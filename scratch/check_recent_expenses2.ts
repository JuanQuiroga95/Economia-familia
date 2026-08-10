import { prisma } from './src/lib/prisma';

async function main() {
  const expenses = await prisma.expense.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: { profile: true }
  });
  console.log("Recent expenses:");
  expenses.forEach(e => {
    console.log(`- [${e.id}] ${e.description} | Date: ${e.date.toISOString()} | Profile: ${e.profile.name}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
