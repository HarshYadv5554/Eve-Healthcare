require('dotenv').config();

const required = ['DATABASE_URL', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  payment: {
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || 'webhook-shared-secret',
    successRate: parseFloat(process.env.PAYMENT_SUCCESS_RATE || '0.8'),
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:56379',
    centreCacheTtlSeconds: parseInt(process.env.CENTRE_CACHE_TTL_SECONDS || '60', 10),
    webhookQueueName: process.env.WEBHOOK_QUEUE_NAME || 'payment-webhooks',
    webhookRetryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '5', 10),
    webhookRetryDelayMs: parseInt(process.env.WEBHOOK_RETRY_DELAY_MS || '1000', 10),
  },
};
