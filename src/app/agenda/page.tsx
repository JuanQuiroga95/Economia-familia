export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import { parseMonthYear } from '@/lib/monthParams';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
import AgendaClient from './AgendaClient';
import { getAgenda } from '@/actions/agenda';
import { getCategories } from '@/actions/expenses';
import { getWallets } from '@/actions/wallets';
import { getArgDate } from '@/lib/dateUtils';
import { getAccountId } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export default async function AgendaPage(props: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { month, year, esMesActual } = parseMonthYear(searchParams);

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
        today={esMesActual ? getArgDate().getDate() : null}
      />
    </AppLayout>
  );
}
