const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./docs/openapi');
const { errorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const centreRoutes = require('./routes/centreRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
  });

  app.get('/', (req, res) => {
    res.redirect('/docs');
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

  app.use('/auth', authRoutes);
  app.use('/centres', centreRoutes);
  app.use('/bookings', bookingRoutes);
  app.use('/payments', webhookLimiter, paymentRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
