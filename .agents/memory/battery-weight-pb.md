---
name: Battery weight & Pb conventions
description: Source-of-truth conventions for battery weight, safe-load factor and Pb derivation in the Itinium portal.
---

## Weight convention (confirmed by user, July 2026)
- Estimated weight = per-cell weight × actual cell count; the server then multiplies by the 1.4 safe vehicle loading factor before storing.
- The 1.4 factor is intentional and must stay.
- **Why:** user confirmed this is the business rule agreed with the client.

## No real weights exist yet
- The client's cell spreadsheet only contains Pb content per cell; the catalogue's weight-per-cell values were seeded from those same Pb figures, so displayed weights are understated.
- Do NOT invent weights. Client contact Ingrid is being asked to clarify (she expects 552.72 kg for a 24V 5PzS575, which equals 32.9 kg/cell × 12 cells × 1.4 — 32.9 is the Pb figure of a *different* model, so her table likely has distinct weights).
- **How to apply:** when a weights table arrives, update `lib/db/src/data/cell-models.ts` weight_per_cell_kg (and DB rows) only — no formula changes needed.

## Pb derivation (fixed July 2026)
- Total Pb = Pb-per-cell × actual cell count. Actual cell count = voltage/2 for full batteries (each cell 2V), loose-cells quantity for loose rows. Never use the number embedded in the model name (e.g. the 5 in 5PzS575).
- Voltage parsing must accept only a single clean numeric token; digit concatenation ("12/24V" → 1224) wildly inflates counts.
