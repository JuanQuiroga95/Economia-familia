export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import AhorrosClient from './AhorrosClient';
import { getSavingsGoals, getPatrimonioStats } from '@/actions/savings';
import { getCurrentExchangeRate } from '@/actions/config';
import { getCurrentFinancialMonth, getArgDate } from '@/lib/dateUtils';

export default async function AhorrosPage() {
  const now = getArgDate();
  const current = getCurrentFinancialMonth(now);
  
  const [goals, patrimonio, rates] = await Promise.all([
    getSavingsGoals(),
    getPatrimonioStats(),
    getCurrentExchangeRate(current.month, current.year),
  ]);

  return (
    <AppLayout>
      <AhorrosClient
        initialGoals={JSON.parse(JSON.stringify(goals))}
        patrimonio={patrimonio}
        rates={rates}
      />
    </AppLayout>
  );
}
