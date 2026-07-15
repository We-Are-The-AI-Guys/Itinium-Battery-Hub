---
name: API server restart staleness
description: Requests right after restarting the api-server workflow can hit the old process
---
After `restart_workflow` on the api-server, the first curl requests sometimes still hit the old code even though the tool reports success and logs show a fresh boot.

**Why:** Observed twice while verifying CSV-import changes — identical requests failed, then succeeded with no code change after a second restart/short delay.

**How to apply:** If a just-edited server behavior appears unchanged after restart, restart again (or wait a few seconds and retry) before assuming the code is wrong.
