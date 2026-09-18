---
name: Waste Collector blocs pricing
description: Business rule for the temporarily unused Waste Collector Spot Blocs percentage.
---

Do not use a Waste Collector Spot Blocs percentage or blocs-rate contribution in the Financial Master calculation. Keep the blocs rate at zero and exclude Waste Collector blocs tonnage from its invoice value.

**Why:** Itinium stated that the market is too volatile and they are not using Waste Collector Spot Blocs pricing at present.

**How to apply:** This rule applies only to the Waste Collector side. Customer LME Blocs remains a separate active input and calculation. Preserve the old database fields for historical compatibility unless Itinium later requests their removal.