---
name: Shareable portal address
description: Why externally shared sign-in links use the branded published portal domain
---

For links intentionally shared with collection companies and other portal users, prefer the branded published portal domain, not the current browser URL or the deployment's primary hostname.

**Why:** The deployment has several live hostnames, including a primary hostname unrelated to the Itinium brand. The branded domain was confirmed as an additional published URL and responds successfully. Browser URLs may be preview links or contain page query parameters that must not be forwarded to someone else.

**How to apply:** When changing sign-in or invitation link generation, check the live deployment's registered URLs first; preserve a credential-free HTTPS login path and never derive a share link from the active page's full address.