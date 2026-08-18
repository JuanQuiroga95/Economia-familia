'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/formatUtils';
import type { AgendaSummary as AgendaSummaryData } from '@/actions/agenda';

export default function AgendaSummary({ summary }: { summary: AgendaSummaryData }) {
  if (!summary.hasItems) return null;

  const todoListo = summary.countPending === 0;
  const progreso =
    summary.totalPlanned > 0 ? (summary.totalDone / summary.totalPlanned) * 100 : 0;

  return (
    <div className="glass-card p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center">
            <span className="text-xl">🗓️</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Agenda del mes</h3>
            <p className="text-xs text-text-muted">
              {todoListo
                ? 'Ya resolviste todo lo que tenías anotado 🎉'
                : `Te quedan ${summary.countPending} cosa(s) por resolver`}
            </p>
          </div>
        </div>
        <Link href="/agenda" className="text-xs text-accent hover:underline whitespace-nowrap">
          Ver agenda →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-bg-input rounded-xl p-3">
          <p className="text-xs text-text-muted mb-0.5">Previsto</p>
          <p className="text-base font-bold text-text-primary">
            ${formatCurrency(summary.totalPlanned)}
          </p>
        </div>
        <div className="bg-bg-input rounded-xl p-3">
          <p className="text-xs text-text-muted mb-0.5">Resuelto</p>
          <p className="text-base font-bold text-success">${formatCurrency(summary.totalDone)}</p>
        </div>
        <div className="bg-bg-input rounded-xl p-3">
          <p className="text-xs text-text-muted mb-0.5">Falta</p>
          <p className={`text-base font-bold ${todoListo ? 'text-success' : 'text-warning'}`}>
            ${formatCurrency(summary.totalPending)}
          </p>
        </div>
      </div>

      <div className="h-1.5 bg-bg-input rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-success transition-all duration-500"
          style={{ width: `${progreso}%` }}
        />
      </div>

      {summary.upcoming.length > 0 && (
        <ul className="space-y-2">
          {summary.upcoming.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-text-secondary min-w-0">
                <span className="shrink-0">{item.icon}</span>
                <span className="truncate">{item.title}</span>
                {item.isOverdue ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/20 text-danger whitespace-nowrap">
                    vencido
                  </span>
                ) : item.daysLeft === 0 ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning whitespace-nowrap">
                    hoy
                  </span>
                ) : item.day ? (
                  <span className="text-[10px] text-text-muted whitespace-nowrap">día {item.day}</span>
                ) : null}
              </span>
              <span className="text-text-primary font-medium whitespace-nowrap">
                {item.amount ? `$${formatCurrency(item.amount)}` : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {summary.countWithoutAmount > 0 && (
        <p className="text-[11px] text-text-muted">
          {summary.countWithoutAmount} ítem(s) sin monto estimado.
        </p>
      )}
    </div>
  );
}
