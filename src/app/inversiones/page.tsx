export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import InversionesClient from './InversionesClient';
import { getInvestments } from '@/actions/investments';
import { getCurrentExchangeRate } from '@/actions/config';
import { getCurrentFinancialMonth, getArgDate } from '@/lib/dateUtils';

export default async function InversionesPage() {
  const now = getArgDate();
  const current = getCurrentFinancialMonth(now);
  
  const [investments, rates] = await Promise.all([
    getInvestments(),
    getCurrentExchangeRate(current.month, current.year),
  ]);

  return (
    <AppLayout>
      <InversionesClient 
        initialInvestments={JSON.parse(JSON.stringify(investments))} 
        rates={rates}
      />
    </AppLayout>
  );
}
