# RCC ATS — Application Tracking System

RCC ATS is an internal applicant tracking system built for the **Responsible Computing Club (RCC)** at **San José State University**. It centralizes RCC recruitment workflows that were previously managed across Google Forms and Google Sheets into a single web application for importing, reviewing, filtering, updating, and managing applications.

The system supports multiple recruitment pipelines, including:
- **Project / Intern applications**
- **Ambassador / Lead applications**
- **E-Board applications**

It is designed for internal reviewer use and supports authenticated access, CSV-based applicant imports, structured review workflows, status management, reviewer notes, and email outreach.

---

## Overview

RCC ATS was built to replace a fragmented recruitment workflow with a centralized internal system that allows RCC reviewers to:

- import applicant responses from CSV exports
- review applicants in a kanban-style board
- view full application responses in a modal
- add internal notes during review
- update application statuses
- send applicant emails through the app
- enforce placement rules across overlapping application tracks
- manage internal access through invite-only authentication

This project is an **internal staff tool**, not a public applicant portal.

---

## Core Features

### Applicant review workflow
- Per-opportunity review boards
- Search and filtering by applicant, email, and role
- Applicant modal with full question-and-answer review
- Cross-application visibility for applicants with multiple applications

### Import pipeline
- CSV import flow for multiple RCC application form types
- Project / Intern import support
- E-Board import support
- Matrix-based Ambassador / Lead form support
- Import validation to prevent incompatible form types from being added into the wrong opportunity

### Notes and decision support
- Structured internal notes:
  - application notes
  - interview notes
  - decision notes
- Save-on-blur behavior for efficient reviewer workflows
- Toggleable notes side panel in the applicant review modal

### Status and outreach workflow
- Application statuses:
  - `To Review`
  - `Interviewing`
  - `Rejected`
  - `Accepted`
- Email drafting and sending from within the app
- “Send Email Later” workflow for more flexible reviewer triage

### Placement enforcement
- Separate `Applicant`, `Application`, and `Placement` entities
- Acceptance logic that closes conflicting same-track applications automatically

### Internal access control
- Google-authenticated sign-in
- Invite-only access based on approved users in the database
- Internal access management UI

---

## Tech Stack

### Frontend
- **Next.js 15**
- **React**
- **Tailwind CSS**

### Backend
- **Next.js API Routes**

### Database / ORM
- **PostgreSQL**
- **Prisma**

### Authentication
- **Auth.js / NextAuth.js**
- **Google OAuth**

### Tooling
- **Bun**
- **Vitest**

---

## Architecture Notes

This app uses a server-side architecture for data access:

- browser requests go through the Next.js app
- API routes handle reads and writes
- Prisma communicates with PostgreSQL
- authentication is enforced at the app layer

The browser does **not** directly query Supabase tables.

---

## Project Structure

```txt
application-tracking-system/
├── apps/
│   └── web/                  # Fullstack Next.js app
├── packages/
│   └── db/                   # Prisma schema and database package
```

Important files and folders include:

- `apps/web/src/app/admin/page.tsx` — main ATS interface
- `apps/web/src/app/api/import/route.ts` — CSV import route
- `apps/web/src/app/api/applications/route.ts` — application fetch/update API
- `apps/web/src/app/api/email/route.ts` — email sending route
- `apps/web/src/lib/parseCsv.ts` — CSV parsing and normalization
- `apps/web/src/lib/placement.ts` — placement enforcement logic
- `packages/db/prisma/schema/schema.prisma` — canonical database schema

---

## Prerequisites

Before running the project locally, make sure you have:

- **Bun** installed
- **PostgreSQL** database access
- **Google OAuth credentials** for Auth.js
- required environment variables configured

---

## Installation

Install dependencies with:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Prisma.

### Push the schema

```bash
bun run db:push
```

### Generate Prisma client

```bash
bun run db:generate
```

## Running the App

Start the development server with:

```bash
bun run dev
```

Then open:

`http://localhost:3001`

---

## Available Scripts

- `bun run dev` — start the app in development mode
- `bun run build` — build the application
- `bun run check-types` — run TypeScript checks
- `bun run db:push` — push Prisma schema changes to the database
- `bun run db:generate` — generate Prisma client/types
- `bun run db:migrate` — run database migrations
- `bun run db:studio` — open Prisma Studio

---

## Product / Domain Notes

A few important domain rules shape this project:

- **Applicant**, **Application**, and **Placement** are intentionally separate entities
- **Opportunity** and **Role** are not the same thing
- **E-Board** is treated as an **Ambassador-track subtype**, not a separate top-level track
- accepted applicants can automatically close conflicting same-track applications
- import validation is important because different RCC forms have different structures and must map into the correct opportunity family

---

## Security Notes

This repository is for an internal recruitment workflow tool. Sensitive credentials and production configuration are intentionally not included.

Current product direction:
- Google-only authentication
- invite-only access
- internal reviewer/admin workflow only

For production or internal deployment, environment variables and secrets should be managed outside the repo.

---

## Status

RCC ATS has moved beyond an initial MVP and into active internal use. The system supports core recruitment workflows end to end, including imports, review boards, notes, status changes, email workflows, and placement enforcement.

Current areas of focus include:
- workflow polish
- internal security hardening
- continued testing and refinement of reviewer/admin flows

---

## Why This Project Exists

RCC ATS was built to replace a manual recruitment workflow spread across forms, spreadsheets, and disconnected reviewer communication. The goal was to give RCC a centralized internal system that is easier to use, easier to review from, and more consistent across multiple application pipelines.

---

## Disclaimer

This project is an internal operational tool for RCC recruitment. Any example data, local environment setup, or screenshots should be treated as non-production unless explicitly stated otherwise.
