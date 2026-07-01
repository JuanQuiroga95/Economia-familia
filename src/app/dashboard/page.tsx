export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import DashboardClient from './DashboardClient';
import { getDashboardStats, getCategoryBreakdown, getMonthlyComparison, getBudgetStatus, getSharedFundStats } from '@/actions/dashboard';
import { prisma } from '@/lib/prisma';
import { getCurrentFinancialMonth, getArgDate } from '@/lib/dateUtils';
import { getAccountId } from '@/lib/session';

import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const now = getArgDate();
  const { month, year } = getCurrentFinancialMonth(now);
  const accountId = await getAccountId();

  if (!accountId) {
    redirect('/logout');
  }

  // Fetch all data server-side
  const profiles = await prisma.profile.findMany({
    where: { accountId },
    orderBy: { name: 'asc' },
  });

  const [stats, categoryData, monthlyData, sharedFundStats] = await Promise.all([
    getDashboardStats(month, year),
    getCategoryBreakdown(month, year),
    getMonthlyComparison(),
    getSharedFundStats(month, year),
  ]);

  // Get budget status for ALL profiles that have an active budget config
  const budgetStatuses = await Promise.all(
    profiles.map((p) => getBudgetStatus(p.id))
  );
  const activeBudgets = budgetStatuses.filter((b) => b !== null);

  return (
    <AppLayout>
      <DashboardClient
        stats={stats}
        categoryData={categoryData}
        monthlyData={monthlyData}
        budgetStatuses={activeBudgets}
        sharedFundStats={sharedFundStats}
        profiles={profiles}
        currentMonth={month}
        currentYear={year}
      />
    </AppLayout>
  );
}
