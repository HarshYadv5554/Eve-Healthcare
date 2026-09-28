const { ZodError } = require('zod');
const { AppError } = require('../utils/AppError');
const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    });
  }

  logger.error('Unhandled error', { err: err.message, stack: err.stack });
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
}

module.exports = { errorHandler };
