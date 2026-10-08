---
name: Battery weight & Pb conventions
description: Source-of-truth conventions for battery weight, safe-load factor and Pb derivation in the Itinium portal.
---

## Displayed load = gross = lead x 1.4 (user re-confirmed July 30, 2026)
- The depot form's on-screen Current Load must show gross weight = total lead content × 1.4 — the same figure stored server-side. A July 20 change to display lead-only was reverted at the user's request; 26t/10t thresholds apply to the gross figure on both client and server.

## Weight convention (SETTLED — user confirmed July 20, 2026)
- The client's Pb spreadsheet is the MASTER data source. Everything runs off lead weight only; total battery weight is deliberately not tracked.
- Estimated weight = Pb-per-cell × actual cell count × 1.4 safe vehicle loading factor. The catalogue's weight_per_cell_kg values being the Pb figures is intentional, not a data gap.
- **Why:** user confirmed this is the agreed business rule; the 1.4 factor is what accounts for safe vehicle load. Ingrid's expected 552.72 kg (32.9 × 12 × 1.4) follows the same convention.
- **How to apply:** do NOT seek or add "real" battery weights, and do not change the 1.4 factor. Any mismatch with client figures means a per-cell Pb value differs in the catalogue — spot-check that value only.

## Cell count reconfirmed (July 30, 2026)
- Ingrid (client) confirmed a 24V battery = 12 cells (voltage/2). The one-cell-per-volt reading in her July 28 feedback was wrong; the portal math is correct. Do not revisit.

## Placeholder manufacturers use TAB without manufacturer review (updated October 6, 2026)
- Blank, "N/A", "unknown", "Other" (no name), "none", "-", "?" manufacturers must all be treated identically: use "Unknown" → TAB weights, without a manufacturer review requirement. Retain independent serial, model, voltage and missing-weight warnings.
- **Why:** the user explicitly requested accepting unknown manufacturers as-is with TAB weights rather than requiring Itinium review. Depots routinely cannot identify manufacturers.
- **How to apply:** keep CSV import, manual entry, submission, corrections and existing-job review consistent. Preserve submitted model identity and manual weight overrides. This exception does not approve genuinely unrecognised named manufacturers or resolve unrelated flags.

## Missing-weight safety (October 8, 2026)
- Customer requests with unresolved weights may be saved as drafts but must not be submitted as verified loads. Keep a clearly labelled 500 kg provisional allowance, including the normal ×1.4 gross-load factor, rather than counting unknown weights as zero. Internal review remains available.
- **Why:** updated development feedback explicitly requires safe handling of unknown weights without allowing an unverified excess load. This supersedes the previous rule allowing customers to submit token-weight rows.
- **How to apply:** provide simple guidance to complete battery details or contact Itinium; never expose a customer per-battery manual estimated-weight input. Preserve existing records and stored manual weights. Over-limit requests must be reduced to at most 26 tonnes, with additional tonnage requested as a separate job.

## Pb derivation (fixed July 2026)
- Total Pb = Pb-per-cell × actual cell count. Actual cell count = voltage/2 for full batteries (each cell 2V), loose-cells quantity for loose rows. Never use the number embedded in the model name (e.g. the 5 in 5PzS575).
- Voltage parsing must accept only a single clean numeric token; digit concatenation ("12/24V" → 1224) wildly inflates counts.
