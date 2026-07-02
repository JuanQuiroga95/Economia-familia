export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import IngresosClient from './IngresosClient';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
import { getIncomes } from '@/actions/income';
import { getCurrentFinancialMonth, getArgDate } from '@/lib/dateUtils';
import { getWallets } from '@/actions/wallets';

export default async function IngresosPage(props: { searchParams: Promise<{ month?: string; year?: string }> }) {
  const searchParams = await props.searchParams;
  const now = getArgDate();
  const current = getCurrentFinancialMonth(now);
  
  const month = searchParams.month ? parseInt(searchParams.month) : current.month;
  const year = searchParams.year ? parseInt(searchParams.year) : current.year;
  
  const [incomes, wallets] = await Promise.all([
    getIncomes({ month, year }),
    getWallets(),
  ]);

  return (
    <AppLayout>
      <MonthYearPicker month={month} year={year} />
      <IngresosClient
        initialIncomes={JSON.parse(JSON.stringify(incomes))}
        currentMonth={month}
        currentYear={year}
        wallets={JSON.parse(JSON.stringify(wallets))}
      />
    </AppLayout>
  );
}
