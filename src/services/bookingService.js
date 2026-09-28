const prisma = require('../db/prisma');
const { AppError } = require('../utils/AppError');

async function createBooking(userId, { testId, centreId, appointmentAt }) {
  const appointment = new Date(appointmentAt);
  if (Number.isNaN(appointment.getTime())) {
    throw new AppError('Invalid appointment date', 400, 'INVALID_DATE');
  }
  if (appointment <= new Date()) {
    throw new AppError('Appointment must be in the future', 400, 'INVALID_DATE');
  }

  const test = await prisma.diagnosticTest.findFirst({
    where: { id: testId, centreId },
  });

  if (!test) {
    throw new AppError(
      'Test not found at the specified diagnostic centre',
      404,
      'NOT_FOUND'
    );
  }

  const booking = await prisma.booking.create({
    data: {
      userId,
      testId,
      centreId,
      appointmentAt: appointment,
      amount: test.price,
      status: 'PENDING',
    },
    include: bookingInclude,
  });

  return formatBooking(booking);
}

async function listBookings(userId, { page, limit }) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where: { userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: bookingInclude,
    }),
    prisma.booking.count({ where: { userId } }),
  ]);

  return {
    items: items.map(formatBooking),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

async function getBooking(userId, bookingId) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude,
  });

  if (!booking) {
    throw new AppError('Booking not found', 404, 'NOT_FOUND');
  }

  if (booking.userId !== userId) {
    throw new AppError('Not authorized to access this booking', 403, 'FORBIDDEN');
  }

  return formatBooking(booking);
}

async function cancelBooking(userId, bookingId) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

  if (!booking) {
    throw new AppError('Booking not found', 404, 'NOT_FOUND');
  }

  if (booking.userId !== userId) {
    throw new AppError('Not authorized to modify this booking', 403, 'FORBIDDEN');
  }

  if (booking.status === 'CANCELLED') {
    return getBooking(userId, bookingId);
  }

  if (booking.status === 'CONFIRMED') {
    throw new AppError(
      'Cannot cancel a confirmed booking via this endpoint',
      400,
      'INVALID_STATE'
    );
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'CANCELLED' },
    include: bookingInclude,
  });

  return formatBooking(updated);
}

async function getBookingForPayment(bookingId, userId) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  if (!booking) {
    throw new AppError('Booking not found', 404, 'NOT_FOUND');
  }

  if (booking.userId !== userId) {
    throw new AppError('Not authorized to pay for this booking', 403, 'FORBIDDEN');
  }

  if (booking.status === 'CANCELLED') {
    throw new AppError('Cannot pay for a cancelled booking', 400, 'INVALID_STATE');
  }

  if (booking.status === 'CONFIRMED') {
    throw new AppError('Booking is already confirmed', 400, 'ALREADY_PAID');
  }

  return booking;
}

const bookingInclude = {
  test: { select: { id: true, name: true, price: true } },
  centre: { select: { id: true, name: true, location: true } },
  payments: {
    select: { id: true, status: true, amount: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  },
};

function formatBooking(booking) {
  return {
    id: booking.id,
    status: booking.status,
    appointmentAt: booking.appointmentAt.toISOString(),
    amount: Number(booking.amount),
    createdAt: booking.createdAt.toISOString(),
    test: booking.test
      ? {
          id: booking.test.id,
          name: booking.test.name,
          price: Number(booking.test.price),
        }
      : undefined,
    centre: booking.centre
      ? {
          id: booking.centre.id,
          name: booking.centre.name,
          location: booking.centre.location,
        }
      : undefined,
    payments: (booking.payments || []).map((p) => ({
      id: p.id,
      status: p.status,
      amount: Number(p.amount),
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

module.exports = {
  createBooking,
  listBookings,
  getBooking,
  cancelBooking,
  getBookingForPayment,
  formatBooking,
};
