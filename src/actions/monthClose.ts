'use server';

import { prisma } from '@/lib/prisma';
import { getAccountId } from '@/lib/session';
import { getDashboardStats } from './dashboard';
import { revalidatePath } from 'next/cache';
import { addMonths, periodIndex } from '@/lib/periodUtils';

/** Hasta cuántos meses para atrás se ofrece cerrar un mes olvidado. */
const MESES_HACIA_ATRAS = 12;

/**
 * Busca el mes más viejo que quedó sin cerrar y todavía tiene saldo a favor.
 *
 * Antes miraba solo el mes anterior: si pasabas 30 días sin entrar, ese mes
 * quedaba colgado para siempre y el sobrante no se arrastraba ni iba a ahorros.
 */
export async function checkPreviousMonthStatus(currentMonth: number, currentYear: number) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return null;

    const cierres = await prisma.monthClose.findMany({
      where: { accountId },
      select: { month: true, year: true },
    });
    const cerrados = new Set(cierres.map((c) => periodIndex(c.month, c.year)));

    // Del más viejo al más nuevo, arrancando por el mes anterior al consultado.
    for (let i = MESES_HACIA_ATRAS; i >= 1; i--) {
      const { month, year } = addMonths(currentMonth, currentYear, -i);
      if (cerrados.has(periodIndex(month, year))) continue;

      const stats = await getDashboardStats(month, year);
      if (stats.balance > 0) {
        return { month, year, balance: stats.balance };
      }

      // Un mes sin sobrante se marca como visto para no volver a calcularlo.
      await prisma.monthClose
        .create({ data: { month, year, accountId, action: 'IGNORE' } })
        .catch(() => {});
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

    // El ingreso entra el día 1 del mes siguiente al que sobró.
    const siguiente = addMonths(prevMonth, prevYear, 1);
    const date = new Date(siguiente.year, siguiente.month - 1, 1, 12, 0, 0);

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
