import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const account = await prisma.account.findFirst();
    if (!account) return NextResponse.json({ error: 'No account' });

    const txs = await prisma.savingsTransaction.findMany({
      where: { description: 'Distribución de sobrante del mes', profile: { accountId: account.id } },
      include: { savingsGoal: true }
    });

    const results = [];
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

      if (correspondingExpense && correspondingExpense.currency !== tx.savingsGoal.currency) {
        // Revert it
        await prisma.savingsGoal.update({
          where: { id: tx.savingsGoalId },
          data: { currentAmount: Math.max(0, tx.savingsGoal.currentAmount - tx.amount) }
        });
        await prisma.expense.delete({ where: { id: correspondingExpense.id } });
        await prisma.savingsTransaction.delete({ where: { id: tx.id } });
        results.push(`Reverted ${tx.amount} ${correspondingExpense.currency} mistakenly added to ${tx.savingsGoal.currency} goal.`);
      }
    }

    return NextResponse.json({ success: true, fixed: results });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
