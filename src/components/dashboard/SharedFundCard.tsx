'use client';
import { formatCurrency } from '@/lib/formatUtils';

import type { SharedFundStats } from '@/types';

export default function SharedFundCard({ stats }: { stats: SharedFundStats }) {
  const hasDebts = stats.debts.length > 0;
  const hasExpenses = stats.totalSharedExpenses > 0;

  if (!hasExpenses && !hasDebts) return null;

  return (
    <div className="glass-card p-4 lg:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
          <span className="text-xl">👥</span>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Fondo Compartido</h3>
          <p className="text-xs text-text-muted">Gastos compartidos del mes</p>
        </div>
      </div>

      {/* Total compartido */}
      <div className="p-3 rounded-xl bg-bg-input mb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Total gastado en conjunto</span>
          <span className="text-lg font-bold text-text-primary">
            ${formatCurrency(stats.totalSharedExpenses)}
          </span>
        </div>
      </div>

      {/* Deudas */}
      {hasDebts && (
        <div>
          <p className="text-sm font-medium text-text-secondary mb-2">
            💳 Deudas del fondo (a devolver)
          </p>
          <div className="space-y-2">
            {stats.debts.map((debt) => (
              <div
                key={debt.profileId}
                className="flex items-center justify-between p-3 rounded-xl bg-warning/5 border border-warning/20"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{debt.profileAvatar || '👤'}</span>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {debt.debtorName ? `${debt.debtorName} le debe a ${debt.profileName}` : `El fondo le debe a ${debt.profileName}`}
                    </p>
                    <p className="text-xs text-text-muted">
                      Pagó gastos compartidos de su billetera
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-warning">
                  ${formatCurrency(debt.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasDebts && hasExpenses && (
        <div className="p-3 rounded-xl bg-success/5 border border-success/20 text-center">
          <p className="text-sm text-success">
            ✅ No hay deudas pendientes este mes
          </p>
        </div>
      )}
    </div>
  );
}
