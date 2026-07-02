'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { SavingsGoalFormData } from '@/types';
import { getAccountId } from '@/lib/session';

export async function createSavingsGoal(data: SavingsGoalFormData) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const initialAmount = data.initialAmount || 0;
    const goal = await prisma.savingsGoal.create({
      data: {
        name: data.name,
        targetAmount: data.targetAmount,
        currentAmount: initialAmount,
        currency: data.currency,
        accountId: accountId,
        monthsToAchieve: data.monthsToAchieve,
        monthlySplits: data.monthlySplits || {},
      },
    });

    if (initialAmount > 0) {
      const firstProfile = await prisma.profile.findFirst({ where: { accountId } });
      if (firstProfile) {
        await prisma.savingsTransaction.create({
          data: {
            amount: initialAmount,
            type: 'DEPOSITO',
            description: 'Saldo inicial',
            savingsGoalId: goal.id,
            profileId: firstProfile.id,
          },
        });
      }
    }

    revalidatePath('/ahorros');
    return { success: true, data: goal };
  } catch (error) {
    console.error('Error creating savings goal:', error);
    return { success: false, error: 'Error al crear meta de ahorro' };
  }
}

export async function getSavingsGoals() {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    return await prisma.savingsGoal.findMany({
      where: { accountId },
      include: {
        transactions: { 
          orderBy: { date: 'desc' },
          include: { profile: true }
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    console.error('Error fetching savings goals:', error);
    return [];
  }
}

export async function addSavingsTransaction(data: {
  savingsGoalId: string;
  amount: number;
  type: 'DEPOSITO' | 'RETIRO';
  description?: string;
  profileId: string;
}) {
  try {
    await prisma.savingsTransaction.create({
      data: {
        amount: data.amount,
        type: data.type,
        description: data.description,
        savingsGoalId: data.savingsGoalId,
        profileId: data.profileId,
      },
    });

    const goal = await prisma.savingsGoal.findUnique({
      where: { id: data.savingsGoalId },
    });

    if (goal) {
      const newAmount =
        data.type === 'DEPOSITO'
          ? goal.currentAmount + data.amount
          : goal.currentAmount - data.amount;

      await prisma.savingsGoal.update({
        where: { id: data.savingsGoalId },
        data: { currentAmount: Math.max(0, newAmount) },
      });
    }

    revalidatePath('/ahorros');
    return { success: true };
  } catch (error) {
    console.error('Error adding savings transaction:', error);
    return { success: false, error: 'Error al agregar transacción' };
  }
}

export async function deleteSavingsGoal(id: string) {
  try {
    const goal = await prisma.savingsGoal.findUnique({
      where: { id },
      include: { transactions: true },
    });

    if (goal) {
      // Find and delete associated expenses for distributed surplus
      for (const tx of goal.transactions) {
        if (tx.description === 'Distribución de sobrante del mes') {
          const expenses = await prisma.expense.findMany({
            where: {
              amount: tx.amount,
              description: { startsWith: 'Distribución de sobrante' },
              profileId: tx.profileId,
            },
          });
          
          for (const exp of expenses) {
            const diff = Math.abs(exp.createdAt.getTime() - tx.createdAt.getTime());
            if (diff < 10000) {
              await prisma.expense.delete({ where: { id: exp.id } });
              break;
            }
          }
        }
      }
    }

    await prisma.savingsGoal.delete({
      where: { id },
    });
    revalidatePath('/ahorros');
    return { success: true };
  } catch (error) {
    console.error('Error deleting savings goal:', error);
    return { success: false, error: 'Error al eliminar meta' };
  }
}

export async function deleteSavingsTransaction(id: string) {
  try {
    const tx = await prisma.savingsTransaction.findUnique({
      where: { id },
    });

    if (tx) {
      const goal = await prisma.savingsGoal.findUnique({
        where: { id: tx.savingsGoalId },
      });

      if (goal) {
        const revertAmount =
          tx.type === 'DEPOSITO'
            ? goal.currentAmount - tx.amount
            : goal.currentAmount + tx.amount;

        await prisma.savingsGoal.update({
          where: { id: tx.savingsGoalId },
          data: { currentAmount: Math.max(0, revertAmount) },
        });
      }

      if (tx.description === 'Distribución de sobrante del mes') {
        const expenses = await prisma.expense.findMany({
          where: {
            amount: tx.amount,
            description: { startsWith: 'Distribución de sobrante' },
            profileId: tx.profileId,
          },
        });
        
        for (const exp of expenses) {
          const diff = Math.abs(exp.createdAt.getTime() - tx.createdAt.getTime());
          if (diff < 10000) {
            await prisma.expense.delete({ where: { id: exp.id } });
            break;
          }
        }
      }

      await prisma.savingsTransaction.delete({ where: { id } });
    }

    revalidatePath('/ahorros');
    return { success: true };
  } catch (error) {
    console.error('Error deleting savings transaction:', error);
    return { success: false, error: 'Error al eliminar transacción' };
  }
}

export async function updateSavingsGoal(
  id: string,
  data: Partial<SavingsGoalFormData>
) {
  try {
    await prisma.savingsGoal.update({
      where: { id },
      data: {
        name: data.name,
        targetAmount: data.targetAmount,
        currency: data.currency,
        monthsToAchieve: data.monthsToAchieve,
        monthlySplits: data.monthlySplits || {},
      },
    });
    revalidatePath('/ahorros');
    return { success: true };
  } catch (error) {
    console.error('Error updating savings goal:', error);
    return { success: false, error: 'Error al actualizar meta de ahorro' };
  }
}

export async function withdrawToBalanceFromSavings(savingsGoalId: string, amount: number, profileId: string) {
  try {
    const goal = await prisma.savingsGoal.findUnique({ where: { id: savingsGoalId } });
    if (!goal) throw new Error('Meta no encontrada');
    if (goal.currentAmount < amount) throw new Error('Fondos insuficientes en la meta');

    // 1. Retiro de la meta
    await prisma.savingsTransaction.create({
      data: {
        amount,
        type: 'RETIRO',
        description: 'Transferencia a Balance',
        savingsGoalId,
        profileId,
      },
    });

    await prisma.savingsGoal.update({
      where: { id: savingsGoalId },
      data: { currentAmount: goal.currentAmount - amount },
    });

    // 2. Ingreso al balance mensual (asume que la fecha es el mes actual para impactar el Dashboard)
    const { getArgDate } = await import('@/lib/dateUtils');
    await prisma.income.create({
      data: {
        amount,
        currency: goal.currency as "ARS" | "USD" | "EUR",
        date: getArgDate(),
        description: `Rescate desde ahorros: ${goal.name}`,
        profileId,
      },
    });

    revalidatePath('/ahorros');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: any) {
    console.error('Error withdrawing to balance:', error);
    return { success: false, error: error.message || 'Error al rescatar fondos' };
  }
}

export async function distributeSurplus(data: {
  amount: number;
  currency: string;
  savingsGoalId: string;
  profileId: string;
}) {
  try {
    // 1. Buscar o crear la categoría de Ahorro/Inversión
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    let category = await prisma.category.findFirst({
      where: { name: 'Ahorro / Inversión', accountId },
    });
    if (!category) {
      category = await prisma.category.create({
        data: { name: 'Ahorro / Inversión', icon: '🏦', color: '#10b981', accountId },
      });
    }

    // 2. Crear el "gasto" para descontarlo del sobrante del mes
    const { getArgDate } = await import('@/lib/dateUtils');
    await prisma.expense.create({
      data: {
        amount: data.amount,
        currency: data.currency as "ARS" | "USD" | "EUR",
        date: getArgDate(),
        description: 'Distribución de sobrante',
        categoryId: category.id,
        profileId: data.profileId,
        type: 'PROPIO',
        paidFromPersonalBudget: false,
      },
    });

    // 3. Crear el depósito en la meta de ahorro seleccionada
    await prisma.savingsTransaction.create({
      data: {
        amount: data.amount,
        type: 'DEPOSITO',
        description: 'Distribución de sobrante del mes',
        savingsGoalId: data.savingsGoalId,
        profileId: data.profileId,
      },
    });

    // 4. Actualizar el saldo de la meta
    const goal = await prisma.savingsGoal.findUnique({ where: { id: data.savingsGoalId } });
    if (goal) {
      await prisma.savingsGoal.update({
        where: { id: data.savingsGoalId },
        data: { currentAmount: goal.currentAmount + data.amount },
      });
    }

    revalidatePath('/ahorros');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error distributing surplus:', error);
    return { success: false, error: 'Error al distribuir el sobrante' };
  }
}

export async function getPatrimonioStats() {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    // 1. Total en metas de ahorro (agrupado por moneda)
    const savingsGoals = await prisma.savingsGoal.findMany({
      where: { accountId },
    });
    const savingsByCurrency: Record<string, number> = {};
    savingsGoals.forEach((goal) => {
      savingsByCurrency[goal.currency] = (savingsByCurrency[goal.currency] || 0) + goal.currentAmount;
    });

    // 2. Total en inversiones (agrupado por moneda)
    const investments = await prisma.investment.findMany({
      where: { profile: { accountId } },
    });
    const investmentsByCurrency: Record<string, number> = {};
    investments.forEach((inv) => {
      investmentsByCurrency[inv.currency] = (investmentsByCurrency[inv.currency] || 0) + inv.amount;
    });

    // 3. Sobrante del mes actual (ingresos - gastos de este mes)
    const { getCurrentFinancialMonth, getFinancialMonthRange, getArgDate } = await import('@/lib/dateUtils');
    const now = getArgDate();
    const current = getCurrentFinancialMonth(now);
    const { startDate, endDate } = getFinancialMonthRange(current.month, current.year);

    const incomes = await prisma.income.findMany({
      where: { date: { gte: startDate, lte: endDate }, profile: { accountId } },
    });

    const expenses = await prisma.expense.findMany({
      where: { date: { gte: startDate, lte: endDate }, profile: { accountId } },
    });

    // Agrupar ingresos por moneda
    const incomeByCurrency: Record<string, number> = {};
    incomes.forEach((inc) => {
      incomeByCurrency[inc.currency] = (incomeByCurrency[inc.currency] || 0) + inc.amount;
    });

    // Agrupar gastos por moneda
    const expenseByCurrency: Record<string, number> = {};
    expenses.forEach((exp) => {
      expenseByCurrency[exp.currency] = (expenseByCurrency[exp.currency] || 0) + exp.amount;
    });

    // Calcular sobrante por moneda
    const surplusByCurrency: Record<string, number> = {};
    const allCurrencies = new Set([...Object.keys(incomeByCurrency), ...Object.keys(expenseByCurrency)]);
    allCurrencies.forEach((cur) => {
      const income = incomeByCurrency[cur] || 0;
      const expense = expenseByCurrency[cur] || 0;
      surplusByCurrency[cur] = income - expense;
    });

    // 4. Totales generales por moneda
    const allCurrenciesTotal = new Set([
      ...Object.keys(savingsByCurrency),
      ...Object.keys(investmentsByCurrency),
    ]);
    const totalByCurrency: Record<string, number> = {};
    allCurrenciesTotal.forEach((cur) => {
      totalByCurrency[cur] = (savingsByCurrency[cur] || 0) + (investmentsByCurrency[cur] || 0);
    });

    return {
      savingsByCurrency,
      investmentsByCurrency,
      surplusByCurrency,
      totalByCurrency,
      savingsCount: savingsGoals.length,
      investmentsCount: investments.length,
    };
  } catch (error) {
    console.error('Error fetching patrimonio stats:', error);
    return {
      savingsByCurrency: {},
      investmentsByCurrency: {},
      surplusByCurrency: {},
      totalByCurrency: {},
      savingsCount: 0,
      investmentsCount: 0,
    };
  }
}
