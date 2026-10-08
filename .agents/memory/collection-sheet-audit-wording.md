---
name: Collection-sheet audit wording
description: Required explicit wording when a collection has no special or loading instructions.
---

Every collection-sheet PDF must print “None” when special/loading instructions are null, empty, or whitespace-only.

Confirmed collection sheets should omit the supplier/buyer and invoice-details block; keep the operational site address, contacts, hours, collection date and transport details.

**Why:** The user wants a site-focused collection document, not buyer/supplier information duplicated above the site details.

**Why:** Audit and inspection records must explicitly confirm there were no special loading instructions; a blank field is ambiguous.

**How to apply:** Normalize the value at document generation, not only in the form, so historical jobs and any other blank-data path receive the same explicit wording.