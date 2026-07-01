export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import IngresosClient from './IngresosClient';
import { getIncomes } from '@/actions/income';
import { getCurrentFinancialMonth, getArgDate } from '@/lib/dateUtils';

export default async function IngresosPage() {
  const now = getArgDate();
  const { month, year } = getCurrentFinancialMonth(now);
  
  const incomes = await getIncomes({ month, year });

  return (
    <AppLayout>
      <IngresosClient
        initialIncomes={JSON.parse(JSON.stringify(incomes))}
        currentMonth={month}
        currentYear={year}
      />
    </AppLayout>
  );
}
