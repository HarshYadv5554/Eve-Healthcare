const {
  createWebhookQueue,
  createWebhookWorker,
} = require('../src/queues/webhookQueue');

describe('Webhook queue retries', () => {
  it('retries transient job failures and completes the job', async () => {
    const queueName = `webhook-retry-test-${process.pid}-${Date.now()}`;
    const queue = createWebhookQueue(queueName, {
      attempts: 3,
      backoff: { type: 'fixed', delay: 20 },
      removeOnComplete: false,
    });
    let attempts = 0;
    const worker = createWebhookWorker({
      name: queueName,
      processor: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('temporary test failure');
        return { processed: true };
      },
      concurrency: 1,
    });

    try {
      const job = await queue.add('retry-test', { eventId: 'retry-test-event' });
      const deadline = Date.now() + 10000;
      let state;
      while (Date.now() < deadline) {
        state = await job.getState();
        if (state === 'completed' || state === 'failed') break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      expect(state).toBe('completed');
      expect(attempts).toBe(3);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }, 15000);
});