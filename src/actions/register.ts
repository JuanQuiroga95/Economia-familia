'use server';

import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export interface RegisterData {
  label: string;
  username: string;
  password: string;
  profileNames: string[];
  budgets?: { firstHalf: number; secondHalf: number }[];
}

export async function registerAccount(data: RegisterData) {
  try {
    const { label, username, password, profileNames, budgets } = data;

    if (!label || !username || !password || !profileNames || profileNames.length === 0) {
      return { success: false, error: 'Todos los campos son obligatorios' };
    }

    const existingAccount = await prisma.account.findUnique({
      where: { username },
    });

    if (existingAccount) {
      return { success: false, error: 'El nombre de usuario ya está en uso' };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      // Create Account
      const account = await tx.account.create({
        data: {
          username,
          password: hashedPassword,
          label,
          splitMode: profileNames.length > 1 ? 'FONDO_COMUN' : 'PORCENTAJE',
        },
      });

      // Create default categories
      const defaultCategories = [
        { name: 'Supermercado', icon: '🛒', color: '#3b82f6' },
        { name: 'Transporte', icon: '🚌', color: '#eab308' },
        { name: 'Servicios', icon: '💡', color: '#f97316' },
        { name: 'Comida', icon: '🍔', color: '#ef4444' },
        { name: 'Ahorro / Inversión', icon: '🐷', color: '#22c55e' },
        { name: 'Otros', icon: '📦', color: '#6366f1' },
      ];

      for (const cat of defaultCategories) {
        await tx.category.create({
          data: { ...cat, accountId: account.id },
        });
      }

      // Create Profiles and their BudgetConfigs
      for (let i = 0; i < profileNames.length; i++) {
        const name = profileNames[i];
        const profile = await tx.profile.create({
          data: {
            name,
            accountId: account.id,
          },
        });

        const budget = budgets?.[i] || { firstHalf: 0, secondHalf: 0 };

        await tx.budgetConfig.create({
          data: {
            profileId: profile.id,
            firstHalfBudget: budget.firstHalf,
            secondHalfBudget: budget.secondHalf,
            extraBudget: 0,
            isActive: budget.firstHalf > 0 || budget.secondHalf > 0,
          },
        });
      }

      return account;
    });

    return { success: true, data: { id: result.id, username: result.username } };
  } catch (error) {
    console.error('Error during registration:', error);
    return { success: false, error: 'Ocurrió un error al crear la cuenta' };
  }
}
