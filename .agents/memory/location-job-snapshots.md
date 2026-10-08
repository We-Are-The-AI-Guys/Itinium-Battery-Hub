---
name: Location details on jobs
description: Why customer-editable location defaults are copied onto job records.
---

Treat saved locations as reusable defaults, but copy the selected contacts, site hours, special instructions, and collection address into each new job.

**Why:** customers must be able to amend details for one collection, and later changes to a location must not silently change existing jobs or collection paperwork.

**How to apply:** validate that a selected location belongs to the authenticated client, prefill the job form from it, prefer explicit form values when creating the job, and render the job snapshot on collection details.

## User defaults versus per-job selections

A client's user may have multiple explicitly permitted locations. Their default is only the preselected site for new collections; it must be one of those permitted locations. Both depot users and team leaders must be restricted to their permitted sites, not automatically every site in the client.

**Why:** On 2026-10-08 the user clarified that depot data must be siloed and accounts can be assigned multiple locations. This supersedes the earlier unrestricted same-client selection rule.

**How to apply:** Enforce both client and explicit location membership server-side across reads and writes. Missing location assignments must not grant broad access. Never infer a default or legacy job ownership. Preserve internal staff and collector permissions separately and keep historical snapshots unchanged.

## Ambiguous related records

Legacy stillage records without canonical client/location ownership remain internal-only, rather than being matched to a client by their depot label.

**Why:** Similar depot names can exist under different clients. Recovering permissions from names would recreate the cross-client exposure that explicit memberships are intended to prevent.

**How to apply:** Treat any future legacy-record recovery as verified administrator assignment, not automatic name matching.