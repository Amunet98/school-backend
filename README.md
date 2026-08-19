# School Backend

[![NestJS](https://img.shields.io/badge/NestJS-11-e0234e?logo=nestjs&logoColor=white)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-6-2d3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-compose-2496ed?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Jest](https://img.shields.io/badge/tests-Jest%20%2B%20Supertest-c21325?logo=jest&logoColor=white)](https://jestjs.io)

A multi-tenant school-management API for Nepali schools — attendance,
students, guardians, enrollments, SMS alerts, and staff notices today;
fees in a later milestone. Built with NestJS, Prisma, PostgreSQL, and an
embedded graphile-worker queue.

Milestone 1 (scaffold, complete schema, auth + tenant scoping,
academics/students incl. CSV import, attendance), the SMS milestone
(queue, absence alerts to guardians, OTP through the queue), and notices
(school/class/section-targeted announcements with optional SMS fan-out)
are all implemented.

The staff-facing web client lives in a separate repo:
[`school-admin`](https://github.com/Amunet98/school-admin).

See [`CLAUDE.md`](./CLAUDE.md) for the full breakdown of commands, seed
credentials, and implementation notes (tenant-scoping rule, BS dates,
attendance upsert, etc.).

## Stack

- NestJS 11 + TypeScript (strict)
- Prisma 6 + PostgreSQL 16 (via Docker Compose)
- JWT auth (access + refresh, HS256), argon2 password hashing
- graphile-worker for SMS delivery — Postgres-backed, embedded in the API
  process (no separate worker, no Redis)
- `nepali-date-converter` for AD↔BS dates
- Jest + Supertest

## Quickstart

```bash
cp .env.example .env
docker compose up -d          # Postgres 16 on host port 5433
npx prisma migrate dev        # apply the schema
npm run seed                  # seed two schools with test data (see CLAUDE.md for credentials)
npm run start:dev             # API on http://localhost:3000/api/v1
```

Run the tests:

```bash
npm run test        # unit
npm run test:e2e    # e2e (auto-resets the seed fixtures first)
```

## API surface (Milestone 1)

```
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/otp/request
POST /api/v1/auth/otp/verify

GET/POST   /api/v1/classes
GET/POST   /api/v1/sections
GET/POST   /api/v1/academic-years
GET/POST   /api/v1/teachers
GET/POST/PATCH /api/v1/students
POST       /api/v1/students/import       (CSV, multipart field "file")
POST       /api/v1/enrollments/promote

GET  /api/v1/my/sections                 (teacher)
GET  /api/v1/sections/:id/students?date=
POST /api/v1/sections/:id/attendance     { date, records: [{ enrollment_id, status }] }

GET  /api/v1/my/children                 (guardian)
GET  /api/v1/children/:id/attendance?month=
GET  /api/v1/children/notices             (guardian)

GET/POST /api/v1/notices                 (school_admin, any audience)
GET/POST /api/v1/my/notices              (teacher, own section only)
```

Marking a student `absent` (not `late`/`leave`) enqueues an SMS to their
primary guardian via an embedded graphile-worker queue (`src/sms/`) — see
`CLAUDE.md` for the dedup/locale/opt-out rules. Notices with `send_sms: true`
fan out the same way, title-only, to every guardian in the target audience.
No endpoints for fee structures or invoices/payments yet — those tables are
modeled in the database already (so that milestone is additive code, not
migrations).

---

More of my work: **[bimeshpoudel.com.np](https://www.bimeshpoudel.com.np)**
