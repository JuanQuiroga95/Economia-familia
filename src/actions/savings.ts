'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { SavingsGoalFormData } from '@/types';
import { getAccountId } from '@/lib/session';
import { categoriaDeConsumo } from '@/lib/reportFilters';
import { getCurrentFinancialMonth, getFinancialMonthRange, getArgDate } from '@/lib/dateUtils';

/** La meta tiene que ser de la cuenta con la sesion abierta. */
async function metaPropia(id: string, accountId: string) {
  return prisma.savingsGoal.findFirst({ where: { id, accountId } });
}

/** El perfil tiene que ser de esta cuenta. */
async function perfilPropio(profileId: string, accountId: string) {
  return prisma.profile.findFirst({ where: { id: profileId, accountId } });
}

export async function createSavingsGoal(data: SavingsGoalFormData) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const initialAmount = data.initialAmount || 0;
    const goal = await prisma.savingsGoal.create({
      data: {
        name: data.name,
        targetAmount: data.targetAmount || null,
        isPiggyBank: data.isPiggyBank || false,
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
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const goal = await metaPropia(data.savingsGoalId, accountId);
    if (!goal) return { success: false, error: 'Meta no encontrada' };

    if (!(await perfilPropio(data.profileId, accountId))) {
      return { success: false, error: 'Perfil no encontrado' };
    }

    if (!data.amount || data.amount <= 0) {
      return { success: false, error: 'El monto tiene que ser mayor a cero' };
    }

    // Se rechaza el retiro en lugar de dejar el saldo en cero: si el movimiento
    // se guardaba por el monto completo y el saldo se recortaba, al borrarlo
    // después la meta terminaba con más plata de la que había.
    if (data.type === 'RETIRO' && data.amount > goal.currentAmount) {
      return {
        success: false,
        error: `No podés retirar más de lo que hay: la meta tiene $${goal.currentAmount.toLocaleString('es-AR')}`,
      };
    }

    await prisma.savingsTransaction.create({
      data: {
        amount: data.amount,
        type: data.type,
        description: data.description,
        savingsGoalId: data.savingsGoalId,
        profileId: data.profileId,
      },
    });

    const newAmount =
      data.type === 'DEPOSITO'
        ? goal.currentAmount + data.amount
        : goal.currentAmount - data.amount;

    await prisma.savingsGoal.update({
      where: { id: data.savingsGoalId },
      data: { currentAmount: newAmount },
    });

    revalidatePath('/ahorros');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error adding savings transaction:', error);
    return { success: false, error: 'Error al agregar transacción' };
  }
}

export async function deleteSavingsGoal(id: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };
    if (!(await metaPropia(id, accountId))) {
      return { success: false, error: 'Meta no encontrada' };
    }

    // Los movimientos de la meta se van por cascada.
    await prisma.savingsGoal.delete({ where: { id } });

    revalidatePath('/ahorros');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error deleting savings goal:', error);
    return { success: false, error: 'Error al eliminar meta' };
  }
}

export async function deleteSavingsTransaction(id: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const tx = await prisma.savingsTransaction.findFirst({
      where: { id, savingsGoal: { accountId } },
      include: { savingsGoal: true },
    });
    if (!tx) return { success: false, error: 'Movimiento no encontrado' };

    const revertAmount =
      tx.type === 'DEPOSITO'
        ? tx.savingsGoal.currentAmount - tx.amount
        : tx.savingsGoal.currentAmount + tx.amount;

    await prisma.savingsGoal.update({
      where: { id: tx.savingsGoalId },
      data: { currentAmount: Math.max(0, revertAmount) },
    });
    await prisma.savingsTransaction.delete({ where: { id } });

    revalidatePath('/ahorros');
    revalidatePath('/dashboard');
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
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };
    if (!(await metaPropia(id, accountId))) {
      return { success: false, error: 'Meta no encontrada' };
    }

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
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No autenticado');

    const goal = await metaPropia(savingsGoalId, accountId);
    if (!goal) throw new Error('Meta no encontrada');
    if (!(await perfilPropio(profileId, accountId))) throw new Error('Perfil no encontrado');
    if (!amount || amount <= 0) throw new Error('El monto tiene que ser mayor a cero');
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

    // (No income creation needed anymore)

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

    const goal = await metaPropia(data.savingsGoalId, accountId);
    if (!goal) return { success: false, error: 'Meta no encontrada' };
    if (!(await perfilPropio(data.profileId, accountId))) {
      return { success: false, error: 'Perfil no encontrado' };
    }
    if (!data.amount || data.amount <= 0) {
      return { success: false, error: 'El monto tiene que ser mayor a cero' };
    }
    if (goal.currency !== data.currency) {
      return { success: false, error: `La moneda de la meta (${goal.currency}) no coincide con el sobrante (${data.currency})` };
    }

    // (No category or expense creation needed anymore)

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
    await prisma.savingsGoal.update({
      where: { id: data.savingsGoalId },
      data: { currentAmount: goal.currentAmount + data.amount },
    });

    revalidatePath('/ahorros');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error distributing surplus:', error);
    return { success: false, error: 'Error al distribuir el sobrante' };
  }
}

export async function getPatrimonioStats(month?: number, year?: number) {
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

    // 3. Sobrante del mes consultado. Usa exactamente la misma cuenta que el
    //    balance del dashboard (incluida la exclusión de las categorías de
    //    ahorro): si no, las dos pantallas mostraban números distintos.
    const current = getCurrentFinancialMonth(getArgDate());
    const mes = month ?? current.month;
    const anio = year ?? current.year;
    const { startDate, endDate } = getFinancialMonthRange(mes, anio);

    const incomes = await prisma.income.findMany({
      where: { date: { gte: startDate, lte: endDate }, profile: { accountId } },
    });

    const expenses = await prisma.expense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        profile: { accountId },
        category: categoriaDeConsumo,
      },
    });

    const incomeByCurrency: Record<string, number> = {};
    incomes.forEach((inc) => {
      incomeByCurrency[inc.currency] = (incomeByCurrency[inc.currency] || 0) + inc.amount;
    });

    const expenseByCurrency: Record<string, number> = {};
    expenses.forEach((exp) => {
      expenseByCurrency[exp.currency] = (expenseByCurrency[exp.currency] || 0) + exp.amount;
    });

    const savingsTxs = await prisma.savingsTransaction.findMany({
      where: { date: { gte: startDate, lte: endDate }, profile: { accountId } },
      include: { savingsGoal: true },
    });

    // Inversiones abiertas este mes, con su monto original reconstruido.
    const newInvestments = await prisma.investment.findMany({
      where: { startDate: { gte: startDate, lte: endDate }, profile: { accountId } },
      include: { transactions: true },
    });

    // Rescates de inversiones hechos este mes, de cualquier inversión.
    const investmentTxs = await prisma.investmentTransaction.findMany({
      where: { date: { gte: startDate, lte: endDate }, profile: { accountId } },
      include: { investment: { select: { currency: true } } },
    });

    const allCurrencies = new Set([
      ...Object.keys(incomeByCurrency),
      ...Object.keys(expenseByCurrency),
      ...savingsTxs.map((t) => t.savingsGoal.currency),
      ...newInvestments.map((i) => i.currency),
      ...investmentTxs.map((t) => t.investment.currency),
    ]);

    const surplusByCurrency: Record<string, number> = {};

    allCurrencies.forEach((cur) => {
      const income = incomeByCurrency[cur] || 0;
      const expense = expenseByCurrency[cur] || 0;

      let savingsDeposits = 0;
      let savingsWithdrawals = 0;
      savingsTxs
        .filter((tx) => tx.savingsGoal.currency === cur)
        .forEach((tx) => {
          if (tx.type === 'DEPOSITO') savingsDeposits += tx.amount;
          if (tx.type === 'RETIRO') savingsWithdrawals += tx.amount;
        });

      let investmentDeposits = 0;
      newInvestments
        .filter((inv) => inv.currency === cur)
        .forEach((inv) => {
          const retirado = inv.transactions
            .filter((t) => t.type === 'RETIRO')
            .reduce((acc, t) => acc + t.amount, 0);
          investmentDeposits += inv.amount + retirado;
        });

      let investmentWithdrawals = 0;
      investmentTxs
        .filter((tx) => tx.investment.currency === cur)
        .forEach((tx) => {
          if (tx.type === 'RETIRO') investmentWithdrawals += tx.amount;
          if (tx.type === 'DEPOSITO') investmentDeposits += tx.amount;
        });

      surplusByCurrency[cur] =
        income -
        expense -
        savingsDeposits +
        savingsWithdrawals -
        investmentDeposits +
        investmentWithdrawals;
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
      month: mes,
      year: anio,
    };
  } catch (error) {
    console.error('Error fetching patrimonio stats:', error);
    const current = getCurrentFinancialMonth(getArgDate());
    return {
      savingsByCurrency: {},
      investmentsByCurrency: {},
      surplusByCurrency: {},
      totalByCurrency: {},
      savingsCount: 0,
      investmentsCount: 0,
      month: month ?? current.month,
      year: year ?? current.year,
    };
  }
}
