---
name: V16 access authority
description: Signed-off six-role rules supersede older access and document policies.
---
V16 is the authority: Admin alone administers access, internal finance/Pb/resolved data and official job changes. Customer roles may combine within exactly one client; Lead Client and Accounts are client-wide, Team Leader and Warehouse are location-restricted. Accounts is no longer a global internal finance role. Never auto-promote legacy unassigned Accounts users to Admin or infer client assignment.

**Why:** The user supplied the approved V16 specification with explicit overrides to previous spreadsheets and instructions.

**How to apply:** Warehouse uses Operational Overview, not the main dashboard. Customer roles combine features but never bypass their one client or permitted depot scope. Lead Client/Accounts are client-wide; Team Leader/Warehouse have no finance unless combined with a finance-entitled customer role. Provisional unknown weights are allowed at request time, not confirmation; 26t remains the hard limit.

**Why (request cutoff override):** On 2026-10-14 the corrective specification superseded the earlier shared pre-collection cutoff: authorised customers may request amendments until Completed, including Received/Processing. Cancellation closes at physical collection, not scheduling. Collector completed/partial reports constitute collection evidence; a proposed or confirmed date alone does not. Requests never mutate official job data; Admin decides and actions them.

**Why (document release override):** On 2026-10-14 the user reiterated that customer signed-document release is the actual Invoice/Invoiced stage (Itinium invoices the collection company), NOT Completed (Itinium pays the customer). Awaiting Invoice is not Invoice. Keep released signed files accessible at Completed.

Admin and the assigned Collection Co may Upload, View, Download and Replace ALL THREE job document types at ANY status: signed collection sheet, signed consignment note and Statement to Itinium. No timing or Completed gate applies to these internal actors. Retain actor/date/version history and the other files when replacing one type. PDF/JPEG/PNG, 20MB per file.

**Why:** The corrective specification dated 2026-10-14 supersedes previous collector upload timing and Completed-only download rules, and explicitly gives Admin the same full document controls.

**How to apply:** Customer metadata, files and notifications must never expose Statements, internal version history or internal resolved details. Only the two approved signed types are customer-facing. Verify backing files exist before advertising current-file links. Preserve the separate unsigned driver-sheet download before collection, with assigned-company, explicit release and confirmed-schedule checks.

Stillages movement logs, internal notes, editing and global company totals are Admin-only. Lead Client/Accounts get read-only counts for their client; Team Leader/Warehouse only their permitted depots. Collection Co has no Stillages access.

**Why:** The 2026-10-14 correction explicitly separates operational depot counts from internal movement/notes records.

**How to apply:** Enforce restrictions in SQL scope and response allowlists as well as UI/export controls. Do not return movement rows with their notes merely because the UI hides the table. Internal document notifications target Itinium Admin, never customer Accounts.

Real support/operations addresses, retention duration, extra document types and collector assignment redesign remain deferred. Keep KPI presentation/functionality unchanged apart from enforcing tenant isolation. No automatic publishing.

Production is in use by real clients; testing must not alter live records or notify live recipients.

**Why:** On 2026-10-12 the user requested isolated staging because real clients are now using the published portal.

**How to apply:** Keep staging database, documents, accounts and outbound email isolated; do not treat a separate database alone as sufficient isolation. Obtain approval before publishing production changes.

KPI exception: non-Itinium users must not receive Gross Profit, Gross Margin, Overdue Invoices (count or value), or Avg CBL LME % in cards, graphs, monthly tables or API responses.

**Why:** The user explicitly requested this KPI restriction on 2026-10-12, superseding the earlier preserve-KPI rule for these metrics.

**How to apply:** Retain these metrics for Admin only, including in printable views and chart tooltips.

Accounts and Lead Client may download the existing date-filtered KPI spreadsheet containing one row per job. “LME Value £” means the customer's agreed traction rate (£/t), NOT the underlying LME market price. The 2026-10-14 Admin-only Pb rule excludes derived traction/bloc Pb weight columns from customer exports; retain these for Admin. Review flags stay Itinium-only.

**Why:** The user explicitly extended export permissions on 2026-10-12, then corrected the placement: this must be a KPI date-range export, NOT a per-job download. This is an exception to the earlier invoice-total-only financial rule.

**How to apply:** Match the KPI date filter and client scope. Jobs pages offer the signed document downloads instead of Excel. Do not expose collector costs, profit or other internal financial fields.

Warehouse teams also have read-only Schedule access for their assigned sites.

**Why:** The user explicitly extended Warehouse access on 2026-10-12; this supersedes the original schedule role restriction.

**How to apply:** Keep the Operational Overview landing page and location/client boundaries; do not grant schedule editing, confirmation, finance or main-dashboard access.

**Why:** These are the user's explicit scope boundaries, not implementation assumptions.

**How to apply:** Require configured mailbox/sender addresses, retain requests even when email is pending configuration, and preserve original files/history.

The reported Wellingborough login issue is resolved. Do not attempt targeted account repair or password reset; test new-user creation, activation, sign-in, role unions and scope with isolated fictional users instead.

**Why:** The user explicitly confirmed the issue was separately resolved in the 2026-10-14 corrective specification.

**How to apply:** Treat earlier proposed account-specific reset work as obsolete unless the user reports a new issue and explicitly authorises remediation. Never publish or deploy these corrective changes automatically.
