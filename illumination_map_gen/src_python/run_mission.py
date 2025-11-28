import numpy as np
import spiceypy as spice
import json
import rasterio 
import rasterio.warp
import netCDF4 as nc
import os
from datetime import datetime, timedelta, timezone
from illumination_engine import IlluminationEngine

CONFIG_FILE = "config.json"
MOON_RADIUS = 1737400.0
# Spec-compliant Proj4 string
PROJ4_STRING = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"

class RealDEM:
    def __init__(self, meta_path, mask_path):
        with open(meta_path, 'r') as f:
            self.meta = json.load(f)
        
        full_width = self.meta['width']
        full_height = self.meta['height']
        self.transform = rasterio.Affine.from_gdal(*self.meta['transform'])
        
        # ROI Logic
        buffer_m = self.meta.get('buffer_meters', 50000.0)
        pixel_size = self.transform.a 
        buffer_px = int(buffer_m / pixel_size)
        
        x_start, x_end = buffer_px, full_width - buffer_px
        y_start, y_end = buffer_px, full_height - buffer_px
        
        self.roi_width = x_end - x_start
        self.roi_height = y_end - y_start
        
        print(f"ROI Size: {self.roi_width}x{self.roi_height} (Buffer: {buffer_px}px)")

        if not os.path.exists(mask_path):
            raise FileNotFoundError(f"Horizon mask missing: {mask_path}")

        full_horizon_cube = np.memmap(mask_path, dtype=np.int16, mode='r', shape=(full_height, full_width, 360))
        print("Loading ROI into RAM...")
        self.horizon_roi = np.array(full_horizon_cube[y_start:y_end, x_start:x_end, :])
        
        # 1. Generate 1D Coordinate Vectors (Spec Compliant)
        # Centers of pixels
        col_indices = np.arange(x_start, x_end) + 0.5
        self.x_coords, _ = self.transform * (col_indices, np.zeros_like(col_indices))
        
        row_indices = np.arange(y_start, y_end) + 0.5
        _, self.y_coords = self.transform * (np.zeros_like(row_indices), row_indices)
        
        # 2. Generate 2D Grids for Physics Engine
        self.X_grid, self.Y_grid = np.meshgrid(self.x_coords, self.y_coords)
        
        proj_crs = self.meta['crs']
        geo_crs = {'proj': 'longlat', 'R': MOON_RADIUS, 'no_defs': True}
        e_flat, n_flat = self.X_grid.flatten(), self.Y_grid.flatten()
        lons_flat, lats_flat = rasterio.warp.transform(proj_crs, geo_crs, e_flat, n_flat)
        
        self.lats = np.array(lats_flat, dtype=np.float32).reshape(self.roi_height, self.roi_width)
        self.lons = np.array(lons_flat, dtype=np.float32).reshape(self.roi_height, self.roi_width)
        
        self.width = self.roi_width
        self.height = self.roi_height

        # Enforce Decreasing Y (North-to-South) for CF-1.7 Compliance
        if self.y_coords[0] < self.y_coords[-1]:
            print("WARNING: Y coordinates increasing, flipping to comply with CF-1.7...")
            self.y_coords = self.y_coords[::-1]
            self.horizon_roi = np.flip(self.horizon_roi, axis=0)
            self.lats = np.flip(self.lats, axis=0)
            self.lons = np.flip(self.lons, axis=0)

    def get_horizon_elevation_vectorized(self, azimuth_grid):
        az = np.mod(azimuth_grid, 360.0)
        az_floor = np.floor(az).astype(int)
        az_ceil = (az_floor + 1) % 360
        fraction = az - az_floor
        
        H, W = azimuth_grid.shape
        y_idx, x_idx = np.indices((H, W))
        
        h1 = self.horizon_roi[y_idx, x_idx, az_floor] / 100.0
        h2 = self.horizon_roi[y_idx, x_idx, az_ceil] / 100.0
        
        return h1 + (h2 - h1) * fraction

class RealEphemeris:
    def __init__(self, kernel_dir):
        spice.kclear()
        kernels = ["naif0012.tls", "pck00010.tpc", "de440.bsp", "moon_pa_de421_1900-2050.bpc", "moon_080317.tf"]
        for k in kernels:
            path = os.path.join(kernel_dir, k)
            if not os.path.exists(path): raise FileNotFoundError(f"Missing {k}")
            spice.furnsh(path)

    def get_sun_vector_body_fixed(self, time):
        et = spice.str2et(time.isoformat())
        sun_pos, _ = spice.spkpos("SUN", et, "MOON_PA", "LT+S", "MOON")
        return np.array(sun_pos)

    def get_apparent_sun_radius(self, time):
        # Hardcoded physical radius (km)
        SUN_RADIUS_KM = 696340.0 
        sun_vec = self.get_sun_vector_body_fixed(time)
        distance_km = np.linalg.norm(sun_vec)
        angular_radius_rad = np.arcsin(SUN_RADIUS_KM / distance_km)
        return np.degrees(angular_radius_rad)

    def calculate_grid_geometry(self, sun_vec, dem):
        lat_rad = np.radians(dem.lats)
        lon_rad = np.radians(dem.lons)
        
        cos_lat, sin_lat = np.cos(lat_rad), np.sin(lat_rad)
        cos_lon, sin_lon = np.cos(lon_rad), np.sin(lon_rad)
        
        s = sun_vec / np.linalg.norm(sun_vec)
        
        dot_up = s[0]*(cos_lat*cos_lon) + s[1]*(cos_lat*sin_lon) + s[2]*(sin_lat)
        dot_north = s[0]*(-sin_lat*cos_lon) + s[1]*(-sin_lat*sin_lon) + s[2]*(cos_lat)
        dot_east = s[0]*(-sin_lon) + s[1]*(cos_lon)
        
        elevation = np.degrees(np.arcsin(dot_up))
        az_north = np.degrees(np.arctan2(dot_east, dot_north))
        
        grid_azimuth_bearing = az_north + dem.lons
        
        # CRITICAL FIX: Image-Space Rotation
        # Previous: 90 - Bearing (Assumed +Y is UP)
        # Correct: Bearing - 90  (Accounts for +Y being DOWN in memory)
        # Bearing 0 (N) -> -90 -> sin(-90) = -1 (Decreasing Y / Up)
        # Bearing 90 (E) -> 0 -> cos(0) = +1 (Increasing X / Right)
        math_angle = grid_azimuth_bearing - 90.0
        
        return np.mod(math_angle, 360.0), elevation

def init_netcdf(output_path, dem, start_time, end_time):
    print(f"Saving NetCDF4 (8-bit Packed) to {output_path}...")
    ds = nc.Dataset(output_path, 'w', format='NETCDF4')
    
    # Global Attributes
    ds.title = "Lunar Surface Illumination Map"
    ds.institution = "Mission Planning"
    ds.source = "LRO LOLA DEM, SPICE Ephemeris"
    ds.history = f"{datetime.now(timezone.utc).strftime('%Y-%m-%d')}: Created with illumination_generator.py"
    ds.Conventions = "CF-1.7"
    
    ds.geospatial_lat_min = float(np.min(dem.lats))
    ds.geospatial_lat_max = float(np.max(dem.lats))
    ds.geospatial_lon_min = float(np.min(dem.lons))
    ds.geospatial_lon_max = float(np.max(dem.lons))
    
    ds.time_coverage_start = start_time.isoformat() + "Z"
    ds.time_coverage_end = end_time.isoformat() + "Z"
    
    # Dimensions
    ds.createDimension('time', None)
    ds.createDimension('y', dem.height)
    ds.createDimension('x', dem.width)
    
    # CRS
    crs = ds.createVariable('polar_stereographic', 'i4')
    crs.grid_mapping_name = "polar_stereographic"
    crs.latitude_of_projection_origin = -90.0
    crs.straight_vertical_longitude_from_pole = 0.0
    crs.scale_factor_at_projection_origin = 1.0
    crs.false_easting = 0.0
    crs.false_northing = 0.0
    crs.semi_major_axis = MOON_RADIUS
    crs.inverse_flattening = 0.0
    crs.spatial_ref = PROJ4_STRING
    crs[:] = 0 
    
    # Coordinate Variables
    times = ds.createVariable('time', 'f8', ('time',))
    times.units = f"hours since {start_time.isoformat()}Z"
    
    ys = ds.createVariable('y', 'f8', ('y',))
    ys.standard_name = "projection_y_coordinate"
    ys.units = "m"
    ys[:] = dem.y_coords
    
    xs = ds.createVariable('x', 'f8', ('x',))
    xs.standard_name = "projection_x_coordinate"
    xs.units = "m"
    xs[:] = dem.x_coords
    
    # --- 8-BIT PACKED DATA VARIABLE ---
    illum = ds.createVariable(
        'illumination', 
        'i1',  # Signed 8-bit Integer
        ('time', 'y', 'x'), 
        zlib=True, 
        complevel=4, 
        shuffle=True, 
        chunksizes=(1, int(dem.height), int(dem.width)), 
        fill_value=-128
    )
    illum.standard_name = "surface_downwelling_shortwave_flux_in_air"
    illum.long_name = "Solar Illumination Fraction"
    illum.units = "1"
    illum.valid_range = [-127, 127] # In packed values
    illum.grid_mapping = "polar_stereographic"
    
    illum.scale_factor = 1.0 / 254.0
    illum.add_offset = 0.5
    
    return ds, times, illum

if __name__ == "__main__":
    with open(CONFIG_FILE) as f: cfg = json.load(f)
    
    print("Initializing Mission...")
    # Pass FULL config to RealDEM so it can read the ROI request
    dem = RealDEM(cfg['paths']['output_meta'], cfg['paths']['output_horizon'], cfg)
    ephem = RealEphemeris("input_data")
    engine = IlluminationEngine(dem, ephem)
    
    start = datetime.fromisoformat(cfg['mission']['start_date'])
    end = datetime.fromisoformat(cfg['mission']['end_date'])
    
    ds = None
    try:
        ds, nc_times, nc_illum = init_netcdf(cfg['paths']['output_netcdf'], dem, start, end)
        
        print("Starting Simulation Loop (Streaming to Disk)...")
        idx = 0
        time_step_hours = cfg.get('mission', {}).get('time_step_hours', 1)
        current_time = start
        
        while current_time <= end:
            sun_vec = ephem.get_sun_vector_body_fixed(current_time)
            sun_radius = ephem.get_apparent_sun_radius(current_time)
            
            az_grid, el_grid = ephem.calculate_grid_geometry(sun_vec, dem)
            horizon_grid = dem.get_horizon_elevation_vectorized(az_grid)
            illum_map = engine.calculate_circular_segment_area(el_grid, horizon_grid, sun_radius)
            
            hours_elapsed = (current_time - start).total_seconds() / 3600.0
            nc_times[idx] = hours_elapsed
            
            # Write float array; library auto-packs to int8
            nc_illum[idx, :, :] = illum_map
            
            if idx % 24 == 0:
                print(f"Saved Frame {idx} ({current_time})")
                ds.sync()
            
            idx += 1
            current_time += timedelta(hours=time_step_hours)
            
        print("Mission Complete.")
        
    except KeyboardInterrupt:
        print("\nSimulation interrupted by user. Saving progress...")
    except Exception as e:
        print(f"\nCRITICAL ERROR: {e}")
        raise e
    finally:
        if ds:
            ds.close()
            print("NetCDF file closed safely.")