import numpy as np
from datetime import timedelta

class IlluminationEngine:
    def __init__(self, dem, ephemeris):
        self.dem = dem
        self.ephemeris = ephemeris

    def calculate_circular_segment_area(self, sun_elev_deg, horizon_elev_deg, sun_radius_deg):
        """
        Vectorized calculation of visible solar disk fraction.
        Math performed in RADIANS.
        sun_radius_deg: Can be scalar or array (if radius changes over time)
        """
        r_rad = np.radians(sun_radius_deg)
        h_rad = np.radians(horizon_elev_deg - sun_elev_deg)
        
        fraction = np.zeros_like(h_rad, dtype=np.float32)
        
        mask_partial = (h_rad > -r_rad) & (h_rad < r_rad)
        
        if np.any(mask_partial):
            h_part = h_rad[mask_partial]
            
            # Handle dynamic radius broadcasting if necessary
            if np.ndim(r_rad) > 0 and r_rad.shape == h_rad.shape:
                r_part = r_rad[mask_partial]
            else:
                r_part = r_rad

            x = np.abs(h_part)
            x = np.minimum(x, r_part) 
            
            term1 = (r_part**2) * np.arccos(x / r_part)
            term2 = x * np.sqrt(r_part**2 - x**2)
            seg_area = term1 - term2
            
            total_area = np.pi * (r_part**2)
            seg_frac = seg_area / total_area
            
            vals = np.zeros_like(h_part)
            vals[h_part >= 0] = seg_frac[h_part >= 0]
            vals[h_part < 0] = 1.0 - seg_frac[h_part < 0]
            
            fraction[mask_partial] = vals

        fraction[h_rad <= -r_rad] = 1.0
        fraction[h_rad >= r_rad] = 0.0
        
        return fraction

    def run_simulation_generator(self, start_date, end_date):
        current_time = start_date
        lats_roi = self.dem.lats
        lons_roi = self.dem.lons
        
        print(f"Physics Engine: Grid {lats_roi.shape}")
        
        while current_time <= end_date:
            # 1. Get Sun State (Vector + Radius)
            sun_vec = self.ephemeris.get_sun_vector_body_fixed(current_time)
            # Dynamic Solar Radius calculation happens in ephemeris class now
            sun_radius = self.ephemeris.get_apparent_sun_radius(current_time)
            
            # 2. Geometry
            az_grid, el_grid = self.ephemeris.calculate_grid_geometry(sun_vec, self.dem)
            
            # 3. Horizon
            horizon_grid = self.dem.get_horizon_elevation_vectorized(az_grid)
            
            # 4. Physics (With Dynamic Radius)
            illum_map = self.calculate_circular_segment_area(el_grid, horizon_grid, sun_radius)
            
            yield current_time, illum_map
            
            current_time += timedelta(hours=1)