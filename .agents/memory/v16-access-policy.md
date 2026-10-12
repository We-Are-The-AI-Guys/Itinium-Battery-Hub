---
name: V16 access authority
description: Signed-off six-role rules supersede older access and document policies.
---
V16 is the authority: Admin alone administers access, internal finance/Pb/resolved data and official job changes. Customer roles may combine within exactly one client; Lead Client and Accounts are client-wide, Team Leader and Warehouse are location-restricted. Accounts is no longer a global internal finance role. Never auto-promote legacy unassigned Accounts users to Admin or infer client assignment.

**Why:** The user supplied the approved V16 specification with explicit overrides to previous spreadsheets and instructions.

**How to apply:** Warehouse uses operational overview, not the main dashboard. Customers request amendments/cancellation before Completed; Admin decides separately from official job status. Only signed consignment notes and collection sheets are customer-approved, downloadable by customers and assigned collectors only after Completed. Admin and assigned collectors may upload PDF/JPEG/PNG up to 20MB; Statement and exception evidence remain Admin-only. Provisional unknown weights are allowed at request time, not confirmation; 26t remains the hard limit.

Real support/operations addresses, retention duration, extra document types and collector assignment redesign remain deferred. Keep KPI presentation/functionality unchanged apart from enforcing tenant isolation. No automatic publishing.

KPI exception: non-Itinium users must not receive Gross Profit, Gross Margin, Overdue Invoices (count or value), or Avg CBL LME % in cards, graphs, monthly tables or API responses.

**Why:** The user explicitly requested this KPI restriction on 2026-10-12, superseding the earlier preserve-KPI rule for these metrics.

**How to apply:** Retain these metrics for Admin only, including in printable views and chart tooltips.

Accounts and Lead Client may download a customer job Excel file containing tonnage, customer traction LME percentage, customer Pb blocs tonnage, customer transport/ad hoc costs, net customer invoice value and customer invoice number. Review flags stay Itinium-only.

**Why:** The user explicitly extended export permissions on 2026-10-12; this is an exception to the earlier invoice-total-only financial rule.

**How to apply:** Limit the export to the user's client and the requested customer figures. Do not expose collector costs, profit or other internal financial fields.

Warehouse teams also have read-only Schedule access for their assigned sites.

**Why:** The user explicitly extended Warehouse access on 2026-10-12; this supersedes the original schedule role restriction.

**How to apply:** Keep the Operational Overview landing page and location/client boundaries; do not grant schedule editing, confirmation, finance or main-dashboard access.

**Why:** These are the user's explicit scope boundaries, not implementation assumptions.

**How to apply:** Require configured mailbox/sender addresses, retain requests even when email is pending configuration, and preserve original files/history.
