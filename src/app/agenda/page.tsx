export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
import AgendaClient from './AgendaClient';
import { getAgenda } from '@/actions/agenda';
import { getCategories } from '@/actions/expenses';
import { getWallets } from '@/actions/wallets';
import { getCurrentFinancialMonth, getArgDate } from '@/lib/dateUtils';
import { getAccountId } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export default async function AgendaPage(props: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const searchParams = await props.searchParams;
  const today = getArgDate();
  const current = getCurrentFinancialMonth(today);

  const month = searchParams.month ? parseInt(searchParams.month) : current.month;
  const year = searchParams.year ? parseInt(searchParams.year) : current.year;

  const accountId = await getAccountId();
  const account = accountId
    ? await prisma.account.findUnique({
        where: { id: accountId },
        include: { profiles: { orderBy: { name: 'asc' } } },
      })
    : null;

  const [items, categories, wallets] = await Promise.all([
    getAgenda(month, year),
    getCategories(),
    getWallets(),
  ]);

  return (
    <AppLayout>
      <MonthYearPicker month={month} year={year} />
      <AgendaClient
        items={JSON.parse(JSON.stringify(items))}
        categories={JSON.parse(JSON.stringify(categories))}
        wallets={JSON.parse(JSON.stringify(wallets))}
        profiles={JSON.parse(JSON.stringify(account?.profiles || []))}
        accountInfo={JSON.parse(JSON.stringify(account))}
        month={month}
        year={year}
        today={month === current.month && year === current.year ? today.getDate() : null}
      />
    </AppLayout>
  );
}
