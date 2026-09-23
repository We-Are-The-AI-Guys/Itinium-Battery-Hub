---
name: Receipt table shared saves
description: Concurrency and failure-handling rules for saving multiple editable receipt rows.
---

When saving multiple receipt rows through the existing per-row API, send only fields the user actually changed, serialize the requests, and disable every competing table mutation until completion. Successful rows become clean; failed rows must remain dirty and visible for retry.

**Why:** Full-row draft payloads can overwrite newer notes or recalculated values even when the user changed only one field. Competing mutations during a save can also replace newer local drafts or desynchronize the table.

**How to apply:** Any future receipt-table action must participate in the same saving lock or explicitly reconcile and reload drafts afterward.