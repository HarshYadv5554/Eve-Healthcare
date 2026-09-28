const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db/prisma');
const config = require('../config');
const { AppError } = require('../utils/AppError');

async function signup({ email, password, name }) {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name,
    },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  const token = signToken(user.id);
  return { user, token };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const token = signToken(user.id);
  return {
    user: { id: user.id, email: user.email, name: user.name },
    token,
  };
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

module.exports = { signup, login, signToken };
