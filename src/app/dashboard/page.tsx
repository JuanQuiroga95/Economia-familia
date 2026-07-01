export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import DashboardClient from './DashboardClient';
import { getDashboardStats, getCategoryBreakdown, getMonthlyComparison, getBudgetStatus, getSharedFundStats } from '@/actions/dashboard';
import { prisma } from '@/lib/prisma';
import { getCurrentFinancialMonth, getArgDate } from '@/lib/dateUtils';

export default async function DashboardPage() {
  const now = getArgDate();
  const { month, year } = getCurrentFinancialMonth(now);

  // Fetch all data server-side
  const [stats, categoryData, monthlyData, profiles, sharedFundStats] = await Promise.all([
    getDashboardStats(month, year),
    getCategoryBreakdown(month, year),
    getMonthlyComparison(),
    prisma.profile.findMany(),
    getSharedFundStats(month, year),
  ]);

  // Get budget status for Juan
  const juanProfile = profiles.find((p) => p.name === 'Juan');
  const budgetStatus = juanProfile ? await getBudgetStatus(juanProfile.id) : null;

  return (
    <AppLayout>
      <DashboardClient
        stats={stats}
        categoryData={categoryData}
        monthlyData={monthlyData}
        budgetStatus={budgetStatus}
        sharedFundStats={sharedFundStats}
        profiles={profiles}
        currentMonth={month}
        currentYear={year}
      />
    </AppLayout>
  );
}
