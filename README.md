# School Backend

A multi-tenant school-management API for Nepali schools — attendance,
students, guardians, enrollments today; notices, fees, and SMS in later
milestones. Built with NestJS, Prisma, and PostgreSQL.

This is Milestone 1: scaffold, complete schema, auth + tenant scoping,
academics/students (incl. CSV import), and attendance.

See [`CLAUDE.md`](./CLAUDE.md) for the full breakdown of commands, seed
credentials, and implementation notes (tenant-scoping rule, BS dates,
attendance upsert, etc.).

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
```

Notices, fee structures, invoices/payments, and SMS delivery are modeled
in the database already (so later milestones are additive code, not
migrations) but have no endpoints yet.
