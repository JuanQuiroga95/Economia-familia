import { prisma } from './src/lib/prisma';

async function testQuery() {
  const accountId = 'cmr1mfunb00004uj152hwz69w'; // Juan & Tania account
  
  console.log("Investments:");
  const investments = await prisma.investment.findMany({
    where: { profile: { accountId } },
    include: { profile: true },
    orderBy: { startDate: 'desc' },
  });
  console.dir(investments, { depth: null });
}

testQuery().then(() => process.exit(0));
