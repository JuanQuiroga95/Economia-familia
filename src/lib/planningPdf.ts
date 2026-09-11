import { jsPDF } from 'jspdf';
import { autoTable, type CellDef, type UserOptions } from 'jspdf-autotable';
import { FULL_MONTHS, REPORT_TITLES, reportMoney, reportNumber, reportPercent, type PlanningReport, type ReportScope } from './planningReport';
import { MONTHS, variance } from './planning';

const COLORS = { ink: '#17243b', muted: '#58677e', purple: '#6554c0', teal: '#158571', amber: '#b77b14', red: '#b83346', line: '#dce3ed', light: '#f3f5fa' };
// Built-in PDF fonts support Spanish/Latin characters. Discard decorative emoji instead of producing broken glyphs.
const printable = (text: string) => text.normalize('NFC').replace(/[^\u0020-\u007e\u00a0-\u00ff\n\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u20ac]/gu, '');

/** Vector PDF: selectable text, crisp charts, repeated table headers and automatic pagination. */
export function createPlanningPdf(r: PlanningReport, scope: ReportScope) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `${REPORT_TITLES[scope]} | ${r.periodLabel}`, subject: 'Planificación financiera familiar en ARS', author: 'EconoApp', creator: 'EconoApp' });
  const margin = 16;
  const width = doc.internal.pageSize.getWidth();
  const contentWidth = width - margin * 2;
  const drawnHeaders = new Set<number>();
  const write = (text: string, x: number, y: number, size = 10, color = COLORS.ink, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(color);
    doc.text(printable(text), x, y);
  };
  const wrap = (text: string, maxWidth: number, size = 9): string[] => {
    doc.setFont('helvetica', 'normal').setFontSize(size);
    return doc.splitTextToSize(printable(text), maxWidth) as string[];
  };
  function header(title: string, subtitle = `${r.periodLabel} | ARS | Ciclo: ${r.range}`) {
    const page = doc.getCurrentPageInfo().pageNumber;
    if (drawnHeaders.has(page)) return;
    drawnHeaders.add(page);
    write('ECONOAPP / FINANZAS FAMILIARES', margin, 14, 9, COLORS.purple, true);
    const accountLines = wrap(r.account, 120, 9);
    doc.setTextColor(COLORS.muted).text(accountLines[0] + (accountLines.length > 1 ? '...' : ''), width - margin, 14, { align: 'right' });
    doc.setDrawColor(COLORS.line).setLineWidth(0.3).line(margin, 19, width - margin, 19);
    write(title, margin, 31, 20, COLORS.ink, true);
    write(subtitle, margin, 40, 9, COLORS.muted);
  }
  function page(title: string) { doc.addPage('a4', 'landscape'); header(title); }
  function table(title: string, head: string[], body: (string | CellDef)[][], foot?: (string | CellDef)[][], options: Partial<UserOptions> = {}) {
    autoTable(doc, {
      startY: 50, margin: { top: 50, left: margin, right: margin, bottom: 20 },
      head: [head], body, foot, showHead: 'everyPage', showFoot: 'lastPage', rowPageBreak: 'avoid',
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, textColor: COLORS.ink, overflow: 'linebreak', halign: 'right', valign: 'middle', lineColor: COLORS.line },
      headStyles: { fillColor: COLORS.ink, textColor: '#ffffff', fontStyle: 'bold', fontSize: 8.5 },
      footStyles: { fillColor: '#e9e6f8', textColor: COLORS.ink, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: COLORS.light },
      columnStyles: { 0: { halign: 'left', cellWidth: 65 } },
      willDrawPage: () => header(title),
      didParseCell: cell => {
        cell.cell.text = cell.cell.text.map(printable);
        if (cell.column.index === 0 || options.columnStyles?.[cell.column.index]?.halign === 'left') cell.cell.styles.halign = 'left';
      },
      willDrawCell: cell => {
        const raw = cell.cell.raw;
        const value = typeof raw === 'string' ? raw : raw && typeof raw === 'object' && 'content' in raw ? String(raw.content) : '';
        if (!/^-?\d[\d.,]*%?$/.test(value)) return;
        // Never break an amount across lines, even for exceptionally large budgets.
        const available = cell.cell.width - cell.cell.padding('left') - cell.cell.padding('right');
        const size = doc.getFontSize();
        doc.setFontSize(Math.min(size, size * available / Math.max(doc.getTextWidth(value), 1) * 0.98));
        cell.cell.text = [value];
      },
      ...options,
    });
  }
  function card(label: string, value: string, hint: string, x: number, color: string) {
    const cardWidth = (contentWidth - 12) / 4;
    doc.setFillColor(COLORS.light).roundedRect(x, 55, cardWidth, 31, 2, 2, 'F');
    write(label, x + 4, 62, 8.5, COLORS.muted);
    doc.setFont('helvetica', 'bold').setFontSize(17);
    const size = Math.min(17, 17 * (cardWidth - 8) / Math.max(1, doc.getTextWidth(value)));
    write(value, x + 4, 73, size, color, true);
    write(hint, x + 4, 81, 7.2, COLORS.muted);
  }
  function legend(x: number, y: number, income: boolean) {
    for (const [index, [label, color]] of [['Presupuesto', COLORS.purple], ['Real', COLORS.teal], ...(income ? [['Ingresos', COLORS.amber]] : [])].entries()) {
      doc.setFillColor(color).rect(x + index * 32, y - 2, 3, 2.5, 'F');
      write(label, x + index * 32 + 5, y, 8, COLORS.muted);
    }
  }
  function monthlyChart() {
    const x = margin + 17, y = 119, w = 111, h = 53;
    write('Presupuesto vs. realidad', margin, 98, 11, COLORS.ink, true);
    legend(margin, 106, scope !== 'budget');
    const max = Math.max(1, ...r.monthly.flatMap(item => [item.Presupuesto, item.Real, ...(scope !== 'budget' ? [item.Ingresos] : [])]));
    for (let tick = 0; tick <= 3; tick++) {
      const yy = y + h - h * tick / 3;
      doc.setDrawColor(COLORS.line).setLineWidth(0.2).line(x, yy, x + w, yy);
      doc.setFontSize(7).setTextColor(COLORS.muted);
      doc.text(new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(max * tick / 3), x - 2, yy + 1, { align: 'right' });
    }
    const step = w / r.monthly.length;
    const barWidth = Math.min(7, step * 0.28);
    for (const [i, item] of r.monthly.entries()) {
      const center = x + step * (i + 0.5);
      for (const [value, color, offset] of [[item.Presupuesto, COLORS.purple, -barWidth], [item.Real, COLORS.teal, 0]] as const) {
        const barHeight = Math.max(0, value) / max * h;
        doc.setFillColor(color).rect(center + offset, y + h - barHeight, barWidth * 0.88, barHeight, 'F');
      }
      if (scope !== 'budget') {
        const yy = y + h - item.Ingresos / max * h;
        doc.setDrawColor(COLORS.amber).setLineWidth(0.6);
        if (i > 0) doc.line(center - step, y + h - r.monthly[i - 1].Ingresos / max * h, center, yy);
        doc.setFillColor(COLORS.amber).circle(center, yy, 0.8, 'F');
      }
      doc.setFontSize(7).setTextColor(COLORS.muted).text(item.name, center, y + h + 5, { align: 'center' });
    }
  }
  function concentrationChart() {
    const left = 163, graphX = 225, graphWidth = 54;
    write('Dónde se concentra el gasto', left, 98, 11, COLORS.ink, true);
    legend(left, 106, false);
    const max = Math.max(1, ...r.topCategories.flatMap(row => [row.planned, row.actual]));
    if (!r.topCategories.length) { write('Sin datos para graficar.', left, 133, 10, COLORS.muted); return; }
    r.topCategories.forEach((row, index) => {
      const y = 117 + index * 10.5;
      const lines = wrap(row.name, 59, 8);
      write(lines.slice(0, 2).map((line, i) => i === 1 && lines.length > 2 ? `${line.slice(0, -3)}...` : line).join('\n'), left, y + 2, 8, COLORS.muted);
      doc.setFillColor(COLORS.purple).rect(graphX, y - 1, row.planned / max * graphWidth, 2.6, 'F');
      doc.setFillColor(COLORS.teal).rect(graphX, y + 2, row.actual / max * graphWidth, 2.6, 'F');
    });
    doc.setDrawColor(COLORS.line).setLineWidth(0.2).line(graphX, 176, graphX + graphWidth, 176);
    write('0', graphX, 180, 7, COLORS.muted);
    doc.setFontSize(7).text(new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(max), graphX + graphWidth, 180, { align: 'right' });
    write('Hasta 6 categorías por mayor gasto real.', left, 183, 7.5, COLORS.muted);
  }

  header(REPORT_TITLES[scope]);
  write(`${r.status} | ${r.configured} asignaciones con presupuesto`, margin, 48, 8, COLORS.muted);
  const cardStep = (contentWidth + 4) / 4;
  card('Gastos presupuestados', reportMoney(r.planned), 'Suma del plan seleccionado', margin, COLORS.purple);
  card('Gastos reales', reportMoney(r.actual), 'Pagos registrados · ARS', margin + cardStep, COLORS.ink);
  card('Disponible del plan', reportMoney(r.available), 'Negativo = exceso de gasto', margin + cardStep * 2, r.available < 0 ? COLORS.red : COLORS.teal);
  card('Ejecución', reportPercent(r.execution), 'Gasto real / presupuesto', margin + cardStep * 3, r.execution !== null && r.execution > 100 ? COLORS.red : COLORS.purple);
  monthlyChart(); concentrationChart();
  write('Importes exactos en las tablas del informe. Las cifras parciales no se extrapolan.', margin, 183, 7.5, COLORS.muted);

  if (scope !== 'analytics') {
    // At most six months per table keeps annual plans readable, even on printed A4.
    const blockSize = r.rows.some(row => row.planned >= 1e11) ? 3 : 6;
    for (let start = 0; start < r.months.length; start += blockSize) {
      const block = r.months.slice(start, start + blockSize);
      const label = `Presupuesto mensual | ${MONTHS[block[0] - 1]}${block.length > 1 ? ` a ${MONTHS[block.at(-1)! - 1]}` : ''} ${r.year}`;
      page(label);
      const body = r.rows.map(row => {
        const cells = row.cells.filter(cell => block.includes(cell.month));
        return [row.name, ...cells.map(cell => cell.planned === null ? 'Sin plan' : reportNumber(cell.planned)), reportNumber(cells.reduce((sum, cell) => sum + (cell.planned ?? 0), 0))];
      });
      const totals = r.monthly.filter(item => block.includes(item.month));
      table(label, ['Categoría', ...block.map(m => FULL_MONTHS[m - 1]), 'Total de estos meses'], body,
        [['TOTAL · ARS', ...totals.map(item => reportNumber(item.Presupuesto)), reportNumber(totals.reduce((sum, item) => sum + item.Presupuesto, 0))]]);
    }
  }
  if (scope !== 'budget') {
    const label = 'Analítica | Desvíos por categoría';
    page(label);
    table(label, ['Categoría', 'Presupuesto\nARS', 'Real\nARS', 'Disponible\nARS', 'Ejecución', 'Cobertura', 'Sin plan\nARS'],
      r.rows.map(row => [row.name, row.configured ? reportNumber(row.planned) : 'Sin plan', reportNumber(row.actual),
        { content: row.configured ? reportNumber(row.available) : '—', styles: { textColor: row.available < 0 ? COLORS.red : COLORS.teal } },
        reportPercent(row.execution), `${row.configured}/${r.months.length} meses`, reportNumber(row.unplanned)]),
      [['TOTAL', reportNumber(r.planned), reportNumber(r.actual), reportNumber(r.available), reportPercent(r.execution), `${r.configured} asign.`, reportNumber(r.unplanned)]]);
    page('Analítica | Ingresos y observaciones');
    table('Analítica | Ingresos y observaciones', ['Indicador', 'Importe / lectura'], [
      ['Ingresos registrados', `${reportMoney(r.income)} ARS`],
      ['Ingresos menos gastos', `${reportMoney(r.income - r.actual)} ARS. Antes de ahorro e inversión; no representa saldo bancario.`],
      ['Gastos sin presupuesto', `${reportMoney(r.unplanned)} ARS. Meses y categorías sin plan.`],
      ...r.insights.map((text, i) => [`Observación ${i + 1}`, text]),
    ], undefined, { columnStyles: { 0: { halign: 'left', cellWidth: 65 }, 1: { halign: 'left' } } });
  }
  page('Evolución mensual | Detalle del gráfico');
  table('Evolución mensual | Detalle del gráfico', ['Mes', 'Presupuesto\nARS', 'Real\nARS', 'Disponible\nARS', 'Ejecución', ...(scope !== 'budget' ? ['Ingresos\nARS'] : []), 'Estado'],
    r.monthly.map(item => [FULL_MONTHS[item.month - 1], reportNumber(item.Presupuesto), reportNumber(item.Real), reportNumber(item.Presupuesto - item.Real), reportPercent(variance(item.Presupuesto, item.Real).execution), ...(scope !== 'budget' ? [reportNumber(item.Ingresos)] : []), item.status]),
    [['TOTAL', reportNumber(r.planned), reportNumber(r.actual), reportNumber(r.available), reportPercent(r.execution), ...(scope !== 'budget' ? [reportNumber(r.income)] : []), r.status]],
    { columnStyles: { 0: { halign: 'left', cellWidth: 35 } } });

  page('Concentración del gasto | Detalle del gráfico');
  table('Concentración del gasto | Detalle del gráfico', ['Categoría', 'Presupuesto (ARS)', 'Real (ARS)'],
    r.topCategories.length ? r.topCategories.map(row => [row.name, reportNumber(row.planned), reportNumber(row.actual)]) : [['Sin datos para graficar', '—', '—']]);
  page('Criterios de lectura');
  table('Criterios de lectura', ['Referencia', 'Descripción'], r.notes.map((note, i) => [`${i + 1}.`, note]), undefined,
    { columnStyles: { 0: { halign: 'left', cellWidth: 25 }, 1: { halign: 'left' } } });

  const pages = doc.getNumberOfPages();
  for (let index = 1; index <= pages; index++) {
    doc.setPage(index);
    const y = doc.internal.pageSize.getHeight() - 11;
    doc.setDrawColor(COLORS.line).setLineWidth(0.3).line(margin, y - 5, width - margin, y - 5);
    write(`EconoApp | ${REPORT_TITLES[scope]} | Emitido: ${r.generatedLabel} (Argentina)`, margin, y, 7, COLORS.muted);
    doc.setFontSize(7).text(`${index} / ${pages}`, width - margin, y, { align: 'right' });
  }
  return doc;
}
