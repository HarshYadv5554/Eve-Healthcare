const { createApp } = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const prisma = require('./db/prisma');
const cache = require('./cache/redisCache');
const { createWebhookWorker, closeWebhookQueue } = require('./queues/webhookQueue');

const app = createApp();

if (require.main === module) {
  const webhookWorker = createWebhookWorker();
  const server = app.listen(config.port, () => {
    logger.info('Server listening', { port: config.port, env: config.nodeEnv });
  });

  async function shutdown() {
    server.close(async () => {
      await webhookWorker.close();
      await closeWebhookQueue();
      await cache.closeCache();
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app;
