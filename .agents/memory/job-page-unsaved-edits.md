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