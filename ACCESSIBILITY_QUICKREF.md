# Accessibility Audit - Quick Reference by File and Issue

## Quick Statistics
- **Total Components:** 15 React components
- **Interactive Elements:** 61+ without proper keyboard support
- **ARIA Labels:** Only 3 (on Zoom controls and Toast dismiss)
- **WCAG Compliance:** 25-35% (Non-compliant for AA)
- **Critical Issues:** 6
- **High Priority:** 10+
- **Medium Priority:** 6+

---

## CRITICAL ISSUES - MUST FIX

### Issue #1: Missing Keyboard Navigation
**Files:** ControlPanel.tsx, DataCanvas.tsx, TimeSlider.tsx, TopBar.tsx
**Impact:** Users cannot navigate app with keyboard only
**Fix Time:** 8-10 hours

```
SPECIFIC LOCATIONS:
- /components/ControlPanel.tsx:25 - Section click handler
- /components/ControlPanel.tsx:52 - AddLayerMenu expand/collapse
- /components/ControlPanel.tsx:306 - Layer visibility toggle
- /components/ControlPanel.tsx:309 - Layer flicker toggle
- /components/ControlPanel.tsx:321 - Layer select/expand
- /components/DataCanvas.tsx - div onClick for interactions
- /components/TimeSlider.tsx:69-100 - Time range slider mouse-only
```

### Issue #2: Missing ARIA Labels
**Files:** ControlPanel.tsx (600 lines), TopBar.tsx, ImportFilesModal.tsx, TimeSlider.tsx
**Impact:** Screen reader users cannot understand button purposes
**Fix Time:** 6-8 hours

```
SPECIFIC MISSING ARIA:
- ControlPanel.tsx:25 - Section header needs aria-expanded
- ControlPanel.tsx:64-67 - "Add Layer" dropdown buttons missing aria-label
- ControlPanel.tsx:306 - Visibility toggle missing aria-label, aria-pressed
- ControlPanel.tsx:309 - Flicker toggle missing aria-label, aria-pressed  
- ControlPanel.tsx:321 - Expand arrow missing aria-label
- ControlPanel.tsx:324 - Delete button missing aria-label
- ControlPanel.tsx:337 - Colormap select missing aria-label
- ControlPanel.tsx:345 - Invert checkbox missing aria-label
- TopBar.tsx:17-30 - ToolButton component all missing aria-label
- TopBar.tsx:64-67 - Tool buttons missing aria-current="page"
- ImportFilesModal.tsx:11 - Modal missing role="dialog"
- ImportFilesModal.tsx:20-26 - File input missing associated label
- TimeSlider.tsx:149-176 - SVG elements missing accessible names
```

### Issue #3: No Visible Focus Indicators
**Files:** All component files
**Impact:** Keyboard users cannot see where focus is
**Fix Time:** 4-6 hours

```
ADD TO GLOBAL CSS:
*:focus-visible {
  outline: 2px solid #06b6d4;
  outline-offset: 2px;
}

APPLY TO COMPONENTS:
- All buttons
- All inputs
- All interactive divs
- Links (if any)
```

### Issue #4: Non-semantic HTML Structure
**Files:** App.tsx, ControlPanel.tsx, TopBar.tsx
**Impact:** Screen readers cannot navigate page structure
**Fix Time:** 6-8 hours

```
REQUIRED CHANGES:
- App.tsx:99 - Change <div className="h-screen"> to <main>
- App.tsx:111 - Wrap data canvas in semantic <section aria-label="Data Visualization">
- ControlPanel.tsx:21-31 - Section component should use <details>/<summary> or <button role="tab">
- TopBar.tsx:58 - Add aria-label="Tools" to sidebar
- ControlPanel.tsx:1057 - Add aria-label="Layer Controls" to aside
```

### Issue #5: No Modal Focus Management
**Files:** ImportFilesModal.tsx, ProgressOverlay.tsx
**Impact:** Keyboard users stuck inside modals or cannot interact
**Fix Time:** 4-6 hours

```
REQUIREMENTS:
- Set initial focus to first input/button
- Trap Tab/Shift+Tab within modal
- Restore focus on close
- Add role="dialog" and aria-labelledby
- Add aria-modal="true"
```

### Issue #6: No Screen Reader Announcements
**Files:** ProgressOverlay.tsx, ErrorBoundary.tsx, Toast.tsx
**Impact:** Screen readers don't announce changes
**Fix Time:** 3-4 hours

```
MISSING ARIA:
- ProgressOverlay.tsx:54 - Message needs role="status" aria-live="polite"
- ErrorBoundary.tsx:85 - Error heading needs role="alert" aria-live="assertive"
- Toast.tsx:104 - Toast items need role="status"
- Toast.tsx:174 - Toast items need aria-live (polite or assertive based on type)
```

---

## HIGH PRIORITY ISSUES

### Issue #7: Touch Target Size Too Small
**Files:** ZoomControls.tsx, TopBar.tsx, TimeSlider.tsx
**Impact:** Mobile users cannot easily tap buttons
**Location:** 
- ZoomControls.tsx:14 - Buttons are w-9 h-9 (36px, minimum should be 44px)
- TopBar.tsx:21 - ToolButtons should be taller
- TimeSlider.tsx:85 - Grab threshold only 20px

### Issue #8: Missing Form Validation
**Files:** ImportFilesModal.tsx, ControlPanel.tsx
**Impact:** Users get errors after submitting, poor UX
**Locations:**
- ImportFilesModal.tsx - No file type validation shown
- ControlPanel.tsx:215-222 - Color stop value needs validation feedback
- ControlPanel.tsx:551-555 - Expression validation hidden

### Issue #9: Color Contrast Issues
**Files:** ControlPanel.tsx, StatusBar.tsx
**Locations:**
- ControlPanel.tsx:316 - text-gray-500 too light
- ControlPanel.tsx:410 - text-gray-400 too light  
- StatusBar.tsx:8 - text-cyan-300 with text-xs may be too small
- Fix: Change gray-500/400 to gray-300/200 for better contrast

### Issue #10: Missing Help/Tooltips
**Files:** ControlPanel.tsx, TopBar.tsx, TimeSlider.tsx
**Locations:**
- TopBar.tsx:64-67 - Tool buttons need description
- ControlPanel.tsx:989 - Graticule density unexplained
- ControlPanel.tsx:1024 - Grid spacing needs units
- ControlPanel.tsx:725-744 - Artifact properties need units
- No keyboard shortcuts reference visible

---

## MEDIUM PRIORITY ISSUES

### Issue #11: Confusing UI Patterns
**Problem Areas:**
1. **Collapsible sections** (ControlPanel.tsx:21-31)
   - Users don't know it's clickable
   - No background color change on hover
   - Consider: Add bg-gray-700 hover:bg-gray-600

2. **Layer selection** (ControlPanel.tsx:260-512)
   - Unclear what "active" vs "selected" means
   - Multiple buttons with unclear purpose
   - Recommendation: Add tooltips and clearer state

3. **Time slider** (TimeSlider.tsx)
   - Drag handles not obviously interactive
   - No instruction text
   - Tick labels hard to read at zoom

4. **Colormap editor** (ControlPanel.tsx:114-241)
   - Grid layout confusing
   - No preview of result
   - "Add" button purpose unclear

### Issue #12: Missing Responsive Design
**Files:** App.tsx, ControlPanel.tsx, TopBar.tsx
**Problems:**
- w-80 sidebar too wide for mobile
- No hamburger menu
- Canvas interactions mouse-only
- No touch gesture support

### Issue #13: Limited Mobile Support
**Missing:**
- Touch event handlers
- Pinch-to-zoom
- Long-press context menus
- Swipe navigation
- Responsive breakpoints

---

## FILE-BY-FILE REMEDIATION CHECKLIST

### `/App.tsx` ✓ Review
- [ ] Change outer `<div>` to `<main>`
- [ ] Add `aria-label="Main Content"` to main
- [ ] Wrap data section with `<section aria-label="Data Canvas">`
- [ ] Add focus trap management for modals
- [ ] Add `aria-busy="true"` during loading

### `/components/TopBar.tsx` ✓ HIGH PRIORITY
- [ ] Add `aria-label` to each ToolButton
- [ ] Add `aria-current="page"` to active tool
- [ ] Add `aria-label="Lunagis Application Logo"` to logo SVG
- [ ] Add `aria-label="Tools Panel"` to aside
- [ ] Increase button height for touch targets
- [ ] Add focus indicator styles

### `/components/ControlPanel.tsx` ✓ CRITICAL
- [ ] Refactor Section component - use <details>/<summary>
- [ ] Add aria-expanded to section headers
- [ ] Add aria-label to 50+ elements (see file locations above)
- [ ] Add aria-pressed to toggle buttons
- [ ] Add aria-label to checkboxes
- [ ] Add aria-describedby to sliders
- [ ] Add help text for complex inputs
- [ ] Implement form validation feedback
- [ ] Add colormap preview
- [ ] Add expression syntax help
- [ ] Improve layer selection UX
- [ ] Add validation error display

### `/components/ImportFilesModal.tsx` ✓ HIGH PRIORITY
- [ ] Add role="dialog" to modal container
- [ ] Add aria-labelledby="modal-title"
- [ ] Add aria-describedby with instructions
- [ ] Add aria-modal="true"
- [ ] Implement focus trap
- [ ] Set initial focus to file input
- [ ] Add aria-label to file input
- [ ] Add validation feedback
- [ ] Add aria-required="true"

### `/components/TimeSlider.tsx` ✓ HIGH PRIORITY
- [ ] Add role="slider" to SVG slider
- [ ] Add aria-label="Time Range Selector"
- [ ] Add aria-valuemin, aria-valuemax, aria-valuenow
- [ ] Add keyboard handlers (Arrow keys)
- [ ] Add touch event handlers
- [ ] Add aria-label to SVG elements
- [ ] Improve tick label contrast
- [ ] Add instructions/help text
- [ ] Support keyboard focus
- [ ] Add aria-live announcements

### `/components/ProgressOverlay.tsx` ✓ HIGH PRIORITY
- [ ] Add role="status" to progress container
- [ ] Add aria-live="polite"
- [ ] Add aria-busy="true"
- [ ] Support prefers-reduced-motion
- [ ] Add completion announcement
- [ ] Make loading messages more specific
- [ ] Add aria-label to spinner

### `/components/ZoomControls.tsx` ✓ MEDIUM PRIORITY
- [ ] Increase button size from w-9 h-9 to w-11 h-11
- [ ] Already has aria-label (good!)
- [ ] Add focus indicator styling
- [ ] Increase touch target spacing

### `/components/ImportFilesModal.tsx` ✓ MEDIUM PRIORITY
- [ ] Good: aria-label on dismiss button
- [ ] Add role="status" to toast items
- [ ] Add aria-live per type (polite or assertive)
- [ ] Add aria-label to dismiss button (already good)
- [ ] Add aria-hidden="true" to decorative icon

### `/components/ErrorBoundary.tsx` ✓ MEDIUM PRIORITY
- [ ] Wrap error in role="alert"
- [ ] Add aria-live="assertive"
- [ ] Replace confirm() with accessible modal
- [ ] Add aria-describedby for error details
- [ ] Focus error message when shown

### `/components/DataCanvas.tsx` ✓ MEDIUM PRIORITY
- [ ] Add aria-label to canvas elements
- [ ] Add aria-label to interactive regions
- [ ] Support keyboard interactions
- [ ] Add touch gesture support
- [ ] Add loading spinner with role="status"

### `/components/Colorbar.tsx` ✓ LOW PRIORITY
- [ ] Add aria-label to canvas
- [ ] Consider role="img" with description
- [ ] Add alt text equivalent

### `/components/StatusBar.tsx` ✓ LOW PRIORITY
- [ ] Fix color contrast on text-cyan-300
- [ ] Add role="status" to status bar
- [ ] Add aria-live="polite"
- [ ] Improve contrast for gray text

### `/components/TimeSeriesPlot.tsx` ✓ LOW PRIORITY
- [ ] Add aria-label to SVG
- [ ] Add role="img" with description
- [ ] Add alt text alternative

---

## Testing Checklist

### Manual Testing
- [ ] Test all components with keyboard only (no mouse)
- [ ] Test with screen reader (NVDA, JAWS, or VoiceOver)
- [ ] Test on mobile device (not just browser)
- [ ] Test focus order (Tab key)
- [ ] Test color contrast with WCAG checker
- [ ] Test with prefers-reduced-motion enabled
- [ ] Test modal focus trap
- [ ] Test error messages announced

### Automated Testing
- [ ] Run axe DevTools on all pages
- [ ] Run WAVE accessibility evaluator
- [ ] Run Lighthouse accessibility audit
- [ ] Run eslint-plugin-jsx-a11y

### Browser/Device Testing
- [ ] Chrome + screen reader
- [ ] Firefox + screen reader
- [ ] Safari + VoiceOver
- [ ] Mobile Safari + VoiceOver
- [ ] Android + TalkBack
- [ ] Windows Narrator

---

## Estimated Implementation Timeline

**Phase 1 (Critical): 40-50 hours**
- Keyboard navigation (12h)
- ARIA labels (10h)
- Focus management (8h)
- Semantic HTML (12h)
- Screen reader support (8h)

**Phase 2 (High): 30-40 hours**
- Form validation (8h)
- Touch targets (4h)
- Loading announcements (4h)
- Tooltips/help (6h)
- Mobile responsiveness (8h)
- UI pattern improvements (4h)

**Phase 3 (Medium): 20-30 hours**
- Touch gestures (8h)
- Keyboard shortcuts reference (4h)
- Tutorial/onboarding (6h)
- Syntax highlighting (6h)
- Help documentation (4h)

**Total: 90-120 hours (2.5-3 weeks with 1 developer)**

