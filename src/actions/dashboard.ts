'use server';

import { prisma } from '@/lib/prisma';
import type { BudgetStatus, CategoryBreakdown, SharedFundStats } from '@/types';

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

    // Total gastos PROPIOS (los compartidos van al fondo compartido)
    const expenses = await prisma.expense.findMany({
      where: {
        ...whereBase,
        type: 'PROPIO',
      },
    });

    const totalOwnExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Gastos compartidos pagados desde billetera personal (se descuentan del saldo personal)
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

      const totalExpenses = expenseRecords.reduce((sum, exp) => sum + exp.amount, 0);

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
    const year = now.getFullYear();
    const month = now.getMonth();

    // La primera quincena arranca el último día del mes (día de cobro)
    // y termina el 15 del mes siguiente.
    // La segunda quincena va del 16 al penúltimo día del mes.
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const isFirstHalf = day >= lastDayOfMonth || day <= 15;
    const currentHalf: 1 | 2 = isFirstHalf ? 1 : 2;
    const budget = currentHalf === 1 ? config.firstHalfBudget : config.secondHalfBudget;

    // Calcular rango de fechas de la quincena actual
    let startDate: Date;
    let endDate: Date;

    if (isFirstHalf) {
      if (day >= lastDayOfMonth) {
        // Último día del mes actual → 15 del mes siguiente
        startDate = new Date(year, month, lastDayOfMonth);
        endDate = new Date(year, month + 1, 15, 23, 59, 59);
      } else {
        // Día 1-15: último día del mes anterior → 15 del mes actual
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        startDate = new Date(year, month - 1, prevMonthLastDay);
        endDate = new Date(year, month, 15, 23, 59, 59);
      }
    } else {
      // Segunda quincena: 16 al penúltimo día del mes
      startDate = new Date(year, month, 16);
      endDate = new Date(year, month, lastDayOfMonth - 1, 23, 59, 59);
    }

    // Gastos PROPIOS del perfil
    const ownExpenses = await prisma.expense.findMany({
      where: {
        profileId,
        date: { gte: startDate, lte: endDate },
        currency: config.currency,
        type: 'PROPIO',
      },
    });

    const spentOwn = ownExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Gastos COMPARTIDOS pagados desde la billetera personal de este perfil
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
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Todos los gastos compartidos del mes
    const sharedExpenses = await prisma.expense.findMany({
      where: {
        type: 'COMPARTIDO',
        date: { gte: startDate, lte: endDate },
      },
      include: { profile: true },
    });

    const totalSharedExpenses = sharedExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Deudas: gastos compartidos pagados desde billetera personal
    // Agrupar por perfil
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
