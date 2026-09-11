import { MONTHS, periodMonths, variance, type PlanningData } from './planning';
import { getFinancialMonthRange } from './dateUtils';

export type ReportScope = 'complete' | 'budget' | 'analytics';
export const REPORT_TITLES: Record<ReportScope, string> = {
  complete: 'Presupuesto y analítica', budget: 'Presupuesto', analytics: 'Analítica presupuestaria',
};
export const FULL_MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const reportNumber = (value: number) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
export const reportMoney = (value: number) => `$ ${reportNumber(value)}`;
export const reportPercent = (value: number | null) => value === null ? 'Sin base' : `${reportNumber(value)}%`;
export const reportTimestamp = (date = new Date()) => date.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });
export const planKey = (id: string, month: number) => `${id}:${month}`;

/** Shared snapshot: screen, CSV and PDF all use the same calculations and selection. */
export function buildPlanningReport(data: PlanningData, draft: Record<string, string>, month: number, period: string, account = 'Familia', generatedAt = new Date()) {
  const months = periodMonths(month, period);
  const actualMap = new Map<string, number>();
  for (const item of data.actuals) {
    const key = planKey(item.categoryId, item.month);
    actualMap.set(key, (actualMap.get(key) ?? 0) + item.amount);
  }
  const rows = data.categories.map(category => {
    const cells = months.map(m => {
      const raw = draft[planKey(category.id, m)];
      const planned = raw === undefined || raw === '' ? null : Number(raw);
      return { month: m, planned, actual: actualMap.get(planKey(category.id, m)) ?? 0 };
    });
    const planned = cells.reduce((sum, cell) => sum + (cell.planned ?? 0), 0);
    const actual = cells.reduce((sum, cell) => sum + cell.actual, 0);
    const configured = cells.filter(cell => cell.planned !== null).length;
    const unplanned = cells.reduce((sum, cell) => sum + (cell.planned === null ? cell.actual : 0), 0);
    return { ...category, cells, planned, actual, configured, unplanned, ...variance(planned, actual) };
  });
  const monthly = months.map(m => ({
    month: m, name: MONTHS[m - 1],
    Presupuesto: rows.reduce((sum, row) => sum + (row.cells.find(cell => cell.month === m)?.planned ?? 0), 0),
    Real: rows.reduce((sum, row) => sum + (row.cells.find(cell => cell.month === m)?.actual ?? 0), 0),
    Ingresos: data.incomes[m - 1] ?? 0,
    status: data.year > data.currentYear || (data.year === data.currentYear && m > data.currentMonth) ? 'Futuro' : data.year === data.currentYear && m === data.currentMonth ? 'En curso · datos parciales' : 'Transcurrido',
  }));
  const planned = rows.reduce((sum, row) => sum + row.planned, 0);
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const income = monthly.reduce((sum, item) => sum + item.Ingresos, 0);
  const configured = rows.reduce((sum, row) => sum + row.configured, 0);
  const unplanned = rows.reduce((sum, row) => sum + row.unplanned, 0);
  const isOpen = data.year === data.currentYear && months.includes(data.currentMonth);
  const future = data.year > data.currentYear || (data.year === data.currentYear && months[0] > data.currentMonth);
  const status = future ? 'Período futuro' : isOpen ? 'Período en curso · datos parciales' : 'Período transcurrido';
  const periodLabel = `${period === 'year' ? 'Anual' : period === 'half' ? 'Semestral' : 'Mensual'} · ${FULL_MONTHS[months[0] - 1]}${months.length > 1 ? ` a ${FULL_MONTHS[months.at(-1)! - 1]}` : ''} ${data.year}`;
  const dateLabel = (date: Date) => `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  const range = `${dateLabel(getFinancialMonthRange(months[0], data.year, data.payday).startDate)} al ${dateLabel(getFinancialMonthRange(months.at(-1)!, data.year, data.payday).endDate)}`;
  const ranked = [...rows].filter(row => row.planned || row.actual).sort((a, b) => a.available - b.available);
  const topCategories = [...ranked].sort((a, b) => b.actual - a.actual).slice(0, 6);
  const insights: string[] = [];
  if (!configured) insights.push('Todavía no hay presupuesto para este período. Creá un plan para medir los desvíos.');
  if (unplanned > 0) insights.push(`${reportMoney(unplanned)} de gastos pertenecen a meses y categorías sin presupuesto.`);
  for (const row of ranked.filter(row => row.available < 0 && row.configured).slice(0, 3)) insights.push(`${row.name} supera su presupuesto en ${reportMoney(-row.available)}.`);
  if (configured > 0 && actual <= planned) insights.push('El gasto acumulado está dentro del presupuesto total del período.');
  insights.push(isOpen ? 'El período sigue abierto: lo disponible todavía debe cubrir los gastos pendientes.' : future ? 'Los gastos de fechas futuras son registros anticipados, no una proyección automática.' : 'Los desvíos corresponden al período completo según los movimientos registrados.');
  const notes = [
    'Moneda: ARS (pesos argentinos). Se incluyen todos los perfiles de la cuenta. USD y EUR no se convierten ni se suman.',
    `Ciclo financiero: ${range}. Día de cobro: ${data.payday === 0 ? 'último día del mes' : data.payday}. Los meses siguen el mismo corte que Inicio.`,
    'Sin plan: no hay monto asignado. Cero: se planificó no gastar. Cobertura: meses con presupuesto sobre meses seleccionados. Los totales suman los montos asignados, aunque la cobertura sea parcial.',
    'Disponible = presupuesto - gasto real. Un valor negativo significa exceso de gasto. Ejecución = gasto real / presupuesto. Sin base: presupuesto cero o inexistente.',
    'Los gastos sin plan se incluyen en el gasto real total. Un disponible positivo en un período abierto no equivale a ahorro definitivo.',
    'Tarjetas y préstamos impactan cuando se registra su pago como gasto, con la categoría del pago. La agenda pendiente y las compras en cuotas no se suman nuevamente.',
    'Se excluyen las categorías de ahorro e inversión. Ingresos menos gastos no es saldo bancario: no incluye los movimientos de ahorro e inversión.',
    'El presupuesto es editable y no mueve dinero. Este informe refleja los datos guardados al momento de la descarga; no es una proyección automática.',
  ];
  return {
    account, year: data.year, months, periodLabel, range, status, isOpen, future, rows, monthly, ranked, topCategories, actualMap,
    planned, actual, income, configured, unplanned, ...variance(planned, actual), insights, notes,
    generatedLabel: reportTimestamp(generatedAt),
    filename: `econoapp-${data.year}-${String(months[0]).padStart(2, '0')}${months.length > 1 ? `-a-${String(months.at(-1)).padStart(2, '0')}` : ''}`,
  };
}
export type PlanningReport = ReturnType<typeof buildPlanningReport>;
export function reportFilename(report: PlanningReport, scope: ReportScope, extension: string) {
  return `${report.filename}-${scope === 'complete' ? 'informe-completo' : scope === 'budget' ? 'presupuesto' : 'analitica'}.${extension}`;
}

type CsvCell = string | number | null;
/** Excel in Spanish: explicit delimiter, UTF-8 BOM, decimal comma, numeric negatives. */
export function serializeReportCsv(records: CsvCell[][]) {
  const width = Math.max(...records.map(row => row.length));
  const escape = (value: CsvCell | undefined) => {
    if (value === null || value === undefined) return '""';
    if (typeof value === 'number') return `"${value.toFixed(2).replace('.', ',')}"`;
    const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return '\ufeffsep=;\r\n' + records.map(row => Array.from({ length: width }, (_, i) => escape(row[i])).join(';')).join('\r\n');
}

export function buildPlanningCsv(report: PlanningReport, scope: ReportScope) {
  const r = report;
  const records: CsvCell[][] = [
    [`ECONOAPP | ${REPORT_TITLES[scope].toLocaleUpperCase('es-AR')}`], ['Cuenta', r.account], ['Período', r.periodLabel],
    ['Ciclo financiero', r.range], ['Moneda', 'ARS · pesos argentinos'], ['Estado', r.status], ['Emitido (hora Argentina)', r.generatedLabel], [],
    ['RESUMEN DEL PERÍODO'], ['Indicador', 'Valor', 'Cómo interpretarlo'],
    ['Gastos presupuestados (ARS)', r.planned, 'Suma de los montos asignados'], ['Gastos reales (ARS)', r.actual, 'Pagos registrados'],
    ['Disponible del plan (ARS)', r.available, 'Presupuesto menos gasto real; negativo = exceso'],
    ['Ejecución', reportPercent(r.execution), 'Gasto real / presupuesto'],
    ['Asignaciones con presupuesto', `${r.configured} de ${r.rows.length * r.months.length}`, 'Categorías por meses seleccionados'],
    ['Gastos sin presupuesto (ARS)', r.unplanned, 'Gastos de meses y categorías sin plan'],
  ];
  if (scope !== 'budget') records.push(['Ingresos registrados (ARS)', r.income], ['Ingresos menos gastos (ARS)', r.income - r.actual, 'Antes de ahorro e inversión; no es saldo bancario']);
  if (scope !== 'analytics') {
    records.push([], ['PRESUPUESTO POR CATEGORÍA Y MES · ARS'], ['Categoría', ...r.months.map(m => `${FULL_MONTHS[m - 1]} ${r.year}`), 'Total del período', 'Cobertura']);
    for (const row of r.rows) records.push([row.name, ...row.cells.map(cell => cell.planned ?? 'Sin plan'), row.planned, `${row.configured}/${r.months.length} meses`]);
    records.push(['TOTAL PRESUPUESTADO', ...r.monthly.map(item => item.Presupuesto), r.planned, `${r.configured} asignaciones`]);
  }
  if (scope !== 'budget') {
    records.push([], ['ANALÍTICA · DESVÍOS POR CATEGORÍA'], ['Categoría', 'Presupuesto (ARS)', 'Real (ARS)', 'Disponible (ARS)', 'Ejecución', 'Cobertura', 'Sin presupuesto (ARS)']);
    for (const row of r.rows) records.push([row.name, row.configured ? row.planned : 'Sin plan', row.actual, row.configured ? row.available : null, reportPercent(row.execution), `${row.configured}/${r.months.length} meses`, row.unplanned]);
    records.push(['TOTAL DEL PERÍODO', r.planned, r.actual, r.available, reportPercent(r.execution), `${r.configured} asignaciones`, r.unplanned]);
    records.push([], ['OBSERVACIONES DEL PERÍODO'], ...r.insights.map((text, i) => [`Observación ${i + 1}`, text]));
  }
  records.push([], ['EVOLUCIÓN MENSUAL · DATOS DEL GRÁFICO'], ['Mes', 'Presupuesto (ARS)', 'Real (ARS)', 'Disponible (ARS)', 'Ejecución', ...(scope !== 'budget' ? ['Ingresos (ARS)'] : []), 'Estado del mes']);
  for (const item of r.monthly) records.push([`${FULL_MONTHS[item.month - 1]} ${r.year}`, item.Presupuesto, item.Real, item.Presupuesto - item.Real, reportPercent(variance(item.Presupuesto, item.Real).execution), ...(scope !== 'budget' ? [item.Ingresos] : []), item.status]);
  records.push(['TOTAL DEL PERÍODO', r.planned, r.actual, r.available, reportPercent(r.execution), ...(scope !== 'budget' ? [r.income] : []), r.status]);
  records.push([], ['CONCENTRACIÓN DEL GASTO · DATOS DEL GRÁFICO'], ['Categoría (hasta 6, por mayor gasto real)', 'Presupuesto (ARS)', 'Real (ARS)']);
  for (const row of r.topCategories) records.push([row.name, row.planned, row.actual]);
  if (!r.topCategories.length) records.push(['Sin datos para graficar']);
  records.push([], ['CRITERIOS DE LECTURA'], ...r.notes.map((text, i) => [`Nota ${i + 1}`, text]));
  return serializeReportCsv(records);
}
