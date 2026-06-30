'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { SavingsGoalFormData } from '@/types';

export async function createSavingsGoal(data: SavingsGoalFormData) {
  try {
    const initialAmount = data.initialAmount || 0;
    const goal = await prisma.savingsGoal.create({
      data: {
        name: data.name,
        targetAmount: data.targetAmount,
        currentAmount: initialAmount,
        currency: data.currency,
        profileId: data.profileId,
      },
    });

    // Si hay monto inicial, crear una transacción de depósito inicial
    if (initialAmount > 0) {
      await prisma.savingsTransaction.create({
        data: {
          amount: initialAmount,
          type: 'DEPOSITO',
          description: 'Saldo inicial',
          savingsGoalId: goal.id,
          profileId: data.profileId,
        },
      });
    }

    revalidatePath('/ahorros');
    return { success: true, data: goal };
  } catch (error) {
    console.error('Error creating savings goal:', error);
    return { success: false, error: 'Error al crear meta de ahorro' };
  }
}

export async function getSavingsGoals(profileId?: string) {
  try {
    const where = profileId ? { profileId } : {};
    return await prisma.savingsGoal.findMany({
      where,
      include: {
        profile: true,
        transactions: { orderBy: { date: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    console.error('Error fetching savings goals:', error);
    return [];
  }
}

export async function addSavingsTransaction(data: {
  savingsGoalId: string;
  amount: number;
  type: 'DEPOSITO' | 'RETIRO';
  description?: string;
  profileId: string;
}) {
  try {
    // Crear la transacción
    await prisma.savingsTransaction.create({
      data: {
        amount: data.amount,
        type: data.type,
        description: data.description,
        savingsGoalId: data.savingsGoalId,
        profileId: data.profileId,
      },
    });

    // Actualizar el monto actual de la meta
    const goal = await prisma.savingsGoal.findUnique({
      where: { id: data.savingsGoalId },
    });

    if (goal) {
      const newAmount =
        data.type === 'DEPOSITO'
          ? goal.currentAmount + data.amount
          : goal.currentAmount - data.amount;

      await prisma.savingsGoal.update({
        where: { id: data.savingsGoalId },
        data: { currentAmount: Math.max(0, newAmount) },
      });
    }

    revalidatePath('/ahorros');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error adding savings transaction:', error);
    return { success: false, error: 'Error al registrar movimiento' };
  }
}

export async function deleteSavingsGoal(id: string) {
  try {
    await prisma.savingsGoal.delete({ where: { id } });
    revalidatePath('/ahorros');
    return { success: true };
  } catch (error) {
    console.error('Error deleting savings goal:', error);
    return { success: false, error: 'Error al eliminar meta' };
  }
}
