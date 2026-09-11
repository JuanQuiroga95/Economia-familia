import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlanningCsv, buildPlanningReport, serializeReportCsv } from './planningReport';
import type { PlanningData } from './planning';
import { createPlanningPdf } from './planningPdf';

const data: PlanningData = {
  year: 2026, month: 1, payday: 0, currentMonth: 2, currentYear: 2026,
  categories: [
    { id: 'food', name: 'Alimentación; "hogar"', icon: '🍎', color: '#000000' },
    { id: 'travel', name: 'Transporte', icon: '', color: '#000000' },
  ], budgets: [], agenda: [], incomes: [1000, 2000, ...Array(10).fill(0)],
  actuals: [{ categoryId: 'food', month: 1, amount: 125.5 }, { categoryId: 'food', month: 2, amount: 50 }, { categoryId: 'travel', month: 1, amount: 10 }],
};
const draft = { 'food:1': '100.25', 'travel:1': '0' };

test('report preserves zero, unplanned amounts, partial coverage and monthly reconciliation', () => {
  const report = buildPlanningReport(data, draft, 1, 'half');
  assert.equal(report.planned, 100.25);
  assert.equal(report.actual, 185.5);
  assert.equal(report.available, -85.25);
  assert.equal(report.unplanned, 50);
  assert.equal(report.income, 3000);
  assert.equal(report.rows[1].cells[0].planned, 0);
  assert.equal(report.rows[0].cells[1].planned, null);
  assert.equal(report.rows[0].configured, 1);
  assert.equal(report.monthly.reduce((sum, row) => sum + row.Real, 0), report.actual);
  assert.equal(report.monthly.reduce((sum, row) => sum + row.Presupuesto, 0), report.planned);
  assert.equal(report.isOpen, true);
  assert.equal(report.range, '31/12/2025 al 29/06/2026');
});

test('CSV uses Excel separator and decimal comma; negative money remains numeric', () => {
  const csv = serializeReportCsv([['Categoría', 'Disponible'], ['Comida; "hogar"', -25.75], [' =SUM(A1)', 0], ['+fórmula', null]]);
  assert.ok(csv.startsWith('\ufeffsep=;\r\n'));
  assert.ok(csv.includes('"Comida; ""hogar""";"-25,75"'));
  assert.ok(csv.includes('"\' =SUM(A1)";"0,00"'));
  assert.ok(csv.includes('"\'+fórmula";""'));
  assert.ok(!csv.includes("'-25"));
});

test('CSV scope and headings match the selected period and contain graph data', () => {
  const report = buildPlanningReport(data, draft, 1, 'month', 'Familia de prueba');
  const complete = buildPlanningCsv(report, 'complete');
  assert.ok(complete.includes('PRESUPUESTO POR CATEGORÍA Y MES'));
  assert.ok(complete.includes('ANALÍTICA · DESVÍOS POR CATEGORÍA'));
  assert.ok(complete.includes('EVOLUCIÓN MENSUAL · DATOS DEL GRÁFICO'));
  assert.ok(complete.includes('CONCENTRACIÓN DEL GASTO · DATOS DEL GRÁFICO'));
  assert.ok(complete.includes('Mensual · Enero 2026'));
  assert.ok(!complete.includes('Febrero 2026'));
  assert.ok(!buildPlanningCsv(report, 'budget').includes('ANALÍTICA · DESVÍOS POR CATEGORÍA'));
  assert.ok(!buildPlanningCsv(report, 'analytics').includes('PRESUPUESTO POR CATEGORÍA Y MES'));
});

test('PDF supports empty, monthly, annual and long multipage category tables', () => {
  for (const period of ['month', 'half', 'year']) {
    const report = buildPlanningReport(data, draft, 1, period);
    for (const scope of ['budget', 'analytics', 'complete'] as const) {
      const doc = createPlanningPdf(report, scope);
      assert.ok(doc.output().startsWith('%PDF-'));
      assert.ok(doc.getNumberOfPages() >= 4);
    }
  }
  const empty = createPlanningPdf(buildPlanningReport({ ...data, categories: [], actuals: [] }, {}, 1, 'year'), 'complete');
  assert.ok(empty.getNumberOfPages() >= 4);
  const crowded = { ...data, categories: Array.from({ length: 100 }, (_, i) => ({ id: `cat-${i}`, name: `Categoría ${i} con nombre largo para verificar la paginación y lectura completa del informe`, icon: '', color: '#000000' })) };
  const doc = createPlanningPdf(buildPlanningReport(crowded, {}, 1, 'year'), 'complete');
  assert.ok(doc.getNumberOfPages() > 15);
});
