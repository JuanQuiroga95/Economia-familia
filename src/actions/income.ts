'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { IncomeFormData } from '@/types';
import { sendPushNotification } from '@/lib/push';
import { parseArgDate, getFinancialMonthRange } from '@/lib/dateUtils';
import { getAccountId } from '@/lib/session';

/** El ingreso tiene que pertenecer a un perfil de esta cuenta. */
async function ingresoPropio(id: string, accountId: string) {
  return prisma.income.findFirst({
    where: { id, profile: { accountId } },
    include: { loanPayment: true },
  });
}

export async function createIncome(data: IncomeFormData) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const perfil = await prisma.profile.findFirst({
      where: { id: data.profileId, accountId },
    });
    if (!perfil) return { success: false, error: 'Perfil no encontrado' };

    if (!data.amount || data.amount <= 0) {
      return { success: false, error: 'El monto tiene que ser mayor a cero' };
    }

    const income = await prisma.income.create({
      data: {
        amount: data.amount,
        currency: data.currency,
        date: parseArgDate(data.date),
        description: data.description,
        profileId: data.profileId,
        walletId: data.walletId || null,
        paymentMethod: data.paymentMethod || 'TRANSFERENCIA',
      },
    });

    try {
      // Notificaciones Push
      const otherProfiles = await prisma.profile.findMany({
        where: { accountId, id: { not: data.profileId } },
      });

      const pushTitle = 'Nuevo ingreso registrado';
      const pushBody = `${perfil.name} registró un ingreso de $${data.amount} en concepto de ${data.description}.`;

      for (const op of otherProfiles) {
        await sendPushNotification(op.id, pushTitle, pushBody, '/ingresos');
      }
    } catch (pushErr) {
      console.error('Error enviando push:', pushErr);
    }

    revalidatePath('/ingresos');
    revalidatePath('/dashboard');
    return { success: true, data: income };
  } catch (error) {
    console.error('Error creating income:', error);
    return { success: false, error: 'Error al crear ingreso' };
  }
}

export async function getIncomes(filters?: {
  month?: number;
  year?: number;
  profileId?: string;
}) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const where: Record<string, unknown> = {
      profile: { accountId },
    };

    if (filters?.profileId) where.profileId = filters.profileId;

    if (filters?.month && filters?.year) {
      const { startDate, endDate } = getFinancialMonthRange(filters.month, filters.year);
      where.date = { gte: startDate, lte: endDate };
    }

    const incomes = await prisma.income.findMany({
      where,
      include: {
        profile: true,
        // Para marcar en la lista los ingresos que nacieron de cobrar la cuota
        // de un préstamo otorgado, que no se editan acá.
        loanPayment: { select: { id: true, loan: { select: { name: true } } } },
      },
      orderBy: { date: 'desc' },
    });

    return incomes;
  } catch (error) {
    console.error('Error fetching incomes:', error);
    return [];
  }
}

export async function updateIncome(id: string, data: Partial<IncomeFormData>) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const actual = await ingresoPropio(id, accountId);
    if (!actual) return { success: false, error: 'Ingreso no encontrado' };

    if (actual.loanPayment) {
      return {
        success: false,
        error: 'Este ingreso es el cobro de una cuota. Editalo desde la sección Préstamos.',
      };
    }

    if (data.amount !== undefined && data.amount <= 0) {
      return { success: false, error: 'El monto tiene que ser mayor a cero' };
    }

    if (data.profileId) {
      const perfil = await prisma.profile.findFirst({
        where: { id: data.profileId, accountId },
      });
      if (!perfil) return { success: false, error: 'Perfil no encontrado' };
    }

    const income = await prisma.income.update({
      where: { id },
      data: {
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.currency ? { currency: data.currency } : {}),
        ...(data.date ? { date: parseArgDate(data.date) } : {}),
        ...(data.description ? { description: data.description } : {}),
        ...(data.profileId ? { profileId: data.profileId } : {}),
        ...(data.walletId !== undefined ? { walletId: data.walletId || null } : {}),
        ...(data.paymentMethod ? { paymentMethod: data.paymentMethod } : {}),
      },
    });

    revalidatePath('/ingresos');
    revalidatePath('/dashboard');
    return { success: true, data: income };
  } catch (error) {
    console.error('Error updating income:', error);
    return { success: false, error: 'Error al actualizar ingreso' };
  }
}

export async function deleteIncome(id: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const actual = await ingresoPropio(id, accountId);
    if (!actual) return { success: false, error: 'Ingreso no encontrado' };

    await prisma.income.delete({ where: { id } });

    revalidatePath('/ingresos');
    revalidatePath('/dashboard');
    revalidatePath('/prestamos');
    return { success: true };
  } catch (error) {
    console.error('Error deleting income:', error);
    return { success: false, error: 'Error al eliminar ingreso' };
  }
}
