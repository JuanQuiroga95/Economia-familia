import { prisma } from './src/lib/prisma';

async function checkData() {
  const investments = await prisma.investment.findMany();
  console.log('Investments:');
  console.dir(investments, { depth: null });

  const savings = await prisma.savingsGoal.findMany();
  console.log('Savings:');
  console.dir(savings, { depth: null });
}

checkData().then(() => process.exit(0));
