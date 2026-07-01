'use server';

import { prisma } from '@/lib/prisma';
import type { BudgetStatus, CategoryBreakdown, SharedFundStats } from '@/types';
import { getFinancialMonthRange } from '@/lib/dateUtils';

export async function getDashboardStats(month: number, year: number, profileId?: string) {
  try {
    const { startDate, endDate } = getFinancialMonthRange(month, year);

    const whereBase = {
      date: { gte: startDate, lte: endDate },
      ...(profileId ? { profileId } : {}),
    };

    // Total ingresos
    const incomes = await prisma.income.aggregate({
      where: whereBase,
      _sum: { amount: true },
    });

    // Total gastos PROPIOS
    const expenses = await prisma.expense.findMany({
      where: {
        ...whereBase,
        type: 'PROPIO',
      },
    });

    const totalOwnExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Gastos compartidos pagados desde billetera personal
    const paidFromPersonal = await prisma.expense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        type: 'COMPARTIDO',
        paidFromPersonalBudget: true,
        ...(profileId ? { profileId } : {}),
      },
    });

    const totalPaidFromPersonal = paidFromPersonal.reduce((sum, exp) => sum + exp.amount, 0);

    const totalExpenses = totalOwnExpenses + totalPaidFromPersonal;
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

    const expenses = await prisma.expense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        type: 'PROPIO',
        ...(profileId ? { profileId } : {}),
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
    const now = new Date();
    const months = [];
    
    // Obtener mes financiero actual
    const { getCurrentFinancialMonth } = require('@/lib/dateUtils');
    const current = getCurrentFinancialMonth(now);
    
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

      const whereBase = {
        date: { gte: startDate, lte: endDate },
        ...(profileId ? { profileId } : {}),
      };

      const incomeAgg = await prisma.income.aggregate({
        where: whereBase,
        _sum: { amount: true },
      });

      const expenseRecords = await prisma.expense.findMany({
        where: {
          ...whereBase,
          type: 'PROPIO',
        },
      });

      const totalExpenses = expenseRecords.reduce((sum, exp) => sum + exp.amount, 0);

      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

      months.push({
        name: monthNames[m - 1],
        ingresos: incomeAgg._sum.amount || 0,
        gastos: totalExpenses,
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

    const now = new Date();
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

    const sharedExpenses = await prisma.expense.findMany({
      where: {
        type: 'COMPARTIDO',
        date: { gte: startDate, lte: endDate },
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
