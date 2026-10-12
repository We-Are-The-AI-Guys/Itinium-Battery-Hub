---
name: Shared workspace precautions
description: Avoid repository-wide state changes while helpers work concurrently.
---
Never let a helper stash, reset or checkout the shared repository to compare baseline tests during concurrent work.

**Why:** A frontend helper's git stash affected the entire repository, temporarily removing in-progress backend security edits. Concurrent edits then prevented the stash from being restored automatically.

**How to apply:** Compare baseline source read-only, or use an isolated temporary copy for baseline tests. Treat unexpected file reversions as a coordination incident before making further edits.
