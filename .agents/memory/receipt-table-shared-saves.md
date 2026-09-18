---
name: Receipt table shared saves
description: Concurrency and failure-handling rules for saving multiple editable receipt rows.
---

When saving multiple receipt rows through the existing per-row API, serialize the requests and disable every competing table mutation until completion. Successful rows become clean; failed rows must remain dirty and visible for retry.

**Why:** Allowing edits, recalculation, auto-confirmation, row addition, or removal during a multi-row save can overwrite newer local drafts or leave the table out of sync with the server.

**How to apply:** Any future receipt-table action must participate in the same saving lock or explicitly reconcile and reload drafts afterward.