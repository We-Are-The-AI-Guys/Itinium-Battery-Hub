---
name: Server-side weight derivation is authoritative
description: Battery weights are re-derived on the API server; client auto-weights are advisory. Provenance flags decide what may be overwritten.
---

The rule: the API server derives battery row weights from the cell-model catalogue at job submission and on admin corrections. Client-computed weights are advisory; only rows persisted with a manual-weight flag keep user-supplied weights, and only jobs without a persisted tonnage-override flag get their tonnage re-synced.

**Why:** client-side recompute alone cannot guarantee parity between entry paths — a row whose cell type changes after its weight was computed can silently keep the old model's weight.

**How to apply:**
- Any new path that writes battery weights (imports, edits, migrations) must derive from the catalogue with the same matching rules as Pb: exact manufacturer → TAB → any, ignoring spacing/case; stored weights are gross (×1.4 safe-load).
- Never overwrite a row flagged as manual weight, and never re-sync tonnage on a job flagged as manually overridden. For legacy rows predating the flags, treat tonnage as auto-derived only if it equals the sum of row weights.
