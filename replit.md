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

- `POST /api/auth/login` — validates credentials, creates session, sets httpOnly cookie
- `GET /api/auth/me` — returns current user from session token
- `POST /api/auth/logout` — deletes session, clears cookie
- Sessions expire after 7 days, expired sessions cleaned hourly
- `requireAuth` middleware extracts user from session cookie
- `requireRole(...)` middleware for role-based access control

## Database Schema

### users
- id, email (unique), password_hash, full_name, role, depot, created_at
- Roles: depot_user, team_leader, accounts, head_office_admin

### sessions
- id, user_id (FK → users), token (unique), expires_at, created_at

### jobs
- id, reference (unique), client_name, depot, submitted_at, tonnage (decimal), status (pending/approved/completed/flagged)
- Battery details: pallet_number, asset_number, battery_serial, cell_type, voltage, weight, condition
- Financial: invoice_status (pending_invoice/invoiced/paid), lme_rate_used, calculated_value
- notes, submitted_by_id (FK → users), created_at

## Demo Accounts (all password: password123)

| Email | Role | Name |
|-------|------|------|
| depot@itinium.co.uk | depot_user | Dave Mitchell |
| team@itinium.co.uk | team_leader | Sarah Cooper |
| accounts@itinium.co.uk | accounts | Rachel Adams |
| admin@itinium.co.uk | head_office_admin | Sarah Mitchell |

## API Endpoints

### Auth
- `POST /api/auth/login` — login with email/password
- `GET /api/auth/me` — current user profile
- `POST /api/auth/logout` — end session

### Jobs (requires auth + role: team_leader/accounts/head_office_admin)
- `GET /api/jobs?status=X&page=1&limit=10` — list jobs with filtering and pagination

### Dashboard (requires auth + role: team_leader/accounts/head_office_admin)
- `GET /api/dashboard/stats` — summary metrics (pendingJobs, monthlyTonnage, totalInvoiceValue, flaggedExceptions)

## Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/login` | `login.tsx` | Split-panel login with Itinium branding |
| `/` | `dashboard.tsx` | Depot user dashboard; admin roles redirect to /dashboard |
| `/dashboard` | `admin-dashboard.tsx` | Admin dashboard with sidebar, KPI cards, jobs table |
| `/collection/new` | `depot-form.tsx` | Battery collection submission form |

## Shared Components

- `sidebar-layout.tsx` — Reusable sidebar layout with dark navy sidebar, nav items, user info, header bar. Used by admin dashboard and will be used by LME Pricing, User Management pages.

## Key Files

- `artifacts/portal/src/components/sidebar-layout.tsx` — Shared sidebar layout component
- `artifacts/portal/src/pages/admin-dashboard.tsx` — Admin dashboard with metrics + jobs table
- `artifacts/portal/src/pages/login.tsx` — Login page with split-panel design
- `artifacts/portal/src/pages/dashboard.tsx` — Depot user dashboard
- `artifacts/portal/src/pages/depot-form.tsx` — Depot submission form
- `artifacts/portal/src/App.tsx` — Routing with AuthGuard/GuestGuard
- `artifacts/api-server/src/routes/auth.ts` — Auth API routes
- `artifacts/api-server/src/routes/jobs.ts` — Jobs API routes with dashboard stats
- `artifacts/api-server/src/middlewares/auth.ts` — requireAuth + requireRole middleware
- `lib/db/src/schema/users.ts` — Users + sessions schema
- `lib/db/src/schema/jobs.ts` — Jobs schema
- `scripts/seed.ts` — Database seeder (4 users + 18 demo jobs)

## Mockups

UI mockups designed in mockup-sandbox canvas:
- Login Page, Depot Submission Form, Admin Dashboard, LME Pricing & Accounts, User Management

## Planned Features (Task #2)

- LME Pricing & Accounts page with manual price input, job value table, export section
- User Management page with user CRUD, role filtering, Add New User modal
