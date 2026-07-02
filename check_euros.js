const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkEuros() {
  const account = await prisma.account.findFirst();
  if (!account) return console.log('No account');

  const savings = await prisma.savingsGoal.findMany({
    where: { accountId: account.id }
  });
  console.log('Savings Goals:');
  console.log(savings);

  const investments = await prisma.investment.findMany({
    where: { profile: { accountId: account.id } }
  });
  console.log('Investments:');
  console.log(investments);

  const incomes = await prisma.income.findMany({
    where: { currency: 'EUR' }
  });
  console.log('Incomes in EUR:');
  console.log(incomes);

  const expenses = await prisma.expense.findMany({
    where: { currency: 'EUR' }
  });
  console.log('Expenses in EUR:');
  console.log(expenses);
}

checkEuros()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
