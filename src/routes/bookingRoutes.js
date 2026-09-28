const express = require('express');
const bookingService = require('../services/bookingService');
const { authenticate } = require('../middleware/authenticate');
const {
  validateBody,
  validateQuery,
  validateParams,
  bookingSchema,
  paginationSchema,
  idParamSchema,
} = require('../middleware/validate');

const router = express.Router();

router.use(authenticate);

router.post('/', validateBody(bookingSchema), async (req, res, next) => {
  try {
    const booking = await bookingService.createBooking(req.user.id, req.body);
    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
});

router.get('/', validateQuery(paginationSchema), async (req, res, next) => {
  try {
    const result = await bookingService.listBookings(req.user.id, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', validateParams(idParamSchema), async (req, res, next) => {
  try {
    const booking = await bookingService.getBooking(req.user.id, req.params.id);
    res.json(booking);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', validateParams(idParamSchema), async (req, res, next) => {
  try {
    const booking = await bookingService.cancelBooking(req.user.id, req.params.id);
    res.json(booking);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
