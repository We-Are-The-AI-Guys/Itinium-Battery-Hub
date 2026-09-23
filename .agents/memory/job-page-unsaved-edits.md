---
name: Job-page unsaved edits
description: Why job-detail edits use a navigation warning instead of immediate autosave.
---

Use leave-page warnings for unsaved collection details, receipt rows, and financial edits until job and battery updates support revision-safe autosave.

**Why:** the current partial-update endpoints have no revision token, and receipt/financial responses can replace local state. Overlapping or out-of-order autosaves could silently overwrite newer work—the exact failure autosave is meant to prevent.

**How to apply:** keep warnings active for links, browser history navigation, refresh, and tab close. Before introducing autosave, add request sequencing plus server-side conflict detection and preserve edits made while a save is in flight.