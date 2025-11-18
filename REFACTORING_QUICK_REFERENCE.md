# Lunagis Refactoring Quick Reference

**Full Analysis**: See `REFACTORING_ANALYSIS.md` (880 lines)

---

## Executive Summary

The codebase is **functional but needs strategic refactoring**. Three massive components (2,054, 1,693, 1,381 lines) and 40+ useState hooks cause maintainability issues.

**Recommendation**: TARGETED REFACTORING (6-8 weeks) - NOT a full rewrite

---

## Critical Issues Found

| Issue | Severity | Impact | Fix Effort |
|-------|----------|--------|-----------|
| DataCanvas.tsx (2,054 lines) | CRITICAL | Hard to maintain, test, review | 15-20 hours |
| ControlPanel.tsx (1,693 lines) | CRITICAL | All panels in one file | 10-15 hours |
| AppContext.tsx (40+ useState) | CRITICAL | Monolithic state, cascading re-renders | 20-30 hours |
| Duplicate layer types | HIGH | 3x identical interfaces | 4 hours |
| Unused LRUCache.ts | MEDIUM | Dead code | 1 hour |
| 8+ `any` types | HIGH | Reduced type safety | 4 hours |
| Repetitive type checks | MEDIUM | Pattern: `type === 'a' \|\| type === 'b'` | 4 hours |

---

## Quick Wins (Phase 1: Week 1-2)

1. **Delete LRUCache.ts** (1 hour) ← Start here!
2. **Create layerHelpers.ts** with `isDataGridLayer()` (4 hours)
3. **Install @types/d3, @types/proj4** (1 hour)
4. **Replace console.error() with Toast notifications** (4 hours)
5. **Extract coordinate transformation logic** (8 hours)

**Expected ROI**: 15% code reduction, better type safety

---

## Medium-term Improvements (Phase 2-3: Week 3-6)

- Split ControlPanel into separate files (10 hours)
- Extract modal logic to custom hooks (8 hours)
- Create specialized contexts (TimeContext, UIContext) (20 hours)
- Decompose DataCanvas component (15 hours)

**Expected ROI**: 10-30% performance improvement, 30% easier to maintain

---

## Key Refactoring Targets

### 1. Layer Type Duplication
```typescript
// PROBLEM: 3 nearly identical interfaces
DataLayer, DteCommsLayer, LpfCommsLayer

// SOLUTION: Use generic type
interface DataGridLayer<T extends string> extends LayerBase { ... }
type DataLayer = DataGridLayer<'data'>;
```

### 2. ControlPanel Size (1,693 lines)
```typescript
// PROBLEM: All panels in one file
LayersPanel, ArtifactsPanel, ConfigurationPanel, etc.

// SOLUTION: Separate component files
/components/Panels/LayersPanel.tsx
/components/Panels/ArtifactsPanel.tsx
/components/Panels/EventsPanel.tsx
```

### 3. AppContext Monolith (40+ useState)
```typescript
// PROBLEM: One context with everything
layers, timeRange, artifacts, events, UI settings, etc.

// SOLUTION: Split into specialized contexts
LayerContext, TimeContext, UIContext, ArtifactContext, AnalysisContext
```

### 4. Repetitive Layer Checks
```typescript
// PROBLEM: Scattered throughout code
layer.type === 'data' || layer.type === 'analysis' || 
layer.type === 'dte_comms' || layer.type === 'lpf_comms'

// SOLUTION: Helper function
const isDataGridLayer = (layer): boolean => { ... }
```

### 5. Type Safety (`any`)
```typescript
// PROBLEM: 8+ instances of `any` type
declare const d3: any;
const calculateProjectedDistance = (proj: any, ...) => { ... }

// SOLUTION: Install types, import properly
import type { Selection } from 'd3';
```

---

## Risk Levels

| Area | Risk | Approach |
|------|------|----------|
| Delete unused code | NONE | Do immediately |
| Extract helpers | LOW | Pure functions, easy to test |
| Split components | MEDIUM | One panel at a time |
| Split contexts | MEDIUM-HIGH | Gradual migration needed |
| Refactor DataCanvas | HIGH | Needs comprehensive testing first |

---

## Success Metrics

### Before Refactoring (Current)
- Largest file: 2,054 lines (DataCanvas)
- Context state: 40+ useState hooks
- Type safety: 8+ `any` types
- Dead code: 230 lines (LRUCache)

### After Refactoring (Target)
- Largest file: <600 lines
- Context state: 5-10 per context
- Type safety: 0 `any` types
- Dead code: 0 lines

---

## Timeline Estimate

| Phase | Duration | Focus | ROI |
|-------|----------|-------|-----|
| Phase 1 | Week 1-2 | Foundation, quick wins | 15% code quality improvement |
| Phase 2 | Week 3-4 | Component splitting | 30% easier maintenance |
| Phase 3 | Week 5-6 | DataCanvas & contexts | 20-30% performance improvement |
| Phase 4 | Week 7-8 | Testing & validation | Confidence in changes |

**Total**: 6-8 weeks (45-65 person-days)

---

## Files to Review

1. **REFACTORING_ANALYSIS.md** (full 880-line analysis)
2. **PERFORMANCE_ANALYSIS.md** (existing, 642 lines - 42+ performance issues)
3. **ACCESSIBILITY_AUDIT_FULL.md** (existing, 709 lines - accessibility issues)

---

## Next Actions

1. Read this summary (5 minutes)
2. Read full REFACTORING_ANALYSIS.md (30 minutes)
3. Start with Phase 1, Quick Win #1: Delete LRUCache.ts (1 hour)
4. Proceed through Quick Wins sequentially
5. Plan Phase 2 with team

---

**Generated**: 2025-11-17
**Status**: Ready for implementation
