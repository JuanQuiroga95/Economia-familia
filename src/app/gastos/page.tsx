export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import GastosClient from './GastosClient';
import { getExpenses, getCategories } from '@/actions/expenses';
import { getCurrentFinancialMonth, getArgDate } from '@/lib/dateUtils';

export default async function GastosPage() {
  const now = getArgDate();
  const { month, year } = getCurrentFinancialMonth(now);

  const [expenses, categories] = await Promise.all([
    getExpenses({ month, year }),
    getCategories(),
  ]);

  return (
    <AppLayout>
      <GastosClient
        initialExpenses={JSON.parse(JSON.stringify(expenses))}
        categories={JSON.parse(JSON.stringify(categories))}
      />
    </AppLayout>
  );
}
