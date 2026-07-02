export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import AhorrosClient from './AhorrosClient';
import { getSavingsGoals, getPatrimonioStats } from '@/actions/savings';
import { getCurrentExchangeRate } from '@/actions/config';
import { getCurrentFinancialMonth, getArgDate } from '@/lib/dateUtils';
import { prisma } from '@/lib/prisma';

export default async function AhorrosPage() {
  const now = getArgDate();
  const current = getCurrentFinancialMonth(now);
  
  const accountId = await (await import('@/lib/session')).getAccountId();
  const [goals, patrimonio, rates, profiles] = await Promise.all([
    getSavingsGoals(),
    getPatrimonioStats(),
    getCurrentExchangeRate(),
    accountId ? prisma.profile.findMany({ where: { accountId } }) : Promise.resolve([]),
  ]);

  return (
    <AppLayout>
      <AhorrosClient
        initialGoals={JSON.parse(JSON.stringify(goals))}
        patrimonio={patrimonio}
        rates={rates}
        profiles={profiles}
      />
    </AppLayout>
  );
}
