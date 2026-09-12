'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getAccountId } from '@/lib/session';
import { getBudgetStatus } from './dashboard';

/** El perfil tiene que ser de la cuenta de quien está mirando. */
async function perfilDeLaCuenta(profileId: string) {
  const accountId = await getAccountId();
  if (!accountId) return null;
  return prisma.profile.findFirst({ where: { id: profileId, accountId } });
}

/**
 * Trae plata de la quincena que viene al bolsillo de ahora.
 *
 * No es un gasto ni un ingreso: sólo mueve el límite de una quincena a la otra,
 * así que el mes sigue cerrando por el mismo total. El tope se recalcula acá y
 * no se toma del cliente.
 */
export async function createBudgetAdvance(data: {
  profileId: string;
  amount: number;
  note?: string;
}) {
  try {
    if (!(await perfilDeLaCuenta(data.profileId))) {
      return { success: false, error: 'Perfil no encontrado' };
    }
    if (!data.amount || data.amount <= 0) {
      return { success: false, error: 'El monto tiene que ser mayor a cero' };
    }

    // Siempre sobre la quincena en curso: adelantarle plata a un mes ya cerrado
    // no querría decir nada.
    const estado = await getBudgetStatus(data.profileId);
    if (!estado) return { success: false, error: 'Ese perfil no tiene bolsillo activo' };

    if (data.amount > estado.adelantoDisponible) {
      return {
        success: false,
        error: `No podés adelantar más de $${estado.adelantoDisponible.toLocaleString('es-AR')}: es lo que le queda a la quincena que viene`,
      };
    }

    await prisma.budgetAdvance.create({
      data: {
        profileId: data.profileId,
        month: estado.month,
        year: estado.year,
        half: estado.budgetType === 'MENSUAL' ? 0 : estado.currentHalf,
        amount: data.amount,
        note: data.note?.trim() || null,
      },
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error creating budget advance:', error);
    return { success: false, error: 'Error al adelantar la plata' };
  }
}

/** Devuelve un adelanto: el límite vuelve a quedar como estaba en las dos puntas. */
export async function deleteBudgetAdvance(id: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const adelanto = await prisma.budgetAdvance.findFirst({
      where: { id, profile: { accountId } },
    });
    if (!adelanto) return { success: false, error: 'Adelanto no encontrado' };

    await prisma.budgetAdvance.delete({ where: { id } });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error deleting budget advance:', error);
    return { success: false, error: 'Error al devolver el adelanto' };
  }
}

/** Los adelantos que le entraron a un período, para poder deshacerlos. */
export async function getBudgetAdvances(profileId: string, month: number, year: number, half: number) {
  try {
    if (!(await perfilDeLaCuenta(profileId))) return [];
    return await prisma.budgetAdvance.findMany({
      where: { profileId, month, year, half },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    console.error('Error fetching budget advances:', error);
    return [];
  }
}
