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
    const res = await fetch('https://api.bluelytics.com.ar/v2/latest', { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error('API fetching failed');

    const data = await res.json();
    const usdToArs = data.blue.value_sell;
    const eurToArs = data.blue_euro.value_sell;
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

    // Se refresca si no hay cotización del mes o si la guardada no es de hoy.
    // (Antes también refrescaba cuando el dólar valía exactamente 1200, que era
    // el valor de prueba: el día que el blue llegue a ese número pegaría a la
    // API en cada request.)
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
    if (!data.name?.trim()) return { success: false, error: 'Poné un nombre' };

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
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const categoria = await prisma.category.findFirst({ where: { id, accountId } });
    if (!categoria) return { success: false, error: 'Categoría no encontrada' };

    await prisma.category.delete({ where: { id } });
    revalidatePath('/configuracion');
    revalidatePath('/gastos');
    return { success: true };
  } catch (error) {
    console.error('Error deleting category:', error);
    return { success: false, error: 'Error al eliminar categoría (puede tener gastos asociados)' };
  }
}

// Budget Config
export async function updateBudgetConfig(data: {
  profileId: string;
  budgetType?: string;
  monthlyBudget?: number;
  firstHalfBudget: number;
  secondHalfBudget: number;
  extraBudget?: number;
  isActive?: boolean;
}) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const perfil = await prisma.profile.findFirst({
      where: { id: data.profileId, accountId },
    });
    if (!perfil) return { success: false, error: 'Perfil no encontrado' };

    const config = await prisma.budgetConfig.upsert({
      where: { profileId: data.profileId },
      update: {
        ...(data.budgetType !== undefined && { budgetType: data.budgetType }),
        ...(data.monthlyBudget !== undefined && { monthlyBudget: data.monthlyBudget }),
        firstHalfBudget: data.firstHalfBudget,
        secondHalfBudget: data.secondHalfBudget,
        ...(data.extraBudget !== undefined && { extraBudget: data.extraBudget }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      create: {
        profileId: data.profileId,
        budgetType: data.budgetType ?? 'QUINCENAL',
        monthlyBudget: data.monthlyBudget ?? 0,
        firstHalfBudget: data.firstHalfBudget,
        secondHalfBudget: data.secondHalfBudget,
        extraBudget: data.extraBudget ?? 0,
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
  showSplitBalance: boolean;
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
        showSplitBalance: data.showSplitBalance,
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
