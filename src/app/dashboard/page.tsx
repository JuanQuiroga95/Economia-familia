export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import DashboardClient from './DashboardClient';
import { getDashboardStats, getCategoryBreakdown, getMonthlyComparison, getBudgetStatus } from '@/actions/dashboard';
import { prisma } from '@/lib/prisma';

export default async function DashboardPage() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Fetch all data server-side
  const [stats, categoryData, monthlyData, profiles] = await Promise.all([
    getDashboardStats(month, year),
    getCategoryBreakdown(month, year),
    getMonthlyComparison(),
    prisma.profile.findMany(),
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
        profiles={profiles}
        currentMonth={month}
        currentYear={year}
      />
    </AppLayout>
  );
}
