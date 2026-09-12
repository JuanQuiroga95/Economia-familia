'use server';

import { prisma } from '@/lib/prisma';
import { getAccountId } from '@/lib/session';
import { getArgDate } from '@/lib/dateUtils';
import { addMonths } from '@/lib/periodUtils';
import { mesDePresupuesto } from '@/lib/budgetPeriod';
import { getPaydayDeLaCuenta } from '@/lib/accountPeriod';
import { getBudgetStatus } from './dashboard';
import { revalidatePath } from 'next/cache';
import type { BudgetCloseStatus } from '@/types';

/** El perfil tiene que ser de la cuenta de quien está mirando. */
async function perfilDeLaCuenta(profileId: string) {
  const accountId = await getAccountId();
  if (!accountId) return null;
  return prisma.profile.findFirst({ where: { id: profileId, accountId } });
}

/**
 * El último mes de presupuesto que ya terminó y todavía no se cerró.
 *
 * El mes de presupuesto va de día de cobro a día de cobro, así que el de
 * agosto termina el 30 y el 31 ya arranca el de septiembre.
 */
export async function getBudgetCloseStatus(
  profileId: string
): Promise<BudgetCloseStatus | null> {
  try {
    if (!(await perfilDeLaCuenta(profileId))) return null;

    // El mes de presupuesto de esta persona: si eligió su propio día de cobro,
    // su mes termina otro día que el de la cuenta.
    const config = await prisma.budgetConfig.findUnique({ where: { profileId } });
    const payday = config?.payday ?? (await getPaydayDeLaCuenta());
    const enCurso = mesDePresupuesto(getArgDate(), payday);
    const cerrado = addMonths(enCurso.month, enCurso.year, -1);

    const yaCerrado = await prisma.budgetClose.findUnique({
      where: {
        profileId_month_year: { profileId, month: cerrado.month, year: cerrado.year },
      },
    });
    if (yaCerrado) return null;

    const estado = await getBudgetStatus(profileId, cerrado.month, cerrado.year);
    if (!estado) return null;

    // Un mes sin un solo gasto no se ofrece cerrar, pero tampoco se marca como
    // cerrado: si más tarde aparece un gasto de ese mes, el aviso vuelve.
    if (estado.spent === 0) return null;

    return {
      profileId,
      profileName: estado.profileName,
      month: cerrado.month,
      year: cerrado.year,
      periodo: estado.periodo,
      budget: estado.budget,
      spent: estado.spent,
      leftover: estado.remaining,
      currency: estado.currency,
    };
  } catch (error) {
    console.error('Error checking budget close status:', error);
    return null;
  }
}

/**
 * Cierra el mes de presupuesto de un perfil.
 *
 * `ARRASTRAR` suma lo que sobró a la primera quincena del mes siguiente;
 * `IGNORAR` sólo deja constancia de cómo terminó y hace desaparecer el aviso.
 * El sobrante se recalcula acá y no se toma del cliente.
 */
export async function closeBudgetMonth(
  profileId: string,
  month: number,
  year: number,
  action: 'ARRASTRAR' | 'IGNORAR'
) {
  try {
    if (!(await perfilDeLaCuenta(profileId))) {
      return { success: false, error: 'Perfil no encontrado' };
    }

    const estado = await getBudgetStatus(profileId, month, year);
    if (!estado) return { success: false, error: 'Ese perfil no tiene bolsillo activo' };

    await prisma.budgetClose.create({
      data: { profileId, month, year, action, leftover: estado.remaining },
    });

    revalidatePath('/dashboard');
    return { success: true, leftover: estado.remaining };
  } catch (error) {
    console.error('Error closing budget month:', error);
    return { success: false, error: 'Error al cerrar el presupuesto' };
  }
}

/** Deshace un cierre, por si se cerró de más o hay que recargar un gasto. */
export async function reopenBudgetMonth(profileId: string, month: number, year: number) {
  try {
    if (!(await perfilDeLaCuenta(profileId))) {
      return { success: false, error: 'Perfil no encontrado' };
    }

    await prisma.budgetClose.deleteMany({ where: { profileId, month, year } });
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error reopening budget month:', error);
    return { success: false, error: 'Error al reabrir el presupuesto' };
  }
}
