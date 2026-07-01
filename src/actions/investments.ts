'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { InvestmentFormData } from '@/types';
import { getArgDate } from '@/lib/dateUtils';

export async function createInvestment(data: InvestmentFormData) {
  try {
    const investment = await prisma.investment.create({
      data: {
        name: data.name,
        type: data.type,
        amount: data.amount,
        currency: data.currency,
        returnRate: data.returnRate,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        notes: data.notes,
        profileId: data.profileId,
      },
    });
    revalidatePath('/inversiones');
    revalidatePath('/dashboard');
    return { success: true, data: investment };
  } catch (error) {
    console.error('Error creating investment:', error);
    return { success: false, error: 'Error al crear inversión' };
  }
}

import { getAccountId } from '@/lib/session';

export async function getInvestments(profileId?: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const where: any = {
      profile: { accountId },
    };
    if (profileId) {
      where.profileId = profileId;
    }
    return await prisma.investment.findMany({
      where,
      include: { profile: true },
      orderBy: { startDate: 'desc' },
    });
  } catch (error) {
    console.error('Error fetching investments:', error);
    return [];
  }
}

export async function deleteInvestment(id: string) {
  try {
    await prisma.investment.delete({ where: { id } });
    revalidatePath('/inversiones');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error deleting investment:', error);
    return { success: false, error: 'Error al eliminar inversión' };
  }
}

export async function updateInvestment(id: string, data: Partial<InvestmentFormData>) {
  try {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.returnRate !== undefined) updateData.returnRate = data.returnRate;
    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.profileId !== undefined) updateData.profileId = data.profileId;

    const investment = await prisma.investment.update({
      where: { id },
      data: updateData,
    });
    
    revalidatePath('/inversiones');
    revalidatePath('/dashboard');
    return { success: true, data: investment };
  } catch (error) {
    console.error('Error updating investment:', error);
    return { success: false, error: 'Error al actualizar inversión' };
  }
}

export async function withdrawToBalanceFromInvestment(investmentId: string, amount: number, profileId: string) {
  try {
    const inv = await prisma.investment.findUnique({ where: { id: investmentId } });
    if (!inv) throw new Error('Inversión no encontrada');
    if (inv.amount < amount) throw new Error('Fondos insuficientes en la inversión');

    // 1. Restar el monto de la inversión
    await prisma.investment.update({
      where: { id: investmentId },
      data: { amount: inv.amount - amount },
    });

    // 2. Crear ingreso en balance
    await prisma.income.create({
      data: {
        amount,
        currency: inv.currency,
        date: getArgDate(),
        description: `Rescate desde inversión: ${inv.name}`,
        profileId,
      },
    });

    revalidatePath('/inversiones');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: any) {
    console.error('Error withdrawing from investment:', error);
    return { success: false, error: error.message || 'Error al rescatar fondos' };
  }
}
