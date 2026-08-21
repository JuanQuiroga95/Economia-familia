'use server';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAccountId } from '@/lib/session';
import { parseArgDate, getArgDate, getCurrentFinancialMonth } from '@/lib/dateUtils';
import { addMonths, periodIndex } from '@/lib/periodUtils';
import { revalidatePath } from 'next/cache';

export type PlannedKind = 'FIJO' | 'EVENTUAL';
export type PlannedStatus = 'PENDIENTE' | 'HECHO' | 'OMITIDO';

function revalidateAgenda() {
  revalidatePath('/agenda');
  revalidatePath('/dashboard');
}

/** Categoría para los gastos que se registran desde la agenda sin categoría propia. */
async function getFallbackCategory(accountId: string) {
  const otros = await prisma.category.findFirst({ where: { accountId, name: 'Otros' } });
  if (otros) return otros;

  const any = await prisma.category.findFirst({ where: { accountId } });
  if (any) return any;

  return prisma.category.create({
    data: { name: 'Otros', icon: '📦', color: '#6b7280', accountId },
  });
}

/**
 * Clona en el mes pedido los ítems marcados como "se repite todos los meses"
 * que todavía no tienen su copia. Se toma la última aparición de cada serie,
 * así lo que se edita o se da de baja no vuelve a aparecer.
 */
async function ensureRecurringItems(accountId: string, month: number, year: number) {
  const target = periodIndex(month, year);

  // No se clonan fijos hacia meses muy lejanos: mirar diciembre no tiene que
  // llenar la base de ítems de todo el año.
  const actual = getCurrentFinancialMonth(getArgDate());
  if (target > periodIndex(actual.month, actual.year) + 1) return;

  const series = await prisma.plannedExpense.findMany({
    where: { accountId, seriesId: { not: null } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  const latestBySeries = new Map<string, (typeof series)[number]>();
  const ocupados = new Map<string, Set<number>>();

  for (const item of series) {
    const key = item.seriesId!;
    if (!latestBySeries.has(key)) latestBySeries.set(key, item);
    if (!ocupados.has(key)) ocupados.set(key, new Set());
    ocupados.get(key)!.add(periodIndex(item.month, item.year));
  }

  // Se rellenan TODOS los meses entre la última aparición y el mes pedido.
  // Antes solo se creaba el mes consultado, así que saltar de agosto a octubre
  // dejaba septiembre vacío para siempre.
  const data: Prisma.PlannedExpenseCreateManyInput[] = [];

  for (const item of latestBySeries.values()) {
    if (!item.isRecurring) continue;
    const desde = periodIndex(item.month, item.year);
    if (desde >= target) continue;

    const ya = ocupados.get(item.seriesId!)!;
    for (let idx = desde + 1; idx <= target; idx++) {
      if (ya.has(idx)) continue;
      const periodo = addMonths(item.month, item.year, idx - desde);
      data.push({
        title: item.title,
        amount: item.amount,
        currency: item.currency,
        day: item.day,
        month: periodo.month,
        year: periodo.year,
        kind: item.kind,
        status: 'PENDIENTE' as const,
        notes: item.notes,
        isRecurring: true,
        seriesId: item.seriesId,
        categoryId: item.categoryId,
        accountId,
        profileId: item.profileId,
      });
    }
  }

  if (data.length === 0) return;
  await prisma.plannedExpense.createMany({ data });
}

// ============================================
// ABM de ítems
// ============================================

export interface PlannedExpenseFormData {
  title: string;
  amount?: number | null;
  currency?: string;
  day?: number | null;
  month: number;
  year: number;
  kind: PlannedKind;
  notes?: string;
  isRecurring?: boolean;
  categoryId?: string;
  profileId?: string;
}

export async function createPlannedExpense(data: PlannedExpenseFormData) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };
    if (!data.title?.trim()) return { success: false, error: 'Poné un nombre' };

    const item = await prisma.plannedExpense.create({
      data: {
        title: data.title.trim(),
        amount: data.amount ?? null,
        currency: data.currency || 'ARS',
        day: data.day ? Math.min(31, Math.max(1, data.day)) : null,
        month: data.month,
        year: data.year,
        kind: data.kind,
        notes: data.notes?.trim() || null,
        isRecurring: !!data.isRecurring,
        categoryId: data.categoryId || null,
        profileId: data.profileId || null,
        accountId,
      },
    });

    // La serie se identifica con el id del primer ítem.
    if (data.isRecurring) {
      await prisma.plannedExpense.update({
        where: { id: item.id },
        data: { seriesId: item.id },
      });
    }

    revalidateAgenda();
    return { success: true, data: item };
  } catch (error) {
    console.error('Error creating planned expense:', error);
    return { success: false, error: 'Error al agregar el ítem' };
  }
}

export async function updatePlannedExpense(
  id: string,
  data: Partial<PlannedExpenseFormData> & { applyToSeries?: boolean }
) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const item = await prisma.plannedExpense.findFirst({ where: { id, accountId } });
    if (!item) return { success: false, error: 'Ítem no encontrado' };

    const fields = {
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.amount !== undefined ? { amount: data.amount } : {}),
      ...(data.currency !== undefined ? { currency: data.currency } : {}),
      ...(data.day !== undefined
        ? { day: data.day ? Math.min(31, Math.max(1, data.day)) : null }
        : {}),
      ...(data.kind !== undefined ? { kind: data.kind } : {}),
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId || null } : {}),
      ...(data.profileId !== undefined ? { profileId: data.profileId || null } : {}),
    };

    // Pasar a "se repite" un ítem suelto lo convierte en el inicio de una serie.
    let seriesId = item.seriesId;
    if (data.isRecurring !== undefined && data.isRecurring && !seriesId) seriesId = item.id;

    await prisma.plannedExpense.update({
      where: { id },
      data: {
        ...fields,
        ...(data.isRecurring !== undefined ? { isRecurring: data.isRecurring, seriesId } : {}),
      },
    });

    // "Aplicar a los próximos meses": arrastra el cambio a las copias futuras.
    if (data.applyToSeries && seriesId) {
      await prisma.plannedExpense.updateMany({
        where: {
          accountId,
          seriesId,
          id: { not: id },
          OR: [{ year: { gt: item.year } }, { year: item.year, month: { gt: item.month } }],
        },
        data: fields,
      });
    }

    revalidateAgenda();
    return { success: true };
  } catch (error) {
    console.error('Error updating planned expense:', error);
    return { success: false, error: 'Error al actualizar el ítem' };
  }
}

/**
 * `scope: 'ONE'` borra solo el ítem de este mes.
 * `scope: 'SERIES'` además corta la repetición y limpia los meses siguientes.
 */
export async function deletePlannedExpense(id: string, scope: 'ONE' | 'SERIES' = 'ONE') {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const item = await prisma.plannedExpense.findFirst({ where: { id, accountId } });
    if (!item) return { success: false, error: 'Ítem no encontrado' };

    if (scope === 'SERIES' && item.seriesId) {
      await prisma.plannedExpense.deleteMany({
        where: {
          accountId,
          seriesId: item.seriesId,
          OR: [
            { year: { gt: item.year } },
            { year: item.year, month: { gte: item.month } },
          ],
        },
      });
      // Las apariciones viejas quedan como historial, pero ya no se repiten.
      await prisma.plannedExpense.updateMany({
        where: { accountId, seriesId: item.seriesId },
        data: { isRecurring: false },
      });
    } else {
      await prisma.plannedExpense.delete({ where: { id } });
    }

    revalidateAgenda();
    return { success: true };
  } catch (error) {
    console.error('Error deleting planned expense:', error);
    return { success: false, error: 'Error al eliminar el ítem' };
  }
}

/** Tilda / destilda el ítem. No toca el balance: es solo la marca de la agenda. */
export async function setPlannedStatus(id: string, status: PlannedStatus) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const item = await prisma.plannedExpense.findFirst({ where: { id, accountId } });
    if (!item) return { success: false, error: 'Ítem no encontrado' };

    await prisma.plannedExpense.update({ where: { id }, data: { status } });

    revalidateAgenda();
    return { success: true };
  } catch (error) {
    console.error('Error updating planned status:', error);
    return { success: false, error: 'Error al actualizar el ítem' };
  }
}

// ============================================
// Pasar un ítem previsto a gasto real
// ============================================

export interface RegisterPlannedData {
  id: string;
  amount: number;
  date: string;
  profileId: string;
  type: 'PROPIO' | 'COMPARTIDO';
  paidFromPersonalBudget?: boolean;
  splitPercentage?: number;
  walletId?: string;
  paymentMethod?: 'EFECTIVO' | 'TRANSFERENCIA';
  categoryId?: string;
}

/**
 * Crea el gasto real a partir del ítem de la agenda y lo deja marcado como hecho.
 * Es la única acción de la agenda que impacta en el balance.
 */
export async function registerPlannedAsExpense(data: RegisterPlannedData) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const item = await prisma.plannedExpense.findFirst({ where: { id: data.id, accountId } });
    if (!item) return { success: false, error: 'Ítem no encontrado' };
    if (item.expenseId) return { success: false, error: 'Este ítem ya se registró como gasto' };
    if (!data.amount || data.amount <= 0) return { success: false, error: 'Monto inválido' };

    const profile = await prisma.profile.findFirst({ where: { id: data.profileId, accountId } });
    if (!profile) return { success: false, error: 'Perfil no encontrado' };

    const categoryId = data.categoryId || item.categoryId;
    const category = categoryId
      ? await prisma.category.findFirst({ where: { id: categoryId, accountId } })
      : null;
    const finalCategory = category ?? (await getFallbackCategory(accountId));

    const expense = await prisma.expense.create({
      data: {
        amount: data.amount,
        currency: item.currency,
        date: parseArgDate(data.date),
        description: item.title,
        categoryId: finalCategory.id,
        profileId: data.profileId,
        type: data.type,
        paidFromPersonalBudget:
          data.type === 'COMPARTIDO' ? !!data.paidFromPersonalBudget : false,
        splitPercentage: data.type === 'COMPARTIDO' ? data.splitPercentage ?? null : null,
        walletId: data.walletId || null,
        paymentMethod: data.paymentMethod || 'TRANSFERENCIA',
      },
    });

    // Se guarda lo que se pagó de verdad, no la estimación: si no, el total
    // previsto del mes nunca terminaba de coincidir con lo gastado.
    await prisma.plannedExpense.update({
      where: { id: item.id },
      data: { status: 'HECHO', expenseId: expense.id, amount: data.amount },
    });

    revalidateAgenda();
    revalidatePath('/gastos');
    return { success: true };
  } catch (error) {
    console.error('Error registering planned expense:', error);
    return { success: false, error: 'Error al registrar el gasto' };
  }
}

/** Trae los ítems del mes anterior que no estén ya en este mes. */
export async function copyFromPreviousMonth(month: number, year: number) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const prev = addMonths(month, year, -1);

    const [source, current] = await Promise.all([
      prisma.plannedExpense.findMany({
        where: { accountId, month: prev.month, year: prev.year },
      }),
      prisma.plannedExpense.findMany({
        where: { accountId, month, year },
        select: { title: true, seriesId: true },
      }),
    ]);

    const existingTitles = new Set(current.map((i) => i.title.toLowerCase()));
    const existingSeries = new Set(current.map((i) => i.seriesId).filter(Boolean));

    const toCopy = source.filter(
      (i) =>
        !existingTitles.has(i.title.toLowerCase()) &&
        !(i.seriesId && existingSeries.has(i.seriesId))
    );

    if (toCopy.length === 0) {
      return { success: true, data: { copied: 0 } };
    }

    await prisma.plannedExpense.createMany({
      data: toCopy.map((i) => ({
        title: i.title,
        amount: i.amount,
        currency: i.currency,
        day: i.day,
        month,
        year,
        kind: i.kind,
        status: 'PENDIENTE' as const,
        notes: i.notes,
        isRecurring: i.isRecurring,
        seriesId: i.seriesId,
        categoryId: i.categoryId,
        accountId,
        profileId: i.profileId,
      })),
    });

    revalidateAgenda();
    return { success: true, data: { copied: toCopy.length } };
  } catch (error) {
    console.error('Error copying agenda:', error);
    return { success: false, error: 'Error al copiar el mes anterior' };
  }
}

// ============================================
// Lecturas
// ============================================

export async function getAgenda(month: number, year: number) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return [];

    await ensureRecurringItems(accountId, month, year);

    const items = await prisma.plannedExpense.findMany({
      where: { accountId, month, year },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        profile: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: [{ day: 'asc' }, { createdAt: 'asc' }],
    });

    return items;
  } catch (error) {
    console.error('Error fetching agenda:', error);
    return [];
  }
}

export interface AgendaSummary {
  hasItems: boolean;
  /** Cuánta plata hay que juntar según lo anotado. */
  totalPlanned: number;
  totalDone: number;
  totalPending: number;
  countPending: number;
  countDone: number;
  countTotal: number;
  /** Ítems sin monto estimado: no entran en los totales. */
  countWithoutAmount: number;
  /** Pendientes con fecha dentro de los próximos 7 días o ya vencidos. */
  upcoming: {
    id: string;
    title: string;
    amount: number | null;
    day: number | null;
    icon: string;
    isOverdue: boolean;
    daysLeft: number | null;
  }[];
}

/** Resumen liviano para el dashboard. */
export async function getAgendaSummary(month?: number, year?: number): Promise<AgendaSummary> {
  const empty: AgendaSummary = {
    hasItems: false,
    totalPlanned: 0,
    totalDone: 0,
    totalPending: 0,
    countPending: 0,
    countDone: 0,
    countTotal: 0,
    countWithoutAmount: 0,
    upcoming: [],
  };

  try {
    const accountId = await getAccountId();
    if (!accountId) return empty;

    const today = getArgDate();
    const current = getCurrentFinancialMonth(today);
    const m = month ?? current.month;
    const y = year ?? current.year;

    // Que el dashboard vea los fijos del mes nuevo aunque todavía no hayas abierto la agenda.
    await ensureRecurringItems(accountId, m, y);

    const items = await prisma.plannedExpense.findMany({
      where: { accountId, month: m, year: y },
      include: { category: { select: { icon: true } } },
      orderBy: [{ day: 'asc' }, { createdAt: 'asc' }],
    });
    if (items.length === 0) return empty;

    const summary: AgendaSummary = { ...empty, hasItems: true, upcoming: [] };
    const isCurrentMonth = m === current.month && y === current.year;
    const todayDay = today.getDate();

    for (const item of items) {
      if (item.status === 'OMITIDO') continue;

      const amount = item.amount ?? 0;
      summary.countTotal++;
      if (!item.amount) summary.countWithoutAmount++;
      summary.totalPlanned += amount;

      if (item.status === 'HECHO') {
        summary.countDone++;
        summary.totalDone += amount;
        continue;
      }

      summary.countPending++;
      summary.totalPending += amount;

      const daysLeft = item.day != null && isCurrentMonth ? item.day - todayDay : null;
      const isOverdue = daysLeft != null && daysLeft < 0;
      if (daysLeft == null || daysLeft <= 7) {
        summary.upcoming.push({
          id: item.id,
          title: item.title,
          amount: item.amount,
          day: item.day,
          icon: item.category?.icon || '📌',
          isOverdue,
          daysLeft,
        });
      }
    }

    summary.upcoming = summary.upcoming
      .sort((a, b) => (a.day ?? 99) - (b.day ?? 99))
      .slice(0, 5);

    return summary;
  } catch (error) {
    console.error('Error fetching agenda summary:', error);
    return empty;
  }
}
