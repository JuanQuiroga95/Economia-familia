'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { ExpenseFormData, TransactionFilters } from '@/types';
import { sendPushNotification } from '@/lib/push';

import { parseArgDate } from '@/lib/dateUtils';

export async function createExpense(data: ExpenseFormData) {
  try {
    const expenseDate = parseArgDate(data.date);

    // Si viene de un fondo, descontar primero
    if (data.fundingSource && data.fundingSource !== 'balance') {
      const parts = data.fundingSource.split('_');
      const type = parts[0];
      const sourceId = parts.slice(1).join('_');
      
      if (type === 'ahorro') {
        const goal = await prisma.savingsGoal.findUnique({ where: { id: sourceId } });
        if (!goal) throw new Error('Meta no encontrada');
        if (goal.currentAmount < data.amount) throw new Error('Fondos insuficientes en el ahorro');
        
        await prisma.savingsTransaction.create({
          data: {
            amount: data.amount,
            type: 'RETIRO',
            description: `Gasto: ${data.description}`,
            savingsGoalId: sourceId,
            profileId: data.profileId,
          }
        });
        await prisma.savingsGoal.update({
          where: { id: sourceId },
          data: { currentAmount: goal.currentAmount - data.amount }
        });
        
      } else if (type === 'inversion') {
        const inv = await prisma.investment.findUnique({ where: { id: sourceId } });
        if (!inv) throw new Error('Inversión no encontrada');
        if (inv.amount < data.amount) throw new Error('Fondos insuficientes en la inversión');
        
        await prisma.investment.update({
          where: { id: sourceId },
          data: { amount: inv.amount - data.amount }
        });
      }

      // Crear ingreso "fantasma" para que no afecte el balance mensual
      await prisma.income.create({
        data: {
          amount: data.amount,
          currency: data.currency,
          date: expenseDate,
          description: `Uso de ${type === 'ahorro' ? 'Ahorros' : 'Inversiones'} para: ${data.description}`,
          profileId: data.profileId,
        }
      });
    }

    // Registrar gasto normal
    await prisma.expense.create({
      data: {
        amount: data.amount,
        currency: data.currency,
        date: expenseDate,
        description: data.description,
        categoryId: data.categoryId,
        profileId: data.profileId,
        type: data.type,
        paidFromPersonalBudget: data.type === 'COMPARTIDO' ? data.paidFromPersonalBudget : false,
        splitPercentage: data.type === 'COMPARTIDO' ? data.splitPercentage : null,
        receiptUrl: data.receiptUrl || null,
      },
    });

    try {
      // Notificaciones Push
      const currentProfile = await prisma.profile.findUnique({ 
        where: { id: data.profileId }, 
        include: { account: { include: { profiles: true } } } 
      });
      if (currentProfile && currentProfile.account) {
        const otherProfiles = currentProfile.account.profiles.filter(p => p.id !== data.profileId);
        
        let pushTitle = 'Nuevo gasto';
        let pushBody = `${currentProfile.name} registró un gasto de $${data.amount} en ${data.description}.`;
        
        if (data.type === 'COMPARTIDO' && data.paidFromPersonalBudget) {
          pushTitle = 'Deuda generada al fondo';
          pushBody = `${currentProfile.name} pagó $${data.amount} (${data.description}) con su dinero personal.`;
        }

        for (const op of otherProfiles) {
          await sendPushNotification(op.id, pushTitle, pushBody, '/gastos');
        }
      }
    } catch(pushErr) {
      console.error('Error enviando push:', pushErr);
    }

    revalidatePath('/gastos');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error creating expense:', error);
    return { success: false, error: 'Error al crear gasto' };
  }
}

import { getAccountId } from '@/lib/session';
import { getFinancialMonthRange } from '@/lib/dateUtils';

export async function getExpenses(filters?: TransactionFilters) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const where: any = {
      profile: { accountId },
    };

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

export async function updateExpense(id: string, data: Partial<ExpenseFormData>) {
  try {
    const updateData: any = { ...data };
    if (data.date) {
      updateData.date = parseArgDate(data.date);
    }
    // No permitimos editar fundingSource, ya que eso implica revertir/crear transacciones de ahorro/inversion complejas.
    delete updateData.fundingSource;

    await prisma.expense.update({
      where: { id },
      data: updateData,
    });

    revalidatePath('/gastos');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error updating expense:', error);
    return { success: false, error: 'Error al actualizar gasto' };
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
    const accountId = await getAccountId();
    let cats = await prisma.category.findMany({
      where: accountId ? { accountId } : {},
      orderBy: { name: 'asc' },
    });

    if (cats.length === 0 && accountId) {
       const defaultCats = [
         { name: 'Supermercado', icon: '🛒', color: '#3b82f6', accountId },
         { name: 'Transporte', icon: '🚌', color: '#8b5cf6', accountId },
         { name: 'Servicios', icon: '💡', color: '#eab308', accountId },
         { name: 'Comida', icon: '🍔', color: '#f97316', accountId },
         { name: 'Salud', icon: '💊', color: '#ef4444', accountId },
         { name: 'Educación', icon: '📚', color: '#06b6d4', accountId },
         { name: 'Ocio', icon: '🎭', color: '#ec4899', accountId },
         { name: 'Otros', icon: '📦', color: '#6366f1', accountId },
       ];
       await prisma.category.createMany({ data: defaultCats });
       cats = await prisma.category.findMany({ where: { accountId }, orderBy: { name: 'asc' } });
    }

    return cats;
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}
