# Performance Deep Dive: Large Illumination Maps

## Executive Summary
The application was experiencing severe lag and failure to render large illumination maps (NetCDF files). The root cause was identified as an inefficient data conversion process in the fallback 2D rendering path, which created millions of JavaScript objects per frame, blocking the main thread and causing memory spikes.

We have implemented a fix that optimizes the 2D rendering path to use flat `Float32Array` buffers directly, eliminating the object creation overhead. This ensures that even if WebGL rendering is not active (or during initialization), the application remains responsive.

## Investigation Findings

### 1. Critical Bottleneck: 2D Array Conversion
In `DataCanvas.tsx`, the lazy loading logic for the 2D renderer was converting the raw `Float32Array` from `h5wasm` into a nested `number[][]` array to satisfy the legacy `DataSet` type definition.

```typescript
// OLD CODE (The Bottleneck)
const slice2D: number[][] = [];
for (let y = 0; y < height; y++) {
  const row: number[] = [];
  for (let x = 0; x < width; x++) {
    row.push(flatSlice[y * width + x]);
  }
  slice2D.push(row);
}
```

For a 1000x1000 map, this loop created **1,001,000 new JavaScript objects** (1M numbers + 1K arrays) on every new frame load. This caused massive Garbage Collection (GC) pauses and blocked the main UI thread.

### 2. Rendering Loop Inefficiency
The subsequent rendering loop iterated over this 2D array using nested loops and property access (`slice[y][x]`), which is significantly slower than iterating over a flat typed array.

### 3. WebGL Fallback
Although `USE_WEBGL_RENDERER` is enabled, the application falls back to the 2D renderer if:
- The WebGL context hasn't initialized yet.
- The WebGL context is lost.
- The device doesn't support required extensions (e.g., `OES_texture_float`).

Because the fallback path was so inefficient, any hiccup in WebGL would cause the app to freeze.

### 4. `h5wasm` Slice Bug
We also identified that `h5wasm`'s `slice()` method was occasionally returning the *entire* dataset instead of the requested slice, leading to `RangeError: Invalid array length`. We patched this in `LazyDataset.ts` with a manual extraction fallback.

## Implemented Optimizations

### 1. Direct `Float32Array` Rendering
We rewrote the 2D rendering logic in `DataCanvas.tsx` to render directly from the flat `Float32Array` returned by `LazyDataset`.
- **Removed:** The `number[][]` conversion loop.
- **Added:** A `Uint32Array` view on the target `ImageData` buffer for 32-bit pixel writes (faster than writing R, G, B, A bytes individually).
- **Result:** Zero object creation during rendering; purely flat memory access.

### 2. Synchronous Cache Access
We added `getCachedSlice` to the `ILazyDataset` interface. This allows the render loop to check if data is available synchronously, avoiding unnecessary Promise overhead for cached frames.

### 3. Lint Fixes
Fixed type errors related to `d3.color` to ensure robust compilation.

## Further Recommendations (Options for Future)

### Option 1: Web Workers (Recommended)
Move the `h5wasm` data loading and the 2D rendering logic into a Web Worker.
- **Pros:** Completely unblocks the main thread. UI remains responsive even during heavy data processing.
- **Cons:** Requires architectural changes to message passing (transferring `ArrayBuffer` or `ImageBitmap`).

### Option 2: Robust WebGL Handling
Ensure `WebGLRenderer` is the primary path and debug why it might be failing or falling back.
- **Action:** Add more telemetry/logging to `WebGLRenderer` initialization.
- **Action:** Ensure `isDataGridLayer` correctly identifies all heavy layers.

### Option 3: Tiled Loading
For extremely large datasets (larger than memory), implement a tiling strategy.
- **Current State:** We load full frames (slices).
- **Future:** Load 256x256 tiles on demand. This requires backend support or a smarter `h5wasm` reader that only reads visible tiles.

### Option 4: Downsampling for Interaction
Maintain a low-resolution version of the dataset for rapid scrubbing/interaction, and only load the full-resolution data when the user stops interacting.

## Conclusion
The immediate "lag" issue has been addressed by optimizing the 2D rendering path. The application should now be able to handle large maps without freezing, even in the fallback mode.
