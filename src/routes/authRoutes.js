const express = require('express');
const authService = require('../services/authService');
const { validateBody, signupSchema, loginSchema } = require('../middleware/validate');

const router = express.Router();

router.post('/signup', validateBody(signupSchema), async (req, res, next) => {
  try {
    const result = await authService.signup(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
