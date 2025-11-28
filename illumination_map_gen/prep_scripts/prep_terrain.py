import rasterio
import rasterio.warp
import rasterio.windows
import numpy as np
import json
import os

CONFIG_FILE = "config.json"
# EXACT CONSTANTS from Mission Runner
MOON_RADIUS = 1737400.0
PROJ4_STRING = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"

def load_config():
    if not os.path.exists(CONFIG_FILE):
        raise FileNotFoundError(f"Config file {CONFIG_FILE} not found.")
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)

def extract_terrain():
    cfg = load_config()
    
    input_file = cfg['paths']['input_dem_lbl']
    output_bin = cfg['paths']['output_dem_bin']
    output_meta = cfg['paths']['output_meta']
    output_cpp_config = "output_data/horizon_config.txt"
    
    roi = cfg['roi']
    buffer_m = cfg['simulation']['buffer_meters']

    print(f"--- PREP TERRAIN ---")
    print(f"Input: {input_file}")
    print(f"Requested ROI: Lat [{roi['lat_min']}, {roi['lat_max']}] Lon [{roi['lon_min']}, {roi['lon_max']}]")
    
    if not os.path.exists(input_file):
        print(f"ERROR: Input file not found: {input_file}")
        return

    with rasterio.open(input_file) as src:
        print(f"Source CRS: {src.crs}")
        
        # 1. Define Transforms
        # Source: Lat/Lon on Moon Sphere
        src_crs = {'proj': 'longlat', 'R': MOON_RADIUS, 'no_defs': True}
        # Dest: Polar Stereographic
        dst_crs = PROJ4_STRING

        # 2. Transform ROI Corners to Projected Meters
        lons = [roi['lon_min'], roi['lon_max'], roi['lon_min'], roi['lon_max']]
        lats = [roi['lat_min'], roi['lat_min'], roi['lat_max'], roi['lat_max']]
        
        xs, ys = rasterio.warp.transform(src_crs, dst_crs, lons, lats)
        
        # 3. Calculate Projected Bounding Box
        req_min_x, req_max_x = min(xs), max(xs)
        req_min_y, req_max_y = min(ys), max(ys)
        
        print(f"ROI Projected Bounds: X[{req_min_x:.1f}, {req_max_x:.1f}] Y[{req_min_y:.1f}, {req_max_y:.1f}]")
        
        # 4. Apply Buffer
        buffered_min_x = req_min_x - buffer_m
        buffered_max_x = req_max_x + buffer_m
        buffered_min_y = req_min_y - buffer_m
        buffered_max_y = req_max_y + buffer_m
        
        print(f"Buffered Bounds: X[{buffered_min_x:.1f}, {buffered_max_x:.1f}] Y[{buffered_min_y:.1f}, {buffered_max_y:.1f}]")

        # 5. Convert to Pixel Window
        window = rasterio.windows.from_bounds(buffered_min_x, buffered_min_y, buffered_max_x, buffered_max_y, src.transform)
        window = window.round_offsets().round_lengths()
        
        # 6. Read Data
        print(f"Reading window: {window}")
        raw_data = src.read(1, window=window)
        
        # Handle NODATA
        data = raw_data.astype(np.float32)
        if src.nodata is not None:
            data[data == src.nodata] = 1737400.0 
            
        height, width = data.shape
        print(f"Extracted Grid: {width} x {height}")
        
        # 7. Save Binary
        data.tofile(output_bin)
        
        # 8. Calculate Exact Geographic Bounds of the Extracted Grid for verification
        win_transform = src.window_transform(window)
        
        # Corners of the extracted grid
        grid_xs = [0, width, 0, width]
        grid_ys = [0, 0, height, height]
        # Convert pixels to projected meters
        grid_proj_x, grid_proj_y = rasterio.transform.xy(win_transform, grid_ys, grid_xs, offset='ul')
        # Convert projected meters to Lat/Lon
        grid_lons, grid_lats = rasterio.warp.transform(dst_crs, src_crs, grid_proj_x, grid_proj_y)
        
        print(f"\n--- EXTRACTED GRID GEOGRAPHIC CORNERS (Check these!) ---")
        labels = ["TL", "TR", "BL", "BR"]
        for i in range(4):
            print(f"{labels[i]}: Lat {grid_lats[i]:.5f}, Lon {grid_lons[i]:.5f}")
        print("--------------------------------------------------------")

        # 9. Save Metadata
        pixel_scale = win_transform.a 
        
        meta = {
            "width": width, 
            "height": height,
            "transform": win_transform.to_gdal(),
            "crs": PROJ4_STRING, # Save explicit PROJ string
            "observer_height_m": cfg['simulation']['observer_height_m'],
            "buffer_meters": buffer_m,
            "pixel_scale": pixel_scale
        }
        with open(output_meta, "w") as f:
            json.dump(meta, f, indent=4)
            
        # 10. Save C++ Config
        with open(output_cpp_config, "w") as f:
            f.write(f"WIDTH={width}\n")
            f.write(f"HEIGHT={height}\n")
            f.write(f"OBSERVER_HEIGHT={cfg['simulation']['observer_height_m']}\n")
            f.write(f"PIXEL_SCALE={pixel_scale}\n")
            
        print(f"Metadata saved to {output_meta}")
        print(f"C++ Config saved to {output_cpp_config}")

if __name__ == "__main__":
    extract_terrain()