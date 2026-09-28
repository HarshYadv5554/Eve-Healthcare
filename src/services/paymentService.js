const prisma = require('../db/prisma');
const config = require('../config');
const { AppError } = require('../utils/AppError');
const logger = require('../utils/logger');

function resolveOutcome(forceOutcome) {
  if (forceOutcome) {
    return forceOutcome;
  }
  return Math.random() < config.payment.successRate ? 'SUCCESS' : 'FAILED';
}

function verifyWebhookSecret(webhookSecretHeader) {
  if (webhookSecretHeader !== config.payment.webhookSecret) {
    throw new AppError('Invalid webhook secret', 401, 'UNAUTHORIZED');
  }
}

async function isWebhookProcessed(eventId) {
  return Boolean(await prisma.webhookEvent.findUnique({ where: { eventId } }));
}

async function assertWebhookPaymentExists(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true },
  });
  if (!payment) {
    throw new AppError('Payment not found', 404, 'NOT_FOUND');
  }
}

async function processMockPayment(userId, { bookingId, forceOutcome, deferConfirmation }) {
  const { getBookingForPayment } = require('./bookingService');
  const booking = await getBookingForPayment(bookingId, userId);

  if (deferConfirmation) {
    const pending = await prisma.payment.findFirst({
      where: { bookingId: booking.id, status: 'PENDING' },
    });
    if (pending) {
      throw new AppError('A pending payment already exists for this booking', 409, 'PENDING_PAYMENT');
    }

    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        amount: booking.amount,
        status: 'PENDING',
      },
    });

    return {
      payment: {
        id: payment.id,
        bookingId: payment.bookingId,
        amount: Number(payment.amount),
        status: payment.status,
      },
      booking: { id: booking.id, status: booking.status },
    };
  }

  const outcome = resolveOutcome(forceOutcome);
  const paymentStatus = outcome === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
  const bookingStatus = outcome === 'SUCCESS' ? 'CONFIRMED' : 'FAILED';

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        bookingId: booking.id,
        amount: booking.amount,
        status: paymentStatus,
      },
    });

    const updatedBooking = await tx.booking.update({
      where: { id: booking.id },
      data: { status: bookingStatus },
    });

    return { payment, booking: updatedBooking };
  });

  logger.info('Mock payment processed', {
    paymentId: result.payment.id,
    bookingId,
    status: paymentStatus,
  });

  return {
    payment: {
      id: result.payment.id,
      bookingId: result.payment.bookingId,
      amount: Number(result.payment.amount),
      status: result.payment.status,
    },
    booking: {
      id: result.booking.id,
      status: result.booking.status,
    },
  };
}

async function processWebhook({ eventId, paymentId, status }, webhookSecretHeader) {
  verifyWebhookSecret(webhookSecretHeader);

  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { eventId },
  });

  if (existingEvent) {
    logger.info('Duplicate webhook event ignored', { eventId });
    const payment = await prisma.payment.findUnique({
      where: { id: existingEvent.paymentId || paymentId },
    });
    const booking = payment
      ? await prisma.booking.findUnique({ where: { id: payment.bookingId } })
      : null;

    return {
      duplicate: true,
      payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            bookingId: payment.bookingId,
          }
        : null,
      booking: booking ? { id: booking.id, status: booking.status } : null,
    };
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    throw new AppError('Payment not found', 404, 'NOT_FOUND');
  }

  const bookingStatus = status === 'SUCCESS' ? 'CONFIRMED' : 'FAILED';

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.create({
        data: {
          eventId,
          paymentId: payment.id,
        },
      });

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: { status, providerEventId: eventId },
      });

      const updatedBooking = await tx.booking.update({
        where: { id: payment.bookingId },
        data: { status: bookingStatus },
      });

      return { payment: updatedPayment, booking: updatedBooking };
    });

    logger.info('Webhook processed', { eventId, paymentId, status });

    return {
      duplicate: false,
      payment: {
        id: result.payment.id,
        status: result.payment.status,
        bookingId: result.payment.bookingId,
      },
      booking: {
        id: result.booking.id,
        status: result.booking.status,
      },
    };
  } catch (err) {
    if (err.code === 'P2002') {
      logger.info('Concurrent duplicate webhook', { eventId });
      const dup = await prisma.webhookEvent.findUnique({ where: { eventId } });
      const p = dup?.paymentId
        ? await prisma.payment.findUnique({ where: { id: dup.paymentId } })
        : await prisma.payment.findUnique({ where: { id: paymentId } });
      const b = p ? await prisma.booking.findUnique({ where: { id: p.bookingId } }) : null;
      return {
        duplicate: true,
        payment: p ? { id: p.id, status: p.status, bookingId: p.bookingId } : null,
        booking: b ? { id: b.id, status: b.status } : null,
      };
    }
    throw err;
  }
}

module.exports = {
  processMockPayment,
  processWebhook,
  verifyWebhookSecret,
  isWebhookProcessed,
  assertWebhookPaymentExists,
};
