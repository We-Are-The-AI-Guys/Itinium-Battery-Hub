---
name: Server-side weight derivation is authoritative
description: Battery weights are re-derived on the API server; client auto-weights are advisory. Provenance flags decide what may be overwritten.
---

The rule: the API server derives battery row weights from the cell-model catalogue at job submission and on admin corrections. Client-computed weights are advisory; only rows persisted with a manual-weight flag keep user-supplied weights, and only jobs without a persisted tonnage-override flag get their tonnage re-synced.

**Why:** client-side recompute alone cannot guarantee parity between entry paths — a row whose cell type changes after its weight was computed can silently keep the old model's weight.

**How to apply:**
- Any path that writes battery weights must group equivalent Pz model variants, resolve combined-name aliases, and select requested manufacturer → TAB → no automatic rate. Never use an unrelated manufacturer's rate; stored weights are gross (×1.4 safe-load).
- Never overwrite a row flagged as manual weight, and never re-sync tonnage on a job flagged as manually overridden. For legacy rows predating the flags, treat tonnage as auto-derived only if it equals the sum of row weights.

## Collection tonnage is independent of receipt confirmation

Collection/dashboard tonnage must reflect all collection rows, including provisional load allowances, regardless of receipt toggles. Keep confirmed receipt/payment totals separate.

**Why:** The user explicitly reported that collection tonnage must be visible before any row is marked received; receipt synchronization had incorrectly replaced it with the confirmed-only weight.

**How to apply:** Preserve manual tonnage overrides, but derive automatic collection tonnage from the full collection table, never the confirmed-only receipt subtotal.

## Partial auto-confirm

Auto-confirm should confirm rows with valid TAB weights and leave unresolved/token-only rows pending, without aborting the whole batch.

**Why:** The user explicitly selected this policy rather than allowing token estimates to count as verified receipts.

**How to apply:** Retain skipped rows and their provisional load allowances, report which rows remain pending, and do not advance the entire job to received until every row has an explicit review decision.
