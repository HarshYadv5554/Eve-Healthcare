# EVE Healthcare — Diagnostic Bookings API (Node.js)

Backend service for diagnostic test bookings and **simulated** payments, built for the EVE Healthcare SDE Intern backend assignment.

**Stack:** Node.js 20, Express, PostgreSQL, Prisma, JWT, Zod validation, Jest + Supertest, Swagger UI, Docker Compose, Winston logging, rate limiting.

## Quick start

### Option A — Docker (recommended)

```bash
docker compose up --build
```

API: `http://localhost:3000`  
Swagger: `http://localhost:3000/docs`  
Health: `http://localhost:3000/health`

For a browser-only walkthrough of the complete API, see [Manual Swagger Testing](docs/MANUAL_TESTING.md).

### Option B — Local Node + Postgres

1. Start Postgres (or only the DB container):

```bash
docker compose up postgres redis -d
```

2. Install and configure:

```bash
cp .env.example .env
npm install
npm run setup
npm run dev
```

Redis is required for centre caching and background webhook processing. Start it with `docker compose up redis -d` and set `REDIS_URL` in `.env` (the example uses `redis://127.0.0.1:56379`). Cache failures are fail-open; webhook delivery requires a healthy queue.

## Running tests

Tests reset their database before each run. Use a disposable local Postgres database whose name ends in `_test`; the test setup refuses remote hosts such as Neon.

```powershell
docker compose up postgres redis -d
docker run --detach --name eve-healthcare-isolated-test-postgres --publish 55433:5432 --env POSTGRES_USER=eve_test --env POSTGRES_PASSWORD=test-only-secret --env POSTGRES_DB=eve_healthcare_test postgres:16-alpine
docker exec eve-healthcare-isolated-test-postgres pg_isready -U eve_test -d eve_healthcare_test
$env:TEST_DATABASE_URL = "postgresql://eve_test:test-only-secret@127.0.0.1:55433/eve_healthcare_test?schema=public"
$env:TEST_REDIS_URL = "redis://127.0.0.1:56379"
npm test
```

Create the disposable test container once. Start it again with `docker start eve-healthcare-isolated-test-postgres` for later test runs. Remove it when it is no longer needed:

```powershell
docker rm --force eve-healthcare-isolated-test-postgres
```

The Jest setup applies the Prisma schema with `--force-reset` only to `TEST_DATABASE_URL`, and requires `TEST_REDIS_URL` to use local Redis. It does not use the application `DATABASE_URL` or regenerate the Prisma client during tests. Tests use a separate Redis queue name and clear that queue on exit.

## Authentication

All protected routes use `Authorization: Bearer <JWT>`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | No | Register user |
| POST | `/auth/login` | No | Login, returns JWT |

**Signup example:**

```bash
curl -s -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"patient@example.com","password":"password123","name":"Patient One"}'
```

**Login example:**

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"patient@example.com","password":"password123"}'
```

## Diagnostic centres & tests

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/centres?page=1&limit=20` | No | List centres (paginated) with tests |
| GET | `/centres/:id` | No | Get one centre |
| POST | `/centres` | Yes | Create centre |
| POST | `/centres/:id/tests` | Yes | Add test to centre |

Seed data includes two Bangalore/Mumbai-style centres with common lab tests.

**List centres:**

```bash
curl -s http://localhost:3000/centres
```

**Add test (authenticated):**

```bash
curl -s -X POST http://localhost:3000/centres/<CENTRE_ID>/tests \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Liver Function Test","price":750}'
```

## Bookings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/bookings` | Yes | Create booking (status `PENDING`) |
| GET | `/bookings` | Yes | List own bookings |
| GET | `/bookings/:id` | Yes | Get booking (owner only) |
| POST | `/bookings/:id/cancel` | Yes | Cancel `PENDING` / `FAILED` booking |

**Create booking:**

```bash
curl -s -X POST http://localhost:3000/bookings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "testId": "<TEST_UUID>",
    "centreId": "<CENTRE_UUID>",
    "appointmentAt": "2026-10-15T10:30:00.000Z"
  }'
```

Booking amount is taken from the test price at creation time. Appointment must be in the future. Test must belong to the given centre.

**Booking statuses:** `PENDING`, `CONFIRMED`, `FAILED`, `CANCELLED`.

## Simulated payments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/payments/` | Yes | Mock payment processing |
| POST | `/payments/webhook/` | Secret header | Provider webhook (idempotent) |

### POST `/payments/`

**Synchronous simulation (default):** creates a payment and sets booking to `CONFIRMED` or `FAILED`.

Optional body fields:

- `forceOutcome`: `"SUCCESS"` \| `"FAILED"` (deterministic; useful for demos/tests)
- `deferConfirmation`: `true` — creates `PENDING` payment only; booking stays `PENDING` until webhook

```bash
curl -s -X POST http://localhost:3000/payments/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"<BOOKING_UUID>","forceOutcome":"SUCCESS"}'
```

Without `forceOutcome`, outcome is random (~80% success, configurable via `PAYMENT_SUCCESS_RATE`).

### POST `/payments/webhook/`

Simulates an async payment provider callback. Valid events are queued for background processing and return `202`; transient processing failures are retried up to `WEBHOOK_RETRY_ATTEMPTS` times with exponential backoff. **Idempotent:** repeating the same `eventId` does not duplicate state changes, including when an event is already queued or processed.

Header: `x-webhook-secret: <PAYMENT_WEBHOOK_SECRET>` (default `webhook-shared-secret`).

```bash
curl -s -X POST http://localhost:3000/payments/webhook/ \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: webhook-shared-secret" \
  -d '{
    "eventId": "evt_unique_001",
    "paymentId": "<PAYMENT_UUID>",
    "status": "SUCCESS"
  }'
```

Response includes `duplicate: true` when the event was already processed.

## Database schema

PostgreSQL via Prisma (`prisma/schema.prisma`):

```
users
  id, email (unique), password_hash, name, created_at

diagnostic_centres
  id, name, location, created_at

diagnostic_tests
  id, centre_id (FK), name, price

bookings
  id, user_id (FK), test_id (FK), centre_id (FK),
  appointment_at, amount, status, created_at

payments
  id, booking_id (FK), amount, status,
  provider_event_id (unique, set by webhook), created_at

webhook_events
  id, event_id (unique), payment_id, processed_at
```

**Relationships:**

- Centre → many tests  
- User → many bookings  
- Booking → many payments (typically one successful path; pending flow supported)  
- `webhook_events.event_id` enforces webhook idempotency  

## Edge cases handled

- Validation errors (Zod) with structured 400 responses  
- Duplicate signup email (409)  
- Invalid credentials (401)  
- Missing/invalid JWT (401)  
- Access to another user’s booking (403)  
- Unknown centre/test/booking/payment (404)  
- Past appointment dates, test/centre mismatch  
- Paying for cancelled/already confirmed bookings  
- Duplicate pending payment per booking (409)  
- Invalid webhook secret (401)  
- Idempotent webhook replay (safe no-op semantics with `duplicate: true`)  
- Rate limiting on payment routes  

## Assumptions

1. **Any authenticated user** can create centres/tests (no admin role) — sufficient for the assignment; production would use RBAC.  
2. **Amount snapshot** on booking avoids price changes affecting existing bookings.  
3. **Mock payment** is synchronous by default; `deferConfirmation` + webhook models async provider flow.  
4. **Confirmed bookings** cannot be cancelled via API (would need refund flow).  
5. **Webhook auth** uses a shared secret header (not HMAC signature) for simplicity.  

## If I had more time

- Role-based access (admin vs patient)  
- Outbox pattern for transactional event publication  
- Payment idempotency keys on `POST /payments/`  
- CI pipeline with GitHub Actions  
- Migration files instead of `db push` for production  
- System can be connected with IOT devices to get reports including ECG data and other data from devices on dashboard for both patients and doctors as done in this repository(https://github.com/HarshYadv5554/HealthMonitor)

## Project layout

```
src/
  app.js              Express app factory
  server.js           Entry point
  config/             Environment config
  db/                 Prisma client
  middleware/         Auth, validation, errors
  routes/             HTTP routes
  services/           Business logic
  docs/openapi.js     Swagger spec
prisma/
  schema.prisma
  seed.js
tests/
  api.test.js
docker-compose.yml
Dockerfile
```

## Environment variables

See `.env.example`:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signing secret for JWT |
| `JWT_EXPIRES_IN` | Token TTL (default `7d`) |
| `PAYMENT_WEBHOOK_SECRET` | Webhook header secret |
| `PAYMENT_SUCCESS_RATE` | 0–1 probability for random mock payments |
| `PORT` | Server port (default `3000`) |
| `REDIS_URL` | Redis connection for centre caching and webhook jobs |
| `CENTRE_CACHE_TTL_SECONDS` | Centre cache lifetime (default `60`) |
| `WEBHOOK_QUEUE_NAME` | BullMQ queue name |
| `WEBHOOK_RETRY_ATTEMPTS` | Maximum background attempts (default `5`) |
| `WEBHOOK_RETRY_DELAY_MS` | Initial exponential retry delay (default `1000`) |

---

Built with Node.js for **EVE Healthcare** — diagnostic bookings & simulated payments.
