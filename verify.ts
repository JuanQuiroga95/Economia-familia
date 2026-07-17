import { prisma } from './src/lib/prisma';

import { getDashboardStats } from './src/actions/dashboard';
import { getAccountId } from './src/lib/session';




async function main() {
  const account = await prisma.account.findFirst({
    include: { profiles: true, wallets: true, categories: true }
  });
  if (!account) return console.log('No account found');

  const profileA = account.profiles[0];
  const profileB = account.profiles[1];
  const wallet = account.wallets[0];
  const category = account.categories[0];

  console.log('Account:', account.label);
  
  // Set split mode to PORCENTAJE and enable showSplitBalance
  await prisma.account.update({
    where: { id: account.id },
    data: { splitMode: 'PORCENTAJE', splitPercentA: 60, splitPercentB: 40, showSplitBalance: true }
  });

  // delete all incomes/expenses for this test
  await prisma.income.deleteMany();
  await prisma.expense.deleteMany();

  // Create income 100k
  await prisma.income.create({
    data: { amount: 100000, date: new Date(), description: 'Test', profileId: profileA.id, walletId: wallet?.id }
  });

  // Create Propio expense for A (10k)
  await prisma.expense.create({
    data: { amount: 10000, date: new Date(), description: 'Propio A', type: 'PROPIO', categoryId: category.id, profileId: profileA.id, walletId: wallet?.id }
  });

  // Create Compartido expense paid by B (20k)
  await prisma.expense.create({
    data: { amount: 20000, date: new Date(), description: 'Compartido', type: 'COMPARTIDO', categoryId: category.id, profileId: profileB.id, walletId: wallet?.id, paidFromPersonalBudget: true }
  });

  // Now call dashboard stats
  // Wait, getDashboardStats depends on getAccountId. Let's just run the logic manually here to see what it does.
  
  const incomes = await prisma.income.aggregate({ _sum: { amount: true } });
  const totalIncome = incomes._sum.amount || 0;

  const allMonthExpenses = await prisma.expense.findMany();
  const totalShared = allMonthExpenses.filter(e => e.type === 'COMPARTIDO').reduce((sum, e) => sum + e.amount, 0);

  const ownExpensesA = allMonthExpenses.filter(e => e.type === 'PROPIO' && e.profileId === profileA.id).reduce((sum, e) => sum + e.amount, 0);
  const ownExpensesB = allMonthExpenses.filter(e => e.type === 'PROPIO' && e.profileId === profileB.id).reduce((sum, e) => sum + e.amount, 0);

  const assignedA = totalIncome * (60 / 100);
  const assignedB = totalIncome * (40 / 100);

  // LOGIC FROM dashboard.ts:
  // const usedA = ownExpensesA + totalShared * (account.splitPercentA / 100);
  // const usedB = ownExpensesB + totalShared * (account.splitPercentB / 100);
  const usedA = ownExpensesA + totalShared * (60 / 100);
  const usedB = ownExpensesB + totalShared * (40 / 100);

  console.log(`Income: ${totalIncome}`);
  console.log(`Assigned A (60%): ${assignedA}, Used A: ${usedA}, Available A: ${assignedA - usedA}`);
  console.log(`Assigned B (40%): ${assignedB}, Used B: ${usedB}, Available B: ${assignedB - usedB}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
