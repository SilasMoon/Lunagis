# COMPREHENSIVE PERFORMANCE ANALYSIS - Lunagis Temporal Data Viewer

## Executive Summary
Found **42+ performance issues** across all 10 categories with varying severity levels. Critical issues identified in React re-rendering, heavy computations, memory management, and lack of code optimization patterns.

---

## 1. REACT RE-RENDERING ISSUES (HIGH SEVERITY)

### Issue 1.1: Massive Monolithic Component - ControlPanel.tsx
- **File**: `/home/user/Lunagis/components/ControlPanel.tsx`
- **Size**: 1,061 lines (largest component)
- **Problem**: Single component contains LayersPanel, ArtifactsPanel, MeasurementPanel, ConfigurationPanel, and sub-components all inline
- **Impact**: Any state change triggers re-render of entire 1000+ line component. Causes cascade re-renders of all child components
- **Evidence**: Lines 603-1061 show everything in single component without memoization

### Issue 1.2: Missing React.memo on List Item Components
- **Components**: `LayerItem` (line 260), `ArtifactItem` (line 658)
- **Problem**: These components render in lists but lack React.memo
- **Impact**: Every time parent layer list changes, ALL LayerItems re-render even if individual layer data hasn't changed
- **Example**: Line 642-648 maps over layers array without any memoization
- **Severity**: HIGH - could be thousands of items in large projects

### Issue 1.3: DataCanvas Dependencies Explosion
- **File**: `/home/user/Lunagis/components/DataCanvas.tsx`
- **Lines**: 287 - effect dependency array has 15+ dependencies
- **Problem**: Every dependency change triggers full canvas re-render
  ```typescript
  }, [layers, timeIndex, showGraticule, debouncedGraticuleDensity, proj, viewState, 
      isDataLoaded, latRange, lonRange, canvasToProjCoords, debouncedTimeRange, 
      debouncedShowGrid, debouncedGridSpacing, gridColor]);
  ```
- **Impact**: Frequent unnecessary canvas renders when unrelated props change

### Issue 1.4: Keyboard Shortcuts Dependency Problem
- **File**: `/home/user/Lunagis/hooks/useKeyboardShortcuts.ts`
- **Line**: 42
- **Problem**: `shortcuts` array in dependency array creates new identity every render in App.tsx
  ```typescript
  }, [shortcuts, enabled]);
  ```
- **Line 37-95 of App.tsx**: New shortcuts array created on every render
- **Impact**: Event listener constantly re-attached, old listeners not properly cleaned

### Issue 1.5: No React.memo on Section/AddLayerMenu Components
- **File**: `/home/user/Lunagis/components/ControlPanel.tsx`
- **Lines**: 21-32, 34-93
- **Problem**: `Section` and `AddLayerMenu` components don't use React.memo
- **Impact**: Re-render whenever parent ControlPanel renders

### Issue 1.6: AppContext High-Frequency Updates
- **File**: `/home/user/Lunagis/context/AppContext.tsx`
- **Problem**: 
  - `setLayers` called frequently causes all consumers to re-render
  - Context value object created on every render (line 869+) without memoization
  - All 50+ state updates trigger context subscribers
- **Impact**: Every state change cascades to all subscribers

### Issue 1.7: ControlPanel Re-renders Panel Selector
- **File**: `/home/user/Lunagis/components/ControlPanel.tsx`
- **Lines**: 1045-1061
- **Problem**: `SidePanel` renders different panel based on `activeTool` but entire panel unmounts/remounts
- **Impact**: Expensive re-initialization of panels on tool switch

---

## 2. LARGE BUNDLE SIZE / MISSING CODE SPLITTING (HIGH SEVERITY)

### Issue 2.1: No Code Splitting in Vite Configuration
- **File**: `/home/user/Lunagis/vite.config.ts`
- **Problem**: No code splitting configuration set
- **Expected**: 
  ```typescript
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'd3': ['d3'],
          'canvas': ['./components/DataCanvas']
        }
      }
    }
  }
  ```
- **Impact**: Single bundle file with all 4700+ lines of code

### Issue 2.2: Global CDN Dependencies Without Lazy Loading
- **File**: `/home/user/Lunagis/index.html`
- **Lines**: 8-10
- **Problem**: Large libraries loaded on every page load:
  - Tailwind CSS from CDN (entire framework)
  - D3.js v7 (320KB minified)
  - Proj4js (100KB+ minified)
- **Impact**: No tree-shaking, no lazy loading, blocking main thread
- **Missing**: No async load attribute, no deferred loading

### Issue 2.3: React Loaded from CDN Without Optimization
- **File**: `/home/user/Lunagis/index.html`
- **Lines**: 20-27
- **Problem**: React imported via importmap from CDN without caching headers optimization
- **Impact**: Fetches full React bundle on every page load

### Issue 2.4: No Dynamic Imports / Lazy Loading
- **File**: All component files
- **Problem**: No `React.lazy()` usage anywhere in codebase
  ```javascript
  // NOT FOUND: const ControlPanel = lazy(() => import('./components/ControlPanel'));
  ```
- **Impact**: All components loaded at startup, even ControlPanel, AnalysisPanel, etc.

### Issue 2.5: ControlPanel Loaded Regardless of Active Tool
- **File**: `/home/user/Lunagis/App.tsx`
- **Line**: 108
- **Problem**: `<SidePanel />` imported and rendered always, even if user doesn't interact with layers
- **Impact**: 1061 lines of code loaded even for simple use cases

---

## 3. UNOPTIMIZED IMAGES/ASSETS (MEDIUM SEVERITY)

### Issue 3.1: Basemap PNG Not Optimized
- **File**: `/home/user/Lunagis/context/AppContext.tsx`
- **Lines**: 377, 786
- **Problem**: 
  ```typescript
  const image = await dataUrlToImage(URL.createObjectURL(pngFile));
  ```
  - PNG loaded without compression check
  - No preview/thumbnail generation
  - Full resolution loaded even if small display
- **Impact**: Large PNG files (possibly multi-MB) loaded into memory uncompressed

### Issue 3.2: Image Element Not Cleaned Up
- **File**: `/home/user/Lunagis/context/AppContext.tsx`
- **Lines**: 14-21
- **Problem**: `dataUrlToImage` creates Image elements without cleanup
  ```typescript
  image.src = dataUrl;  // ObjectURL created but never revoked on removal
  ```
- **Impact**: Memory leak when basemaps removed

### Issue 3.3: No Responsive Image Sizing
- **File**: `/home/user/Lunagis/components/DataCanvas.tsx`
- **Problem**: Canvas renders at full devicePixelRatio without consideration for zoom level
- **Line**: 128
- **Impact**: Unnecessary high-resolution rendering when zoomed out

---

## 4. MEMORY LEAKS (MEDIUM-HIGH SEVERITY)

### Issue 4.1: Window Event Listeners Not Properly Cleaned
- **File**: `/home/user/Lunagis/components/TimeSlider.tsx`
- **Lines**: 102-119
- **Problem**: 
  ```typescript
  if (draggingHandle) {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }
  return () => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };
  ```
- **Issue**: If `draggingHandle` unmounts mid-drag, listeners persist in window
- **Impact**: Ghost event listeners accumulate on page interactions

### Issue 4.2: Flicker Interval Not Cleaned on Component Unmount
- **File**: `/home/user/Lunagis/context/AppContext.tsx`
- **Lines**: 665-672
- **Problem**: `setInterval` created for flicker effect
  ```typescript
  flickerIntervalRef.current = window.setInterval(() => {...}, 400);
  ```
- **Better Design**: Could clear on layer removal but cleanup in useEffect is minimal
- **Potential Issue**: If AppContext unmounts unexpectedly, interval persists

### Issue 4.3: BaseURL ObjectURL Not Revoked
- **File**: `/home/user/Lunagis/context/AppContext.tsx`
- **Lines**: 377, 710, 786
- **Problem**: `URL.createObjectURL()` creates memory reference never revoked
  ```typescript
  const image = await dataUrlToImage(URL.createObjectURL(pngFile));
  // Missing: URL.revokeObjectURL(objectUrl) - should be in cleanup
  ```
- **Impact**: Memory leak when switching basemaps - old URLs remain in memory

### Issue 4.4: FileReader ObjectURL Leak
- **File**: `/home/user/Lunagis/context/AppContext.tsx`
- **Line**: 758
- **Problem**: FileReader used but no cleanup of file reference
- **Impact**: Large files not garbage collected after reading

### Issue 4.5: Keyboard Event Listeners in AppContext
- **File**: `/home/user/Lunagis/context/AppContext.tsx`
- **Lines**: 622-630
- **Problem**: Window keydown listener added without active toggle
- **Impact**: Listener persists even when component should be inactive

### Issue 4.6: CanvasLRUCache Memory Tracking Bug
- **File**: `/home/user/Lunagis/utils/LRUCache.ts`
- **Line**: 193-196
- **Problem**: In `delete()`, it calls `this.get(key)` which updates access order BEFORE deleting
  ```typescript
  const canvas = this.get(key);  // Updates access order!
  if (canvas) {
    this.currentMemoryBytes -= this.getCanvasMemorySize(canvas);
  }
  ```
- **Impact**: Corrupts LRU ordering when evicting items

---

## 5. N+1 QUERY PROBLEMS / INEFFICIENT DATA FETCHING (HIGH SEVERITY)

### Issue 5.1: Nightfall Dataset Creates Intermediate Array Per Pixel
- **File**: `/home/user/Lunagis/services/analysisService.ts`
- **Lines**: 143
- **Problem**: 
  ```typescript
  const pixelTimeSeries = dataset.map(slice => slice[y][x]);
  ```
  This creates NEW array for every pixel (y*x times)
- **For 1000x1000 image**: Creates 1,000,000 arrays!
- **Impact**: Massive memory allocation, garbage collection pressure
- **Better**: Direct iteration without intermediate array

### Issue 5.2: Coordinate Transformer Recalculated on Every Prop Change
- **File**: `/home/user/Lunagis/context/AppContext.tsx`
- **Lines**: 207-236
- **Problem**: Complex projection calculations in useMemo but dependencies include `proj` and `primaryDataLayer`
- **Issue**: If other state changes, useEffect line 287 in DataCanvas re-runs with same transformer
- **Impact**: Redundant proj4 forward calls

### Issue 5.3: Graticule Lines Recalculated Every Render
- **File**: `/home/user/Lunagis/components/DataCanvas.tsx`
- **Lines**: 275-282
- **Problem**: For each longitude (-180 to 180 by lonStep), 101 points are projected and drawn
- **For dense graticule**: 360/step * 101 * proj4.forward() calls per render
- **Impact**: Expensive synchronous proj4 calls blocking rendering

### Issue 5.4: Array Filter/Map Chain in Artifact Hit Detection
- **File**: `/home/user/Lunagis/components/DataCanvas.tsx`
- **Lines**: 255-256
- **Problem**: 
  ```typescript
  const samplePoints = [...].map(p => canvasToProjCoords(...))
    .filter(p => p !== null)
    .map(p => proj4.inverse(p))
    .filter((p): p is [...] => p !== null);
  ```
  - Multiple iterations over same data
  - Unnecessary intermediate arrays
- **Impact**: 4 iterations for 8 points when 1 would suffice

### Issue 5.5: Daylightfraction Recalculated on Every Hover
- **File**: `/home/user/Lunagis/context/AppContext.tsx`
- **Lines**: 252-318
- **Problem**: When `selectedPixel` changes (which happens on EVERY mouse move), entire daylight fraction is recalculated
- **Code**: `useEffect` dependency includes `selectedPixel` with heavy computation
- **Impact**: Per-pixel daylight analysis on every hover event (potentially 60x per second)

### Issue 5.6: LayerItem Recalculates Expression Variables
- **File**: `/home/user/Lunagis/components/ControlPanel.tsx`
- **Lines**: 282-287
- **Problem**: 
  ```typescript
  const availableExpressionVariables = useMemo(() => {
    return layers
      .filter(l => l.type === 'data' || ...)
      .filter(l => l.id !== layer.id)
      .map(l => sanitizeLayerNameForExpression(l.name));
  }, [layers, layer.id]);
  ```
  - Called for EVERY LayerItem in list
  - Recalculates when ANY layer changes
- **For 100 layers**: 100 * layer filter chains per render
- **Impact**: O(n²) complexity when filtering layers

---

## 6. LARGE LISTS WITHOUT VIRTUALIZATION (HIGH SEVERITY)

### Issue 6.1: Layers List Not Virtualized
- **File**: `/home/user/Lunagis/components/ControlPanel.tsx`
- **Lines**: 641-650
- **Problem**: 
  ```typescript
  {layers.length > 0 ? (
    [...layers].reverse().map((layer: Layer) => (
      <LayerItem key={layer.id} ... />
    ))
  )}
  ```
- **Issue**: Renders ALL layers even if only 5 visible in scroll area
- **Scenario**: User has 1000 layer files loaded = 1000 DOM nodes
- **Impact**: Massive DOM tree, slow scrolling, memory intensive

### Issue 6.2: Artifacts List Not Virtualized
- **File**: `/home/user/Lunagis/components/ControlPanel.tsx`
- **Lines**: 831-839
- **Problem**: Same as layers - all artifacts rendered even if scrolled off-screen
- **For 500 artifacts**: 500 ArtifactItem components always in DOM

### Issue 6.3: Waypoints List Not Truly Virtualized
- **File**: `/home/user/Lunagis/components/ControlPanel.tsx`
- **Lines**: 754-773
- **Problem**: 
  ```typescript
  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
    {(artifact as PathArtifact).waypoints.map((wp, i) => (...))}
  </div>
  ```
  - Uses CSS overflow, not virtual scrolling
  - All waypoints DOM nodes created even if scrolled
- **For path with 10,000 waypoints**: All rendered but hidden
- **Impact**: Browser struggles with 10K DOM nodes

---

## 7. HEAVY SYNCHRONOUS COMPUTATIONS (HIGH SEVERITY)

### Issue 7.1: Triple Nested Loop in Expression Layer Calculation
- **File**: `/home/user/Lunagis/services/analysisService.ts`
- **Lines**: 68-97
- **Problem**: 
  ```typescript
  for (let t = 0; t < time; t++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // ... evaluation
      }
    }
  }
  ```
- **Worst Case**: 8760 hours * 1000 pixels * 1000 pixels = 8.76 BILLION iterations
- **Blocks Main Thread**: No web worker, synchronous JS execution
- **Even with yielding**: Progress updates every 50,000 pixels may still block
- **Impact**: UI freezes for minutes with large datasets

### Issue 7.2: Nightfall Dataset Triple Nested Loop
- **File**: `/home/user/Lunagis/services/analysisService.ts`
- **Lines**: 141-199
- **Problem**: 
  ```typescript
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelTimeSeries = dataset.map(slice => ...);  // Creates array each iteration
      // ... heavy processing of nightPeriods
    }
  }
  ```
- **Array Creation**: Creates 1M arrays for 1000x1000 image
- **nightPeriods Finding**: O(time) for each pixel
- **Impact**: Minutes of computation, GC pressure

### Issue 7.3: Graticule Line Drawing in Canvas Effect
- **File**: `/home/user/Lunagis/components/DataCanvas.tsx`
- **Lines**: 275-282
- **Problem**: 
  ```typescript
  for (let lon = -180; lon <= 180; lon += lonStep) {
    gratCtx.beginPath();
    for (let i = 0; i <= 100; i++) {  // 101 points per line
      const lat = -90 + (i/100)*180;
      const pt = proj.forward([lon, lat]);  // EXPENSIVE!
      // ... draw
    }
  }
  for (let lat = -90; lat <= 90; lat += latStep) {
    // ... same with 200 points per line
  }
  ```
- **Iterations**: (360/step * 101) + (180/step * 200) proj4 calls
- **For density 1.0**: ~3600 + ~7200 = 10,800 proj4 calls per render!
- **Impact**: Blocks canvas rendering, poor responsiveness

### Issue 7.4: Daylightfraction Span Loop on Every Hover
- **File**: `/home/user/Lunagis/context/AppContext.tsx`
- **Lines**: 268-289
- **Problem**: On EVERY pixel hover:
  ```typescript
  for (let t = start; t <= end; t++) {  // Could be 8760 hours
    const value = sourceLayer.dataset[t][y][x];  // 3D array access
    if (value === 1) dayHours++;
    // ... tracking min/max periods
  }
  ```
- **Called on**: Every mouse move = 60x per second potentially
- **Total**: 8760 iterations * 60 hz = 525,600 array accesses per second!
- **Impact**: CPU maxed during hover

### Issue 7.5: Three-Level Array Access in Hot Loops
- **File**: Multiple files with `dataset[t][y][x]`
- **Problem**: JavaScript array access has lookup overhead
- **Better**: Flatten to 1D array with index calculation
- **Impact**: Cascading performance issue through entire codebase

---

## 8. MISSING LAZY LOADING (MEDIUM SEVERITY)

### Issue 8.1: No React.lazy for Code Splitting
- **File**: `/home/user/Lunagis/components/ControlPanel.tsx`
- **Problem**: Entire panel with all sub-panels loaded at startup
- **Missing**:
  ```typescript
  const LayersPanel = lazy(() => import('./LayersPanel'));
  const ArtifactsPanel = lazy(() => import('./ArtifactsPanel'));
  const ConfigurationPanel = lazy(() => import('./ConfigurationPanel'));
  const MeasurementPanel = lazy(() => import('./MeasurementPanel'));
  ```
- **Impact**: 1061 lines of code for rarely-used panels loaded immediately

### Issue 8.2: D3 and Proj4 Not Lazy Loaded
- **File**: `/home/user/Lunagis/index.html`
- **Problem**: Both loaded on page load even if user just viewing stored data
- **Better**: Load TimeSeriesPlot and coordinate transformation on-demand
- **Impact**: 420KB+ of code loaded before app interactive

### Issue 8.3: No Suspense Boundaries for Async Components
- **File**: `/home/user/Lunagis/App.tsx`
- **Missing**: `<Suspense fallback={...}>` wrappers
- **Impact**: No loading UI while components load

### Issue 8.4: Canvas Effect Not Debounced on Initial Mount
- **File**: `/home/user/Lunagis/components/DataCanvas.tsx`
- **Lines**: 115-287
- **Problem**: Heavy rendering effect runs on every dependency change
- **Missing**: useTransition for non-urgent updates
- **Impact**: Blocks UI during drag/pan

---

## 9. INEFFICIENT ALGORITHMS / DATA STRUCTURES (MEDIUM-HIGH SEVERITY)

### Issue 9.1: LRUCache Using Array.filter for Access Order Update
- **File**: `/home/user/Lunagis/utils/LRUCache.ts`
- **Lines**: 124-129
- **Problem**: 
  ```typescript
  private updateAccessOrder(key: K): void {
    this.accessOrder = this.accessOrder.filter(k => k !== key);  // O(n)!
    this.accessOrder.push(key);
  }
  ```
- **Complexity**: O(n) for every cache hit
- **Better**: Doubly-linked list with node references = O(1)
- **Impact**: With 50 cached canvases, each canvas lookup is O(50)

### Issue 9.2: CanvasLRUCache Incorrect Eviction Logic
- **File**: `/home/user/Lunagis/utils/LRUCache.ts`
- **Lines**: 172-176
- **Problem**: 
  ```typescript
  while (this.currentMemoryBytes + canvasSize > this.maxMemoryBytes && this.size > 0) {
    this.evictOldest();  // Calls keys() which creates new array
  }
  ```
- **Issue**: `keys()` creates array copy every eviction call
- **Better**: Have pointer to oldest without creating arrays
- **Impact**: Inefficient memory cleanup during heavy rendering

### Issue 9.3: Sanitize Layer Name Called Repeatedly
- **File**: `/home/user/Lunagis/services/analysisService.ts`
- **Lines**: 46-47
- **Problem**: 
  ```typescript
  const layerVarNames = sourceLayers.map(l => sanitizeLayerNameForExpression(l.name));
  ```
- **Issue**: Called for EACH expression calculation
- **Better**: Cache in layer object or memoize
- **Impact**: Redundant string operations for every dataset evaluation

### Issue 9.4: JSON.stringify in Hot Path
- **File**: `/home/user/Lunagis/components/DataCanvas.tsx`
- **Line**: 169
- **Problem**: 
  ```typescript
  baseKey += `-${JSON.stringify(layer.customColormap)}`;
  ```
- **Issue**: Serializes array to string for cache key
- **Called**: Every frame for every layer!
- **Better**: Memoize or use stable key like `layer.id + layer.colormapVersion`
- **Impact**: String serialization is expensive, slows cache lookup

### Issue 9.5: Range Finding Algorithm in Nightfall
- **File**: `/home/user/Lunagis/services/analysisService.ts`
- **Lines**: 145-167
- **Problem**: Linear scan for night periods for every pixel
- **Better**: Use binary search or preprocessing
- **Impact**: O(time) per pixel = O(time * height * width) total

---

## 10. BLOCKING OPERATIONS IN MAIN THREAD (MEDIUM SEVERITY)

### Issue 10.1: Canvas Rendering Not Truly Non-Blocking
- **File**: `/home/user/Lunagis/components/DataCanvas.tsx`
- **Lines**: 196-206
- **Problem**: 
  ```typescript
  for (let y = 0; y < height; y++) { 
    for (let x = 0; x < width; x++) {
      const value = slice[y][x];
      const index = (y * width + x) * 4;
      const finalColor = d3.color(colorScale(value));  // D3 color parsing
      imageData.data[index] = finalColor.r;
      imageData.data[index + 1] = finalColor.g;
      imageData.data[index + 2] = finalColor.b;
      imageData.data[index + 3] = finalColor.opacity * 255;
    }
  }
  ```
- **Issue**: No yielding during canvas rendering loop
- **For 1000x1000**: 1M D3 color parsing operations in tight loop
- **Impact**: Blocks thread during map rendering

### Issue 10.2: putImageData Called in Hot Loop
- **File**: `/home/user/Lunagis/components/DataCanvas.tsx`
- **Line**: 207
- **Problem**: After tight loop, puts entire image data - expensive operation
- **Better**: Use web worker to render canvas off-thread
- **Impact**: UI lag when rendering large layers

### Issue 10.3: Proj4 Projection Calls Not Web Worker
- **File**: `/home/user/Lunagis/context/AppContext.tsx`
- **Lines**: 214-236 and throughout DataCanvas
- **Problem**: All projection calculations synchronous
- **For graticule**: 10,800+ proj4 calls per render on main thread
- **Better**: Offload to web worker
- **Impact**: Main thread blocked, smooth scrolling impossible

### Issue 10.4: Artifact Hit Detection Loop on Every Move
- **File**: `/home/user/Lunagis/components/DataCanvas.tsx`
- **Lines**: 669-705
- **Problem**: On EVERY mouse move:
  ```typescript
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const artifact = artifacts[i];
    if (artifact.type === 'path') {
      for (const waypoint of artifact.waypoints) {  // Double loop!
        try {
          const wpProjPos = proj.forward(waypoint.geoPosition);
          const dist = Math.sqrt(Math.pow(...));  // Expensive
        }
      }
    }
  }
  ```
- **Called**: Every mousemove = 60x per second
- **Waypoints**: Could be thousands per artifact
- **Impact**: CPU spikes during interaction over artifacts

### Issue 10.5: Heavy Regular Expressions in Parsing
- **File**: `/home/user/Lunagis/services/expressionEvaluator.ts`
- **Lines**: 22
- **Problem**: 
  ```typescript
  const regex = /\s*(>=|<=|==|>|<|\(|\)|[a-zA-Z_][a-zA-Z0-9_]*|\d+(\.\d+)?|\S)\s*/g;
  ```
- **Issue**: Complex regex with lookahead/lookbehind is slow
- **Called during**: Expression parsing for every evaluation
- **Better**: Simpler tokenizer or pre-compiled parser
- **Impact**: Expression layer calculations slower than necessary

---

## ADDITIONAL ISSUES

### A.1: Duplicate Code Patterns
- `/home/user/Lunagis/context/AppContext.tsx` lines 337-340 and 800-801: Identical nested loops for dataset initialization

### A.2: Unnecessary String Conversions
- `/home/user/Lunagis/components/ControlPanel.tsx` line 30: Creates new animation-fade-in string on every render

### A.3: No Web Worker Support
- Entire codebase: All heavy computation (expression, nightfall, daylighting) runs on main thread
- Missing: Web Worker implementation for computation

### A.4: No IndexedDB Caching
- Session data serialized to JSON only, no persistent cache
- Every import re-parses NPY from scratch

### A.5: No Service Worker
- No offline support
- No caching strategy for loaded data

---

## SEVERITY CLASSIFICATION

**CRITICAL (Immediate Action Required):**
1. Triple nested loop blocking (Expression layer, Nightfall - up to 8.76B iterations)
2. Massive unvirtualized lists (1000+ layer DOM nodes)
3. Memory leaks in ObjectURL (unbounded growth)
4. 1000+ line monolithic component

**HIGH (Should Fix Soon):**
1. Missing React.memo on list items (N² re-renders)
2. No code splitting (full app bundle)
3. N+1 array creation in analysis (1M intermediate arrays)
4. Event listener leaks in TimeSlider
5. Missing lazy loading (420KB unnecessary code)

**MEDIUM (Optimize):**
1. Inefficient LRU cache (O(n) operations)
2. JSON.stringify in hot path (cache keys)
3. Blocking canvas operations (no web worker)
4. Graticule rendering (10K+ proj4 calls)
5. Unoptimized PNG loading (no compression)

---

## RECOMMENDATIONS (Prioritized)

### Phase 1 - Critical Fixes (Days 1-3)
1. Add React.memo to LayerItem, ArtifactItem (5 min fix, huge impact)
2. Implement virtual list for layers/artifacts/waypoints (2-3 hours, use react-virtual)
3. Move triple-nested loops to Web Worker (4-6 hours)
4. Add URL.revokeObjectURL cleanup (15 min, prevents memory leak)

### Phase 2 - High Impact (Days 4-7)
1. Split ControlPanel into separate files (2-3 hours)
2. Implement code splitting with Vite (2 hours)
3. Add React.lazy for components (1 hour)
4. Memoize context to prevent cascading updates (3-4 hours)

### Phase 3 - Medium Priority (Week 2)
1. Replace LRUCache with proper doubly-linked list (2 hours)
2. Offload proj4 calculations to Web Worker (4-6 hours)
3. Add virtual scrolling to waypoints (1-2 hours)
4. Optimize canvas color parsing (batch operations)

### Phase 4 - Polish (Week 3+)
1. Add service worker for caching
2. Implement IndexedDB session storage
3. Profile and optimize remaining hot paths
4. Add performance monitoring

