---
name: Operational job lists
description: Estimated versus confirmed Pb weights and non-financial operational tables.
---

All jobs must show unconfirmed weight until Itinium confirms receipt, with pallet totals instead of monetary totals. The dashboard Operational table should not show Value or Gross Profit; financial views remain unchanged.

The user explicitly clarified that the Operational dashboard needs a Pallets column, while the Financial dashboard must retain both Value and Gross Profit. Removal of financial columns applies only to Operational, not the shared table in both tabs.

**Why:** The user needs operational lists for collection planning, not financial reporting.

**How to apply:** Keep the Pb column in lead kilograms, excluding the collection load's 1.4 factor. Label estimated amounts and wait for all receipt rows to be reviewed before switching to received-only totals, so a partially reviewed job does not misleadingly show a partial total as final.

## Dashboard financial weight source

Job table column order must put Pallets immediately before Status, followed by Documents. Documents offers only the uploaded signed consignment note and signed collection sheet, never generated replacement PDFs.

**Why:** The user explicitly requested this operational table arrangement and access to signed originals.

**How to apply:** Preserve access checks at download time; show non-clickable missing-document states. Display the initial status as “Requested” but keep the stored/API value `request` and its workflow semantics unchanged.

Operational dashboard tonnage remains the full CBL collection load. Financial dashboard weight must come from the Customer section on the right of the Master Financial Log, not the CBL/waste-collector weight or a generic battery Pb total.

**Why:** The user explicitly distinguishes the load CBL collects from the customer-side Pb weight used for finances.

**How to apply:** Use customer Traction and Blocs Pb tonnages for the financial table, clearly labelled with units. Never substitute operational collection tonnage when customer financial weights are absent.
