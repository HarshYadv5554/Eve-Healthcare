module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'EVE Healthcare — Diagnostic Bookings API',
    version: '1.0.0',
    description: 'Backend service for diagnostic test bookings and simulated payments.',
  },
  servers: [{ url: 'http://localhost:3000' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      SignupRequest: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8, maxLength: 128 },
          name: { type: 'string', minLength: 1, maxLength: 255 },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
      CentreRequest: {
        type: 'object',
        required: ['name', 'location'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          location: { type: 'string', minLength: 1, maxLength: 500 },
        },
      },
      TestRequest: {
        type: 'object',
        required: ['name', 'price'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          price: { type: 'number', exclusiveMinimum: 0, maximum: 1000000 },
        },
      },
      BookingRequest: {
        type: 'object',
        required: ['testId', 'centreId', 'appointmentAt'],
        properties: {
          testId: { type: 'string', format: 'uuid' },
          centreId: { type: 'string', format: 'uuid' },
          appointmentAt: { type: 'string', format: 'date-time' },
        },
      },
      PaymentRequest: {
        type: 'object',
        required: ['bookingId'],
        properties: {
          bookingId: { type: 'string', format: 'uuid' },
          forceOutcome: { type: 'string', enum: ['SUCCESS', 'FAILED'] },
          deferConfirmation: { type: 'boolean' },
        },
      },
      WebhookRequest: {
        type: 'object',
        required: ['eventId', 'paymentId', 'status'],
        properties: {
          eventId: { type: 'string', minLength: 1, maxLength: 255 },
          paymentId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['SUCCESS', 'FAILED'] },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/auth/signup': {
      post: {
        summary: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SignupRequest' },
            },
          },
        },
        responses: { 201: { description: 'User created' } },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: { 200: { description: 'JWT token' } },
      },
    },
    '/centres': {
      get: {
        summary: 'List diagnostic centres (paginated)',
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1, default: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: { 200: { description: 'Paginated centres and their tests' } },
      },
      post: {
        summary: 'Create centre',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CentreRequest' },
            },
          },
        },
        responses: { 201: { description: 'Centre created' } },
      },
    },
    '/centres/{id}': {
      get: {
        summary: 'Get a centre and its tests',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: { 200: { description: 'Centre details' }, 404: { description: 'Centre not found' } },
      },
    },
    '/centres/{id}/tests': {
      post: {
        summary: 'Add a diagnostic test to a centre',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TestRequest' },
            },
          },
        },
        responses: { 201: { description: 'Test created' }, 404: { description: 'Centre not found' } },
      },
    },
    '/bookings': {
      get: {
        summary: 'List my bookings',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1, default: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: { 200: { description: 'Paginated bookings for the signed-in user' } },
      },
      post: {
        summary: 'Create booking',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BookingRequest' },
            },
          },
        },
        responses: { 201: { description: 'Booking created with PENDING status' } },
      },
    },
    '/bookings/{id}': {
      get: {
        summary: 'Get one of my bookings',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: { 200: { description: 'Booking details' }, 403: { description: 'Not your booking' } },
      },
    },
    '/bookings/{id}/cancel': {
      post: {
        summary: 'Cancel a pending or failed booking',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: { 200: { description: 'Booking cancelled' }, 400: { description: 'Booking cannot be cancelled' } },
      },
    },
    '/payments/': {
      post: {
        summary: 'Simulate payment for a booking',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaymentRequest' },
            },
          },
        },
        responses: { 201: { description: 'Payment processed or left pending for webhook' } },
      },
    },
    '/payments/webhook/': {
      post: {
        summary: 'Payment provider webhook (idempotent)',
        parameters: [
          {
            name: 'x-webhook-secret',
            in: 'header',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WebhookRequest' },
            },
          },
        },
        responses: {
          200: { description: 'Previously processed duplicate event' },
          202: { description: 'Webhook accepted for background processing with automatic retries' },
          401: { description: 'Invalid webhook secret' },
          500: { description: 'Queue unavailable; provider may retry the request' },
        },
      },
    },
  },
};
