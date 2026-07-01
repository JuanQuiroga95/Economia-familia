export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import ConfigClient from './ConfigClient';
import { getExchangeRates } from '@/actions/config';
import { prisma } from '@/lib/prisma';
import { getAccountId } from '@/lib/session';

export default async function ConfiguracionPage() {
  const accountId = await getAccountId();

  if (!accountId) {
    return <div>No autenticado</div>;
  }

  const [exchangeRates, categories, budgetConfigs, account, profiles] = await Promise.all([
    getExchangeRates(),
    prisma.category.findMany({
      where: { accountId },
      orderBy: { name: 'asc' },
    }),
    prisma.budgetConfig.findMany({
      where: { profile: { accountId } },
      include: { profile: true },
    }),
    prisma.account.findUnique({ where: { id: accountId } }),
    prisma.profile.findMany({
      where: { accountId },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <AppLayout>
      <ConfigClient
        exchangeRates={JSON.parse(JSON.stringify(exchangeRates))}
        categories={JSON.parse(JSON.stringify(categories))}
        budgetConfigs={JSON.parse(JSON.stringify(budgetConfigs))}
        profiles={JSON.parse(JSON.stringify(profiles))}
        splitMode={account?.splitMode || 'FONDO_COMUN'}
        splitPercentA={account?.splitPercentA || 50}
        splitPercentB={account?.splitPercentB || 50}
      />
    </AppLayout>
  );
}
