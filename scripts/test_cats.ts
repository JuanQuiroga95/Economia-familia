import { prisma } from '../src/lib/prisma';

async function main() {
  const accountId = 'cmr1mfus100014uj1lr9jmc1e';
  console.log('Account ID:', accountId);
  const cats = await prisma.category.findMany({ where: { accountId } });
  console.log('Categories for account:', cats.length);
  const globalCats = await prisma.category.findMany({ where: { accountId: null } });
  console.log('Global Categories:', globalCats.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
