export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import { parseMonthYear } from '@/lib/monthParams';
import DashboardClient from './DashboardClient';
import MonthYearPicker from '@/components/ui/MonthYearPicker';
import { getDashboardStats, getCategoryBreakdown, getMonthlyComparison, getBudgetStatus, getSharedFundStats, getUserExpenseBreakdown, getCategoryBudgetStatuses, getWalletBalances } from '@/actions/dashboard';
import { getCardsSummary } from '@/actions/cards';
import { getLoansSummary } from '@/actions/loans';
import { getAgendaSummary } from '@/actions/agenda';
import { prisma } from '@/lib/prisma';
import { getAccountId } from '@/lib/session';

import { redirect } from 'next/navigation';

import MonthCloseBannerWrapper from '@/components/dashboard/MonthCloseBannerWrapper';

export default async function DashboardPage(props: { searchParams: Promise<{ month?: string; year?: string }> }) {
  const searchParams = await props.searchParams;
  const { month, year } = parseMonthYear(searchParams);

  const accountId = await getAccountId();

  if (!accountId) {
    redirect('/logout');
  }

  // Fetch all data server-side
  const profiles = await prisma.profile.findMany({
    where: { accountId },
    orderBy: { name: 'asc' },
  });

  const [stats, categoryData, monthlyData, sharedFundStats, userExpenseBreakdown, categoryBudgets, walletBalances, cardsSummary, loansSummary, agendaSummary] = await Promise.all([
    getDashboardStats(month, year),
    getCategoryBreakdown(month, year),
    getMonthlyComparison(month, year),
    getSharedFundStats(month, year),
    getUserExpenseBreakdown(month, year),
    getCategoryBudgetStatuses(month, year),
    getWalletBalances(),
    getCardsSummary(month, year),
    getLoansSummary(month, year),
    getAgendaSummary(month, year),
  ]);

  // Get budget status for ALL profiles that have an active budget config
  const budgetStatuses = await Promise.all(
    profiles.map((p) => getBudgetStatus(p.id, month, year))
  );
  const activeBudgets = budgetStatuses.filter((b) => b !== null);

  return (
    <AppLayout>
      <MonthCloseBannerWrapper currentMonth={month} currentYear={year} />
      <MonthYearPicker month={month} year={year} />
      <DashboardClient
        stats={stats}
        categoryData={categoryData}
        monthlyData={monthlyData}
        budgetStatuses={activeBudgets}
        sharedFundStats={sharedFundStats}
        profiles={profiles}
        currentMonth={month}
        currentYear={year}
        userExpenseBreakdown={userExpenseBreakdown}
        categoryBudgets={categoryBudgets}
        walletBalances={walletBalances}
        cardsSummary={cardsSummary}
        loansSummary={loansSummary}
        agendaSummary={agendaSummary}
      />
    </AppLayout>
  );
}
