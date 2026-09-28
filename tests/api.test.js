const {
  app,
  request,
  resetDb,
  seedCentreWithTest,
  signupUser,
  authHeader,
} = require('./helpers');

describe('API root', () => {
  it('redirects to the API documentation', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/docs');
  });
});

describe('Auth', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('signs up and returns JWT', async () => {
    const res = await request(app).post('/auth/signup').send({
      email: 'alice@example.com',
      password: 'password123',
      name: 'Alice',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('rejects duplicate email', async () => {
    await signupUser('dup@example.com');
    const res = await request(app).post('/auth/signup').send({
      email: 'dup@example.com',
      password: 'password123',
      name: 'Bob',
    });
    expect(res.status).toBe(409);
  });

  it('logs in with valid credentials', async () => {
    await signupUser('login@example.com');
    const res = await request(app).post('/auth/login').send({
      email: 'login@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects invalid login', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'nope@example.com',
      password: 'wrong',
    });
    expect(res.status).toBe(401);
  });
});

describe('Centres', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('lists paginated centres and returns a centre with its tests', async () => {
    const { centre } = await seedCentreWithTest();

    const listRes = await request(app).get('/centres?page=1&limit=1');
    expect(listRes.status).toBe(200);
    expect(listRes.body.pagination).toMatchObject({ page: 1, limit: 1, total: 1 });
    expect(listRes.body.items[0].tests).toHaveLength(1);

    const detailRes = await request(app).get(`/centres/${centre.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.id).toBe(centre.id);
  });

  it('requires authentication to create a centre and add tests', async () => {
    const initialList = await request(app).get('/centres');
    expect(initialList.body.items).toHaveLength(0);

    const unauthenticated = await request(app).post('/centres').send({
      name: 'New Centre',
      location: 'Test City',
    });
    expect(unauthenticated.status).toBe(401);

    const user = await signupUser();
    const centreRes = await request(app)
      .post('/centres')
      .set(authHeader(user.token))
      .send({ name: 'New Centre', location: 'Test City' });
    expect(centreRes.status).toBe(201);

    const listAfterCreate = await request(app).get('/centres');
    expect(listAfterCreate.body.items).toHaveLength(1);

    const detailBeforeTest = await request(app).get(`/centres/${centreRes.body.id}`);
    expect(detailBeforeTest.body.tests).toHaveLength(0);

    const testRes = await request(app)
      .post(`/centres/${centreRes.body.id}/tests`)
      .set(authHeader(user.token))
      .send({ name: 'Blood Panel', price: 250 });
    expect(testRes.status).toBe(201);
    expect(testRes.body.price).toBe(250);

    const detailAfterTest = await request(app).get(`/centres/${centreRes.body.id}`);
    expect(detailAfterTest.body.tests).toHaveLength(1);
  });
});

describe('Bookings and payments', () => {
  let token;
  let test;
  let centre;

  beforeEach(async () => {
    await resetDb();
    const seeded = await seedCentreWithTest();
    centre = seeded.centre;
    test = seeded.test;
    const user = await signupUser();
    token = user.token;
  });

  it('creates a booking for authenticated user', async () => {
    const appointmentAt = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post('/bookings')
      .set(authHeader(token))
      .send({
        testId: test.id,
        centreId: centre.id,
        appointmentAt,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.amount).toBe(500);
  });

  it('lists and cancels a pending booking', async () => {
    const appointmentAt = new Date(Date.now() + 86400000).toISOString();
    const created = await request(app)
      .post('/bookings')
      .set(authHeader(token))
      .send({ testId: test.id, centreId: centre.id, appointmentAt });

    const listRes = await request(app).get('/bookings').set(authHeader(token));
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);

    const cancelRes = await request(app)
      .post(`/bookings/${created.body.id}/cancel`)
      .set(authHeader(token));
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('CANCELLED');
  });

  it('rejects malformed and unknown booking IDs', async () => {
    const malformed = await request(app)
      .get('/bookings/not-a-uuid')
      .set(authHeader(token));
    expect(malformed.status).toBe(400);

    const unknown = await request(app)
      .get('/bookings/00000000-0000-4000-8000-000000000001')
      .set(authHeader(token));
    expect(unknown.status).toBe(404);
  });

  it('rejects past appointments and tests from another centre', async () => {
    const pastAppointment = new Date(Date.now() - 86400000).toISOString();
    const pastRes = await request(app)
      .post('/bookings')
      .set(authHeader(token))
      .send({ testId: test.id, centreId: centre.id, appointmentAt: pastAppointment });
    expect(pastRes.status).toBe(400);

    const mismatchRes = await request(app)
      .post('/bookings')
      .set(authHeader(token))
      .send({
        testId: test.id,
        centreId: '00000000-0000-4000-8000-000000000001',
        appointmentAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(mismatchRes.status).toBe(404);
  });

  it('forbids access to another users booking', async () => {
    const appointmentAt = new Date(Date.now() + 86400000).toISOString();
    const bookingRes = await request(app)
      .post('/bookings')
      .set(authHeader(token))
      .send({ testId: test.id, centreId: centre.id, appointmentAt });

    const other = await signupUser('other@example.com');
    const getRes = await request(app)
      .get(`/bookings/${bookingRes.body.id}`)
      .set(authHeader(other.token));

    expect(getRes.status).toBe(403);
  });

  it('processes mock payment with forced success', async () => {
    const appointmentAt = new Date(Date.now() + 86400000).toISOString();
    const bookingRes = await request(app)
      .post('/bookings')
      .set(authHeader(token))
      .send({ testId: test.id, centreId: centre.id, appointmentAt });

    const payRes = await request(app)
      .post('/payments/')
      .set(authHeader(token))
      .send({ bookingId: bookingRes.body.id, forceOutcome: 'SUCCESS' });

    expect(payRes.status).toBe(201);
    expect(payRes.body.payment.status).toBe('SUCCESS');
    expect(payRes.body.booking.status).toBe('CONFIRMED');
  });

  it('handles failed mock payment', async () => {
    const appointmentAt = new Date(Date.now() + 86400000).toISOString();
    const bookingRes = await request(app)
      .post('/bookings')
      .set(authHeader(token))
      .send({ testId: test.id, centreId: centre.id, appointmentAt });

    const payRes = await request(app)
      .post('/payments/')
      .set(authHeader(token))
      .send({ bookingId: bookingRes.body.id, forceOutcome: 'FAILED' });

    expect(payRes.body.payment.status).toBe('FAILED');
    expect(payRes.body.booking.status).toBe('FAILED');
  });
});

describe('Payment webhook idempotency', () => {
  let token;
  let paymentId;
  let bookingId;

  beforeEach(async () => {
    await resetDb();
    const { centre, test } = await seedCentreWithTest();
    const user = await signupUser();
    token = user.token;

    const appointmentAt = new Date(Date.now() + 86400000).toISOString();
    const bookingRes = await request(app)
      .post('/bookings')
      .set(authHeader(token))
      .send({ testId: test.id, centreId: centre.id, appointmentAt });
    bookingId = bookingRes.body.id;

    const payInit = await request(app)
      .post('/payments/')
      .set(authHeader(token))
      .send({ bookingId, deferConfirmation: true });

    paymentId = payInit.body.payment.id;
  });

  it('prevents duplicate pending payments for one booking', async () => {
    const duplicate = await request(app)
      .post('/payments/')
      .set(authHeader(token))
      .send({ bookingId, deferConfirmation: true });

    expect(duplicate.status).toBe(409);
  });

  it('updates booking on webhook and ignores duplicate events', async () => {
    const payload = {
      eventId: `evt_${Date.now()}_${Math.random()}`,
      paymentId,
      status: 'SUCCESS',
    };

    const first = await request(app)
      .post('/payments/webhook/')
      .set('x-webhook-secret', 'webhook-shared-secret')
      .send(payload);

    expect(first.status).toBe(202);
    expect(first.body.status).toBe('QUEUED');

    let booking;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      booking = await request(app)
        .get(`/bookings/${bookingId}`)
        .set(authHeader(token));
      if (booking.body.status === 'CONFIRMED') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(booking.body.status).toBe('CONFIRMED');

    const second = await request(app)
      .post('/payments/webhook/')
      .set('x-webhook-secret', 'webhook-shared-secret')
      .send(payload);

    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.booking.status).toBe('CONFIRMED');

    const bookingDetails = await request(app)
      .get(`/bookings/${bookingId}`)
      .set(authHeader(token));
    expect(bookingDetails.body.payments).toHaveLength(1);
  });

  it('rejects webhook without secret', async () => {
    const res = await request(app).post('/payments/webhook/').send({
      eventId: 'evt_x',
      paymentId,
      status: 'SUCCESS',
    });
    expect(res.status).toBe(401);
  });

  it('rejects a webhook for an unknown payment before queueing', async () => {
    const res = await request(app)
      .post('/payments/webhook/')
      .set('x-webhook-secret', 'webhook-shared-secret')
      .send({
        eventId: 'evt_unknown_payment',
        paymentId: '00000000-0000-4000-8000-000000000001',
        status: 'SUCCESS',
      });

    expect(res.status).toBe(404);
  });
});
