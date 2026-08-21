export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import { parseMonthYear } from '@/lib/monthParams';
import IngresosClient from './IngresosClient';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
import { getIncomes } from '@/actions/income';
import { getWallets } from '@/actions/wallets';

export default async function IngresosPage(props: { searchParams: Promise<{ month?: string; year?: string }> }) {
  const searchParams = await props.searchParams;
  const { month, year } = parseMonthYear(searchParams);

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
