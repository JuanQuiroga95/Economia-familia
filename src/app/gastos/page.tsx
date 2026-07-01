export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import GastosClient from './GastosClient';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
import { getExpenses, getCategories } from '@/actions/expenses';
import { getCurrentFinancialMonth, getArgDate } from '@/lib/dateUtils';

export default async function GastosPage({ searchParams }: { searchParams: { month?: string; year?: string } }) {
  const now = getArgDate();
  const current = getCurrentFinancialMonth(now);
  
  const month = searchParams.month ? parseInt(searchParams.month) : current.month;
  const year = searchParams.year ? parseInt(searchParams.year) : current.year;

  const [expenses, categories] = await Promise.all([
    getExpenses({ month, year }),
    getCategories(),
  ]);

  return (
    <AppLayout>
      <MonthYearPicker month={month} year={year} />
      <GastosClient
        initialExpenses={JSON.parse(JSON.stringify(expenses))}
        categories={JSON.parse(JSON.stringify(categories))}
      />
    </AppLayout>
  );
}
