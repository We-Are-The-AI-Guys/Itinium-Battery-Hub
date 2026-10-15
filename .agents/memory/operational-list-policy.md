---
name: Operational job lists
description: Estimated versus confirmed Pb weights and non-financial operational tables.
---

## Latest reported clarification — 15 October 2026

The user clarified that KPIs and Dashboard should use estimated and confirmed **net** weights, not gross loading weights. They explicitly chose: use estimated net until receipt review is complete, then replace it with confirmed net. They approved development implementation and testing, without publishing.

**Why:** Ingrid believes KPI tonnage is using the Dashboard's gross-weight source. This supersedes the older instruction below to retain gross operational Dashboard tonnage.

**How to apply:** Apply the chosen transition per job, only after its receipt review is complete; do not replace the estimate with a partially reviewed total. The user explicitly approved receipt-confirmed battery Pb totals as the authoritative confirmed net source, not separately editable Customer Financial Master weights. Keep gross loading/capacity calculations separate and preserve role visibility.

Unavailable reporting weights remain unknown and are excluded from aggregates with a visible explanation, rather than guessed from a manually overridden gross job total.

**Why:** A missing receipt or estimate must not silently become an apparently verified weight or a partial total.

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

The earlier split between gross Operational Dashboard weights and Customer Financial Master weights is superseded by the approved net reporting rule above. Both Dashboard tabs use the same estimate-to-confirmed receipt basis.

**Why:** The user explicitly selected receipt-confirmed battery Pb as authoritative for Dashboard/KPI reporting, replacing the earlier Financial Master source.

**How to apply:** Keep financial amounts and operational gross loading/capacity calculations unchanged. Reporting must not fall back to either gross loading weights or editable Financial Master weights.
