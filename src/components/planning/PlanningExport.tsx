'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { buildPlanningCsv, reportFilename, reportTimestamp, type PlanningReport, type ReportScope } from '@/lib/planningReport';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give browsers (including mobile Safari) time to start reading the file.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function PlanningExport({ report, disabled }: { report: PlanningReport; disabled: boolean }) {
  const [scope, setScope] = useState<ReportScope>('complete');
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);

  async function exportReport(format: 'pdf' | 'csv') {
    if (disabled || busy) return;
    setBusy(format);
    const snapshot = { ...report, generatedLabel: reportTimestamp() };
    try {
      if (format === 'csv') {
        download(new Blob([buildPlanningCsv(snapshot, scope)], { type: 'text/csv;charset=utf-8;' }), reportFilename(snapshot, scope, 'csv'));
      } else {
        const { createPlanningPdf } = await import('@/lib/planningPdf');
        download(createPlanningPdf(snapshot, scope).output('blob'), reportFilename(snapshot, scope, 'pdf'));
      }
      toast.success(`${format.toUpperCase()} preparado para descargar.`);
    } catch {
      toast.error('No se pudo generar el informe. Intentá nuevamente.');
    } finally { setBusy(null); }
  }

  return <section aria-label="Descargar informes" className="mt-6 border-t border-border pt-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="font-semibold">Descargar informe</h2><p className="text-xs text-text-secondary mt-1">{report.periodLabel} · ARS · {report.status}</p></div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-text-secondary">Contenido
          <select className="input-field mt-1" value={scope} disabled={!!busy} onChange={event => setScope(event.target.value as ReportScope)}>
            <option value="complete">Presupuesto + Analítica</option><option value="budget">Solo Presupuesto</option><option value="analytics">Solo Analítica</option>
          </select>
        </label>
        <button type="button" onClick={() => exportReport('pdf')} disabled={disabled || !!busy} className="gradient-btn px-4 py-3 text-sm disabled:opacity-40">{busy === 'pdf' ? 'Preparando PDF…' : '↓ Descargar PDF'}</button>
        <button type="button" onClick={() => exportReport('csv')} disabled={disabled || !!busy} className="border border-border rounded-xl px-4 py-3 text-sm disabled:opacity-40">{busy === 'csv' ? 'Preparando CSV…' : '↓ Descargar CSV'}</button>
      </div>
    </div>
    <p role="status" className={`text-xs mt-3 ${disabled ? 'text-warning' : 'text-text-muted'}`}>{disabled ? 'Guardá los cambios antes de descargar el informe.' : 'PDF con gráficos, tablas y totales, listo para compartir. CSV organizado por secciones para Excel en español, con los datos de los gráficos. Se exporta el período seleccionado.'}</p>
  </section>;
}
