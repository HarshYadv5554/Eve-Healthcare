const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../db/prisma');
const { AppError } = require('../utils/AppError');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwt.secret);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      throw new AppError('User not found', 401, 'UNAUTHORIZED');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };
