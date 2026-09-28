const { createHash } = require('node:crypto');
const { Queue, Worker, UnrecoverableError } = require('bullmq');
const IORedis = require('ioredis');
const config = require('../config');
const paymentService = require('../services/paymentService');
const { AppError } = require('../utils/AppError');
const logger = require('../utils/logger');

function createRedisConnection() {
  return new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

const webhookJobOptions = {
  attempts: config.redis.webhookRetryAttempts,
  backoff: { type: 'exponential', delay: config.redis.webhookRetryDelayMs },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800, count: 1000 },
};

function createWebhookQueue(name = config.redis.webhookQueueName, defaultJobOptions = webhookJobOptions) {
  const queue = new Queue(name, {
    connection: createRedisConnection(),
    defaultJobOptions,
  });
  queue.on('error', (err) => logger.error('Webhook queue error', { error: err.message }));
  return queue;
}

const webhookQueue = createWebhookQueue();

async function enqueueWebhook(payload) {
  const jobId = queueJobIdForEvent(payload.eventId);
  const existing = await webhookQueue.getJob(jobId);
  if (existing) {
    if ((await existing.getState()) === 'failed') {
      await existing.retry('failed');
    }
    return { jobId };
  }

  const job = await webhookQueue.add('process-payment-webhook', payload, { jobId });
  return { jobId: job.id };
}

async function processWebhookJob(job) {
  try {
    return await paymentService.processWebhook(job.data, config.payment.webhookSecret);
  } catch (err) {
    if (err instanceof AppError && err.statusCode < 500) {
      throw new UnrecoverableError(err.message);
    }
    throw err;
  }
}

function createWebhookWorker({
  name = config.redis.webhookQueueName,
  processor = processWebhookJob,
  concurrency = 5,
} = {}) {
  const worker = new Worker(name, processor, {
    connection: createRedisConnection(),
    concurrency,
  });
  worker.on('completed', (job) => {
    logger.info('Webhook background job completed', {
      jobId: job.id,
      eventId: job.data.eventId,
    });
  });
  worker.on('failed', (job, err) => {
    logger.error('Webhook background job attempt failed', {
      jobId: job?.id,
      eventId: job?.data.eventId,
      attemptsMade: job?.attemptsMade,
      maxAttempts: job?.opts.attempts,
      error: err.message,
    });
  });
  worker.on('error', (err) => logger.error('Webhook worker error', { error: err.message }));
  return worker;
}

async function closeWebhookQueue({ clear = false } = {}) {
  if (clear) await webhookQueue.obliterate({ force: true });
  await webhookQueue.close();
}

function queueJobIdForEvent(eventId) {
  return createHash('sha256').update(eventId).digest('hex');
}

module.exports = {
  createRedisConnection,
  createWebhookQueue,
  createWebhookWorker,
  enqueueWebhook,
  closeWebhookQueue,
  webhookJobOptions,
  queueJobIdForEvent,
};