import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });

import { prisma } from './src/lib/prisma';

async function fix() {
  const account = await prisma.account.findFirst();
  if (!account) return;

  const txs = await prisma.savingsTransaction.findMany({
    where: { description: 'Distribución de sobrante del mes', profile: { accountId: account.id } },
    include: { savingsGoal: true }
  });

  console.log('Surplus txs:', txs.length);
  for (const tx of txs) {
    // Find the corresponding expense
    const expenses = await prisma.expense.findMany({
      where: {
        amount: tx.amount,
        description: 'Distribución de sobrante',
        profileId: tx.profileId,
      }
    });

    let correspondingExpense = null;
    for (const exp of expenses) {
      if (Math.abs(exp.createdAt.getTime() - tx.createdAt.getTime()) < 10000) {
        correspondingExpense = exp;
        break;
      }
    }

    if (correspondingExpense) {
      if (correspondingExpense.currency !== tx.savingsGoal.currency) {
        console.log(`FOUND MISMATCH! TX ID: ${tx.id}, Amount: ${tx.amount}. Goal Currency: ${tx.savingsGoal.currency}, Expense Currency: ${correspondingExpense.currency}`);
        
        // Revert it
        await prisma.savingsGoal.update({
          where: { id: tx.savingsGoalId },
          data: { currentAmount: Math.max(0, tx.savingsGoal.currentAmount - tx.amount) }
        });
        await prisma.expense.delete({ where: { id: correspondingExpense.id } });
        await prisma.savingsTransaction.delete({ where: { id: tx.id } });
        console.log(`Reverted transaction ${tx.id}`);
      }
    }
  }
}

fix().catch(console.error).finally(() => prisma.$disconnect());
