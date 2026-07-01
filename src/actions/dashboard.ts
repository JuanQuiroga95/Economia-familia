'use server';

import { prisma } from '@/lib/prisma';
import type { BudgetStatus, CategoryBreakdown, SharedFundStats } from '@/types';
import { getFinancialMonthRange, getArgDate, getCurrentFinancialMonth } from '@/lib/dateUtils';

import { getAccountId } from '@/lib/session';

export async function getDashboardStats(month: number, year: number, profileId?: string) {
  try {
    const { startDate, endDate } = getFinancialMonthRange(month, year);
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const whereBase = {
      date: { gte: startDate, lte: endDate },
      profile: { accountId },
      ...(profileId ? { profileId } : {}),
    };

    // Total ingresos
    const incomes = await prisma.income.aggregate({
      where: whereBase,
      _sum: { amount: true },
    });

    let totalExpenses = 0;

    if (profileId) {
      // Si es la vista de un perfil específico: Gastos PROPIOS + Compartidos pagados por él
      const expenses = await prisma.expense.findMany({
        where: whereBase,
      });
      totalExpenses = expenses
        .filter((e) => e.type === 'PROPIO' || (e.type === 'COMPARTIDO' && e.paidFromPersonalBudget))
        .reduce((sum, e) => sum + e.amount, 0);
    } else {
      // Vista global (Dashboard): TODOS los gastos (Propios de ambos + Compartidos)
      const allExpenses = await prisma.expense.aggregate({
        where: { date: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
      });
      totalExpenses = allExpenses._sum.amount || 0;
    }

    const totalIncome = incomes._sum.amount || 0;

    return {
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return { totalIncome: 0, totalExpenses: 0, balance: 0 };
  }
}

export async function getCategoryBreakdown(
  month: number,
  year: number,
  profileId?: string
): Promise<CategoryBreakdown[]> {
  try {
    const { startDate, endDate } = getFinancialMonthRange(month, year);
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const expenses = await prisma.expense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        profile: { accountId },
        ...(profileId ? { profileId, type: 'PROPIO' } : {}),
      },
      include: { category: true },
    });

    const categoryMap = new Map<string, { category: string; icon: string; color: string; total: number }>();

    expenses.forEach((exp) => {
      const existing = categoryMap.get(exp.categoryId);
      if (existing) {
        existing.total += exp.amount;
      } else {
        categoryMap.set(exp.categoryId, {
          category: exp.category.name,
          icon: exp.category.icon,
          color: exp.category.color,
          total: exp.amount,
        });
      }
    });

    const totalExpenses = Array.from(categoryMap.values()).reduce((sum, c) => sum + c.total, 0);

    return Array.from(categoryMap.values())
      .map((c) => ({
        category: c.category,
        icon: c.icon,
        color: c.color,
        total: c.total,
        percentage: totalExpenses > 0 ? (c.total / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  } catch (error) {
    console.error('Error fetching category breakdown:', error);
    return [];
  }
}

export async function getMonthlyComparison(profileId?: string) {
  try {
    const current = getCurrentFinancialMonth(getArgDate());
    const data = [];
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');
    
    const currentMonth = current.month;
    const currentYear = current.year;

    for (let i = 5; i >= 0; i--) {
      let m = currentMonth - i;
      let y = currentYear;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }

      const { startDate, endDate } = getFinancialMonthRange(m, y);

      const incomeAgg = await prisma.income.aggregate({
        where: {
          date: { gte: startDate, lte: endDate },
          profile: { accountId },
          ...(profileId ? { profileId } : {}),
        },
        _sum: { amount: true },
      });

      const expenseAgg = await prisma.expense.aggregate({
        where: {
          date: { gte: startDate, lte: endDate },
          profile: { accountId },
          ...(profileId ? { profileId, type: 'PROPIO' } : {}),
        },
        _sum: { amount: true },
      });

      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

      months.push({
        name: monthNames[m - 1],
        ingresos: incomeAgg._sum.amount || 0,
        gastos: expenseAgg._sum.amount || 0,
      });
    }

    return months;
  } catch (error) {
    console.error('Error fetching monthly comparison:', error);
    return [];
  }
}

export async function getBudgetStatus(profileId: string): Promise<BudgetStatus | null> {
  try {
    const config = await prisma.budgetConfig.findUnique({
      where: { profileId },
      include: { profile: true },
    });

    if (!config || !config.isActive) return null;

    const now = require('@/lib/dateUtils').getArgDate();
    const day = now.getDate();
    const year = now.getFullYear();
    const month = now.getMonth();

    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const isFirstHalf = day >= lastDayOfMonth || day <= 15;
    const currentHalf: 1 | 2 = isFirstHalf ? 1 : 2;
    const budget = currentHalf === 1 ? config.firstHalfBudget : config.secondHalfBudget;

    let startDate: Date;
    let endDate: Date;

    if (isFirstHalf) {
      if (day >= lastDayOfMonth) {
        startDate = new Date(year, month, lastDayOfMonth);
        endDate = new Date(year, month + 1, 15, 23, 59, 59);
      } else {
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        startDate = new Date(year, month - 1, prevMonthLastDay);
        endDate = new Date(year, month, 15, 23, 59, 59);
      }
    } else {
      startDate = new Date(year, month, 16);
      endDate = new Date(year, month, lastDayOfMonth - 1, 23, 59, 59);
    }

    const ownExpenses = await prisma.expense.findMany({
      where: {
        profileId,
        date: { gte: startDate, lte: endDate },
        currency: config.currency,
        type: 'PROPIO',
      },
    });

    const spentOwn = ownExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    const sharedPaidPersonal = await prisma.expense.findMany({
      where: {
        profileId,
        date: { gte: startDate, lte: endDate },
        currency: config.currency,
        type: 'COMPARTIDO',
        paidFromPersonalBudget: true,
      },
    });

    const spentSharedPersonal = sharedPaidPersonal.reduce((sum, exp) => sum + exp.amount, 0);
    const spent = spentOwn + spentSharedPersonal;

    return {
      profileId,
      profileName: config.profile.name,
      currentHalf,
      budget,
      spent,
      remaining: budget - spent,
      percentage: budget > 0 ? (spent / budget) * 100 : 0,
      currency: config.currency,
    };
  } catch (error) {
    console.error('Error fetching budget status:', error);
    return null;
  }
}

export async function getSharedFundStats(month: number, year: number): Promise<SharedFundStats> {
  try {
    const { startDate, endDate } = getFinancialMonthRange(month, year);
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { profiles: true },
    });

    if (!account || account.profiles.length < 2) {
      return { totalShared: 0, profileA: { name: 'A', paid: 0, owes: 0 }, profileB: { name: 'B', paid: 0, owes: 0 } };
    }

    const [profileA, profileB] = account.profiles.sort((a, b) => a.name.localeCompare(b.name));

    const sharedExpenses = await prisma.expense.findMany({
      where: {
        type: 'COMPARTIDO',
        date: { gte: startDate, lte: endDate },
        profile: { accountId },
      },
      include: { profile: true },
    });

    const totalSharedExpenses = sharedExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    const debtMap = new Map<string, { profileName: string; profileAvatar: string | null; amount: number }>();

    sharedExpenses.forEach((exp) => {
      if (exp.paidFromPersonalBudget) {
        const existing = debtMap.get(exp.profileId);
        if (existing) {
          existing.amount += exp.amount;
        } else {
          debtMap.set(exp.profileId, {
            profileName: exp.profile.name,
            profileAvatar: exp.profile.avatar,
            amount: exp.amount,
          });
        }
      }
    });

    const debts = Array.from(debtMap.entries()).map(([profileId, data]) => ({
      profileId,
      profileName: data.profileName,
      profileAvatar: data.profileAvatar,
      amount: data.amount,
      currency: 'ARS',
    }));

    return {
      totalSharedExpenses,
      debts,
      currency: 'ARS',
    };
  } catch (error) {
    console.error('Error fetching shared fund stats:', error);
    return { totalSharedExpenses: 0, debts: [], currency: 'ARS' };
  }
}
