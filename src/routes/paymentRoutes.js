const express = require('express');
const paymentService = require('../services/paymentService');
const { authenticate } = require('../middleware/authenticate');
const { validateBody, paymentSchema, webhookSchema } = require('../middleware/validate');
const webhookQueue = require('../queues/webhookQueue');

const router = express.Router();

router.post('/', authenticate, validateBody(paymentSchema), async (req, res, next) => {
  try {
    const result = await paymentService.processMockPayment(req.user.id, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/webhook/', validateBody(webhookSchema), async (req, res, next) => {
  try {
    const secret = req.headers['x-webhook-secret'];
    paymentService.verifyWebhookSecret(secret);

    if (await paymentService.isWebhookProcessed(req.body.eventId)) {
      const result = await paymentService.processWebhook(req.body, secret);
      return res.json(result);
    }

    await paymentService.assertWebhookPaymentExists(req.body.paymentId);
    const job = await webhookQueue.enqueueWebhook(req.body);
    return res.status(202).json({
      eventId: req.body.eventId,
      jobId: job.jobId,
      status: 'QUEUED',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
