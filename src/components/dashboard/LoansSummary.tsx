'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/formatUtils';
import type { LoansSummary as LoansSummaryData } from '@/actions/loans';

export default function LoansSummary({ summary }: { summary: LoansSummaryData }) {
  if (!summary.hasLoans) return null;

  const alDia = summary.pendingThisMonth <= 0;
  const tienePrestados = summary.totalLent > 0 || summary.toCollectThisMonth > 0;

  return (
    <div className="glass-card p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
            <span className="text-xl">🏦</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Préstamos</h3>
            <p className="text-xs text-text-muted">
              {alDia ? 'Las cuotas del mes están al día 🎉' : 'Registrá el pago para que impacte en Gastos'}
            </p>
          </div>
        </div>
        <Link href="/prestamos" className="text-xs text-accent hover:underline whitespace-nowrap">
          Ver todos →
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-bg-input rounded-xl p-3">
          <p className="text-xs text-text-muted mb-0.5">Cuotas del mes</p>
          <p className="text-base font-bold text-text-primary">
            ${formatCurrency(summary.dueThisMonth)}
          </p>
        </div>
        <div className="bg-bg-input rounded-xl p-3">
          <p className="text-xs text-text-muted mb-0.5">Falta pagar</p>
          <p className={`text-base font-bold ${alDia ? 'text-success' : 'text-warning'}`}>
            ${formatCurrency(summary.pendingThisMonth)}
          </p>
        </div>
        <div className="bg-bg-input rounded-xl p-3">
          <p className="text-xs text-text-muted mb-0.5">Saldo total</p>
          <p
            className={`text-base font-bold ${
              summary.totalRemaining > 0 ? 'text-danger' : 'text-success'
            }`}
          >
            ${formatCurrency(summary.totalRemaining)}
          </p>
        </div>
        <div className="bg-bg-input rounded-xl p-3">
          <p className="text-xs text-text-muted mb-0.5">
            {tienePrestados ? 'Te deben' : 'Préstamos activos'}
          </p>
          <p className="text-base font-bold text-text-secondary">
            {tienePrestados
              ? `$${formatCurrency(summary.totalLent)}`
              : summary.loans.filter((l) => l.remaining > 0).length}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {summary.loans
          .filter((l) => l.remaining > 0)
          .map((l) => {
            const progreso =
              l.totalInstallments > 0 ? (l.paidInstallments / l.totalInstallments) * 100 : 0;
            return (
              <li key={l.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-text-secondary min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                    <span className="truncate">{l.name}</span>
                    <span className="text-xs text-text-muted whitespace-nowrap">
                      {l.paidInstallments}/{l.totalInstallments}
                    </span>
                  </span>
                  <span
                    className={`font-medium whitespace-nowrap ${
                      l.kind === 'TOMADO' ? 'text-text-primary' : 'text-success'
                    }`}
                  >
                    ${formatCurrency(l.remaining)} {l.currency}
                  </span>
                </div>
                <div className="h-1.5 bg-bg-input rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progreso}%`, backgroundColor: l.color }}
                  />
                </div>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
