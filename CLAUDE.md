# school-backend

School management backend (Milestone 1: foundation → attendance) for Nepali
schools. Independent git repo, not part of the outer portfolio repo.

## Stack

- NestJS 11 + TypeScript (strict)
- Prisma 6 + PostgreSQL 16 (via Docker Compose)
- JWT auth (access + refresh, HS256), argon2 password hashing
- `nepali-date-converter` for AD↔BS date display
- Jest + Supertest for e2e

## Commands

```bash
docker compose up -d              # start Postgres (host port 5433, NOT 5432 — already in use locally)
npx prisma migrate dev            # apply schema (already applied; use `migrate dev` again after schema.prisma changes)
npm run seed                      # prisma/seed.ts — school A (full roster) + school B (tenant-isolation fixture)
npm run start:dev                 # start the API on :3000 (prefix /api/v1)
npm run build                     # nest build
npm run lint                      # eslint --fix
npm run test                      # unit tests
npm run test:e2e                  # e2e suite (auto-resets + reseeds the two fixture schools first, see below)
```

`.env` (gitignored) holds `DATABASE_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, expiry windows, `PORT`. Copy `.env.example` to start.

## Tenant-scoping rule

**Every tenant-table query filters by `school_id` taken from the JWT, never
from request input.** The JWT payload is `{ user_id, school_id, roles }`
(`school_id` is `null` only for `super_admin`). Services must filter
explicitly — this is the primary defense. A Prisma client extension
(`src/common/prisma/tenant.extension.ts`) auto-injects a `school_id` filter
into queries against tenant models as a *second*, defense-in-depth layer; it
reads the current school from an `AsyncLocalStorage` store
(`src/common/context/tenant-context.ts`) that `JwtAuthGuard` populates after
verifying the token. Do not remove the explicit service-level filters and
rely on the extension alone.

Auth: `JwtAuthGuard` is global (`APP_GUARD`); annotate public routes with
`@Public()`. Role checks use `@Roles('teacher' | 'school_admin' | ...)` +
the global `RolesGuard`.

## Seed credentials (fixed, for local dev/testing — see `prisma/seed.ts`)

**School A — Sunrise Secondary School**
| Role | Phone | Password |
|---|---|---|
| school_admin | `9800000001` | `Admin@12345` |
| teacher **and** guardian (one login, two roles) | `9800000002` | `Teacher@12345` |

The teacher/guardian account's own child is the first seeded student
(Aarav Sharma, section A) — use this account to exercise both the
teacher attendance-marking flow and the guardian attendance-reading flow
with the same login.

**School B — Tenant Isolation Test School** (minimal fixture, exists only
so tests can prove school A data is invisible to it)
| Role | Phone | Password |
|---|---|---|
| school_admin | `9800000099` | `Admin@12345` |

## e2e tests and the database

`npm run test:e2e` runs `test/global-setup.js` first, which deletes only
the rows belonging to the two named fixture schools above (in FK-safe
order, via Prisma Client — **not** `prisma migrate reset`) and re-runs
`prisma/seed.ts`. This keeps re-runs deterministic without touching
anything outside this suite's own fixtures or requiring destructive
whole-database commands. Do not swap this back to `prisma migrate reset`
without a human explicitly present — Prisma's CLI refuses that command
when it detects an AI agent, precisely because it's irreversible; the
targeted-delete approach here gets the same determinism without that risk.

## Notable implementation choices

- **BS dates**: only `src/common/date/bs-date.util.ts` touches
  `nepali-date-converter` (`toBs`/`parseBs`). The DB never stores BS
  strings — only AD `DateTime`/`@db.Date`.
- **Attendance bulk upsert**: `POST /sections/:id/attendance` validates
  every `enrollment_id` belongs to the section + caller's school, then
  does one `INSERT ... ON CONFLICT (enrollment_id, date) DO UPDATE` via
  `$executeRaw` (`src/attendance/attendance.service.ts`). Re-posting for
  the same date corrects in place — no duplicate rows.
- **Absence events**: marking `absent`/`late`/`leave` emits an in-process
  event (`@nestjs/event-emitter`); `AbsenceListener` just logs for now.
  The SMS milestone will attach a real notifier to the same event.
- **SMS**: `SmsGateway` interface + `ConsoleSmsGateway` stub (logs to
  console, records to `sms_messages` when a school is known). Used today
  only by the OTP flow. Swap the DI binding in `auth.module.ts` when a
  real provider (e.g. Sparrow SMS) is ready.
- **OTP**: codes are generated in-memory (`OtpService`, 5 min TTL, single
  process — fine for MVP) and delivered through `SmsGateway`. Login-by-OTP
  assumes a phone maps to one account; if a phone is reused across
  schools (schema allows it — `users` is unique on `(school_id, phone)`,
  not `phone` alone), only password login (which tries every matching
  candidate and checks the hash) disambiguates correctly.
- **Full schema up front**: `prisma/schema.prisma` includes tables not
  used until later milestones (notices, fee_structures, invoices,
  payments, sms_messages) so those milestones are additive code, not
  additive migrations.
