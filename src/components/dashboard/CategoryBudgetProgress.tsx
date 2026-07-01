'use client';
import { formatCurrency } from '@/lib/formatUtils';
import type { CategoryBudgetStatus } from '@/types';
import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

interface CategoryBudgetProgressProps {
  budgets: CategoryBudgetStatus[];
}

export default function CategoryBudgetProgress({ budgets }: CategoryBudgetProgressProps) {
  const alertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    budgets.forEach((b) => {
      if (b.percentage >= 80 && !alertedRef.current.has(b.categoryId)) {
        toast.error(
          `¡Alerta de Presupuesto! Has gastado el ${b.percentage.toFixed(0)}% del límite en ${b.categoryName}.`,
          { duration: 5000, icon: '⚠️' }
        );
        alertedRef.current.add(b.categoryId);
      }
    });
  }, [budgets]);

  if (!budgets || budgets.length === 0) return null;

  return (
    <div className="glass-card p-4 lg:p-6 mb-6">
      <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
        <span>📊</span> Presupuestos por Categoría
      </h3>
      <div className="space-y-4">
        {budgets.map((b) => {
          const isWarning = b.percentage >= 80;
          const isDanger = b.percentage >= 100;
          
          return (
            <div key={b.categoryId} className="space-y-1">
              <div className="flex justify-between items-end mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{b.categoryIcon}</span>
                  <span className="text-sm font-medium text-text-primary">{b.categoryName}</span>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${isDanger ? 'text-danger' : isWarning ? 'text-warning' : 'text-text-primary'}`}>
                    ${formatCurrency(b.spent)}
                  </span>
                  <span className="text-xs text-text-muted ml-1">/ ${formatCurrency(b.budget)}</span>
                </div>
              </div>
              
              <div className="w-full h-3 bg-bg-input rounded-full overflow-hidden relative">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ${isDanger ? 'bg-danger' : isWarning ? 'bg-warning' : 'bg-success'}`}
                  style={{ width: `${Math.min(b.percentage, 100)}%` }}
                />
              </div>
              <div className="text-right">
                <span className={`text-xs ${isDanger ? 'text-danger' : isWarning ? 'text-warning' : 'text-text-muted'}`}>
                  {b.percentage.toFixed(1)}% consumido
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
