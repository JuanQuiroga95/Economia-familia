'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { ExpenseFormData, TransactionFilters } from '@/types';

export async function createExpense(data: ExpenseFormData) {
  try {
    // Gastos compartidos: un solo registro (no se duplica para el otro perfil)
    // El gasto va al "fondo compartido". Si paidFromPersonalBudget = true,
    // el fondo le debe ese monto al perfil que lo pagó.
    await prisma.expense.create({
      data: {
        amount: data.amount,
        currency: data.currency,
        date: require('@/lib/dateUtils').parseArgDate(data.date),
        description: data.description,
        categoryId: data.categoryId,
        profileId: data.profileId,
        type: data.type,
        paidFromPersonalBudget: data.type === 'COMPARTIDO' ? data.paidFromPersonalBudget : false,
        receiptUrl: data.receiptUrl || null,
      },
    });

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
      const { getFinancialMonthRange } = require('@/lib/dateUtils');
      const { startDate, endDate } = getFinancialMonthRange(filters.month, filters.year);
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
