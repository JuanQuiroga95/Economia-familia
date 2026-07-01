import { prisma } from './src/lib/prisma';

async function checkIncomes() {
  const incomes = await prisma.income.findMany();
  incomes.forEach(inc => console.log(`${inc.description} - ${inc.amount} ${inc.currency}`));
}

checkIncomes().then(() => process.exit(0));
