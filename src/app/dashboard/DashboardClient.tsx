'use client';

import IncomeVsExpenseChart from '@/components/dashboard/IncomeVsExpenseChart';
import CategoryPieChart from '@/components/dashboard/CategoryPieChart';
import BudgetTracker from '@/components/dashboard/BudgetTracker';
import SharedFundCard from '@/components/dashboard/SharedFundCard';
import type { BudgetStatus, CategoryBreakdown, SharedFundStats } from '@/types';

interface DashboardClientProps {
  stats: { totalIncome: number; totalExpenses: number; balance: number };
  categoryData: CategoryBreakdown[];
  monthlyData: { name: string; ingresos: number; gastos: number }[];
  budgetStatus: BudgetStatus | null;
  sharedFundStats: SharedFundStats;
  profiles: { id: string; name: string; avatar: string | null }[];
  currentMonth: number;
  currentYear: number;
}

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function DashboardClient({
  stats,
  categoryData,
  monthlyData,
  budgetStatus,
  sharedFundStats,
}: DashboardClientProps) {
  const now = new Date();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Title */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-text-primary">
          Dashboard
        </h1>
        <p className="text-text-muted text-sm mt-1">
          {monthNames[now.getMonth()]} {now.getFullYear()} • Resumen general
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Ingresos */}
        <div className="glass-card p-4 lg:p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center">
              <span className="text-xl">💰</span>
            </div>
            <div>
              <p className="text-xs text-text-muted">Ingresos</p>
              <p className="text-xl font-bold text-success">
                ${stats.totalIncome.toLocaleString('es-AR')}
              </p>
            </div>
          </div>
        </div>

        {/* Gastos */}
        <div className="glass-card p-4 lg:p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-danger/20 flex items-center justify-center">
              <span className="text-xl">💸</span>
            </div>
            <div>
              <p className="text-xs text-text-muted">Gastos</p>
              <p className="text-xl font-bold text-danger">
                ${stats.totalExpenses.toLocaleString('es-AR')}
              </p>
            </div>
          </div>
        </div>

        {/* Balance */}
        <div className="glass-card p-4 lg:p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              stats.balance >= 0 ? 'bg-accent/20' : 'bg-danger/20'
            }`}>
              <span className="text-xl">{stats.balance >= 0 ? '📈' : '📉'}</span>
            </div>
            <div>
              <p className="text-xs text-text-muted">Balance</p>
              <p className={`text-xl font-bold ${
                stats.balance >= 0 ? 'text-accent' : 'text-danger'
              }`}>
                ${stats.balance.toLocaleString('es-AR')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Budget Tracker (solo Juan) */}
      <BudgetTracker status={budgetStatus} />

      {/* Shared Fund */}
      <SharedFundCard stats={sharedFundStats} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IncomeVsExpenseChart data={monthlyData} />
        <CategoryPieChart data={categoryData} />
      </div>
    </div>
  );
}
