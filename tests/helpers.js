const request = require('supertest');
const { createApp } = require('../src/app');
const prisma = require('../src/db/prisma');
const cache = require('../src/cache/redisCache');

const app = createApp();

async function resetDb() {
  await prisma.webhookEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.diagnosticTest.deleteMany();
  await prisma.diagnosticCentre.deleteMany();
  await prisma.user.deleteMany();
  await cache.deletePattern('eve:centres:*');
}

async function seedCentreWithTest() {
  const centre = await prisma.diagnosticCentre.create({
    data: {
      name: 'Test Centre',
      location: 'Test City',
      tests: {
        create: { name: 'Test Panel', price: 500 },
      },
    },
    include: { tests: true },
  });
  return { centre, test: centre.tests[0] };
}

async function signupUser(email = `user-${Date.now()}@test.com`) {
  const res = await request(app)
    .post('/auth/signup')
    .send({
      email,
      password: 'password123',
      name: 'Test User',
    });
  return { ...res.body, status: res.status };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { app, request, resetDb, seedCentreWithTest, signupUser, authHeader, prisma };
