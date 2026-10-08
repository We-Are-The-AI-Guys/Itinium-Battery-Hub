---
name: Client upload review policy
description: Who owns catalogue review and which upload messages clients should see.
---

Clients should not be asked to resolve catalogue-review issues during collection submission. Detailed review warnings and correction prompts belong with Itinium; incomplete or unrecognised battery details must remain flagged for its review.

**Why:** The client reported excessive CSV error/review messages. The agreed scope separates reviewable information from genuine failures rather than hiding failures or treating incomplete details as resolved.

**How to apply:** Keep simple client-facing explanations for failures that prevent upload or submission, including missing required headers and capacity limits. The October 8, 2026 safety requirement also requires a clear unresolved-weight notice and blocks customer submission until weights are confirmed; customers can save a draft and contact Itinium. Preserve submitted identity, review flags and weight safeguards when suppressing detailed catalogue feedback; do not silently auto-correct information without visible acceptance/restoration controls.

## Request-form weight visibility
The per-battery Estimated Weight input must be absent from the collection request form for every role, including administrators using that form. Calculations and stored weights remain in use.

**Why:** The user corrected a role-only removal on October 8, 2026: the request form itself should not show the input.

**How to apply:** Do not retain an admin-only version on the request form. This does not remove weight correction tools from the separate internal job-detail workflow.

## One CSV per collection request
Allow only one successfully committed CSV import per request, including after saving and reopening a draft. Failed imports and cancelled review attempts do not consume the allowance; manual row edits remain available.

**Why:** The user reported an incident where the same CSV was accidentally uploaded twice and explicitly requested a one-file-per-job restriction.

**How to apply:** Keep the import lock with the draft, guard against concurrent file reads and repeated callbacks, and reset only for a new request. Conservatively lock older populated drafts with no import history, because allowing another import could duplicate existing rows.
