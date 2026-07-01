import { prisma } from './src/lib/prisma';

async function check() {
  const accounts = await prisma.account.findMany({ include: { profiles: true } });
  console.log("Accounts:");
  accounts.forEach(a => {
    console.log(`Account ${a.id} (${a.label}): profiles = ${a.profiles.map(p => p.name).join(', ')}`);
  });

  const invs = await prisma.investment.findMany({ include: { profile: true } });
  console.log("Investments:");
  invs.forEach(i => console.log(`${i.id} - ${i.name} - Profile: ${i.profile.name} (${i.profile.accountId})`));
}
check().then(() => process.exit(0));
