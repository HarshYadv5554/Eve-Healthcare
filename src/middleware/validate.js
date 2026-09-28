const { z } = require('zod');

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (err) {
      next(err);
    }
  };
}

function validateParams(schema) {
  return (req, res, next) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (err) {
      next(err);
    }
  };
}

const signupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const centreSchema = z.object({
  name: z.string().min(1).max(255),
  location: z.string().min(1).max(500),
});

const testSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.number().positive().max(1_000_000),
});

const bookingSchema = z.object({
  testId: z.string().uuid(),
  centreId: z.string().uuid(),
  appointmentAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
    message: 'Invalid appointment datetime',
  }),
});

const paymentSchema = z.object({
  bookingId: z.string().uuid(),
  forceOutcome: z.enum(['SUCCESS', 'FAILED']).optional(),
  /** When true, only creates a PENDING payment; booking stays PENDING until webhook */
  deferConfirmation: z.boolean().optional(),
});

const webhookSchema = z.object({
  eventId: z.string().min(1).max(255),
  paymentId: z.string().uuid(),
  status: z.enum(['SUCCESS', 'FAILED']),
  amount: z.number().positive().optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const idParamSchema = z.object({ id: z.string().uuid() });

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
  signupSchema,
  loginSchema,
  centreSchema,
  testSchema,
  bookingSchema,
  paymentSchema,
  webhookSchema,
  paginationSchema,
  idParamSchema,
};
