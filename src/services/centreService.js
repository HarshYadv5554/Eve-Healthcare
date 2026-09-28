const prisma = require('../db/prisma');
const { AppError } = require('../utils/AppError');
const cache = require('../cache/redisCache');

async function listCentres({ page, limit }) {
  const cacheKey = `eve:centres:list:${page}:${limit}`;
  const cached = await cache.getJson(cacheKey);
  if (cached) return cached;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.diagnosticCentre.findMany({
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        tests: {
          select: { id: true, name: true, price: true },
        },
      },
    }),
    prisma.diagnosticCentre.count(),
  ]);

  const result = {
    items: items.map(formatCentre),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
  await cache.setJson(cacheKey, result);
  return result;
}

async function getCentre(id) {
  const cacheKey = `eve:centres:detail:${id}`;
  const cached = await cache.getJson(cacheKey);
  if (cached) return cached;

  const centre = await prisma.diagnosticCentre.findUnique({
    where: { id },
    include: {
      tests: { select: { id: true, name: true, price: true } },
    },
  });

  if (!centre) {
    throw new AppError('Diagnostic centre not found', 404, 'NOT_FOUND');
  }

  const result = formatCentre(centre);
  await cache.setJson(cacheKey, result);
  return result;
}

async function createCentre(data) {
  const centre = await prisma.diagnosticCentre.create({
    data,
    include: { tests: true },
  });
  await cache.deletePattern('eve:centres:*');
  return formatCentre(centre);
}

async function addTest(centreId, { name, price }) {
  const centre = await prisma.diagnosticCentre.findUnique({ where: { id: centreId } });
  if (!centre) {
    throw new AppError('Diagnostic centre not found', 404, 'NOT_FOUND');
  }

  const test = await prisma.diagnosticTest.create({
    data: {
      centreId,
      name,
      price,
    },
  });
  await cache.deletePattern('eve:centres:*');

  return {
    id: test.id,
    name: test.name,
    price: Number(test.price),
    centreId: test.centreId,
  };
}

function formatCentre(centre) {
  return {
    id: centre.id,
    name: centre.name,
    location: centre.location,
    tests: (centre.tests || []).map((t) => ({
      id: t.id,
      name: t.name,
      price: Number(t.price),
    })),
  };
}

module.exports = { listCentres, getCentre, createCentre, addTest };
