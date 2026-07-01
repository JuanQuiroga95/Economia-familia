import { prisma } from './src/lib/prisma';

async function seedSavings() {
  const account = await prisma.account.findFirst();
  const tania = await prisma.profile.findFirst({ where: { accountId: account.id, name: 'Tania' } });

  // Ualá USD
  const goalUSD = await prisma.savingsGoal.create({
    data: {
      name: "Ahorro Ualá",
      targetAmount: 0,
      currentAmount: 60,
      currency: "USD",
      profileId: tania.id,
    }
  });
  await prisma.savingsTransaction.create({
    data: {
      amount: 60,
      type: "DEPOSITO",
      description: "Saldo inicial",
      savingsGoalId: goalUSD.id,
      profileId: tania.id,
    }
  });

  // AstroPay EUR
  const goalEUR = await prisma.savingsGoal.create({
    data: {
      name: "Ahorro AstroPay",
      targetAmount: 0,
      currentAmount: 18.36,
      currency: "EUR",
      profileId: tania.id,
    }
  });
  await prisma.savingsTransaction.create({
    data: {
      amount: 18.36,
      type: "DEPOSITO",
      description: "Saldo inicial",
      savingsGoalId: goalEUR.id,
      profileId: tania.id,
    }
  });

  console.log("Savings seeded");
}

seedSavings().then(() => process.exit(0));
