# Itinium Battery Portal

## Overview

The Itinium Battery Portal is a web-based client portal designed to streamline the management of battery collection, replacing traditional manual workflows involving Excel spreadsheets and emails. It serves as a comprehensive system for clients to submit battery collection requests and for Itinium staff to manage these requests, track logistics, and handle financial aspects. The project aims to enhance efficiency, accuracy, and transparency in the battery collection process for both clients and Itinium.

## User Preferences

- The agent should prioritize critical tasks, such as bug fixes or security vulnerabilities, over new feature development.
- The agent should always provide a clear explanation of the changes made and the reasoning behind them.
- Before implementing any major changes or new features, the agent should propose the plan and await confirmation.
- The agent should maintain a clean and readable codebase, adhering to established coding standards and best practices.
- The agent should focus on delivering incremental changes and seek feedback regularly to ensure alignment with project goals.
- Do not make changes to the `lib/db/src/data/cell-models.ts` file.

## System Architecture

The Itinium Battery Portal is built as a monorepo using pnpm workspaces.

### Frontend
- **Framework**: React with Vite for fast development.
- **Styling**: Tailwind CSS v4 for utility-first styling.
- **UI/UX**: The design system uses a primary Navy (`#0f2744`) and accent Teal (`#0ea5e9`) color scheme with Inter font. The layout features a reusable sidebar for admin views.

### Backend
- **API Server**: Express v5.
- **Authentication**: Custom email/password authentication using bcrypt for password hashing and cookie-based sessions. It includes role-based access control (`requireRole` middleware) and session management with expiration.

### Database
- **Type**: PostgreSQL.
- **ORM**: Drizzle ORM.
- **Schema**: Key entities include `clients`, `locations`, `users` (with roles: `depot_user`, `team_leader`, `accounts`, `head_office_admin`), `sessions`, `jobs` (tracking collection details, financial data, and status), `job_batteries` (detailed battery information per job, including estimated weights, serials, and admin fields), `cell_models` (pre-seeded static data for battery types), `battery_weight_reference` (for weight lookups), `lme_prices` (for lead metal exchange rates), `stillage_movements` (for tracking container logistics), and `system_settings`.

### Core Features
- **Job Management**: Creation of battery collection jobs by depot users, detailed tracking of battery items, and administrative/financial completion.
- **User Management**: Comprehensive user management with role-based access control for different levels of system interaction.
- **Client & Location Management**: Administration of client organizations and their associated collection locations.
- **LME Pricing**: Manual input and historical tracking of Lead Metal Exchange prices used for job valuation.
- **Stillage Tracking**: Management of stillage container movements for logistical operations.
- **Dashboard & Reporting**: Summary statistics and job listings for administrative oversight.
- **Settings**: User profile, password, notification preferences, and system-wide settings management.

## External Dependencies

- **PostgreSQL**: Primary database for all application data.
- **Vite**: Frontend build tool.
- **React**: Frontend library.
- **Tailwind CSS**: CSS framework.
- **Express**: Backend web framework.
- **bcrypt**: For password hashing.
- **Drizzle ORM**: For database interaction.

## Frontend Pages

- **Login** (`/login`): Email/password login
- **Dashboard** (`/`, `/dashboard`): Depot user dashboard / Admin dashboard
- **Job Management** (`/jobs`, `/jobs/:id`): Job listing and detail views (admin roles)
- **Stillages** (`/stillages`): Stillage tracking (all authenticated users)
- **KPI Reporting** (`/kpi`): Placeholder (accounts, head_office_admin only)
- **LME Pricing** (`/lme-pricing`): LME price management (accounts, head_office_admin)
- **Clients** (`/clients`): Client CRUD with inline locations and team leaders (head_office_admin only)
- **Locations** (`/locations`): Location CRUD for team leader's own client (team_leader only)
- **User Access** (`/users`): User management with client/location selectors (head_office_admin sees all + client/location dropdowns; team_leader sees own client's users, can only manage depot_users)
- **New Collection** (`/collection/new`): Depot form for battery collection submission
- **Settings** (`/settings`): Profile and system settings

## Role Hierarchy & Navigation

- **head_office_admin**: Full access — Dashboard, Jobs, Stillages, KPI, LME Pricing, Clients, Users, New Collection, Settings, Help
- **accounts**: Dashboard, Jobs, Stillages, KPI, LME Pricing, New Collection, Settings, Help
- **team_leader**: Dashboard, Jobs, Stillages, Locations, Users (depot_user only), New Collection, Settings, Help. Scoped to their assigned client.
- **depot_user**: Stillages, New Collection, Settings, Help. Scoped to their assigned location.