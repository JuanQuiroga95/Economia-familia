'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/formatUtils';
import type { CardsSummary } from '@/actions/cards';

export default function CreditCardsSummary({ summary }: { summary: CardsSummary }) {
  if (!summary.hasCards) return null;

  const alDia = summary.pendingThisMonth <= 0;

  return (
    <div className="glass-card p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
            <span className="text-xl">💳</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Tarjetas</h3>
            <p className="text-xs text-text-muted">
              {alDia ? 'Estás al día este mes 🎉' : 'Registrá el pago para que impacte en Gastos'}
            </p>
          </div>
        </div>
        <Link href="/tarjetas" className="text-xs text-accent hover:underline whitespace-nowrap">
          Ver todas →
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-bg-input rounded-xl p-3">
          <p className="text-xs text-text-muted mb-0.5">Resumen del mes</p>
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
          <p className="text-xs text-text-muted mb-0.5">Deuda acumulada</p>
          <p className={`text-base font-bold ${summary.totalDebt > 0 ? 'text-danger' : 'text-success'}`}>
            ${formatCurrency(summary.totalDebt)}
          </p>
        </div>
        <div className="bg-bg-input rounded-xl p-3">
          <p className="text-xs text-text-muted mb-0.5">Cuotas a futuro</p>
          <p className="text-base font-bold text-text-secondary">
            ${formatCurrency(summary.futureInstallments)}
          </p>
        </div>
      </div>

      {summary.cards.some((c) => c.pending > 0) && (
        <ul className="space-y-2">
          {summary.cards
            .filter((c) => c.pending > 0)
            .map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-text-secondary">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                </span>
                <span className="font-medium text-warning">
                  ${formatCurrency(c.pending)} {c.currency}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
