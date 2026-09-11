export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export type PlanCell = { categoryId: string; month: number; amount: number | null };
export type PlanningData = {
  year: number;
  month: number;
  payday: number;
  currentMonth: number;
  currentYear: number;
  categories: { id: string; name: string; icon: string; color: string }[];
  budgets: PlanCell[];
  actuals: { categoryId: string; month: number; amount: number }[];
  agenda: { categoryId: string; month: number; amount: number }[];
  incomes: number[];
};

export function periodMonths(month: number, period: string): number[] {
  const start = period === 'year' ? 1 : period === 'half' ? (month <= 6 ? 1 : 7) : month;
  const length = period === 'year' ? 12 : period === 'half' ? 6 : 1;
  return Array.from({ length }, (_, i) => start + i);
}

export function validatePlan(year: number, cells: PlanCell[]): boolean {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Array.isArray(cells) || cells.length > 6000) return false;
  const keys = new Set<string>();
  return cells.every(cell => {
    if (!cell || typeof cell.categoryId !== 'string' || !cell.categoryId || !Number.isInteger(cell.month) || cell.month < 1 || cell.month > 12) return false;
    if (cell.amount !== null && (typeof cell.amount !== 'number' || !Number.isFinite(cell.amount) || cell.amount < 0 || cell.amount > 1e12 || Math.abs(cell.amount * 100 - Math.round(cell.amount * 100)) > 0.01)) return false;
    const key = `${cell.categoryId}:${cell.month}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

export function variance(planned: number, actual: number) {
  return { available: planned - actual, execution: planned > 0 ? actual / planned * 100 : null };
}
