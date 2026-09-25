---
name: Failed publish may partially apply schema
description: Production database state after a failed managed Publish migration.
---

A failed Publish is not proof that its production schema changes were rolled back. Re-read the production schema and compute a fresh diff before diagnosing or retrying.

**Why:** A failed build ended after announcing additive database statements; the next read-only production inspection found its new tables and indexes present, while the current pending diff had changed. Build logs did not include a final SQL error.

**How to apply:** Use the deployment build details and a read-only production query or schema diff together. Never replay migration statements manually against the managed production database; let Publish handle the remaining diff.