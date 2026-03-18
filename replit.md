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

## Database Schema

### users
- id, email (unique), password_hash, full_name, role, depot, created_at
- Roles: depot_user, team_leader, accounts, head_office_admin

### sessions
- id, user_id (FK → users), token (unique), expires_at, created_at

## Demo Accounts (all password: password123)

| Email | Role | Name |
|-------|------|------|
| depot@itinium.co.uk | depot_user | Dave Mitchell |
| team@itinium.co.uk | team_leader | Sarah Cooper |
| accounts@itinium.co.uk | accounts | Jane Williams |
| admin@itinium.co.uk | head_office_admin | Mark Johnson |

## Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/login` | `login.tsx` | Split-panel login with Itinium branding |
| `/` | `dashboard.tsx` | Welcome dashboard with role info + "New Collection" card |
| `/collection/new` | `depot-form.tsx` | Battery collection submission form |

## Key Files

- `artifacts/portal/src/pages/login.tsx` — Login page with split-panel design
- `artifacts/portal/src/pages/dashboard.tsx` — Dashboard (post-login)
- `artifacts/portal/src/pages/depot-form.tsx` — Depot submission form (tonnage bar, asset details, specs, photo capture, notes)
- `artifacts/portal/src/App.tsx` — Routing with AuthGuard/GuestGuard
- `artifacts/api-server/src/routes/auth.ts` — Auth API routes
- `lib/db/src/schema/users.ts` — Users + sessions schema
- `scripts/seed.ts` — Database seeder

## Mockups

UI mockups designed in mockup-sandbox canvas:
- Login Page, Depot Submission Form, Admin Dashboard, LME Pricing & Accounts, User Management

## Planned Features

- AI-assisted photo data extraction for battery collection forms
- LME lead pricing integration
- Job management workflows
- Financial reporting and invoicing
- Role-based access control (depot → team leader → accounts → admin)