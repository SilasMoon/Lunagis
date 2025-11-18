# Lunagis Codebase Refactoring Analysis Report

**Analysis Date:** 2025-11-17  
**Repository:** Lunagis (Temporal Data Viewer)  
**Framework:** React 19 + TypeScript + Tailwind CSS  
**Tech Stack:** Vite, D3.js, Proj4.js  
**Total Files:** 38 TypeScript/TypeScript React files  
**Total Lines:** ~11,175 lines

---

## Executive Summary

The Lunagis codebase is a React-based temporal data viewer application with moderate-to-high complexity. The analysis reveals **significant architectural and code quality issues** that warrant targeted, strategic refactoring rather than a wholesale overhaul. While no critical security or functionality issues were found, the codebase exhibits:

- **Architectural concerns**: Monolithic context with 40+ state variables, oversized components (2000+ lines), poor separation of concerns
- **Code quality issues**: Duplicate types and implementations, loose typing (`any` types), repetitive layer-type checking patterns
- **Technical debt**: Large modal components, unclear ownership patterns, suboptimal state management
- **Performance issues**: Already documented in existing performance analysis report (42+ issues identified)

**Recommendation: STRATEGIC TARGETED REFACTORING is justified** - Focus on high-impact areas with clear ROI rather than a full rewrite.

---

## 1. CODEBASE HEALTH ASSESSMENT

### 1.1 Positive Indicators ✓

- **Type Safety**: TypeScript is used throughout with strict configuration
- **No Critical TODOs**: Absence of TODO/FIXME comments suggests maturity
- **Modular Dependencies**: Minimal external dependencies (only React, Lucide icons, D3, Proj4)
- **Component Organization**: Components properly separated into `/components`, `/services`, `/hooks`, `/utils`, `/context`
- **Error Handling**: Centralized error messages and error boundary components in place
- **Clear Naming**: Component and function names are generally descriptive
- **CSS Framework**: Consistent use of Tailwind CSS

### 1.2 Negative Indicators ✗

| Area | Issue | Severity |
|------|-------|----------|
| **Component Size** | DataCanvas.tsx (2054 lines), ControlPanel.tsx (1693 lines), AppContext.tsx (1381 lines) | CRITICAL |
| **State Management** | AppContext has 40+ useState hooks managing disparate concerns | CRITICAL |
| **Type Safety** | 8+ instances of `any` type reducing type safety | HIGH |
| **Code Duplication** | Duplicate layer types (DataLayer, DteCommsLayer, LpfCommsLayer, AnalysisLayer) | HIGH |
| **Implementation Duplication** | LRUCache and OptimizedLRUCache both exist (should consolidate) | MEDIUM |
| **Repetitive Patterns** | Layer type checks repeated: `layer.type === 'data' \|\| layer.type === 'dte_comms' \|\| ...` | MEDIUM |
| **Modal Components** | UserManualModal (604 lines), ActivityTimelineModal (551 lines) could be split | MEDIUM |

---

## 2. CODE QUALITY ISSUES IDENTIFIED

### 2.1 Duplicate Code Patterns

#### Issue A: Layer Type Definition Duplication

**Location**: `/types.ts` (lines 68-105, 239-273)

**Problem**: Three nearly identical layer types with only the discriminator `type` field differing:
```typescript
// Lines 68-79: DataLayer
export interface DataLayer extends LayerBase {
  type: 'data';
  dataset: DataSet;
  fileName: string;
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  transparencyLowerThreshold?: number;
  transparencyUpperThreshold?: number;
  dimensions: { time: number; height: number; width: number };
}

// Lines 81-92: DteCommsLayer (identical except type)
// Lines 94-105: LpfCommsLayer (identical except type)
```

**Impact**: 
- Changes to data layer structure require updating 3 interfaces + 3 serializable variants
- Increases cognitive load when adding new fields
- Higher chance of inconsistencies

**Refactoring Strategy**: Extract common properties to a mixin/base type or use generic type parameter:
```typescript
interface DataGridLayer<T extends string> extends LayerBase {
  type: T;
  dataset: DataSet;
  fileName: string;
  range: { min: number; max: number };
  // ... common properties
}

type DataLayer = DataGridLayer<'data'>;
type DteCommsLayer = DataGridLayer<'dte_comms'>;
type LpfCommsLayer = DataGridLayer<'lpf_comms'>;
```

#### Issue B: Cache Implementation Duplication

**Location**: `/utils/LRUCache.ts` (230 lines) vs `/utils/OptimizedLRUCache.ts` (333 lines)

**Problem**: Two separate LRU cache implementations:
- `LRUCache`: Uses array-based access order tracking (O(n) operations)
- `OptimizedLRUCache`: Uses doubly-linked list (O(1) operations) - better performance

**Current Usage**: 
- Only `OptimizedLRUCache` is actually used in codebase (in `analysisCache.ts`)
- `LRUCache` appears to be abandoned/legacy code

**Impact**: 
- Confusion about which implementation to use
- Maintenance burden of two implementations
- Dead code not removed

**Refactoring Strategy**: Delete `LRUCache.ts` entirely - the `OptimizedLRUCache` is superior and already in use.

#### Issue C: Repetitive Layer Type Checking

**Location**: Multiple files (DataCanvas.tsx, ControlPanel.tsx)

**Pattern Found**:
```typescript
// DataCanvas.tsx line 649
if ((layer.type === 'data' || layer.type === 'analysis' || 
     layer.type === 'dte_comms' || layer.type === 'lpf_comms') && proj)

// ControlPanel.tsx line 879
layers.some((l: Layer) => l.type === 'data' || l.type === 'analysis' || 
            l.type === 'dte_comms' || l.type === 'lpf_comms')
```

**Refactoring Strategy**: Create helper functions:
```typescript
// utils/layerHelpers.ts
export const isDataGridLayer = (layer: Layer): 
  layer is DataLayer | AnalysisLayer | DteCommsLayer | LpfCommsLayer => {
  return ['data', 'analysis', 'dte_comms', 'lpf_comms'].includes(layer.type);
};

// Usage
if (isDataGridLayer(layer) && proj) { ... }
```

### 2.2 Inconsistent Naming Conventions

**Issue**: Activity definition names in code vs display names

**Location**: `/context/AppContext.tsx` lines 234-244

```typescript
{ id: 'DTE_COMMS', name: 'TTC_COMMS', defaultDuration: 3600 },
{ id: 'LPF_COMMS', name: 'PL_COMMS', defaultDuration: 60 },
```

**Observation**: `id` and `name` fields use different naming conventions (UPPERCASE vs Mixed). This might be intentional (id for programmatic use, name for display), but it's not documented and creates mental overhead.

**Recommendation**: Add documentation clarifying the naming convention intent.

### 2.3 Large Components/Files

#### DataCanvas.tsx (2,054 lines)

**Breakdown**:
- Main canvas rendering: ~1,400 lines
- Event handlers (drag, click, hover): ~300 lines
- Helper functions (calculateGeoDistance, hashColormap, createColorLookupTable): ~100 lines
- Rendering logic for multiple layer types: ~254 lines

**Issues**:
- Difficult to understand full component logic
- Hard to test individual features
- Maintenance burden is high
- Makes code review difficult

**Refactoring Suggestions**:
1. Extract layer rendering into separate modules by type
2. Extract event handlers into a custom hook
3. Extract helper utilities into `/utils` folder
4. Reduce to ~1,000-1,200 lines through decomposition

**Target**: Split into:
- `DataCanvas.tsx` (main component, ~800 lines)
- `useCanvasRendering.ts` (rendering logic, ~400 lines)
- `useCanvasEvents.ts` (event handling, ~300 lines)
- `canvasHelpers.ts` (utilities)

#### ControlPanel.tsx (1,693 lines)

**Breakdown**:
- LayersPanel sub-component: ~200 lines
- ArtifactsPanel sub-component: ~170 lines
- MeasurementPanel sub-component: ~50 lines
- ConfigurationPanel sub-component: ~130 lines
- EventsPanel sub-component: ~300 lines
- ExpressionEditor sub-component: ~90 lines
- AddLayerMenu sub-component: ~90 lines
- Miscellaneous helpers and styling: ~470 lines

**Issues**:
- All sub-components in single file
- Each panel should ideally be its own file
- Difficult to navigate and edit specific panels
- Mixed concerns (UI logic, file handling, state management)

**Refactoring Suggestions**:
Extract each panel into separate component files:
```
/components/
  ├── ControlPanel.tsx (100 lines - just router)
  ├── LayersPanel/
  │   ├── LayersPanel.tsx
  │   ├── AddLayerMenu.tsx
  │   ├── ExpressionEditor.tsx
  │   └── CustomColormapEditor.tsx
  ├── ArtifactsPanel/
  │   ├── ArtifactsPanel.tsx
  │   └── ArtifactItem.tsx
  ├── ConfigurationPanel.tsx
  ├── MeasurementPanel.tsx
  └── EventsPanel.tsx
```

#### AppContext.tsx (1,381 lines)

**State Variables**: 40+ useState hooks managing:
- Layer state (layers, activeLayerId)
- Time state (timeRange, currentDateIndex, isPlaying, isPaused, playbackSpeed)
- UI state (activeTool, showGraticule, showGrid, selected cells)
- Artifact state (artifacts, activeArtifactId, draggedInfo)
- Analysis state (timeZoomDomain, daylightFractionHoverData)
- Display options (artifactDisplayOptions, pathCreationOptions)
- Activity/Event state (activityDefinitions, events)
- Undo/Redo state (implicit in hooks)

**Issues**:
- Monolithic context violates Single Responsibility Principle
- Any component subscribing to this context re-renders on ANY state change
- 40 useState hooks is extreme - suggests state is grouped incorrectly
- Context value object created on every render (should be memoized)

**Refactoring Strategy**: Split into multiple specialized contexts:

```
/context/
├── AppContext.tsx (router/wrapper)
├── LayerContext.tsx (layers, activeLayerId, baseMap data)
├── TimeContext.tsx (timeRange, currentDateIndex, playback state)
├── UIContext.tsx (activeTool, selections, UI toggles)
├── ArtifactContext.tsx (artifacts, waypoints, display options)
├── AnalysisContext.tsx (analysis-specific state)
└── HistoryContext.tsx (undo/redo)
```

**Benefits**:
- Components only re-render when their specific concern changes
- Easier to test and reason about
- Clearer data flow
- Better performance (fewer context subscribers triggering re-renders)

#### UserManualModal.tsx (604 lines)

**Content**:
- Mostly static documentation content (~550 lines)
- Minimal interactive elements

**Issues**:
- Large modal makes file hard to manage
- Documentation mixed with React component code
- Could be better served as a separate docs file

**Refactoring**:
- Extract documentation content to separate markdown file
- Use modal component to render markdown
- Reduce component to ~100-150 lines

#### ActivityTimelineModal.tsx (551 lines)

**Issues**:
- Complex logic for activity timeline editing
- Template management mixed with modal UI
- Could benefit from extracted hooks and utilities

**Refactoring**:
- Extract timeline manipulation logic to `useActivityTimeline.ts`
- Extract template management to `useActivityTemplates.ts`
- Reduce component to ~300-350 lines

### 2.4 Type Safety Issues

#### Use of `any` Type

**Locations** (8+ instances):
- `/services/colormap.ts` line 5: `declare const d3: any;`
- `/components/DataCanvas.tsx` lines 13-14: `declare const d3: any;` and `declare const proj4: any;`
- `/components/ControlPanel.tsx` lines 24, 41: Function parameters `proj: any`
- `/utils/OptimizedLRUCache.ts` line 293: Cast to `any`
- Multiple other files

**Impact**:
- Reduces type safety and IDE autocomplete
- Makes refactoring harder (can't rely on type checker)
- Hides potential runtime errors

**Root Cause**: External libraries (D3, Proj4) loaded from global scope don't have proper TypeScript declarations

**Solution**:
1. Install type definitions if available: `@types/d3`, `@types/proj4`
2. If not available, create ambient type declarations in `/types/global.d.ts`
3. Create wrapper functions with proper types:
   ```typescript
   // utils/d3Helpers.ts
   declare const d3: typeof import('d3');
   
   export const createColorScale = (colorMap: ColorMapName) => {
     // return typed color scale
   };
   ```

### 2.5 Missing Abstraction Layers

#### Layer Type Discrimination

**Issue**: No centralized logic for handling different layer types

**Current Pattern**:
```typescript
if (layer.type === 'basemap') { /* handle basemap */ }
else if (layer.type === 'image') { /* handle image */ }
else if (layer.type === 'data') { /* handle data */ }
else if (layer.type === 'analysis') { /* handle analysis */ }
```

**Recommendation**: Create layer handler registry:
```typescript
// services/layerHandlers.ts
interface LayerHandler<T extends Layer> {
  render(layer: T, context: RenderContext): void;
  update(layer: T, updates: Partial<T>): T;
  serialize(layer: T): SerializableLayer;
  validate(layer: T): ValidationResult;
}

const layerHandlers: Record<Layer['type'], LayerHandler<any>> = {
  'basemap': new BaseMapLayerHandler(),
  'data': new DataLayerHandler(),
  'image': new ImageLayerHandler(),
  // ...
};

// Usage
const handler = layerHandlers[layer.type];
handler.render(layer, context);
```

---

## 3. ARCHITECTURAL CONCERNS

### 3.1 Separation of Concerns

#### Problem: Context Contains Everything

The `AppContext` serves multiple roles:
- State management
- Event handler definitions
- Complex business logic (coordinate transformation, cell snapping)
- Undo/redo management

**Impact**: Single responsibility principle violated, making it hard to reason about and test.

#### Problem: Components Mix Concerns

Examples:
- `DataCanvas`: Canvas rendering + event handling + layer type dispatching
- `ControlPanel`: UI routing + file import logic + artifact manipulation
- `ActivityTimelineModal`: UI + data fetching + mutation logic

**Recommendation**: Use custom hooks to separate concerns:
- Logic hooks (handle state and computation)
- UI hooks (handle events and rendering)
- Data hooks (handle fetching and caching)

### 3.2 Component Organization

**Current Structure**:
```
/components
├── DataCanvas.tsx (2054 lines)
├── ControlPanel.tsx (1693 lines)
├── ActivityTimelineModal.tsx (551 lines)
├── UserManualModal.tsx (604 lines)
├── WaypointEditModal.tsx (353 lines)
└── ...14 other components
```

**Issues**:
- No clear hierarchical organization
- Modal components not grouped
- Utility/helper components mixed with feature components

**Recommended Structure**:
```
/components
├── Canvas/
│   ├── DataCanvas.tsx
│   ├── useCanvasRendering.ts
│   └── canvasHelpers.ts
├── Panels/
│   ├── ControlPanel.tsx
│   ├── LayersPanel/
│   ├── ArtifactsPanel/
│   ├── EventsPanel/
│   └── ConfigurationPanel/
├── Modals/
│   ├── UserManualModal.tsx
│   ├── ActivityTimelineModal.tsx
│   ├── WaypointEditModal.tsx
│   └── ImportFilesModal.tsx
├── UI/
│   ├── Colorbar.tsx
│   ├── StatusBar.tsx
│   ├── Toast.tsx
│   └── ProgressOverlay.tsx
└── Shared/
    ├── ErrorBoundary.tsx
    └── ZoomControls.tsx
```

### 3.3 State Management Pattern Issues

#### Issue: No Clear Data Flow Model

- Unclear which component "owns" which state
- Circular dependencies possible (component A updates context, context notifies component B, which updates context again)
- No clear validation of state transitions

#### Issue: Undo/Redo Only Covers Artifacts/Events

**Location**: `/context/AppContext.tsx` lines 264-279

Current implementation:
```typescript
type HistoryState = {
  artifacts: Artifact[];
  events: Event[];
};
```

**Problem**: Layers, which are first-class data, aren't included in undo/redo because they contain non-serializable data (HTMLImageElement, binary datasets).

**Better Approach**: Separate mutable state from immutable state:
- Mutable (undo-able): artifacts, events, layer metadata
- Immutable (cache): layer binary data, images

### 3.4 Performance Architecture Issues

**Already Documented**: See `/PERFORMANCE_ANALYSIS.md`

Key issues:
- No React.memo on list items (LayerItem, ArtifactItem)
- Context value not memoized (recreated on every render)
- 15+ dependencies in main effect
- Keyboard shortcuts array recreated on every render

---

## 4. TECHNICAL DEBT INDICATORS

### 4.1 Console Error Logging

**Found**: 14+ `console.error()` calls in production code

**Examples**:
- `/context/AppContext.tsx` lines 231, 259: Activity definition loading errors
- `/components/DataCanvas.tsx` lines 403, 529: Graticule and image layer errors
- `/services/vrtParser.ts` line 48: VRT parsing errors

**Issues**:
- Silent failures - errors logged but not shown to users
- No user feedback mechanism for failures
- Inconsistent error handling patterns

**Recommendation**: Use centralized error handling with user notification:
```typescript
// Use existing Toast infrastructure
const { showError } = useToast();
try {
  // operation
} catch (error) {
  showError(`Failed to load definitions: ${error.message}`);
}
```

### 4.2 Console Warnings

**Found**:
- `/utils/LRUCache.ts` line 181: Canvas cache size warning
- `/utils/fileValidation.ts` line 97: File MIME type warning
- `/services/npyParser.ts` line 80: Float64 downcast warning

**Issues**:
- Warnings indicate non-ideal conditions that users should know about
- Not presented to users
- No action items associated with warnings

### 4.3 Workarounds and Comments Indicating Technical Debt

**Found Comments**:
- `/types.ts` line 1-2: "Fix: Removed invalid file header"
- `/App.tsx` line 1: "Fix: Removed invalid file header"
- `/context/AppContext.tsx` lines 56-73: Coordinate transformer calculation is complex and could use explanation
- `/components/DataCanvas.tsx` lines 293-300: OPTIMIZATION comments indicating performance was an afterthought

**Observation**: Code has been patched to fix issues but deeper architectural problems remain.

---

## 5. TECH STACK REVIEW

### 5.1 Dependencies Analysis

```json
{
  "react": "^19.2.0",           // Latest, good
  "react-dom": "^19.2.0",       // Latest, good
  "lucide-react": "^0.553.0",   // Modern icon library, good
  "vite": "^6.2.0",             // Latest build tool, good
  "typescript": "~5.8.2",       // Up-to-date, good
  "@vitejs/plugin-react": "^5.0.0",  // Latest React plugin, good
  "@types/node": "^22.14.0"     // Latest, good
}
```

**Assessment**: Minimal dependencies (good), all up-to-date (good)

**Gap**: No testing framework (Jest, Vitest) or testing libraries (React Testing Library) installed

### 5.2 External Library Load Pattern

**Issue**: Libraries loaded via global CDN in `index.html`:
- D3.js (320KB minified)
- Proj4.js (100KB minified)
- Tailwind CSS (entire framework)

**Impact**:
- No tree-shaking
- No lazy loading
- Large upfront payload

**Recommendation**:
- Install as npm packages: `npm install d3 proj4`
- Remove from CDN
- Let Vite bundle and optimize
- Use `npm install --save-dev @types/d3 @types/proj4`

---

## 6. RISK ASSESSMENT

### High Risk Areas (Refactoring May Introduce Bugs)

| Area | Risk | Mitigation |
|------|------|-----------|
| **DataCanvas rendering** | HIGH | Add comprehensive unit tests before refactoring |
| **Layer type dispatching** | MEDIUM | Type guards reduce risk |
| **Coordinate transformations** | HIGH | Geometric calculations are error-prone |
| **AppContext splitting** | MEDIUM | Need to maintain backward compatibility with existing subscribers |
| **Artifact undo/redo** | MEDIUM | Complex state tracking - test thoroughly |

### Medium Risk Areas

| Area | Risk | Notes |
|------|------|-------|
| **Modal component extraction** | LOW | Mostly UI, safer to refactor |
| **Helper function extraction** | LOW | Pure functions, can be tested independently |
| **Type improvements** | LOW | Can add types incrementally |
| **Cache consolidation** | LOW | One implementation unused, safe to delete |

---

## 7. PRIORITY REFACTORING AREAS

### Phase 1: HIGH IMPACT, LOW RISK (Weeks 1-2)

**Estimated Effort**: 5-10 person-days

1. **Delete unused LRUCache.ts** (1 hour)
   - Impact: Reduces confusion, removes dead code
   - Risk: None (not used anywhere)

2. **Create layer helper utilities** (4 hours)
   - Extract repetitive layer type checks
   - Impact: Reduces duplicate code, improves maintainability
   - Risk: Low (pure functions)

3. **Create helper functions for layer-agnostic operations** (4 hours)
   - `isDataGridLayer()`, `hasDataset()`, `getLayerDimensions()`
   - Impact: Reduces if-else chains, centralizes logic
   - Risk: Low

4. **Extract coordinate transformation to custom hook** (8 hours)
   - Create `useCoordinateTransformation.ts`
   - Impact: Easier to test and understand
   - Risk: Medium (needs validation)

5. **Add type definitions for D3 and Proj4** (4 hours)
   - Install `@types/d3` and `@types/proj4`
   - Remove `any` type casts
   - Impact: Better IDE support, type safety
   - Risk: Low

**Expected Outcome**: 
- Code duplication reduced by ~15%
- Type safety improved
- Foundation for larger refactors

### Phase 2: MEDIUM IMPACT, MEDIUM RISK (Weeks 3-4)

**Estimated Effort**: 15-20 person-days

1. **Split ControlPanel into separate component files** (10 hours)
   - Move each panel to own file
   - Move AddLayerMenu and ExpressionEditor
   - Impact: Easier to navigate, edit, and test
   - Risk: Medium (prop drilling may be needed)

2. **Extract modal component logic to custom hooks** (8 hours)
   - `useActivityTimeline.ts` for ActivityTimelineModal
   - `useWaypointEdit.ts` for WaypointEditModal
   - Impact: Easier to test, reusable logic
   - Risk: Medium

3. **Memoize context value and split large contexts** (12 hours)
   - Start with creating focused contexts (TimeContext, UIContext)
   - Migrate one context at a time
   - Impact: Better performance, clearer separation
   - Risk: High (needs careful migration)

4. **Add React.memo to list item components** (2 hours)
   - LayerItem, ArtifactItem
   - Impact: Performance improvement
   - Risk: Low

**Expected Outcome**:
- Component file sizes reduced
- Context re-renders reduced
- Performance improvements (~10-20% faster re-renders)

### Phase 3: LOWER IMPACT, HIGHER RISK (Weeks 5+)

**Estimated Effort**: 20-30 person-days

1. **Decompose DataCanvas component** (15 hours)
   - Extract rendering logic
   - Extract event handlers
   - Risk: High (critical component, complex logic)
   - Requires comprehensive testing

2. **Consolidate duplicate type definitions** (4 hours)
   - Create generic DataGridLayer type
   - Update all references
   - Risk: Medium

3. **Create layer handler registry pattern** (10 hours)
   - Implement handler interfaces
   - Replace scattered if-else chains
   - Risk: Medium

4. **Add test suite** (ongoing)
   - Unit tests for extracted logic
   - Integration tests for refactored components
   - Essential for reducing risk in large refactors

**Expected Outcome**:
- Codebase becomes more maintainable
- Easier to add new layer types
- Better separation of concerns

---

## 8. WHOLE CODEBASE REFACTOR ASSESSMENT

### Would a Wholesale Refactor Be Justified?

**Answer: NO** - A targeted approach is better for these reasons:

**Against Whole Rewrite**:
1. **Existing functionality works well** - despite code quality issues, the app functions correctly
2. **High context loss risk** - rewriting could introduce subtle bugs in complex calculations (coordinate transforms, rendering)
3. **Longer timespan** - 4-6 weeks of rewrite vs 2-3 weeks of targeted refactoring
4. **Business continuity** - ongoing development paused during rewrite
5. **Unknown unknowns** - specialized domain knowledge (geospatial, temporal data) embedded in code

**For Targeted Refactoring**:
1. **Lower risk** - changes can be incrementally tested
2. **Parallel development** - teams can continue feature work
3. **Quick wins** - Phase 1 deliverable in 1-2 weeks
4. **Better knowledge retention** - existing code understood and improved
5. **Clear ROI** - each phase has measurable improvements

---

## 9. SPECIFIC RECOMMENDATIONS

### 9.1 Immediate Actions (Do This Now)

1. **Delete `/utils/LRUCache.ts`** - It's unused and `OptimizedLRUCache` is superior
   
2. **Create `/utils/layerHelpers.ts`**:
   ```typescript
   export const isDataGridLayer = (layer: Layer): layer is DataLayer | AnalysisLayer | DteCommsLayer | LpfCommsLayer => {
     return layer.type === 'data' || layer.type === 'analysis' || 
            layer.type === 'dte_comms' || layer.type === 'lpf_comms';
   };
   
   export const hasDataset = (layer: Layer): layer is DataLayer | AnalysisLayer | DteCommsLayer | LpfCommsLayer => {
     return 'dataset' in layer;
   };
   
   export const getLayerDataset = (layer: Layer): DataSet | null => {
     return 'dataset' in layer ? layer.dataset : null;
   };
   ```

3. **Install type definitions**:
   ```bash
   npm install --save-dev @types/d3 @types/proj4
   ```
   Remove `declare const d3: any;` statements and use proper imports.

4. **Consolidate error handling**:
   Replace all `console.error()` with proper Toast notifications using existing `useToast()` hook.

### 9.2 Short-term Improvements (1-2 weeks)

1. **Create separate component files for ControlPanel panels**:
   - `/components/Panels/LayersPanel.tsx`
   - `/components/Panels/ArtifactsPanel.tsx`
   - `/components/Panels/EventsPanel.tsx`
   - `/components/Panels/ConfigurationPanel.tsx`
   - `/components/Panels/MeasurementPanel.tsx`

2. **Extract repeated distance calculation**:
   - Move `calculateProjectedDistance` and `calculatePathDistance` to `/utils/geometryHelpers.ts`
   - Share between ControlPanel and DataCanvas

3. **Memoize context value and expensive computations**:
   - Wrap context value with `useMemo`
   - Memoize coordinate transformer functions

### 9.3 Medium-term Improvements (2-4 weeks)

1. **Start splitting AppContext into specialized contexts**:
   - Begin with `TimeContext` (simplest, lowest risk)
   - Then `UIContext`
   - Migrate consumers incrementally

2. **Extract modal logic to custom hooks**:
   - `useActivityTimeline()` - handles timeline operations
   - `useActivityTemplates()` - handles template CRUD
   - Reduces ActivityTimelineModal complexity

3. **Add React.memo to list components**:
   - `LayerItem`
   - `ArtifactItem`
   - Measure performance improvement

### 9.4 Long-term Improvements (4+ weeks)

1. **Consolidate layer type definitions** using generic types

2. **Decompose DataCanvas**:
   - Extract rendering to `useCanvasRendering.ts`
   - Extract event handling to `useCanvasEvents.ts`
   - Create layer-specific rendering modules

3. **Establish layer handler pattern** for consistent layer operations

4. **Add comprehensive test coverage**:
   - Unit tests for utilities and helpers
   - Component tests for refactored components
   - Integration tests for complex workflows

---

## 10. ESTIMATED EFFORT & TIMELINE

### Timeline Estimate: 6-8 Weeks

**Phase 1 (Weeks 1-2): Foundation** - 5-10 days
- Delete dead code
- Add type definitions
- Create helper utilities
- Expected ROI: Code clarity, foundation for later phases

**Phase 2 (Weeks 3-4): Component Refactoring** - 15-20 days
- Split ControlPanel
- Extract modal logic to hooks
- Begin context splitting
- Expected ROI: 10-20% performance improvement, 30% easier to maintain

**Phase 3 (Weeks 5-6): DataCanvas & Architecture** - 15-20 days
- Decompose DataCanvas
- Consolidate types
- Create layer handlers
- Expected ROI: 20-30% performance improvement, major maintainability gains

**Phase 4 (Weeks 7-8): Testing & Validation** - 10-15 days
- Add unit tests
- Integration tests
- Performance verification
- Expected ROI: Confidence in refactored code, catch regressions

**Total**: 45-65 person-days (6-8 weeks with one developer)

---

## 11. RISKS AND MITIGATION

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Coordinate transformation bugs | Medium | High | Add unit tests first, validate with existing test cases |
| Context splitting breaks consumers | High | Medium | Create adapters, migrate gradually, add integration tests |
| Canvas rendering performance regression | Medium | High | Benchmark before/after, use React DevTools Profiler |
| Modal component extraction issues | Low | Low | Extract one at a time, test thoroughly |
| Type changes cause compilation errors | Low | Low | Use TypeScript compiler incrementally |

---

## 12. SUCCESS METRICS

Track these metrics before and after refactoring:

1. **Code Quality**
   - Lines per component (target: <600 lines)
   - Number of `any` types (target: 0)
   - Cyclomatic complexity (target: <15 per function)
   - Test coverage (target: >50%)

2. **Performance**
   - Re-render frequency (measure with React DevTools)
   - Time to interactive (TTI) in browser
   - Bundle size (track with Vite build analyzer)
   - Context update latency

3. **Maintainability**
   - Average file size (target: <300 lines)
   - Number of files per feature (target: 3-5)
   - Type safety (target: no `any` types)
   - Error handling consistency

---

## 13. CONCLUSION

The Lunagis codebase is **functional but showing signs of technical debt**. The application successfully implements complex temporal data visualization, but the implementation exhibits:

- **Architectural issues**: Monolithic context, oversized components
- **Code quality issues**: Duplication, loose typing, weak separation of concerns
- **Technical debt**: Unused code, inconsistent patterns, missing type definitions

**Recommendation**: Pursue **STRATEGIC TARGETED REFACTORING** over 6-8 weeks, focusing on:
1. High-impact, low-risk changes first (Phase 1)
2. Incremental improvements with measurable ROI (Phases 2-3)
3. Comprehensive testing to ensure quality (Phase 4)

This approach minimizes risk while significantly improving code quality, maintainability, and performance. A whole-codebase rewrite is **not justified** given the functional nature of the existing code and the risks involved in rewriting complex logic.

**Next Steps**: 
1. Prioritize Phase 1 improvements for quick wins
2. Establish testing infrastructure
3. Plan context splitting strategy
4. Begin with ControlPanel decomposition as lowest-risk, high-impact change

---

**Report Generated**: 2025-11-17
**Analysis Scope**: Complete codebase review (38 files, ~11,175 lines)
**Reviewer**: Code analysis tool
