'use client';

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import type { CategoryBreakdown } from '@/types';

export default function CategoryPieChart({ data }: { data: CategoryBreakdown[] }) {
  if (data.length === 0) {
    return (
      <div className="glass-card p-4 lg:p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Gastos por Categoría</h3>
        <div className="flex items-center justify-center h-64 text-text-muted">
          No hay gastos este mes
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 lg:p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-4">Gastos por Categoría</h3>
      <div className="flex flex-col lg:flex-row items-center gap-4">
        <div className="h-52 w-52 lg:h-64 lg:w-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="total"
                nameKey="category"
                strokeWidth={2}
                stroke="#0a0a1a"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#1a1a3e',
                  border: '1px solid rgba(129,140,248,0.2)',
                  borderRadius: '12px',
                  color: '#e0e7ff',
                  fontSize: '13px',
                }}
                formatter={(value: any) => {
                  const numValue = typeof value === 'number' ? value : 0;
                  return [`$${numValue.toLocaleString('es-AR')}`, ''];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2 w-full">
          {data.slice(0, 6).map((item) => (
            <div key={item.category} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-text-secondary">
                  {item.icon} {item.category}
                </span>
              </div>
              <span className="text-text-primary font-medium">
                {item.percentage.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
