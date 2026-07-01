import { prisma } from './src/lib/prisma';

async function checkAccounts() {
  const accounts = await prisma.account.findMany({
    include: { profiles: true }
  });
  console.dir(accounts, { depth: null });
}

checkAccounts().then(() => process.exit(0));
