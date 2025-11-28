import numpy as np
import netCDF4 as nc
import json
import rasterio.warp
import os
from datetime import datetime, timezone

CONFIG_FILE = "config.json"
MOON_RADIUS = 1737400.0
PIXEL_SIZE = 20.0 
PROJ_STR = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"

def load_config():
    if not os.path.exists(CONFIG_FILE):
        return { "roi": { "lat_min": -85.5, "lat_max": -85.4, "lon_min": 30.3, "lon_max": 32.0 } }
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)

def generate_debug_file():
    cfg = load_config()
    roi = cfg['roi']
    output_filename = "debug_illumination_pattern.nc"
    
    print(f"--- Generating Debug Pattern ---")
    print(f"Target ROI: Lat [{roi['lat_min']}, {roi['lat_max']}] Lon [{roi['lon_min']}, {roi['lon_max']}]")

    # 1. Define Transforms
    src_crs = {'proj': 'longlat', 'R': MOON_RADIUS, 'no_defs': True}
    dst_crs = PROJ_STR

    # 2. Calculate Projected Bounds
    lons = [roi['lon_min'], roi['lon_max'], roi['lon_min'], roi['lon_max']]
    lats = [roi['lat_min'], roi['lat_min'], roi['lat_max'], roi['lat_max']]
    
    xs, ys = rasterio.warp.transform(src_crs, dst_crs, lons, lats)
    
    # Snap to pixel grid to ensure clean alignment
    min_x = np.floor(min(xs) / PIXEL_SIZE) * PIXEL_SIZE
    max_x = np.ceil(max(xs) / PIXEL_SIZE) * PIXEL_SIZE
    min_y = np.floor(min(ys) / PIXEL_SIZE) * PIXEL_SIZE
    max_y = np.ceil(max(ys) / PIXEL_SIZE) * PIXEL_SIZE

    # 3. Generate 1D Coordinate Vectors (Pixel Centers)
    # We add half a pixel to get the center of the cell
    x_coords = np.arange(min_x, max_x, PIXEL_SIZE)
    y_coords = np.arange(max_y, min_y, -PIXEL_SIZE) # Decreasing Y (Top-Down)
    
    width = len(x_coords)
    height = len(y_coords)
    
    print(f"Grid: {width}x{height}")
    
    # --- DIAGNOSTIC: PRINT EXACT CORNER PIXEL COORDINATES ---
    # These are the coordinates of the actual pixels in the file
    corners_x = [x_coords[0], x_coords[-1], x_coords[0], x_coords[-1]]
    corners_y = [y_coords[0], y_coords[0], y_coords[-1], y_coords[-1]]
    labels = ["TL (Top-Left)", "TR (Top-Right)", "BL (Bottom-Left)", "BR (Bottom-Right)"]
    
    c_lons, c_lats = rasterio.warp.transform(dst_crs, src_crs, corners_x, corners_y)
    
    print("\n--- CORNER VERIFICATION (Pixel Centers) ---")
    print("Check these coordinates in your viewer:")
    for i in range(4):
        print(f"{labels[i]}: Lat {c_lats[i]:.6f}, Lon {c_lons[i]:.6f}")
    print("---------------------------\n")

    # 4. Create 2D Grids for Pattern Generation
    X, Y = np.meshgrid(x_coords, y_coords)
    
    # 5. Inverse Transform to get Lat/Lon for every pixel
    x_flat = X.flatten()
    y_flat = Y.flatten()
    
    lon_flat, lat_flat = rasterio.warp.transform(dst_crs, src_crs, x_flat, y_flat)
    
    lat_deg = np.array(lat_flat).reshape(height, width)
    lon_deg = np.array(lon_flat).reshape(height, width)

    # 6. Generate Test Patterns
    frames = []
    
    # Frame 0: Corner Markers & Checkerboard
    f0 = np.zeros((height, width), dtype=np.float32) + 0.2
    check_x = (X // 1000).astype(int) % 2
    check_y = (Y // 1000).astype(int) % 2
    f0[check_x == check_y] = 0.4
    s_y, s_x = max(1, height // 10), max(1, width // 10)
    f0[0:s_y, 0:s_x] = 1.0        # TL
    f0[0:s_y, -s_x:] = 0.8        # TR
    f0[-s_y:, 0:s_x] = 0.6        # BL
    f0[-s_y:, -s_x:] = 0.0        # BR
    frames.append(f0)

    # Frame 1: Latitude Rings (Sine wave)
    f1 = 0.5 + 0.5 * np.sin(np.radians(lat_deg) * (2 * np.pi / np.radians(0.02)))
    frames.append(f1.astype(np.float32))

    # Frame 2: Longitude Spokes (Sine wave)
    f2 = 0.5 + 0.5 * np.sin(np.radians(lon_deg) * (2 * np.pi / np.radians(0.5)))
    frames.append(f2.astype(np.float32))
    
    # Frame 3: SPECIFIC GRID LINES (Requested Feature)
    f3 = np.zeros((height, width), dtype=np.float32) + 0.1 
    
    # Thinner tolerances for sharper lines
    lat_tol = 0.001
    lon_tol = 0.015
    
    # Draw Latitudes (-85.5, -85.4) -> VALUE 0.5
    for target_lat in [-85.5, -85.4]:
        mask = np.abs(lat_deg - target_lat) < lat_tol
        f3[mask] = 0.5
        
    # Draw Longitudes (30, 31, 32) -> VALUE 1.0
    for target_lon in [30.0, 31.0, 32.0]:
        mask = np.abs(lon_deg - target_lon) < lon_tol
        f3[mask] = 1.0
        
    frames.append(f3)

    # 7. Write NetCDF
    ds = nc.Dataset(output_filename, 'w', format='NETCDF4')
    
    ds.title = "Debug Pattern"
    ds.Conventions = "CF-1.7"
    ds.history = f"Created {datetime.now(timezone.utc).isoformat()}"
    
    ds.geospatial_lat_min = float(np.min(lat_deg))
    ds.geospatial_lat_max = float(np.max(lat_deg))
    ds.geospatial_lon_min = float(np.min(lon_deg))
    ds.geospatial_lon_max = float(np.max(lon_deg))

    ds.createDimension('time', None)
    ds.createDimension('y', height)
    ds.createDimension('x', width)

    crs = ds.createVariable('polar_stereographic', 'i4')
    crs.grid_mapping_name = "polar_stereographic"
    crs.latitude_of_projection_origin = -90.0
    crs.straight_vertical_longitude_from_pole = 0.0
    crs.standard_parallel = -90.0
    crs.semi_major_axis = MOON_RADIUS
    crs.semi_minor_axis = MOON_RADIUS
    crs.inverse_flattening = 0.0
    crs.spatial_ref = PROJ_STR
    crs[:] = 0

    t_var = ds.createVariable('time', 'f8', ('time',))
    t_var.units = "hours since 2030-01-01T00:00:00Z"
    t_var.standard_name = "time"
    
    y_var = ds.createVariable('y', 'f8', ('y',))
    y_var.units = "m"
    y_var.standard_name = "projection_y_coordinate"
    y_var.axis = "Y"
    y_var[:] = y_coords

    x_var = ds.createVariable('x', 'f8', ('x',))
    x_var.units = "m"
    x_var.standard_name = "projection_x_coordinate"
    x_var.axis = "X"
    x_var[:] = x_coords

    img_var = ds.createVariable('illumination', 'f4', ('time', 'y', 'x'), zlib=True, complevel=4)
    img_var.units = "1"
    img_var.grid_mapping = "polar_stereographic"
    img_var.long_name = "Debug Pattern"
    img_var.valid_range = [0.0, 1.0]

    print(f"Writing {len(frames)} frames...")
    for i, frame in enumerate(frames):
        t_var[i] = float(i)
        img_var[i, :, :] = frame

    ds.close()
    print(f"Done. Saved to {output_filename}")

if __name__ == "__main__":
    generate_debug_file()
