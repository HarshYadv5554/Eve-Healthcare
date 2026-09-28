const express = require('express');
const centreService = require('../services/centreService');
const { authenticate } = require('../middleware/authenticate');
const {
  validateBody,
  validateQuery,
  validateParams,
  centreSchema,
  testSchema,
  paginationSchema,
  idParamSchema,
} = require('../middleware/validate');

const router = express.Router();

router.get('/', validateQuery(paginationSchema), async (req, res, next) => {
  try {
    const result = await centreService.listCentres(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', validateParams(idParamSchema), async (req, res, next) => {
  try {
    const centre = await centreService.getCentre(req.params.id);
    res.json(centre);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, validateBody(centreSchema), async (req, res, next) => {
  try {
    const centre = await centreService.createCentre(req.body);
    res.status(201).json(centre);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/tests',
  authenticate,
  validateParams(idParamSchema),
  validateBody(testSchema),
  async (req, res, next) => {
    try {
      const test = await centreService.addTest(req.params.id, req.body);
      res.status(201).json(test);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
