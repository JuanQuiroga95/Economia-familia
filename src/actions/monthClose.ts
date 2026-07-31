'use server';

import { prisma } from '@/lib/prisma';
import { getAccountId } from '@/lib/session';
import { getDashboardStats } from './dashboard';
import { revalidatePath } from 'next/cache';
import { getArgDate } from '@/lib/dateUtils';

// Verifica si el mes pasado tiene saldo y no fue cerrado
export async function checkPreviousMonthStatus(currentMonth: number, currentYear: number) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return null;

    let prevMonth = currentMonth - 1;
    let prevYear = currentYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear--;
    }

    // Buscar si ya está cerrado
    const closed = await prisma.monthClose.findUnique({
      where: {
        accountId_month_year: {
          accountId,
          month: prevMonth,
          year: prevYear
        }
      }
    });

    if (closed) return null; // Ya fue cerrado o ignorado

    // Obtener stats del mes pasado
    const stats = await getDashboardStats(prevMonth, prevYear);
    if (stats.balance > 0) {
      return {
        month: prevMonth,
        year: prevYear,
        balance: stats.balance,
      };
    }

    return null;
  } catch (error) {
    console.error('Error checking previous month status:', error);
    return null;
  }
}

// Pasa el saldo al mes actual
export async function carryOverBalance(prevMonth: number, prevYear: number, amount: number) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { profiles: true }
    });
    if (!account || account.profiles.length === 0) throw new Error('No profile found');

    const profileId = account.profiles[0].id; // Asignar a cualquier perfil, es ingreso común

    // Determinar la fecha para el ingreso (día 1 del mes siguiente)
    let currentMonth = prevMonth + 1;
    let currentYear = prevYear;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
    const date = new Date(currentYear, currentMonth - 1, 1, 12, 0, 0);

    // 1. Crear el ingreso en el mes actual
    await prisma.income.create({
      data: {
        amount,
        currency: 'ARS',
        date,
        description: `Saldo sobrante de ${prevMonth}/${prevYear}`,
        profileId,
      }
    });

    // 2. Marcar el mes anterior como cerrado
    await prisma.monthClose.create({
      data: {
        month: prevMonth,
        year: prevYear,
        accountId,
        action: 'CARRY_OVER'
      }
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error carrying over balance:', error);
    return { success: false, error: 'Error al pasar el saldo' };
  }
}

// Manda el saldo a una meta de ahorro (en el último día del mes pasado)
export async function sendBalanceToSavings(prevMonth: number, prevYear: number, amount: number, savingsGoalId: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { profiles: true }
    });
    if (!account || account.profiles.length === 0) throw new Error('No profile found');
    const profileId = account.profiles[0].id;

    const goal = await prisma.savingsGoal.findUnique({ where: { id: savingsGoalId } });
    if (!goal) throw new Error('Meta no encontrada');

    // La fecha de depósito será el último día del mes que sobró
    const lastDay = new Date(prevYear, prevMonth, 0).getDate();
    const date = new Date(prevYear, prevMonth - 1, lastDay, 23, 59, 59);

    await prisma.savingsTransaction.create({
      data: {
        amount,
        type: 'DEPOSITO',
        description: `Sobrante del mes ${prevMonth}/${prevYear}`,
        savingsGoalId,
        profileId,
        date // Asignar fecha en el modelo
      }
    });

    await prisma.savingsGoal.update({
      where: { id: savingsGoalId },
      data: { currentAmount: goal.currentAmount + amount }
    });

    await prisma.monthClose.create({
      data: {
        month: prevMonth,
        year: prevYear,
        accountId,
        action: 'SAVINGS'
      }
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error sending balance to savings:', error);
    return { success: false, error: 'Error al enviar a ahorros' };
  }
}

// Ignorar el balance sobrante
export async function ignoreBalance(prevMonth: number, prevYear: number) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    await prisma.monthClose.create({
      data: {
        month: prevMonth,
        year: prevYear,
        accountId,
        action: 'IGNORE'
      }
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error ignoring balance:', error);
    return { success: false, error: 'Error al ignorar saldo' };
  }
}
