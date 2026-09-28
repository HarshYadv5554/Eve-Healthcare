const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.diagnosticCentre.count();
  if (count > 0) {
    console.log('Seed skipped — centres already exist');
    return;
  }

  const centre1 = await prisma.diagnosticCentre.create({
    data: {
      name: 'EVE Diagnostics — Koramangala',
      location: 'Bangalore, Karnataka',
      tests: {
        create: [
          { name: 'Complete Blood Count (CBC)', price: 499 },
          { name: 'Lipid Profile', price: 899 },
          { name: 'HbA1c', price: 649 },
        ],
      },
    },
  });

  await prisma.diagnosticCentre.create({
    data: {
      name: 'EVE Diagnostics — Andheri',
      location: 'Mumbai, Maharashtra',
      tests: {
        create: [
          { name: 'Thyroid Profile (T3/T4/TSH)', price: 799 },
          { name: 'Vitamin D', price: 1199 },
        ],
      },
    },
  });

  console.log('Seeded diagnostic centres', { sampleCentreId: centre1.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
