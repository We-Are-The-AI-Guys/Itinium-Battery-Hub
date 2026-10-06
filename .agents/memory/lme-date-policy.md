---
name: LME pricing date
description: Why CBL dates are a valid fallback without repricing jobs that already have confirmed collection dates.
---

Use the CBL date to select the applicable LME price when no confirmed collection date exists. A confirmed collection date remains authoritative. A proposed collection date alone is not sufficient, and a missing matching monthly price must not silently use the latest unrelated price.

**Why:** On October 6, 2026, the user reported LME pricing as unavailable despite having a CBL date. Treating CBL as a fallback fixes that case without changing the pricing month of jobs whose collection dates are already confirmed.

**How to apply:** Keep the displayed date basis explicit. CBL date edits can preview their applicable rate, but must still require an explicit save; don't turn a proposed collection date into a confirmed date or autosave financial changes.
