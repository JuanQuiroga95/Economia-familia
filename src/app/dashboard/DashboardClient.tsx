'use client';

import IncomeVsExpenseChart from '@/components/dashboard/IncomeVsExpenseChart';
import CategoryPieChart from '@/components/dashboard/CategoryPieChart';
import BudgetTracker from '@/components/dashboard/BudgetTracker';
import SharedFundCard from '@/components/dashboard/SharedFundCard';
import UserExpenseChart from '@/components/dashboard/UserExpenseChart';
import CategoryBudgetProgress from '@/components/dashboard/CategoryBudgetProgress';
import type { BudgetStatus, CategoryBreakdown, SharedFundStats, UserExpenseBreakdown, CategoryBudgetStatus } from '@/types';
import { formatCurrency } from '@/lib/formatUtils';

interface DashboardClientProps {
  stats: { totalIncome: number; totalExpenses: number; balance: number };
  categoryData: CategoryBreakdown[];
  monthlyData: { name: string; ingresos: number; gastos: number }[];
  budgetStatuses: BudgetStatus[];
  sharedFundStats: SharedFundStats;
  profiles: { id: string; name: string; avatar: string | null }[];
  currentMonth: number;
  currentYear: number;
  userExpenseBreakdown: UserExpenseBreakdown[];
  categoryBudgets: CategoryBudgetStatus[];
  walletBalances?: { id: string; name: string; currency: string; balance: number }[];
}

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function DashboardClient({
  stats,
  categoryData,
  monthlyData,
  budgetStatuses,
  sharedFundStats,
  currentMonth,
  currentYear,
  userExpenseBreakdown,
  categoryBudgets,
  walletBalances = [],
}: DashboardClientProps) {

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Title */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-text-primary">
          Dashboard
        </h1>
        <p className="text-text-muted text-sm mt-1">
          {monthNames[currentMonth - 1]} {currentYear} • Resumen general
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
                ${formatCurrency(stats.totalIncome)}
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
                ${formatCurrency(stats.totalExpenses)}
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
                ${formatCurrency(stats.balance)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Saldos por Billetera */}
      {walletBalances && walletBalances.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {walletBalances.map((w) => (
            <div key={w.id} className="glass-card p-4 flex flex-col justify-between hover:scale-105 transition-transform duration-200">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-text-primary truncate">{w.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">{w.currency}</span>
              </div>
              <p className={`text-lg font-bold ${w.balance >= 0 ? 'text-text-primary' : 'text-danger'}`}>
                ${formatCurrency(w.balance)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Category Budgets */}
      {categoryBudgets && categoryBudgets.length > 0 && (
        <CategoryBudgetProgress budgets={categoryBudgets} />
      )}

      {/* Budget Trackers (for all profiles with active budget) */}
      {budgetStatuses.map((status) => (
        <BudgetTracker key={status.profileId} status={status} />
      ))}

      {/* Shared Fund */}
      <SharedFundCard stats={sharedFundStats} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UserExpenseChart data={userExpenseBreakdown} />
        <IncomeVsExpenseChart data={monthlyData} />
        <CategoryPieChart data={categoryData} />
      </div>
    </div>
  );
}
