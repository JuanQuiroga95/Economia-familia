'use server';

import { prisma } from '@/lib/prisma';
import type { BudgetStatus, CategoryBreakdown } from '@/types';

export async function getDashboardStats(month: number, year: number, profileId?: string) {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const whereBase = {
      date: { gte: startDate, lte: endDate },
      ...(profileId ? { profileId } : {}),
    };

    // Total ingresos
    const incomes = await prisma.income.aggregate({
      where: whereBase,
      _sum: { amount: true },
    });

    // Total gastos (considerando splitPercent)
    const expenses = await prisma.expense.findMany({
      where: whereBase,
    });

    const totalExpenses = expenses.reduce((sum, exp) => {
      return sum + (exp.amount * exp.splitPercent) / 100;
    }, 0);

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
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const expenses = await prisma.expense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        ...(profileId ? { profileId } : {}),
      },
      include: { category: true },
    });

    // Agrupar por categoría
    const categoryMap = new Map<string, { category: string; icon: string; color: string; total: number }>();

    expenses.forEach((exp) => {
      const effectiveAmount = (exp.amount * exp.splitPercent) / 100;
      const existing = categoryMap.get(exp.categoryId);
      if (existing) {
        existing.total += effectiveAmount;
      } else {
        categoryMap.set(exp.categoryId, {
          category: exp.category.name,
          icon: exp.category.icon,
          color: exp.category.color,
          total: effectiveAmount,
        });
      }
    });

    const totalExpenses = Array.from(categoryMap.values()).reduce((sum, c) => sum + c.total, 0);

    return Array.from(categoryMap.values())
      .map((c) => ({
        ...c,
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

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      const whereBase = {
        date: { gte: startDate, lte: endDate },
        ...(profileId ? { profileId } : {}),
      };

      const incomeAgg = await prisma.income.aggregate({
        where: whereBase,
        _sum: { amount: true },
      });

      const expenseRecords = await prisma.expense.findMany({
        where: whereBase,
      });

      const totalExpenses = expenseRecords.reduce((sum, exp) => {
        return sum + (exp.amount * exp.splitPercent) / 100;
      }, 0);

      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

      months.push({
        name: monthNames[month - 1],
        month,
        year,
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
    const currentHalf: 1 | 2 = day <= 15 ? 1 : 2;
    const budget = currentHalf === 1 ? config.firstHalfBudget : config.secondHalfBudget;

    // Calcular gastos de la quincena actual
    const year = now.getFullYear();
    const month = now.getMonth();
    const startDate = currentHalf === 1
      ? new Date(year, month, 1)
      : new Date(year, month, 16);
    const endDate = currentHalf === 1
      ? new Date(year, month, 15, 23, 59, 59)
      : new Date(year, month + 1, 0, 23, 59, 59);

    const expenses = await prisma.expense.findMany({
      where: {
        profileId,
        date: { gte: startDate, lte: endDate },
        currency: config.currency,
      },
    });

    const spent = expenses.reduce((sum, exp) => {
      return sum + (exp.amount * exp.splitPercent) / 100;
    }, 0);

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
