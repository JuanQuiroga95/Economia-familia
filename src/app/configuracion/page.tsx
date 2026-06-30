export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import ConfigClient from './ConfigClient';
import { getExchangeRates } from '@/actions/config';
import { getCategories } from '@/actions/expenses';
import { prisma } from '@/lib/prisma';

export default async function ConfiguracionPage() {
  const [exchangeRates, categories, budgetConfigs] = await Promise.all([
    getExchangeRates(),
    getCategories(),
    prisma.budgetConfig.findMany({ include: { profile: true } }),
  ]);

  return (
    <AppLayout>
      <ConfigClient
        exchangeRates={JSON.parse(JSON.stringify(exchangeRates))}
        categories={JSON.parse(JSON.stringify(categories))}
        budgetConfigs={JSON.parse(JSON.stringify(budgetConfigs))}
      />
    </AppLayout>
  );
}
