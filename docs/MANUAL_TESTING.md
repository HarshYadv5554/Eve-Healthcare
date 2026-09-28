# Manual API Testing in Swagger UI

This guide walks through the EVE Healthcare API using only Swagger UI in a web browser.

## Before you start

1. Open a terminal in the project folder.
2. Start the API if it is not already running:

   ```powershell
   npm run dev
   ```

3. Open [http://localhost:3000/docs](http://localhost:3000/docs).
4. Confirm Redis is running (`docker compose up redis -d`) as well as the API. Confirm the API is available by opening `GET /health`, clicking **Try it out**, then **Execute**. Expect status `200` and:

   ```json
   { "status": "ok" }
   ```

Swagger UI displays the endpoints as expandable rows. For each request below, expand the named endpoint, click **Try it out**, enter the JSON in **Request body** when requested, and click **Execute**. The response appears below the endpoint.

> These steps create records in the database configured by `DATABASE_URL` in `.env`. Your current setup uses Neon, so test records will remain in that database. Use a unique test email. Do not use the test suite against Neon; it resets its separate test database.

## 1. Create a test user

1. Expand `POST /auth/signup`.
2. Click **Try it out**.
3. Replace the example request body with this JSON. Change the email to an address not already registered:

   ```json
   {
     "email": "yourname-manual-test-1@example.com",
     "password": "manual-test-123",
     "name": "Manual Tester"
   }
   ```

4. Click **Execute**.
5. Expect status `201`. The response includes `user` and `token`.
6. Copy the token value, but do not include quotation marks around it.

If you see `409 EMAIL_EXISTS`, change the email and submit again.

### Optional: test login

1. Expand `POST /auth/login`, click **Try it out**, and enter the same email and password used for signup:

    ```json
    {
       "email": "yourname-manual-test-1@example.com",
       "password": "manual-test-123"
    }
    ```

2. Click **Execute**. Expect status `200` and a token. You may use this token in the next step instead of the signup token.

## 2. Authorize protected endpoints

1. Click **Authorize** near the top of the Swagger page.
2. In the `bearerAuth` value box, paste the token from signup. Paste only the token, not the word `Bearer`.
3. Click **Authorize**, then **Close**.

Protected endpoints should now work. Without authorization, they return `401`.

## 3. Find a diagnostic centre and test

1. Expand `GET /centres` and click **Try it out**.
2. Leave the default `page` and `limit`, then click **Execute**.
3. Expect status `200`. In the response, find an item and copy its `id`; this is the `centreId`.
4. Inside that item, find one test and copy its `id`; this is the `testId`.
5. Optionally expand `GET /centres/{id}`, enter the centre ID, and execute it. Expect the centre details and its tests.

If the list is empty, create a centre using step 4 below before continuing.

## 4. (Optional) Create a centre and a test

This verifies the authenticated centre-management endpoints. You can skip it when the database already has centres and tests.

1. Expand `POST /centres`, click **Try it out**, and submit:

   ```json
   {
     "name": "Manual Test Centre",
     "location": "Test City"
   }
   ```

2. Expect status `201`. Copy the new centre's `id`.
3. Expand `POST /centres/{id}/tests`, click **Try it out**, enter that centre ID in the `id` path field, then submit:

   ```json
   {
     "name": "Manual Blood Panel",
     "price": 500
   }
   ```

4. Expect status `201`. Copy the returned test `id`. Use this centre ID and test ID for the remaining steps.

## 5. Create and inspect a booking

1. Expand `POST /bookings`, click **Try it out**, and enter the centre and test IDs from step 3 or 4.
2. Set `appointmentAt` to a future date/time in ISO-8601 format. For example:

   ```json
   {
     "testId": "PASTE-TEST-ID-HERE",
     "centreId": "PASTE-CENTRE-ID-HERE",
     "appointmentAt": "2099-12-31T10:30:00.000Z"
   }
   ```

   Replace both ID placeholders with the real IDs. A future date is required; replace the example date if it is no longer in the future.

3. Click **Execute**. Expect status `201`, a booking `id`, and status `PENDING`. Copy the booking ID.
4. Expand `GET /bookings` and execute it. Expect your new booking in `items`.
5. Expand `GET /bookings/{id}`, enter the booking ID, and execute it. Expect the same booking details.

## 6. Test a successful payment

1. Expand `POST /payments/`, click **Try it out**, and enter:

   ```json
   {
     "bookingId": "PASTE-BOOKING-ID-HERE",
     "forceOutcome": "SUCCESS"
   }
   ```

2. Replace the placeholder with the booking ID and click **Execute**.
3. Expect status `201`, payment status `SUCCESS`, and booking status `CONFIRMED`.

A confirmed booking cannot be paid or cancelled again. Create a new booking for the following payment tests.

## 7. Test a failed payment

1. Create another booking using step 5 with a future appointment time.
2. Send `POST /payments/` with that new booking ID and:

   ```json
   {
     "bookingId": "PASTE-NEW-BOOKING-ID-HERE",
     "forceOutcome": "FAILED"
   }
   ```

3. Expect payment status `FAILED` and booking status `FAILED`.

## 8. Test a pending payment and webhook

1. Create another booking using step 5.
2. Expand `POST /payments/` and submit:

   ```json
   {
     "bookingId": "PASTE-NEW-BOOKING-ID-HERE",
     "deferConfirmation": true
   }
   ```

3. Expect payment status `PENDING` and booking status `PENDING`. Copy the payment ID from the response.
4. Expand `POST /payments/webhook/`. In the `x-webhook-secret` header field, enter the value of `PAYMENT_WEBHOOK_SECRET` from `.env`. If it is not set, use `webhook-shared-secret`.
5. Enter this request body, replacing the payment ID and using a unique event ID:

   ```json
   {
     "eventId": "manual-event-001",
     "paymentId": "PASTE-PAYMENT-ID-HERE",
     "status": "SUCCESS"
   }
   ```

6. Click **Execute**. Expect status `202` and `QUEUED`. The worker processes it asynchronously; refresh `GET /bookings/{id}` until the booking status becomes `CONFIRMED`.
7. Execute the exact same webhook again with the same event ID and payment ID. After the event has been processed, expect status `200` and `duplicate: true`; the booking should remain `CONFIRMED`.
8. To verify webhook authentication, try a new event with a deliberately incorrect secret. Expect status `401`.

## 9. Test cancellation and access protection

1. Create one more booking (step 5), then expand `POST /bookings/{id}/cancel` and enter its ID. Expect status `200` and booking status `CANCELLED`.
2. Try paying for that cancelled booking. Expect status `400`.
3. For an authentication check, use **Authorize** to clear the token (or open Swagger in a private window) and execute `GET /bookings`. Expect status `401`.

## Expected results

- `GET /health`: `200`, status `ok`.
- Signup: `201`; duplicate email: `409`.
- Public centre list/details: `200`.
- Protected routes without a token: `401`.
- New booking: `201`, `PENDING`; past appointment: `400`.
- Successful payment: payment `SUCCESS`, booking `CONFIRMED`.
- Failed payment: payment `FAILED`, booking `FAILED`.
- Replayed webhook event: `duplicate: true`.
- Cancelled booking cannot be paid; confirmed booking cannot be cancelled.

Swagger sends requests to the running local API; it does not start the server or the database. If a request cannot connect, start the server with `npm run dev` and check `/health` first.
