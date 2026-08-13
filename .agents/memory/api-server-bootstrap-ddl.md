---
name: API server bootstrap applies hidden DDL
description: Startup bootstrap in the api-server runs raw SQL DDL not reflected in the Drizzle schema files
---

The api-server startup bootstrap (`artifacts/api-server/src/index.ts`) executes raw SQL DDL (indexes, columns, sequences) that is NOT in the Drizzle schema under `lib/db/src/schema/`.

**Why:** A constraint error can come from a bootstrap-created index that no schema file mentions. Note pallet numbers are legitimately reused across and within jobs, so they must never be globally unique.

**How to apply:** When a DB constraint error doesn't match the schema files, check `pg_indexes`/`information_schema` in the live DB and grep the bootstrap in `index.ts`. Removing bootstrap DDL requires both editing the bootstrap AND dropping the object (bootstrap drop statement covers prod on next republish).

## Targeted production data self-heals live here too
One-off production data corrections also go in the bootstrap as idempotent, tightly-guarded statements (exact reference/serial/old-value guards plus provenance flags like weight_manual / tonnage_manual_override), because the agent's production DB access is SELECT-only.

**Why:** the bootstrap runs on republish and is the only write path into prod data; guards make it a no-op everywhere the stale values aren't present.

**How to apply:** wrap multi-statement corrections in a single transaction, and never compute a post-update aggregate in the same statement as the update — Postgres statement/CTE snapshots see pre-update values.
