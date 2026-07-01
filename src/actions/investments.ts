'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { InvestmentFormData } from '@/types';

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
