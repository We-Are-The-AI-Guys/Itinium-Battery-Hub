---
name: Location details on jobs
description: Why customer-editable location defaults are copied onto job records.
---

Treat saved locations as reusable defaults, but copy the selected contacts, site hours, special instructions, and collection address into each new job.

**Why:** customers must be able to amend details for one collection, and later changes to a location must not silently change existing jobs or collection paperwork.

**How to apply:** validate that a selected location belongs to the authenticated client, prefill the job form from it, prefer explicit form values when creating the job, and render the job snapshot on collection details.

## User defaults versus per-job selections

A client user's assigned location is the default for new collections, not a restriction to that one collection site. Both depot users and team leaders may choose another location belonging to their own client for a particular job.

**Why:** The user explicitly requires default preselection plus an editable same-client dropdown, without changing the saved user default or existing job history.

**How to apply:** Never infer a default for users without one. Clear an obsolete default on client reassignment unless a valid replacement is supplied. Keep other role permissions unchanged and enforce client membership on the server.