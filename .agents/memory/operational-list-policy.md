---
name: Operational job lists
description: Estimated versus confirmed Pb weights and non-financial operational tables.
---

## Latest reported clarification — 15 October 2026

The user subsequently clarified that KPIs and Dashboard should use estimated and confirmed **net** weights, not gross loading weights. They explicitly chose: use estimated net until receipt review is complete, then replace it with confirmed net. The discussion remains review-first; selecting the rule does not independently authorise publishing.

**Why:** Ingrid believes KPI tonnage is using the Dashboard's gross-weight source. This supersedes the older instruction below to retain gross operational Dashboard tonnage.

**How to apply:** Apply the chosen transition per job, only after its receipt review is complete; do not replace the estimate with a partially reviewed total. Keep gross loading/capacity calculations separate from reporting. Preserve role visibility and establish the confirmed-net source before implementation; the preceding request was to review before making changes.

Ingrid's email specifies Job Management should show estimated/loading weight, while Dashboard should show confirmed weight used for payment. Use the chemical symbol “Pb”, not “PB”.

**Why:** She reports these weight sources are reversed. This is a business clarification supplied for review, not yet an approved implementation plan.

**How to apply:** Reconcile the older rules below before further weight-display changes. Confirm which dashboard tab/role she means and distinguish gross loading weight from lead weight; do not infer broader customer Pb access or treat an absent confirmed weight as estimated payment weight.

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
