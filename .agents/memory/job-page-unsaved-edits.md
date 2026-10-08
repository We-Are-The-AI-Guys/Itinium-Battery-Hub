---
name: Job-page unsaved edits
description: Why job-detail edits use a navigation warning instead of immediate autosave.
---

Use leave-page warnings for unsaved collection details, receipt rows, and financial edits until job and battery updates support revision-safe autosave.

**Why:** the current partial-update endpoints have no revision token, and receipt/financial responses can replace local state. Overlapping or out-of-order autosaves could silently overwrite newer work—the exact failure autosave is meant to prevent.

**How to apply:** keep warnings active for links, browser history navigation, refresh, and tab close. Before introducing autosave, add request sequencing plus server-side conflict detection and preserve edits made while a save is in flight.

## Explicit model suggestion commits

A model suggestion badge is an explicit one-click save action. It must not merely populate a draft that requires a second Save click. This is not permission to autosave manually typed fields or unrelated job edits.

**Why:** the user reported that people missed or forgot the additional Save button after choosing a suggested model.

**How to apply:** commit only the selected model through the normal correction process, show pending/failure feedback, and prevent overlapping saves or overwriting unsaved receipt edits.

## Live receipt-weight previews

Typing a known receipt model or voltage should immediately preview Pb weight and its calculated value, but must not autosave the correction. Preserve explicitly edited Pb/value fields.

**Why:** The user compared an unsaved corrected row with an identical saved model and reasonably interpreted the unchanged empty-weight placeholder as a failed catalogue lookup.

**How to apply:** Label the unsaved preview, use the same manufacturer/TAB and cell-count rules as the server, and keep preview-only values out of explicit save patches so server recalculation remains authoritative. Preview totals must not silently commit invoice changes.