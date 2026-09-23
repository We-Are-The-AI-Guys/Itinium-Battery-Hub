---
name: Location details on jobs
description: Why customer-editable location defaults are copied onto job records.
---

Treat saved locations as reusable defaults, but copy the selected contacts, site hours, special instructions, and collection address into each new job.

**Why:** customers must be able to amend details for one collection, and later changes to a location must not silently change existing jobs or collection paperwork.

**How to apply:** validate that a selected location belongs to the authenticated client, prefill the job form from it, prefer explicit form values when creating the job, and render the job snapshot on collection details.