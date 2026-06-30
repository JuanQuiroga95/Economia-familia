'use client';

import type { BudgetStatus } from '@/types';

export default function BudgetTracker({ status }: { status: BudgetStatus | null }) {
  if (!status) return null;

  const getStatusColor = () => {
    if (status.percentage >= 90) return 'danger';
    if (status.percentage >= 70) return 'warning';
    return 'success';
  };

  const color = getStatusColor();
  const colorMap = {
    success: { bg: 'bg-success', text: 'text-success', light: 'bg-success/20' },
    warning: { bg: 'bg-warning', text: 'text-warning', light: 'bg-warning/20' },
    danger: { bg: 'bg-danger', text: 'text-danger', light: 'bg-danger/20' },
  };

  const colors = colorMap[color];
  const pulseClass = color === 'danger' ? 'pulse-danger' : color === 'warning' ? 'pulse-warning' : '';

  return (
    <div className={`glass-card p-4 lg:p-6 ${pulseClass}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-text-primary">
          💳 Presupuesto de {status.profileName}
        </h3>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${colors.light} ${colors.text}`}>
          {status.currentHalf === 1 ? '1ra Quincena' : '2da Quincena'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-text-secondary">Gastado</span>
          <span className={`font-semibold ${colors.text}`}>
            {status.percentage.toFixed(0)}%
          </span>
        </div>
        <div className="w-full h-3 bg-bg-input rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${colors.bg}`}
            style={{ width: `${Math.min(status.percentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-text-muted">Presupuesto</p>
          <p className="text-sm font-bold text-text-primary">
            ${status.budget.toLocaleString('es-AR')}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Gastado</p>
          <p className={`text-sm font-bold ${colors.text}`}>
            ${status.spent.toLocaleString('es-AR')}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Disponible</p>
          <p className={`text-sm font-bold ${status.remaining < 0 ? 'text-danger' : 'text-success'}`}>
            ${status.remaining.toLocaleString('es-AR')}
          </p>
        </div>
      </div>

      {status.percentage >= 90 && (
        <div className="mt-3 p-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs text-center animate-fade-in">
          ⚠️ ¡Estás cerca del límite de tu presupuesto!
        </div>
      )}
    </div>
  );
}
