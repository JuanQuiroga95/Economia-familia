'use server';
import { prisma } from '@/lib/prisma';
import { getAccountId } from '@/lib/session';
import { revalidatePath } from 'next/cache';

export async function setCategoryBudget(categoryId: string, month: number, year: number, amount: number) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    await prisma.categoryBudget.upsert({
      where: {
        accountId_categoryId_month_year: {
          accountId,
          categoryId,
          month,
          year,
        },
      },
      update: {
        amount,
        accountId,
      },
      create: {
        categoryId,
        month,
        year,
        amount,
        accountId,
      },
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error setting category budget:', error);
    return { success: false, error: 'Error al establecer límite de categoría' };
  }
}

export async function getCategoryBudgets(month: number, year: number) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    return await prisma.categoryBudget.findMany({
      where: {
        accountId,
        month,
        year,
      },
      include: {
        category: true,
      },
    });
  } catch (error) {
    console.error('Error fetching category budgets:', error);
    return [];
  }
}
