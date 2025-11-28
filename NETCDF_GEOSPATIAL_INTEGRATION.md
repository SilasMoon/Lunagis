# NetCDF4 Geospatial Integration TODO

## Current Status
✅ NetCDF-4 files can be loaded successfully using h5wasm
✅ Data extraction works for 3D illumination arrays
✅ Time slider appears for illumination layers
❌ Geospatial positioning is not applied
❌ Temporal metadata is not used

## Problem
The illumination data from NetCDF-4 files is displayed without proper georeferencing because:

1. **No Coordinate System Integration**: The application expects VRT-style GeoTransform (affine) but NetCDF uses Polar Stereographic projection with 2D lat/lon auxiliary coordinates
2. **Missing Lat/Lon Arrays**: We only extract the min/max ranges, not the full 2D arrays needed for pixel-to-coordinate mapping
3. **No Temporal Alignment**: Time values from the NetCDF file aren't used to set proper dates in the application

## NetCDF File Structure (from specification)
```
- CRS: Polar Stereographic (South Pole)
  - latitude_of_origin: -90.0°
  - central_meridian: 0.0°
  - semi_major_axis: 1737400.0 m (Moon)

- Variables:
  - illumination[time, y, x] - main data (float32, 0-1)
  - time[time] - hours since reference date
  - latitude[y, x] - 2D auxiliary coordinate
  - longitude[y, x] - 2D auxiliary coordinate
  - polar_stereographic - CRS scalar variable with attributes
```

## Required Changes

### 1. Extract Full Coordinate Arrays
**File**: `services/netcdf4Parser.ts`

Currently we only get min/max from attributes. Need to:
```typescript
// Add to NetCdf4ParseResult:
interface NetCdf4ParseResult {
  // ... existing fields
  coordinates?: {
    latitude: Float32Array;  // 2D array flattened to 1D [height * width]
    longitude: Float32Array; // 2D array flattened to 1D [height * width]
  };
}

// In extractMetadata(), read the full arrays:
const latVar = file.get('latitude');
const latData = latVar.value; // [height, width] array
const flatLat = new Float32Array(latData.flat());

const lonVar = file.get('longitude');
const lonData = lonVar.value; // [height, width] array
const flatLon = new Float32Array(lonData.flat());
```

**Note**: Only read if arrays are reasonable size (e.g., < 100K pixels)

### 2. Store Geospatial Metadata in Layer
**File**: `types.ts`

Extend `IlluminationLayer`:
```typescript
export interface IlluminationLayer extends LayerBase {
  // ... existing fields
  geospatial?: {
    coordinates: {
      latitude: Float32Array;  // [height * width]
      longitude: Float32Array; // [height * width]
    };
    crs: {
      projection: 'Polar Stereographic';
      params: {
        latitudeOfOrigin: number;
        centralMeridian: number;
        semiMajorAxis: number;
        // ... other proj4 params
      };
    };
    bounds: {
      latMin: number;
      latMax: number;
      lonMin: number;
      lonMax: number;
    };
  };
}
```

### 3. Create Coordinate Transformation System
**File**: `hooks/useIlluminationCoordinates.ts` (NEW)

Create a hook similar to `useCoordinateTransformation` but for illumination layers:

```typescript
export function useIlluminationCoordinates(illuminationLayer: IlluminationLayer | undefined) {
  return useMemo(() => {
    if (!illuminationLayer?.geospatial) return null;

    const { coordinates, crs, bounds } = illuminationLayer.geospatial;
    const { height, width } = illuminationLayer.dimensions;

    // Create lookup function: pixel (x, y) -> (lat, lon)
    const pixelToLatLon = (x: number, y: number): [number, number] => {
      const index = y * width + x;
      return [
        coordinates.latitude[index],
        coordinates.longitude[index]
      ];
    };

    // Create reverse lookup: (lat, lon) -> pixel (x, y)
    // This requires spatial indexing for efficiency
    const latLonToPixel = (lat: number, lon: number): [number, number] | null => {
      // Find nearest pixel using KD-tree or grid search
      // ... implementation
    };

    return { pixelToLatLon, latLonToPixel, bounds };
  }, [illuminationLayer]);
}
```

### 4. Integrate with Rendering
**File**: `components/DataCanvas.tsx`

When rendering illumination layers:
- Use the coordinate transformation to align with basemap
- Transform each pixel based on its actual lat/lon
- Or create a warped version of the data that matches the basemap projection

**Two Approaches:**

**A. Real-time Warping** (slower, accurate):
```typescript
// For each basemap pixel (px, py):
//   1. Get its lat/lon from basemap transform
//   2. Find corresponding illumination pixel using latLonToPixel
//   3. Sample illumination value
//   4. Draw to canvas
```

**B. Pre-computed Lookup** (faster, approximate):
```typescript
// Create transformation matrix once:
// For each illumination pixel:
//   1. Get its lat/lon
//   2. Transform to basemap projected coordinates
//   3. Store mapping
// Then render using the mapping
```

### 5. Use Temporal Metadata
**File**: `context/AppContext.tsx`

When loading illumination layer:
```typescript
if (metadata.timeValues && metadata.timeUnit) {
  // Parse time unit: "hours since 2024-01-01T00:00:00"
  const dates = parseTimeValues(metadata.timeValues, metadata.timeUnit);

  // Set the application's time domain
  setTimeZoomDomain([dates[0], dates[dates.length - 1]]);

  // Store dates in layer for proper time indexing
  newLayer.temporalMetadata = {
    dates: dates,
    unit: metadata.timeUnit
  };
}
```

## Implementation Priority

### Phase 1: Basic Coordinate Display (MVP)
1. Extract lat/lon arrays from NetCDF
2. Display coordinate info when hovering over illumination pixels
3. Show bounds in layer properties

### Phase 2: Coordinate Integration
1. Create coordinate transformation hooks
2. Align illumination with basemap if both loaded
3. Proper zoom/pan behavior

### Phase 3: Temporal Integration
1. Use NetCDF time values for proper dates
2. Align with other time-series data
3. Support time-based queries

## Testing Requirements

1. **Small test file**: Create 10×10×10 illumination map for testing
2. **Verify coordinates**: Check that pixel (0,0) maps to correct lat/lon
3. **Visual alignment**: Load both basemap and illumination, verify overlap
4. **Time alignment**: Verify time slider shows correct dates

## Alternative: Simplified Approach

If full coordinate transformation is too complex, consider:

1. **Assume Regular Grid**: If the illumination data covers a regular lat/lon grid, derive a simple GeoTransform:
   ```
   GeoTransform[0] = lonMin (top-left X)
   GeoTransform[1] = (lonMax - lonMin) / width (pixel width)
   GeoTransform[2] = 0 (rotation)
   GeoTransform[3] = latMax (top-left Y)
   GeoTransform[4] = 0 (rotation)
   GeoTransform[5] = -(latMax - latMin) / height (pixel height, negative)
   ```

2. **Store as pseudo-VRT**: Create a VrtData object from the NetCDF bounds
3. **Reuse existing rendering**: Use the same code path as basemaps

This works if the projection distortion is minimal over the region of interest.

## Resources

- NetCDF CF Conventions: https://cfconventions.org/
- Proj4js (already used): https://github.com/proj4js/proj4js
- Polar Stereographic in Proj4: `+proj=stere +lat_0=-90 +lon_0=0 +R=1737400`

## Notes

- Moon radius: 1737400 m (used in the NetCDF CRS)
- The application currently uses proj4 for coordinate transformations (see `useCoordinateTransformation.ts`)
- Consider memory usage when storing full lat/lon arrays for large datasets
