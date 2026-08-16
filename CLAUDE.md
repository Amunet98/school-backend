# school-backend

School management backend for Nepali schools. Independent git repo, not
part of the outer portfolio repo. Milestone 1 (foundation → attendance) and
the SMS milestone (queue + absence alerts) are both implemented.

## Stack

- NestJS 11 + TypeScript (strict)
- Prisma 6 + PostgreSQL 16 (via Docker Compose)
- JWT auth (access + refresh, HS256), argon2 password hashing
- `nepali-date-converter` for AD↔BS date display
- graphile-worker (Postgres-based job queue, embedded in the API process)
  for SMS delivery
- Jest + Supertest for e2e

## Commands

```bash
docker compose up -d              # start Postgres (host port 5433, NOT 5432 — already in use locally)
npx prisma migrate dev            # apply schema (interactive; a human runs this locally after schema.prisma changes)
npm run seed                      # prisma/seed.ts — school A (full roster) + school B (tenant-isolation fixture)
npm run start:dev                 # start the API on :3000 (prefix /api/v1)
npm run build                     # nest build
npm run lint                      # eslint --fix
npm run test                      # unit tests
npm run test:e2e                  # e2e suite (auto-resets + reseeds the two fixture schools first, see below)
```

`.env` (gitignored) holds `DATABASE_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, expiry windows, `PORT`, `SPARROW_TOKEN`,
`SPARROW_IDENTITY`. Copy `.env.example` to start.

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
order, via Prisma Client — **not** `prisma migrate reset`, and including
`sms_messages` for those schools) and re-runs `prisma/seed.ts`. This keeps
re-runs deterministic without touching anything outside this suite's own
fixtures or requiring destructive whole-database commands. Do not swap
this back to `prisma migrate reset` without a human explicitly present —
Prisma's CLI refuses that command when it detects an AI agent, precisely
because it's irreversible; the targeted-delete approach here gets the
same determinism without that risk.

The embedded graphile-worker runner starts inside the e2e test's own Nest
app instance (`Test.createTestingModule` in `school.e2e-spec.ts`), so
`send_sms` jobs enqueued during a test run are actually processed by that
same process — e2e SMS assertions poll `sms_messages.status` until it
reaches `'sent'` rather than asserting on it immediately. The fixture
cleanup above never touches the `graphile_worker` schema itself (its
tables are worker-owned infrastructure, not per-fixture data) — only the
`sms_messages` rows created during the run.

`prisma migrate dev` also refuses to run non-interactively for an agent
(same class of guard rail as `migrate reset`). The safe non-interactive
path used for additive migrations in this repo: generate the diff SQL
with `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`,
hand-place it under `prisma/migrations/<timestamp>_<name>/migration.sql`,
then apply with `npx prisma migrate deploy` (which is designed for
exactly this — non-interactive, no destructive-change prompts, just
applies pending migration files).

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
  event (`@nestjs/event-emitter`); `AbsenceListener`
  (`src/attendance/listeners/absence.listener.ts`) reacts to it. Only
  `absent` triggers a guardian SMS — `late`/`leave` just log, staying
  app-only (a scope decision, not a limitation). The listener is fully
  decoupled from the attendance POST (fire-and-forget event + its own
  try/catch around everything) so an SMS failure can never break
  attendance marking.
- **SMS (`src/sms/`)**: `SmsGateway` is delivery-only —
  `deliver(phone, body) -> { gatewayRef? }`. `SmsService.enqueue` owns
  persistence: inside one DB transaction it inserts an `sms_messages` row
  (`status: 'queued'`) and schedules a `send_sms` graphile-worker job, so
  the row and the job can never diverge. `SmsQueueService` runs an
  **embedded** graphile-worker instance inside the API process
  (`concurrency: 2`, `run()` from the `graphile-worker` package) against
  the *same* Postgres database — no separate worker process, no Redis.
  graphile-worker manages its own `graphile_worker` schema in that
  database; treat it as owned infrastructure, not application data (don't
  drop it, don't include it in fixture cleanup beyond incidentally
  processing/consuming jobs).
  - **Dedup**: `sms_messages.dedup_key` is a nullable column with a
    unique index. Absence alerts use
    `absence:<enrollmentId>:<YYYY-MM-DD>` so re-submitting/correcting
    attendance for the same date can never double-send — the second
    `enqueue` call hits the unique-index collision (Prisma `P2002`) and
    `enqueue` returns `null` silently. Known accepted edge case: absent
    -> corrected to present -> re-marked absent the same day sends only
    the *first* SMS, because both attempts share the same dedup key.
  - **Provider**: env-gated. `SmsModule`'s provider factory picks
    `SparrowSmsGateway` when `SPARROW_TOKEN` is set, otherwise
    `ConsoleSmsGateway` (logs instead of sending). No real Sparrow
    credentials exist yet — activation later is just setting
    `SPARROW_TOKEN`/`SPARROW_IDENTITY` in `.env`, no code change.
  - **Locale**: templates (`src/sms/sms-templates.ts`) are chosen by
    `school.settings.locale` — `'ne'` (default, when absent/unknown) or
    `'en'`. BS dates in templates go through `toBs()`
    (`src/common/date/bs-date.util.ts`) — same single-source rule as
    everywhere else.
  - **Per-school opt-out**: `school.settings.sms_enabled === false` skips
    absence SMS for that school entirely (default: enabled).
- **OTP**: codes are generated in-memory (`OtpService`, 5 min TTL, single
  process — fine for MVP) and requests are routed through
  `SmsService.enqueue` (purpose `'otp'`, no dedup key) like any other SMS
  — *except* for a null-`school_id` user (only ever `super_admin`):
  `sms_messages.school_id` is `NOT NULL`, so that case bypasses the queue
  entirely and calls `SMS_GATEWAY.deliver()` directly (see
  `auth.service.ts#requestOtp`). Login-by-OTP assumes a phone maps to one
  account; if a phone is reused across schools (schema allows it —
  `users` is unique on `(school_id, phone)`, not `phone` alone), only
  password login (which tries every matching candidate and checks the
  hash) disambiguates correctly.
- **Intended-role gate on login**: `POST /auth/login` and
  `POST /auth/otp/verify` both accept an optional `role` field (the
  school-admin frontend sends the role picked on its `/welcome` screen).
  If set and the authenticating account doesn't hold that role,
  `AuthService#assertHasRole` throws `ForbiddenException` (403) *instead*
  of issuing tokens for a different role — a deliberate, distinct status
  from the 401 used for bad credentials/code, so the frontend can tell
  "wrong password" from "right account, wrong role" apart. For OTP, the
  code is verified (and consumed) *before* the role check, not after —
  checking role first would let an unauthenticated caller probe "does
  this phone have role X" for any phone number with no code at all. The
  tradeoff: a role-mismatched OTP attempt burns the one-time code, so
  retrying with the correct role needs a fresh `otp/request`. `role` is
  validated against `LOGIN_ROLES` in `common/interfaces/jwt-payload.interface.ts`
  (`school_admin` | `teacher` | `guardian` — `super_admin` excluded, no
  client flow offers it).
- **Full schema up front**: `prisma/schema.prisma` includes tables not
  used until later milestones (notices, fee_structures, invoices,
  payments, sms_messages) so those milestones are additive code, not
  additive migrations.
- **Notices (`src/notices/`)**: staff announcements, additive on top of
  the `Notice` table that already existed from the initial migration —
  no schema change this milestone. Three audiences: `school` (everyone),
  `class` (one `Class`), `section` (one `Section`) — `class_id`/
  `section_id` are mutually exclusive with the audience and with each
  other; `class-validator`'s `@ValidateIf` only *requires* the matching
  id, it can't reject a *stray* one sent alongside the wrong audience, so
  that rejection (400) lives in `NoticesService.create`. Target existence
  is re-checked scoped by `schoolId` (404 on cross-school or missing ids)
  — the tenant-isolation gate, same pattern as everywhere else.
  - **Who posts**: `school_admin` via `POST /notices` picks any audience.
    `teacher` via `POST /my/notices` can only post to their own
    class-taught section — the DTO doesn't even accept an `audience`
    field, the service forces `'section'` and asserts ownership with a
    copy of `AttendanceService.assertOwnsSectionAsClassTeacher`
    (`attendance.service.ts:82-100` — copied, not cross-imported, to keep
    the two modules decoupled). Cross-school section 404s; a real
    section the caller doesn't teach 403s.
  - **Teacher's relevant-notices view**: `GET /my/notices` unions
    school-wide notices with class-wide notices for the classes of
    sections the teacher teaches and section-wide notices for those
    sections directly (mirrors `AttendanceService.getMySections`,
    `attendance.service.ts:31-41`, re-implemented privately in
    `NoticesService` rather than cross-imported).
  - **SMS fan-out**: on create with `send_sms: true`,
    `NOTICE_CREATED_EVENT` is emitted *after* `notice.create` resolves
    (never before — `NoticeSmsListener` re-reads the row rather than
    trusting the event payload beyond the id). The listener mirrors
    `AbsenceListener`: gates on `isSmsEnabled(school.settings)`, resolves
    locale, and sends a **title-only** body —
    `noticeAlert(locale, {schoolName, title})` in `sms-templates.ts` —
    deliberately omitting the notice body to keep the Nepali SMS at 1-2
    segments; guardians read the full text in the app/portal.
    `NoticesService.resolveRecipientPhones(schoolId, notice)` (public,
    unit-tested directly) resolves recipients: current academic year
    (`academicYear.findFirst({isCurrent:true})`, no current year -> `[]`)
    -> active, non-deleted enrollments scoped to the notice's audience
    -> each enrollment's primary guardian (falling back to any guardian,
    skipping enrollments with none) -> phones deduped through a `Set` so
    siblings sharing a guardian get exactly one SMS. Each recipient is
    enqueued with `dedupKey: notice:<noticeId>:<phone>`, same
    per-key-idempotency pattern as absence alerts (`P2002` collision ->
    `enqueue` returns `null`, logged as already-handled). The whole
    listener body and each individual enqueue call are separately
    wrapped in try/catch, same as `AbsenceListener` — an SMS problem here
    can never affect notice creation, and one bad recipient can't stop
    the rest of the fan-out.
  - **Future hardening (not built)**: the fan-out loop is synchronous,
    in-process, one `enqueue` call per recipient — fine at pilot scale (a
    few hundred guardians, already off the request path since it runs
    from the event, not the controller) but not how it should scale.
    A later pass could replace it with a single
    "expand-recipients" graphile-worker job that itself schedules the
    per-recipient `send_sms` jobs, instead of doing the expansion
    synchronously inside the event listener.
  - **Out of scope this milestone**: notice edit/delete (admins can only
    create/list, matching every other CRUD module's lack of update
    routes so far), parent-facing notice views, pagination, scheduled or
    draft notices.
