# Illumination Data Format Specification for Lunagis

## Overview

This document specifies the ideal data format for lunar illumination maps to be used with the Lunagis application. By following this specification, data generation tools can produce files that work seamlessly without requiring complex coordinate transformations in the browser.

## Design Philosophy

**Principle**: Keep the browser application simple by having the data generation tool handle all coordinate transformations, projections, and resampling.

The browser should receive:
- Data already in the correct coordinate system
- Regular grid spacing for efficient rendering
- Simple affine transforms for georeferencing
- Temporal metadata in standard formats

---

## Recommended Format: NetCDF-4 with Standard Conventions

### File Format
- **Format**: NetCDF-4 (HDF5 backend)
- **Compression**: **Recommended** - Use zlib compression to reduce file size
  - Compression works well with h5wasm (typical 15-20x reduction)
  - Example: 675MB uncompressed → 39MB compressed
  - Use `nccopy -d4` or similar for moderate compression
- **Conventions**: CF-1.7 or later
- **File Extension**: `.nc` or `.nc4`

### Coordinate Reference System

**Use a projected CRS that matches the existing basemap, NOT geographic coordinates.**

For lunar south pole data matching the existing Lunagis basemap:

```
Projection: Polar Stereographic (Antarctic/South Pole)
- Latitude of origin: -90.0°
- Central meridian: 0.0°
- False easting: 0.0 m
- False northing: 0.0 m
- Scale factor: 1.0
- Datum: Sphere with radius 1737400.0 m (Moon mean radius)

Proj4 string:
+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs
```

**IMPORTANT**: The illumination data must be resampled/reprojected to match this CRS exactly.

### Grid Structure

**Use a regular grid in projected coordinates (NOT lat/lon)**

- **Grid Type**: Regular rectangular grid in meters (projected coordinates)
- **Grid Spacing**: Uniform spacing in both X and Y directions
- **Orientation**: Grid-aligned (no rotation)
- **Dimensions**: `[time, y, x]` order (C-order, not Fortran)

**Example for Shackleton Crater region:**
```
X range: -50000 to 50000 m (100 km extent)
Y range: -50000 to 50000 m (100 km extent)
Grid spacing: 200 m per pixel
Result: 500 × 500 pixel grid
```

### Required Dimensions

```python
dimensions:
    time = UNLIMITED ;  // Number of time steps
    y = <HEIGHT> ;      // Number of rows (north-south)
    x = <WIDTH> ;       // Number of columns (east-west)
```

### Required Variables

#### 1. Time Coordinate
```python
double time(time) ;
    time:standard_name = "time" ;
    time:long_name = "time" ;
    time:units = "hours since 2030-01-01T00:00:00Z" ;  // ISO 8601 reference
    time:calendar = "gregorian" ;
    time:axis = "T" ;
```

**Notes:**
- Use `hours since` for typical illumination studies (hourly samples)
- Use `days since` for long-term studies (daily samples)
- Always use ISO 8601 format for reference date
- Always include timezone (Z for UTC)

#### 2. X Coordinate (Easting)
```python
double x(x) ;
    x:standard_name = "projection_x_coordinate" ;
    x:long_name = "x coordinate in projected CRS" ;
    x:units = "m" ;
    x:axis = "X" ;
```

**Values**: Linear array from `x_min` to `x_max` with uniform spacing

Example:
```python
x = [-50000, -49800, -49600, ..., 49800, 50000]  // 500 values, 200m spacing
```

#### 3. Y Coordinate (Northing)
```python
double y(y) ;
    y:standard_name = "projection_y_coordinate" ;
    y:long_name = "y coordinate in projected CRS" ;
    y:units = "m" ;
    y:axis = "Y" ;
```

**Values**: Linear array from `y_max` to `y_min` (top to bottom)

Example:
```python
y = [50000, 49800, 49600, ..., -49800, -50000]  // 500 values, 200m spacing, DECREASING
```

**CRITICAL**: Y values must be in DECREASING order (top to bottom) to match image conventions.

#### 4. Illumination Data
```python
float illumination(time, y, x) ;
    illumination:standard_name = "surface_downwelling_shortwave_flux_in_air" ;
    illumination:long_name = "Solar Illumination Fraction" ;
    illumination:units = "1" ;  // Dimensionless
    illumination:valid_range = 0.0f, 1.0f ;
    illumination:_FillValue = -1.0f ;
    illumination:missing_value = -1.0f ;
    illumination:grid_mapping = "polar_stereographic" ;
    illumination:coordinates = "lat lon" ;  // Link to auxiliary coords
```

**Values:**
- `0.0`: Total darkness (umbra)
- `1.0`: Full solar disk visible
- `0.0 < v < 1.0`: Partial illumination (penumbra/horizon effects)
- `-1.0`: No data / outside region of interest

**Data Type**: Use `float32` (not `float64`) for reasonable file sizes

#### 5. Grid Mapping (CRS Definition)
```python
int polar_stereographic ;
    polar_stereographic:grid_mapping_name = "polar_stereographic" ;
    polar_stereographic:latitude_of_projection_origin = -90.0 ;
    polar_stereographic:straight_vertical_longitude_from_pole = 0.0 ;
    polar_stereographic:scale_factor_at_projection_origin = 1.0 ;
    polar_stereographic:false_easting = 0.0 ;
    polar_stereographic:false_northing = 0.0 ;
    polar_stereographic:semi_major_axis = 1737400.0 ;
    polar_stereographic:inverse_flattening = 0.0 ;  // Sphere
    polar_stereographic:spatial_ref = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs" ;
```

#### 6. Auxiliary Coordinates (OPTIONAL but recommended)
```python
float lat(y, x) ;
    lat:standard_name = "latitude" ;
    lat:long_name = "latitude" ;
    lat:units = "degrees_north" ;
    lat:valid_range = -90.0f, 90.0f ;

float lon(y, x) ;
    lon:standard_name = "longitude" ;
    lon:long_name = "longitude" ;
    lon:units = "degrees_east" ;
    lon:valid_range = -180.0f, 180.0f ;
```

These provide lat/lon for each grid cell but are not required for rendering.

### Global Attributes

```python
// Required
:Conventions = "CF-1.7" ;
:title = "Lunar Surface Illumination Map - Shackleton Crater" ;
:institution = "Your Institution" ;
:source = "LOLA DEM, SPICE Ephemeris" ;
:history = "2024-11-24: Created with illumination_generator.py v2.0" ;

// Recommended
:references = "DOI or citation" ;
:comment = "Illumination computed at 1-hour intervals for 1 lunar day" ;
:geospatial_lat_min = -89.9 ;
:geospatial_lat_max = -89.5 ;
:geospatial_lon_min = -180.0 ;
:geospatial_lon_max = 180.0 ;
:geospatial_vertical_min = 0.0 ;      // meters above datum
:geospatial_vertical_max = 0.0 ;
:time_coverage_start = "2030-01-01T00:00:00Z" ;
:time_coverage_end = "2030-02-01T00:00:00Z" ;
:time_coverage_duration = "P31D" ;    // ISO 8601 duration
:time_coverage_resolution = "PT1H" ;  // 1 hour
```

---

## Data Generation Workflow

### Step 1: Compute Illumination in Native Coordinates

Compute illumination at each time step for your DEM grid.

### Step 2: Define Target Grid

Define the output grid matching the Lunagis basemap:

```python
import numpy as np

# Grid parameters (matching basemap)
x_min, x_max = -50000, 50000  # meters
y_min, y_max = -50000, 50000  # meters
pixel_size = 200  # meters per pixel

# Create coordinate arrays
nx = int((x_max - x_min) / pixel_size) + 1
ny = int((y_max - y_min) / pixel_size) + 1

x = np.linspace(x_min, x_max, nx)
y = np.linspace(y_max, y_min, ny)  # DECREASING
```

### Step 3: Reproject/Resample Data

If your illumination data is in a different CRS or grid:

```python
from pyproj import Transformer
from scipy.interpolate import griddata

# Define source and target CRS
source_crs = "EPSG:XXXX"  # Your DEM CRS
target_crs = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +R=1737400 +units=m"

transformer = Transformer.from_crs(source_crs, target_crs)

# Transform your DEM coordinates to target grid
x_source, y_source = ..., ...  # Your DEM coordinates
x_target, y_target = transformer.transform(x_source, y_source)

# Resample illumination data to target grid
X, Y = np.meshgrid(x, y)
illumination_resampled = griddata(
    (x_target, y_target),
    illumination_source,
    (X, Y),
    method='linear'
)
```

### Step 4: Write NetCDF File

```python
import netCDF4 as nc
from datetime import datetime, timedelta

# Create file with compression
ds = nc.Dataset('illumination.nc', 'w', format='NETCDF4')

# Create dimensions
time_dim = ds.createDimension('time', None)  # Unlimited
y_dim = ds.createDimension('y', ny)
x_dim = ds.createDimension('x', nx)

# Create coordinate variables
time_var = ds.createVariable('time', 'f8', ('time',))
time_var.standard_name = 'time'
time_var.long_name = 'time'
time_var.units = 'hours since 2030-01-01T00:00:00Z'
time_var.calendar = 'gregorian'
time_var.axis = 'T'

x_var = ds.createVariable('x', 'f8', ('x',))
x_var.standard_name = 'projection_x_coordinate'
x_var.long_name = 'x coordinate in projected CRS'
x_var.units = 'm'
x_var.axis = 'X'
x_var[:] = x

y_var = ds.createVariable('y', 'f8', ('y',))
y_var.standard_name = 'projection_y_coordinate'
y_var.long_name = 'y coordinate in projected CRS'
y_var.units = 'm'
y_var.axis = 'Y'
y_var[:] = y

# Create CRS variable
crs_var = ds.createVariable('polar_stereographic', 'i4', ())
crs_var.grid_mapping_name = 'polar_stereographic'
crs_var.latitude_of_projection_origin = -90.0
crs_var.straight_vertical_longitude_from_pole = 0.0
crs_var.scale_factor_at_projection_origin = 1.0
crs_var.false_easting = 0.0
crs_var.false_northing = 0.0
crs_var.semi_major_axis = 1737400.0
crs_var.inverse_flattening = 0.0
crs_var.spatial_ref = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +R=1737400 +units=m"

# Create illumination variable with compression
# zlib=True enables compression, complevel=4 is moderate compression
illum_var = ds.createVariable('illumination', 'f4', ('time', 'y', 'x'),
                              zlib=True, complevel=4)
illum_var.long_name = 'Solar Illumination Fraction'
illum_var.units = '1'
illum_var.valid_range = np.array([0.0, 1.0], dtype='f4')
illum_var._FillValue = -1.0
illum_var.grid_mapping = 'polar_stereographic'

# Fill with data
for t in range(n_timesteps):
    time_var[t] = t  # hours since reference
    illum_var[t, :, :] = illumination_data[t, :, :]

# Global attributes
ds.Conventions = 'CF-1.7'
ds.title = 'Lunar Surface Illumination Map'
ds.institution = 'Your Institution'
ds.source = 'LOLA DEM, SPICE Ephemeris'
ds.history = f'{datetime.now().isoformat()}: Created'

ds.close()
```

### Step 5: Verify File

```bash
# Check file structure and compression
ncdump -hs illumination.nc

# Compression should show "zlib" - this is good!
ncdump -hs illumination.nc | grep -i deflate
```

---

## File Size Considerations

### Example File Sizes

| Grid Size | Time Steps | Uncompressed | Compressed (zlib) | Notes |
|-----------|------------|--------------|-------------------|-------|
| 500×500 | 744 (1 month hourly) | ~686 MB | ~40 MB | 1 lunar day at 1-hour intervals |
| 1000×1000 | 744 | ~2.7 GB | ~150 MB | Higher resolution |
| 250×250 | 8760 (1 year hourly) | ~2.0 GB | ~115 MB | Full year coverage |
| 500×500 | 168 (1 week hourly) | ~154 MB | ~9 MB | Short study period |

**Compression Ratios**: Illumination data typically compresses very well (15-20x) because it has:
- Smooth spatial gradients
- Temporal coherence (similar patterns over time)
- Limited value range (0.0 to 1.0)

**Recommendations:**
- Keep individual files under 500MB for browser performance
- For large studies, split into multiple files (e.g., monthly chunks)
- Consider daily sampling instead of hourly for long periods
- Use appropriate grid resolution for your region size

---

## Validation Checklist

Before using your NetCDF file in Lunagis, verify:

- [ ] File is **uncompressed** NetCDF-4 (run `nccopy -d0` if needed)
- [ ] Dimensions are `[time, y, x]` in that order
- [ ] X coordinates are uniformly spaced and **increasing**
- [ ] Y coordinates are uniformly spaced and **decreasing** (top to bottom)
- [ ] Illumination values are between 0.0 and 1.0 (or -1.0 for fill)
- [ ] CRS matches basemap (Polar Stereographic for south pole)
- [ ] Grid bounds overlap with your region of interest
- [ ] Time units include ISO 8601 reference date with timezone
- [ ] File opens successfully in Lunagis without errors

### Test Commands

```bash
# Check file structure
ncdump -h illumination.nc

# Check dimensions
ncdump -v time,x,y illumination.nc | head -50

# Verify data range
ncap2 -s 'print(illumination.min(),"%f"); print(illumination.max(),"%f")' illumination.nc

# Check compression (should say "NONE")
ncdump -sh illumination.nc | grep deflate
```

---

## Alternative: Simplified Format (For Simple Cases)

If you don't need auxiliary lat/lon coordinates and your grid is very simple, you can use an even more minimal format:

**Minimal Required Variables:**
1. `time(time)` - temporal coordinate
2. `x(x)` - projected x coordinate
3. `y(y)` - projected y coordinate (decreasing)
4. `illumination(time, y, x)` - data
5. `polar_stereographic()` - CRS definition

Everything else is optional but recommended for documentation.

---

## Summary

**Key Requirements for Lunagis Compatibility:**

1. ✅ **Uncompressed NetCDF-4**
2. ✅ **Regular grid in projected coordinates** (meters, not degrees)
3. ✅ **Dimensions: [time, y, x]** with y decreasing
4. ✅ **CRS matching basemap** (Polar Stereographic for south pole)
5. ✅ **Illumination values 0.0-1.0** (float32)
6. ✅ **Time in CF-compliant format** with ISO 8601 reference

**The data generator must handle:**
- Coordinate reprojection
- Grid resampling
- Spatial alignment with basemap
- All geometric transformations

**The browser app will:**
- Read the data directly
- Apply simple affine transform from x/y coordinates
- Render efficiently with no reprojection needed

---

## Questions?

If you have questions about this specification or need help implementing it in your data generation tool, please ask!
