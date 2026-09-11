/** Generate review artifacts with synthetic data only. Run: node --import tsx scripts/check-planning-exports.ts */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildPlanningReport, buildPlanningCsv, reportFilename } from '../src/lib/planningReport';
import { createPlanningPdf } from '../src/lib/planningPdf';
import type { PlanningData } from '../src/lib/planning';

const categories = ['Alimentación y supermercado', 'Alquiler y expensas', 'Educación y actividades de los chicos', 'Salud y medicamentos', 'Servicios del hogar', 'Transporte y combustible', 'Salidas y vacaciones', 'Gastos extraordinarios sin presupuesto'];
const data: PlanningData = {
  year: 2026, month: 9, payday: 0, currentMonth: 9, currentYear: 2026,
  categories: categories.map((name, i) => ({ id: String(i), name, icon: '', color: '#6554c0' })),
  budgets: [], actuals: [], agenda: [], incomes: Array.from({ length: 12 }, (_, i) => i < 9 ? 2400000 + i * 80000 : 0),
};
const draft: Record<string, string> = {};
for (let month = 1; month <= 12; month++) for (let category = 0; category < 8; category++) {
  const amount = Math.round((category === 1 ? 650000 : 95000 + category * 17000) * (1 + (month - 1) * 0.035) * 100) / 100;
  if (category !== 7) draft[`${category}:${month}`] = String(category === 6 && month <= 6 ? 0 : amount);
  if (month <= 9) data.actuals.push({ categoryId: String(category), month, amount: Math.round(amount * (category === 0 ? 1.35 : 0.81) * 100) / 100 });
}
const output = 'artifacts/planning-export-review';
mkdirSync(output, { recursive: true });
for (const period of ['month', 'half', 'year']) {
  const report = buildPlanningReport(data, draft, 9, period, 'Familia de ejemplo · DATOS FICTICIOS', new Date('2026-09-11T15:00:00Z'));
  writeFileSync(`${output}/${reportFilename(report, 'complete', 'pdf')}`, new Uint8Array(createPlanningPdf(report, 'complete').output('arraybuffer')));
  writeFileSync(`${output}/${reportFilename(report, 'complete', 'csv')}`, buildPlanningCsv(report, 'complete'));
}
const stress = { ...data, categories: Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, name: `Categoría ${i} con un nombre extenso de gastos familiares y extraordinarios para comprobar lectura`, icon: '', color: '#6554c0' })), actuals: [] };
const largeDraft = Object.fromEntries(stress.categories.flatMap(category => Array.from({ length: 12 }, (_, i) => [`${category.id}:${i + 1}`, '1000000000000'])));
writeFileSync(`${output}/stress.pdf`, new Uint8Array(createPlanningPdf(buildPlanningReport(stress, largeDraft, 9, 'year', 'Prueba de paginación · DATOS FICTICIOS'), 'complete').output('arraybuffer')));
console.log(`Informes de prueba generados en ${output}`);
