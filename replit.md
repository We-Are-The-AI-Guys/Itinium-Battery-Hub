# Itinium Battery Portal

A bespoke web-based client portal for battery collection management, replacing manual Excel/email workflows.

## Architecture

- **Frontend**: React + Vite + Tailwind CSS v4 (artifacts/portal)
- **Backend**: Express v5 API server (artifacts/api-server)
- **Database**: PostgreSQL with Drizzle ORM (lib/db)
- **Monorepo**: pnpm workspace

## Design System

- **Primary**: Navy #0f2744 (HSL 213 64% 16%)
- **Accent**: Teal #0ea5e9 (HSL 199 89% 48%)
- **Background**: Slate #f8fafc
- **Font**: Inter

## Authentication

Custom email/password auth with bcrypt password hashing and cookie-based sessions (NOT Replit Auth).

- `POST /api/auth/login` — validates credentials, creates session, sets httpOnly cookie; stores user-agent and IP
- `GET /api/auth/me` — returns current user from session token
- `POST /api/auth/logout` — deletes session, clears cookie
- Sessions expire after 7 days, expired sessions cleaned hourly
- `requireAuth` middleware extracts user from session cookie, enforces isActive
- `requireRole(...)` middleware for role-based access control

## Database Schema

### users
- id, email (unique), password_hash, full_name, role, depot, is_active (boolean), last_active_at, notification_preferences (JSONB), created_at
- Roles: depot_user, team_leader, accounts, head_office_admin

### sessions
- id, user_id (FK → users), token (unique), user_agent, ip_address, expires_at, created_at

### jobs
- id, reference (unique), client_name, depot, collection_point, collection_date, submitted_at, tonnage (decimal), status (pending/approved/completed/flagged)
- Financial: invoice_status (pending_invoice/invoiced/paid), lme_rate_used, calculated_value
- Admin/Master Job Log: cbl_lme_value, cbl_lme_percent, cbl_lme_price, transport_cost, customer_invoice_value, customer_invoice_no, cbl_waste_advice_note_no, cbl_date, total_invoice_value, gross_profit, itinium_invoice_no
- notes, submitted_by_id (FK → users), created_at
- Indexes: status, submitted_at, composite (status, submitted_at)

### job_batteries
- id, job_id (FK → jobs, cascade delete), pallet_number, asset_number, battery_serial, manufacture, cell_type (PZB/PZS/PZV/Blocs/Other), voltage (dropdown: 12V/24V/36V/48V/80V), loose_cells_qty (integer), estimated_weight_kg (decimal), notes
- Admin fields: receipt_confirmed (boolean), pb_content_kg (decimal), value_gbp (decimal), admin_notes (text)
- pallet_number is auto-generated server-side as PLT-XXXXX using PostgreSQL sequence `pallet_number_seq`
- estimated_weight_kg auto-populated from battery_weight_reference table on depot form
- created_at
- Index: job_id
- Each job can have multiple battery line items (matches the spreadsheet grid)

### battery_weight_reference
- id, cell_type (varchar), voltage (varchar, nullable), weight_kg (decimal), created_at
- Unique constraint: partial indexes for (cell_type, voltage) WHERE voltage IS NOT NULL and (cell_type) WHERE voltage IS NULL
- Used to auto-populate estimated_weight_kg on depot form when cell type + voltage selected
- Blocs type: per-unit weight × loose cells qty; Other: 0 kg by default
- Managed via Settings > Battery Weights tab (admin only)

### lme_prices
- id, price_date, usd_price (decimal), exchange_rate (decimal), gbp_price (decimal), source (manual/api), created_at

### system_settings
- id, company_name, invoice_prefix, data_retention_days, auto_fetch_lme (boolean), updated_at

## Demo Accounts (all password: password123)

| Email | Role | Name |
|-------|------|------|
| depot@itinium.co.uk | depot_user | Dave Mitchell |
| team@itinium.co.uk | team_leader | Sarah Cooper |
| accounts@itinium.co.uk | accounts | Rachel Adams |
| admin@itinium.co.uk | head_office_admin | Sarah Mitchell |

Additional demo users: Alex Johnson, Tom Whitaker, James Patel, Emma Clarke, David Osei, Priya Sharma, Mark Thompson, Lisa Chen

## API Endpoints

### Auth
- `POST /api/auth/login` — login with email/password
- `GET /api/auth/me` — current user profile
- `POST /api/auth/logout` — end session

### Jobs
- `GET /api/jobs?status=X&invoiceStatus=X&search=X&limit=10&offset=0` — list jobs (requires role: team_leader/accounts/head_office_admin)
- `GET /api/jobs/:id` — job detail with battery line items (admin only: team_leader/accounts/head_office_admin)
- `POST /api/jobs` — create job with battery items array (requires auth)
- `PATCH /api/jobs/:id/admin` — update admin/financial fields on a job (admin only)
- `PATCH /api/jobs/:id/status` — update job status (admin only)
- `PATCH /api/jobs/:id/batteries/:batteryId/admin` — update per-battery admin fields (admin only)

### Dashboard (requires auth + role: team_leader/accounts/head_office_admin)
- `GET /api/dashboard/stats` — summary metrics (pendingJobs, monthlyTonnage, totalInvoiceValue, flaggedExceptions)

### LME Pricing (requires auth + role: accounts/head_office_admin)
- `GET /api/lme/current` — latest LME price entry
- `POST /api/lme/update` — save manual price override (usdPrice, exchangeRate → auto-calculates gbpPrice)
- `GET /api/lme/history?limit=20&offset=0` — price history with pagination

### Users (requires auth + role: head_office_admin)
- `GET /api/users?role=X&search=X&limit=10&offset=0` — list users with role filtering, search, and pagination
- `POST /api/users` — create new user (bcrypt password hash, random temp password)
- `PATCH /api/users/:id` — update user (fullName, role, depot, isActive)
- `GET /api/users/stats` — user count by role (total, depotUsers, teamLeaders, adminStaff)

### Settings (requires auth)
- `PATCH /api/settings/profile` — update own fullName and depot
- `POST /api/settings/password` — change password (validates current password)
- `GET /api/settings/notifications` — read notification preferences
- `PATCH /api/settings/notifications` — update notification preferences
- `GET /api/settings/sessions` — list active sessions (browser, masked IP, dates)
- `DELETE /api/settings/sessions/:id` — revoke specific session
- `DELETE /api/settings/sessions` — revoke all sessions except current
- `GET /api/settings/system` — read system settings (head_office_admin only)
- `PATCH /api/settings/system` — update system settings (head_office_admin only)

### Weight Reference (requires auth; write routes require head_office_admin)
- `GET /api/weight-reference` — list all weight references
- `GET /api/weight-reference/lookup?cellType=X&voltage=X` — lookup single weight
- `POST /api/weight-reference` — create weight reference entry
- `PATCH /api/weight-reference/:id` — update weight (weightKg)
- `DELETE /api/weight-reference/:id` — delete weight reference

## Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/login` | `login.tsx` | Split-panel login with Itinium branding |
| `/` | `dashboard.tsx` | Depot user dashboard; admin roles redirect to /dashboard |
| `/dashboard` | `admin-dashboard.tsx` | Admin dashboard with sidebar, KPI cards, jobs table |
| `/lme-pricing` | `lme-pricing.tsx` | LME Pricing & Accounts — manual price input, job value table, export cards |
| `/users` | `user-management.tsx` | User Management — stats, user table with role filters, Add New User modal |
| `/settings` | `settings.tsx` | Settings — Profile, Notifications, Security, System (admin-only) tabs |
| `/jobs` | `job-list.tsx` | Job list with search, filters, pagination — click to review |
| `/jobs/:id` | `job-detail.tsx` | Job detail: read-only depot data + admin financial/completion form |
| `/kpi` | `placeholder.tsx` | KPI Reporting (placeholder) |
| `/collection/new` | `depot-form.tsx` | Redundant Battery Collection Note form (multi-row battery items, matches spreadsheet) |

## Route Guards

- `AuthGuard` — requires authenticated session
- `AdminGuard` — requires auth + role in [team_leader, accounts, head_office_admin]
- `RoleGuard` — requires auth + specific role(s)
- `/lme-pricing` uses RoleGuard [accounts, head_office_admin]
- `/users` uses RoleGuard [head_office_admin]
- `/settings` uses AuthGuard (all authenticated users; System tab hidden for non-admin)

## Shared Components

- `sidebar-layout.tsx` — Reusable sidebar layout with dark navy sidebar, nav items, user info, header bar. Used by admin dashboard, LME Pricing, User Management, Settings pages.

## Key Files

- `artifacts/portal/src/components/sidebar-layout.tsx` — Shared sidebar layout component
- `artifacts/portal/src/pages/admin-dashboard.tsx` — Admin dashboard with metrics + jobs table
- `artifacts/portal/src/pages/lme-pricing.tsx` — LME Pricing & Accounts page
- `artifacts/portal/src/pages/user-management.tsx` — User Management page
- `artifacts/portal/src/pages/settings.tsx` — Settings page with 5 tabs (Profile, Notifications, Security, Battery Weights, System)
- `artifacts/portal/src/pages/login.tsx` — Login page with split-panel design
- `artifacts/portal/src/pages/dashboard.tsx` — Depot user dashboard
- `artifacts/portal/src/pages/depot-form.tsx` — Depot submission form
- `artifacts/portal/src/pages/job-list.tsx` — Admin job list with search/filter/pagination
- `artifacts/portal/src/pages/job-detail.tsx` — Job detail with admin financial completion form
- `artifacts/portal/src/App.tsx` — Routing with AuthGuard/AdminGuard/RoleGuard/GuestGuard
- `artifacts/api-server/src/routes/auth.ts` — Auth API routes (stores user-agent/IP on login)
- `artifacts/api-server/src/routes/jobs.ts` — Jobs API routes with dashboard stats
- `artifacts/api-server/src/routes/lme.ts` — LME pricing API routes
- `artifacts/api-server/src/routes/users.ts` — User management API routes
- `artifacts/api-server/src/routes/settings.ts` — Settings API routes (profile, password, notifications, sessions, system)
- `artifacts/api-server/src/routes/weight-reference.ts` — Battery weight reference CRUD API
- `artifacts/api-server/src/middlewares/auth.ts` — requireAuth + requireRole middleware
- `lib/db/src/schema/users.ts` — Users, sessions, and system_settings schemas
- `lib/db/src/schema/jobs.ts` — Jobs + job_batteries schemas with relations
- `lib/db/src/schema/lme-prices.ts` — LME prices schema
- `scripts/seed.ts` — Database seeder (12 users + 18 demo jobs + 5 LME prices + system settings)

## Mockups

UI mockups designed in mockup-sandbox canvas:
- Login Page, Depot Submission Form, Admin Dashboard, LME Pricing & Accounts, User Management
