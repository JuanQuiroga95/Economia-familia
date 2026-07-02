import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const account = await prisma.account.findFirst();
  if (!account) return console.log('No account');

  const savings = await prisma.savingsGoal.findMany({
    where: { accountId: account.id }
  });
  console.log('--- Savings Goals ---');
  console.log(savings);

  const txs = await prisma.savingsTransaction.findMany();
  console.log('--- Savings Transactions ---');
  console.log(txs);

  const expenses = await prisma.expense.findMany({
    where: { currency: 'EUR' }
  });
  console.log('--- Expenses in EUR ---');
  console.log(expenses);
}

main().catch(console.error).finally(() => prisma.$disconnect());
