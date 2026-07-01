'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { ExchangeRateData } from '@/types';
import { getAccountId } from '@/lib/session';

export async function upsertExchangeRate(data: ExchangeRateData) {
  try {
    const rate = await prisma.exchangeRate.upsert({
      where: {
        month_year: {
          month: data.month,
          year: data.year,
        },
      },
      update: {
        usdToArs: data.usdToArs,
        eurToArs: data.eurToArs,
        eurToUsd: data.eurToUsd,
      },
      create: {
        month: data.month,
        year: data.year,
        usdToArs: data.usdToArs,
        eurToArs: data.eurToArs,
        eurToUsd: data.eurToUsd,
      },
    });
    revalidatePath('/configuracion');
    revalidatePath('/dashboard');
    return { success: true, data: rate };
  } catch (error) {
    console.error('Error upserting exchange rate:', error);
    return { success: false, error: 'Error al guardar tipo de cambio' };
  }
}

export async function getExchangeRates() {
  try {
    return await prisma.exchangeRate.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return [];
  }
}

export async function fetchLiveExchangeRates() {
  try {
    const [usdRes, eurRes] = await Promise.all([
      fetch('https://dolarapi.com/v1/dolares/blue', { next: { revalidate: 3600 } }),
      fetch('https://dolarapi.com/v1/cotizaciones/eur', { next: { revalidate: 3600 } })
    ]);
    
    if (!usdRes.ok || !eurRes.ok) throw new Error('API fetching failed');

    const usdData = await usdRes.json();
    const eurData = await eurRes.json();

    const usdToArs = usdData.venta;
    const eurToArs = eurData.venta;
    const eurToUsd = Number((eurToArs / usdToArs).toFixed(4));

    return { usdToArs, eurToArs, eurToUsd };
  } catch (error) {
    console.error('Error fetching live rates:', error);
    return null;
  }
}

export async function getCurrentExchangeRate() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  try {
    const rate = await prisma.exchangeRate.findUnique({
      where: {
        month_year: {
          month: currentMonth,
          year: currentYear,
        },
      },
    });

    const todayStr = now.toISOString().split('T')[0];
    const rateUpdatedStr = rate ? rate.updatedAt.toISOString().split('T')[0] : null;

    // Si no hay cotización para el mes o no se actualizó hoy, traemos de la API
    if (!rate || rateUpdatedStr !== todayStr) {
      const liveRates = await fetchLiveExchangeRates();
      if (liveRates) {
        return await prisma.exchangeRate.upsert({
          where: { month_year: { month: currentMonth, year: currentYear } },
          update: liveRates,
          create: {
            month: currentMonth,
            year: currentYear,
            ...liveRates
          }
        });
      }
    }

    return rate;
  } catch (error) {
    console.error('Error fetching current exchange rate:', error);
    return null;
  }
}

// Categorías
export async function createCategory(data: { name: string; icon: string; color: string }) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const category = await prisma.category.create({
      data: { ...data, accountId },
    });
    revalidatePath('/configuracion');
    revalidatePath('/gastos');
    return { success: true, data: category };
  } catch (error) {
    console.error('Error creating category:', error);
    return { success: false, error: 'Error al crear categoría' };
  }
}

export async function deleteCategory(id: string) {
  try {
    await prisma.category.delete({ where: { id } });
    revalidatePath('/configuracion');
    return { success: true };
  } catch (error) {
    console.error('Error deleting category:', error);
    return { success: false, error: 'Error al eliminar categoría (puede tener gastos asociados)' };
  }
}

// Budget Config
export async function updateBudgetConfig(data: {
  profileId: string;
  firstHalfBudget: number;
  secondHalfBudget: number;
  isActive?: boolean;
}) {
  try {
    const config = await prisma.budgetConfig.upsert({
      where: { profileId: data.profileId },
      update: {
        firstHalfBudget: data.firstHalfBudget,
        secondHalfBudget: data.secondHalfBudget,
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      create: {
        profileId: data.profileId,
        firstHalfBudget: data.firstHalfBudget,
        secondHalfBudget: data.secondHalfBudget,
        isActive: data.isActive ?? true,
      },
    });
    revalidatePath('/configuracion');
    revalidatePath('/dashboard');
    return { success: true, data: config };
  } catch (error) {
    console.error('Error updating budget config:', error);
    return { success: false, error: 'Error al actualizar presupuesto' };
  }
}

// Split Mode Config
export async function updateSplitMode(data: {
  splitMode: 'FONDO_COMUN' | 'PORCENTAJE';
  splitPercentA: number;
  splitPercentB: number;
}) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    await prisma.account.update({
      where: { id: accountId },
      data: {
        splitMode: data.splitMode,
        splitPercentA: data.splitPercentA,
        splitPercentB: data.splitPercentB,
      },
    });
    revalidatePath('/configuracion');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error updating split mode:', error);
    return { success: false, error: 'Error al actualizar modo de división' };
  }
}
