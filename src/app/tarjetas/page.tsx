export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import { parseMonthYear } from '@/lib/monthParams';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
import TarjetasClient from './TarjetasClient';
import { getCardsOverview } from '@/actions/cards';
import { getCategories } from '@/actions/expenses';
import { getWallets } from '@/actions/wallets';
import { getAccountId } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export default async function TarjetasPage(props: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { month, year } = parseMonthYear(searchParams);

  const accountId = await getAccountId();
  const account = accountId
    ? await prisma.account.findUnique({
        where: { id: accountId },
        include: { profiles: { orderBy: { name: 'asc' } } },
      })
    : null;

  const [cards, categories, wallets] = await Promise.all([
    getCardsOverview(month, year),
    getCategories(),
    getWallets(),
  ]);

  return (
    <AppLayout>
      <MonthYearPicker month={month} year={year} />
      <TarjetasClient
        cards={JSON.parse(JSON.stringify(cards))}
        categories={JSON.parse(JSON.stringify(categories))}
        wallets={JSON.parse(JSON.stringify(wallets))}
        profiles={JSON.parse(JSON.stringify(account?.profiles || []))}
        accountInfo={JSON.parse(JSON.stringify(account))}
        month={month}
        year={year}
      />
    </AppLayout>
  );
}
