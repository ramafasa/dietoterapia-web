# Dietitian Dashboard Components

## Overview

This directory contains all components for the Dietitian Dashboard view (`/dietetyk/dashboard`).

## Accessibility (A11y) Features

### WCAG 2.1 Level AA Compliance

All components follow WCAG 2.1 Level AA guidelines:

- ✅ **Keyboard Navigation**: All interactive elements (buttons, links, table rows) are keyboard accessible
  - `Tab` to navigate between elements
  - `Enter` or `Space` to activate buttons/links
  - Focus states visible with `focus:ring-2 focus:ring-primary`

- ✅ **Screen Reader Support**:
  - ARIA labels on all interactive elements
  - ARIA live regions for dynamic content updates
  - Semantic HTML (`<main>`, `<header>`, `<table>`, etc.)
  - Skip link for quick navigation to main content

- ✅ **Color Contrast**:
  - All text meets minimum contrast ratio (4.5:1 for normal text, 3:1 for large text)
  - Status badges use both color AND text/icons (not color alone)

- ✅ **Focus Management**:
  - Visible focus indicators on all interactive elements
  - Logical tab order
  - No keyboard traps

### Component-Specific A11y Notes

**PatientTable**:
- `role="table"` with proper header structure
- Each row is `role="button"` with keyboard support
- ARIA labels describe action: "Otwórz profil pacjenta [Imię Nazwisko]"

**StatusBadge & WeeklyObligationBadge**:
- Color dots are `aria-hidden="true"` (decorative)
- Text labels provide semantic meaning
- ARIA labels on badge wrapper

**PaginationControls**:
- `aria-current="page"` on current page button
- Disabled state with `disabled` attribute (not just CSS)
- Clear labels: "Poprzednia strona", "Następna strona"

**LoadingSkeleton**:
- `role="status"` indicates loading state
- ARIA label describes what's loading
- Screen reader announcement via `sr-only` text

**ErrorAlert**:
- `role="alert"` for error messages
- `aria-live="assertive"` for immediate announcement
- Retry button clearly labeled

**EmptyState**:
- Clear messaging
- CTA buttons properly labeled
- Icon is `aria-hidden="true"` (decorative)

## Testing Accessibility

### Manual Testing Checklist

- [ ] **Keyboard Navigation**:
  - [ ] Tab through entire page without getting stuck
  - [ ] All interactive elements reachable
  - [ ] Focus order is logical
  - [ ] Enter/Space activate buttons

- [ ] **Screen Reader** (NVDA/JAWS/VoiceOver):
  - [ ] All content announced correctly
  - [ ] ARIA live regions work on filter/page change
  - [ ] Table structure announced properly
  - [ ] Status changes announced

- [ ] **Color Contrast**:
  - [ ] Use browser DevTools Accessibility panel
  - [ ] Check all text against backgrounds
  - [ ] Verify badge colors meet contrast ratio

- [ ] **Zoom to 200%**:
  - [ ] No content loss or horizontal scrolling
  - [ ] Layout remains usable

### Automated Testing Tools

- **axe DevTools**: Run in browser to catch common issues
- **WAVE**: Web accessibility evaluation tool
- **Lighthouse**: Check accessibility score (target: >90)

## Responsive Design

- **Desktop (≥768px)**: Table view with full columns
- **Mobile (<768px)**: Card view for better touch targets
- All touch targets minimum 44x44px (WCAG 2.5.5)

## Performance

- **Memoization**: `useMemo` for expensive calculations (KPI, patient list mapping)
- **Code Splitting**: React components lazy-loaded via Astro islands
- **Skeleton Loading**: Prevents layout shift (CLS)

## Further Reading

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Astro Accessibility](https://docs.astro.build/en/guides/accessibility/)
