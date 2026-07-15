---
name: API server bootstrap applies hidden DDL
description: Startup bootstrap in the api-server runs raw SQL DDL not reflected in the Drizzle schema files
---

The api-server startup bootstrap (`artifacts/api-server/src/index.ts`) executes raw SQL DDL (indexes, columns, sequences) that is NOT in the Drizzle schema under `lib/db/src/schema/`.

**Why:** A constraint error can come from a bootstrap-created index that no schema file mentions. Note pallet numbers are legitimately reused across and within jobs, so they must never be globally unique.

**How to apply:** When a DB constraint error doesn't match the schema files, check `pg_indexes`/`information_schema` in the live DB and grep the bootstrap in `index.ts`. Removing bootstrap DDL requires both editing the bootstrap AND dropping the object (bootstrap drop statement covers prod on next republish).
