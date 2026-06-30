'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface MonthData {
  name: string;
  ingresos: number;
  gastos: number;
}

export default function IncomeVsExpenseChart({ data }: { data: MonthData[] }) {
  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  return (
    <div className="glass-card p-4 lg:p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-4">Ingresos vs Gastos</h3>
      <div className="h-64 lg:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(129,140,248,0.1)" />
            <XAxis
              dataKey="name"
              stroke="#6366a0"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              stroke="#6366a0"
              fontSize={12}
              tickLine={false}
              tickFormatter={formatCurrency}
            />
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
            <Legend
              wrapperStyle={{ fontSize: '12px', color: '#a5b4fc' }}
            />
            <Bar
              dataKey="ingresos"
              name="Ingresos"
              fill="#34d399"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
            <Bar
              dataKey="gastos"
              name="Gastos"
              fill="#f87171"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
