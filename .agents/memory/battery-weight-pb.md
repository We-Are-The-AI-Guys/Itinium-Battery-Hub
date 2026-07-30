---
name: Battery weight & Pb conventions
description: Source-of-truth conventions for battery weight, safe-load factor and Pb derivation in the Itinium portal.
---

## Weight convention (SETTLED — user confirmed July 20, 2026)
- The client's Pb spreadsheet is the MASTER data source. Everything runs off lead weight only; total battery weight is deliberately not tracked.
- Estimated weight = Pb-per-cell × actual cell count × 1.4 safe vehicle loading factor. The catalogue's weight_per_cell_kg values being the Pb figures is intentional, not a data gap.
- **Why:** user confirmed this is the agreed business rule; the 1.4 factor is what accounts for safe vehicle load. Ingrid's expected 552.72 kg (32.9 × 12 × 1.4) follows the same convention.
- **How to apply:** do NOT seek or add "real" battery weights, and do not change the 1.4 factor. Any mismatch with client figures means a per-cell Pb value differs in the catalogue — spot-check that value only.

## Cell count reconfirmed (July 30, 2026)
- Ingrid (client) confirmed a 24V battery = 12 cells (voltage/2). The one-cell-per-volt reading in her July 28 feedback was wrong; the portal math is correct. Do not revisit.

## Placeholder manufacturers never block (July 30, 2026)
- Blank, "N/A", "unknown", "Other" (no name), "none", "-", "?" manufacturers must all be treated identically: map to "Unknown" → TAB weights, flag for Itinium review, never block import or submission.
- **Why:** client's depots routinely can't identify manufacturers; earlier hard-blocks stopped whole submissions.
- **How to apply:** applied at both CSV import and submit time in the depot form; keep any new validation path consistent with this rule.

## Pb derivation (fixed July 2026)
- Total Pb = Pb-per-cell × actual cell count. Actual cell count = voltage/2 for full batteries (each cell 2V), loose-cells quantity for loose rows. Never use the number embedded in the model name (e.g. the 5 in 5PzS575).
- Voltage parsing must accept only a single clean numeric token; digit concatenation ("12/24V" → 1224) wildly inflates counts.
