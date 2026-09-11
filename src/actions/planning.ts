'use server';

import { prisma } from '@/lib/prisma';
import { getAccountId } from '@/lib/session';
import { getPaydayDeLaCuenta } from '@/lib/accountPeriod';
import { getArgDate, getCurrentFinancialMonth, getFinancialMonthRange } from '@/lib/dateUtils';
import { categoriaDeConsumo, MONEDA_BASE } from '@/lib/reportFilters';
import { validatePlan, type PlanCell, type PlanningData } from '@/lib/planning';
import { revalidatePath } from 'next/cache';

export async function getPlanning(year: number, month: number): Promise<PlanningData> {
  const accountId = await getAccountId();
  if (!accountId) throw new Error('Iniciá sesión para ver tu planificación.');
  if (!validatePlan(year, [{ categoryId: 'period', month, amount: null }])) throw new Error('Período inválido.');
  const payday = await getPaydayDeLaCuenta();
  const ranges = Array.from({ length: 12 }, (_, i) => getFinancialMonthRange(i + 1, year, payday));
  const date = { gte: ranges[0].startDate, lte: ranges[11].endDate };
  const [categories, budgets, expenses, incomes, agenda] = await Promise.all([
    prisma.category.findMany({ where: { accountId, ...categoriaDeConsumo }, select: { id: true, name: true, icon: true, color: true }, orderBy: { name: 'asc' } }),
    prisma.categoryBudget.findMany({ where: { accountId, year, category: categoriaDeConsumo }, select: { categoryId: true, month: true, amount: true } }),
    prisma.expense.findMany({ where: { profile: { accountId }, date, currency: MONEDA_BASE, category: categoriaDeConsumo }, select: { categoryId: true, date: true, amount: true } }),
    prisma.income.findMany({ where: { profile: { accountId }, date, currency: MONEDA_BASE }, select: { date: true, amount: true } }),
    prisma.plannedExpense.findMany({ where: { accountId, year, currency: MONEDA_BASE, status: { not: 'OMITIDO' }, categoryId: { not: null }, category: categoriaDeConsumo }, select: { categoryId: true, month: true, amount: true } }),
  ]);
  const actuals = new Map<string, { categoryId: string; month: number; amount: number }>();
  const incomeTotals = Array<number>(12).fill(0);
  for (let i = 0; i < 12; i++) {
    const { startDate, endDate } = ranges[i];
    for (const expense of expenses) {
      if (expense.date < startDate || expense.date > endDate) continue;
      const key = `${expense.categoryId}:${i}`;
      const entry = actuals.get(key) ?? { categoryId: expense.categoryId, month: i + 1, amount: 0 };
      entry.amount += expense.amount;
      actuals.set(key, entry);
    }
    incomeTotals[i] = incomes.filter(item => item.date >= startDate && item.date <= endDate).reduce((sum, item) => sum + item.amount, 0);
  }
  const current = getCurrentFinancialMonth(getArgDate(), payday);
  return { year, month, payday, currentMonth: current.month, currentYear: current.year, categories, budgets, actuals: [...actuals.values()], incomes: incomeTotals, agenda: agenda.map(item => ({ categoryId: item.categoryId!, month: item.month, amount: item.amount ?? 0 })) };
}

export async function savePlanning(year: number, cells: PlanCell[]) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'Tu sesión venció. Volvé a ingresar.' };
    if (!validatePlan(year, cells)) return { success: false, error: 'Revisá los importes y el período. Usá números positivos con hasta dos decimales.' };
    const ids = [...new Set(cells.map(cell => cell.categoryId))];
    const categories = await prisma.category.count({ where: { id: { in: ids }, accountId, ...categoriaDeConsumo } });
    if (categories !== ids.length) return { success: false, error: 'Una categoría no pertenece a tu cuenta o no es un gasto de consumo.' };
    await prisma.$transaction(cells.map(cell => cell.amount === null
      ? prisma.categoryBudget.deleteMany({ where: { accountId, year, month: cell.month, categoryId: cell.categoryId } })
      : prisma.categoryBudget.upsert({
        where: { accountId_categoryId_month_year: { accountId, year, month: cell.month, categoryId: cell.categoryId } },
        create: { accountId, year, month: cell.month, categoryId: cell.categoryId, amount: cell.amount },
        update: { amount: cell.amount },
      })));
    for (const path of ['/presupuesto', '/analitica', '/dashboard']) revalidatePath(path);
    return { success: true };
  } catch {
    return { success: false, error: 'No se pudo guardar el presupuesto. Tus cambios siguen en pantalla; intentá nuevamente.' };
  }
}
