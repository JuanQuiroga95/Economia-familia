'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { IncomeFormData } from '@/types';

export async function createIncome(data: IncomeFormData) {
  try {
    const income = await prisma.income.create({
      data: {
        amount: data.amount,
        currency: data.currency,
        date: new Date(data.date),
        description: data.description,
        profileId: data.profileId,
      },
    });
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
    const where: Record<string, unknown> = {};

    if (filters?.profileId) {
      where.profileId = filters.profileId;
    }

    if (filters?.month && filters?.year) {
      const startDate = new Date(filters.year, filters.month - 1, 1);
      const endDate = new Date(filters.year, filters.month, 0, 23, 59, 59);
      where.date = { gte: startDate, lte: endDate };
    }

    const incomes = await prisma.income.findMany({
      where,
      include: { profile: true },
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
    const income = await prisma.income.update({
      where: { id },
      data: {
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.currency && { currency: data.currency }),
        ...(data.date && { date: new Date(data.date) }),
        ...(data.description && { description: data.description }),
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
    await prisma.income.delete({ where: { id } });
    revalidatePath('/ingresos');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error deleting income:', error);
    return { success: false, error: 'Error al eliminar ingreso' };
  }
}
