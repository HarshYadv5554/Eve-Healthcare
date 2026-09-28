require('dotenv').config({ path: '.env' });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required and must point to an isolated local *_test database.');
}

const testRedisUrl = process.env.TEST_REDIS_URL;
if (!testRedisUrl) {
  throw new Error('TEST_REDIS_URL is required and must point to an isolated local Redis instance.');
}

let testDatabase;
let testRedis;
try {
  testDatabase = new URL(testDatabaseUrl);
  testRedis = new URL(testRedisUrl);
} catch {
  throw new Error('TEST_DATABASE_URL and TEST_REDIS_URL must be valid connection URLs.');
}

const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
const testDatabaseName = decodeURIComponent(testDatabase.pathname.replace(/^\/+/, ''));
if (!localHosts.has(testDatabase.hostname) || !/_test$/i.test(testDatabaseName)) {
  throw new Error('Tests reset their database. Use a local loopback database whose name ends in _test.');
}
if (!localHosts.has(testRedis.hostname) || testRedis.protocol !== 'redis:') {
  throw new Error('Tests require a local loopback Redis URL in TEST_REDIS_URL.');
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.REDIS_URL = testRedisUrl;
process.env.WEBHOOK_QUEUE_NAME = 'payment-webhooks-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-minimum-32-characters';
process.env.PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'webhook-shared-secret';
process.env.PAYMENT_SUCCESS_RATE = '1';

const { execSync } = require('child_process');
let webhookWorker;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for tests. Start Postgres (docker compose up postgres -d).');
  }
  execSync('npx prisma db push --force-reset --accept-data-loss --skip-generate', {
    stdio: 'inherit',
    env: process.env,
  });
  const { createWebhookWorker } = require('../src/queues/webhookQueue');
  webhookWorker = createWebhookWorker();
});

afterAll(async () => {
  const { closeWebhookQueue } = require('../src/queues/webhookQueue');
  const cache = require('../src/cache/redisCache');
  const prisma = require('../src/db/prisma');
  await webhookWorker?.close();
  await closeWebhookQueue({ clear: true });
  await cache.closeCache();
  await prisma.$disconnect();
});
