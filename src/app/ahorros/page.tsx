export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
import AhorrosClient from './AhorrosClient';
import { getSavingsGoals, getPatrimonioStats } from '@/actions/savings';
import { getCurrentExchangeRate } from '@/actions/config';
import { parseMonthYear } from '@/lib/monthParams';
import { getAccountId } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export default async function AhorrosPage(props: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const searchParams = await props.searchParams;
  // El sobrante que se ofrece distribuir depende del mes, así que Ahorros
  // también necesita el selector: antes calculaba siempre el mes en curso sin
  // decirlo en ninguna parte.
  const { month, year } = parseMonthYear(searchParams);

  const accountId = await getAccountId();
  const [goals, patrimonio, rates, profiles, account] = await Promise.all([
    getSavingsGoals(),
    getPatrimonioStats(month, year),
    getCurrentExchangeRate(),
    accountId
      ? prisma.profile.findMany({ where: { accountId }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),
    accountId ? prisma.account.findUnique({ where: { id: accountId } }) : Promise.resolve(null),
  ]);

  return (
    <AppLayout>
      <MonthYearPicker month={month} year={year} />
      <AhorrosClient
        initialGoals={JSON.parse(JSON.stringify(goals))}
        patrimonio={patrimonio}
        rates={rates}
        profiles={profiles}
        accountSplits={account ? { a: account.splitPercentA, b: account.splitPercentB } : undefined}
      />
    </AppLayout>
  );
}
