'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { ExpenseFormData, TransactionFilters } from '@/types';

export async function createExpense(data: ExpenseFormData) {
  try {
    // Si es compartido, crear dos registros (uno por cada perfil)
    if (data.type === 'COMPARTIDO') {
      const profiles = await prisma.profile.findMany();
      const otherProfile = profiles.find((p) => p.id !== data.profileId);

      if (!otherProfile) {
        return { success: false, error: 'No se encontró el otro perfil' };
      }

      // Gasto para el perfil que lo carga
      await prisma.expense.create({
        data: {
          amount: data.amount,
          currency: data.currency,
          date: new Date(data.date),
          description: data.description,
          categoryId: data.categoryId,
          profileId: data.profileId,
          type: 'COMPARTIDO',
          splitPercent: data.splitPercent,
          receiptUrl: data.receiptUrl || null,
        },
      });

      // Gasto para el otro perfil
      await prisma.expense.create({
        data: {
          amount: data.amount,
          currency: data.currency,
          date: new Date(data.date),
          description: `${data.description} (compartido)`,
          categoryId: data.categoryId,
          profileId: otherProfile.id,
          type: 'COMPARTIDO',
          splitPercent: 100 - data.splitPercent,
          receiptUrl: data.receiptUrl || null,
        },
      });
    } else {
      // Gasto propio
      await prisma.expense.create({
        data: {
          amount: data.amount,
          currency: data.currency,
          date: new Date(data.date),
          description: data.description,
          categoryId: data.categoryId,
          profileId: data.profileId,
          type: 'PROPIO',
          splitPercent: 100,
          receiptUrl: data.receiptUrl || null,
        },
      });
    }

    revalidatePath('/gastos');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error creating expense:', error);
    return { success: false, error: 'Error al crear gasto' };
  }
}

export async function getExpenses(filters?: TransactionFilters) {
  try {
    const where: Record<string, unknown> = {};

    if (filters?.profileId) {
      where.profileId = filters.profileId;
    }

    if (filters?.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.month && filters?.year) {
      const startDate = new Date(filters.year, filters.month - 1, 1);
      const endDate = new Date(filters.year, filters.month, 0, 23, 59, 59);
      where.date = { gte: startDate, lte: endDate };
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        profile: true,
        category: true,
      },
      orderBy: { date: 'desc' },
    });

    return expenses;
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return [];
  }
}

export async function deleteExpense(id: string) {
  try {
    await prisma.expense.delete({ where: { id } });
    revalidatePath('/gastos');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error deleting expense:', error);
    return { success: false, error: 'Error al eliminar gasto' };
  }
}

export async function getCategories() {
  try {
    return await prisma.category.findMany({ orderBy: { name: 'asc' } });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}
