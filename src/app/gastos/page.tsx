export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import GastosClient from './GastosClient';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
import { getExpenses, getCategories } from '@/actions/expenses';
import { getCurrentFinancialMonth, getArgDate } from '@/lib/dateUtils';
import { getAccountId } from '@/lib/session';
import { prisma } from '@/lib/prisma';

import { getSavingsGoals } from '@/actions/savings';
import { getInvestments } from '@/actions/investments';

export default async function GastosPage(props: { searchParams: Promise<{ month?: string; year?: string }> }) {
  const searchParams = await props.searchParams;
  const now = getArgDate();
  const current = getCurrentFinancialMonth(now);
  
  const month = searchParams.month ? parseInt(searchParams.month) : current.month;
  const year = searchParams.year ? parseInt(searchParams.year) : current.year;

  const accountId = await getAccountId();
  const account = accountId ? await prisma.account.findUnique({
    where: { id: accountId },
    include: { profiles: { orderBy: { name: 'asc' } } }
  }) : null;

  const [expenses, categories, savings, investments] = await Promise.all([
    getExpenses({ month, year }),
    getCategories(),
    getSavingsGoals(),
    getInvestments(),
  ]);

  return (
    <AppLayout>
      <MonthYearPicker month={month} year={year} />
      <GastosClient
        initialExpenses={JSON.parse(JSON.stringify(expenses))}
        categories={JSON.parse(JSON.stringify(categories))}
        savings={JSON.parse(JSON.stringify(savings))}
        investments={JSON.parse(JSON.stringify(investments))}
        accountInfo={JSON.parse(JSON.stringify(account))}
      />
    </AppLayout>
  );
}
