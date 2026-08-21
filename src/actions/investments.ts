'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { InvestmentFormData } from '@/types';
import { parseArgDate } from '@/lib/dateUtils';
import { getAccountId } from '@/lib/session';

/** La inversión tiene que ser de un perfil de esta cuenta. */
async function inversionPropia(id: string, accountId: string) {
  return prisma.investment.findFirst({ where: { id, profile: { accountId } } });
}

async function perfilPropio(profileId: string, accountId: string) {
  return prisma.profile.findFirst({ where: { id: profileId, accountId } });
}

function revalidar() {
  revalidatePath('/inversiones');
  revalidatePath('/ahorros');
  revalidatePath('/dashboard');
}

export async function createInvestment(data: InvestmentFormData) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    if (!(await perfilPropio(data.profileId, accountId))) {
      return { success: false, error: 'Perfil no encontrado' };
    }
    if (!data.amount || data.amount <= 0) {
      return { success: false, error: 'El monto tiene que ser mayor a cero' };
    }

    const investment = await prisma.investment.create({
      data: {
        name: data.name,
        type: data.type,
        amount: data.amount,
        currency: data.currency,
        returnRate: data.returnRate,
        // parseArgDate, igual que el resto de la app: con `new Date("YYYY-MM-DD")`
        // la fecha se interpretaba a medianoche UTC y una inversión del día 1
        // caía fuera del mes.
        startDate: parseArgDate(data.startDate),
        endDate: data.endDate ? parseArgDate(data.endDate) : null,
        notes: data.notes,
        profileId: data.profileId,
      },
    });

    revalidar();
    return { success: true, data: investment };
  } catch (error) {
    console.error('Error creating investment:', error);
    return { success: false, error: 'Error al crear inversión' };
  }
}

export async function getInvestments(profileId?: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const where: Record<string, unknown> = { profile: { accountId } };
    if (profileId) where.profileId = profileId;

    return await prisma.investment.findMany({
      where,
      include: {
        profile: true,
        transactions: { orderBy: { date: 'desc' }, include: { profile: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  } catch (error) {
    console.error('Error fetching investments:', error);
    return [];
  }
}

export async function deleteInvestment(id: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };
    if (!(await inversionPropia(id, accountId))) {
      return { success: false, error: 'Inversión no encontrada' };
    }

    await prisma.investment.delete({ where: { id } });
    revalidar();
    return { success: true };
  } catch (error) {
    console.error('Error deleting investment:', error);
    return { success: false, error: 'Error al eliminar inversión' };
  }
}

export async function updateInvestment(id: string, data: Partial<InvestmentFormData>) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };
    if (!(await inversionPropia(id, accountId))) {
      return { success: false, error: 'Inversión no encontrada' };
    }

    if (data.amount !== undefined && data.amount <= 0) {
      return { success: false, error: 'El monto tiene que ser mayor a cero' };
    }
    if (data.profileId && !(await perfilPropio(data.profileId, accountId))) {
      return { success: false, error: 'Perfil no encontrado' };
    }

    const investment = await prisma.investment.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.returnRate !== undefined ? { returnRate: data.returnRate } : {}),
        ...(data.startDate !== undefined ? { startDate: parseArgDate(data.startDate) } : {}),
        ...(data.endDate !== undefined
          ? { endDate: data.endDate ? parseArgDate(data.endDate) : null }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.profileId !== undefined ? { profileId: data.profileId } : {}),
      },
    });

    revalidar();
    return { success: true, data: investment };
  } catch (error) {
    console.error('Error updating investment:', error);
    return { success: false, error: 'Error al actualizar inversión' };
  }
}

/**
 * Saca plata de una inversión y la devuelve al balance del mes.
 *
 * Deja un movimiento registrado (antes solo restaba el monto y la plata
 * desaparecía del reporte si la inversión era de un mes anterior).
 */
export async function withdrawToBalanceFromInvestment(
  investmentId: string,
  amount: number,
  profileId: string
) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const inv = await inversionPropia(investmentId, accountId);
    if (!inv) return { success: false, error: 'Inversión no encontrada' };
    if (!(await perfilPropio(profileId, accountId))) {
      return { success: false, error: 'Perfil no encontrado' };
    }
    if (!amount || amount <= 0) {
      return { success: false, error: 'El monto tiene que ser mayor a cero' };
    }
    if (inv.amount < amount) {
      return { success: false, error: 'No hay fondos suficientes en la inversión' };
    }

    await prisma.investmentTransaction.create({
      data: {
        amount,
        type: 'RETIRO',
        description: 'Rescate al balance',
        investmentId,
        profileId,
      },
    });

    await prisma.investment.update({
      where: { id: investmentId },
      data: { amount: inv.amount - amount },
    });

    revalidar();
    return { success: true };
  } catch (error) {
    console.error('Error withdrawing from investment:', error);
    return { success: false, error: 'Error al rescatar fondos' };
  }
}

/** Suma plata a una inversión existente. La descuenta del balance del mes. */
export async function depositToInvestment(
  investmentId: string,
  amount: number,
  profileId: string
) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const inv = await inversionPropia(investmentId, accountId);
    if (!inv) return { success: false, error: 'Inversión no encontrada' };
    if (!(await perfilPropio(profileId, accountId))) {
      return { success: false, error: 'Perfil no encontrado' };
    }
    if (!amount || amount <= 0) {
      return { success: false, error: 'El monto tiene que ser mayor a cero' };
    }

    await prisma.investmentTransaction.create({
      data: {
        amount,
        type: 'DEPOSITO',
        description: 'Aporte a la inversión',
        investmentId,
        profileId,
      },
    });

    await prisma.investment.update({
      where: { id: investmentId },
      data: { amount: inv.amount + amount },
    });

    revalidar();
    return { success: true };
  } catch (error) {
    console.error('Error depositing to investment:', error);
    return { success: false, error: 'Error al aportar a la inversión' };
  }
}
