import { prisma } from './src/lib/prisma';

async function fixSavings() {
  const incomes = await prisma.income.findMany({
    where: {
      description: {
        in: ['Ahorro Ualá', 'Ahorro AstroPay']
      }
    },
    include: { profile: true }
  });

  for (const inc of incomes) {
    console.log(`Moving ${inc.description} (${inc.amount} ${inc.currency}) to Savings`);
    
    // Create Savings Goal
    const goal = await prisma.savingsGoal.create({
      data: {
        name: inc.description,
        targetAmount: 0,
        currentAmount: inc.amount,
        currency: inc.currency,
        profileId: inc.profileId,
      }
    });

    // Create Initial Transaction
    await prisma.savingsTransaction.create({
      data: {
        amount: inc.amount,
        type: 'DEPOSITO',
        description: 'Saldo inicial',
        savingsGoalId: goal.id,
        profileId: inc.profileId,
      }
    });

    // Delete Income
    await prisma.income.delete({
      where: { id: inc.id }
    });

    console.log(`Successfully moved ${inc.description}`);
  }
}

fixSavings().then(() => process.exit(0));
