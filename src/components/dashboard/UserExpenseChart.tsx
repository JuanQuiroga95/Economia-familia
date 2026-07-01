'use client';
import { formatCurrency } from '@/lib/formatUtils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';
import type { UserExpenseBreakdown } from '@/types';

interface UserExpenseChartProps {
  data: UserExpenseBreakdown[];
}

export default function UserExpenseChart({ data }: UserExpenseChartProps) {
  if (!data || data.length === 0) return null;

  const total = data.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="glass-card p-4 lg:p-6 h-[400px] flex flex-col">
      <h3 className="text-lg font-bold text-text-primary mb-4">Desglose de Gastos del Mes</h3>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
            <XAxis 
              dataKey="name" 
              stroke="#ffffff50" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false} 
            />
            <YAxis 
              stroke="#ffffff50" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false}
              tickFormatter={(value) => `$${(value / 1000)}k`}
            />
            <Tooltip 
              cursor={{ fill: '#ffffff05' }}
              contentStyle={{ 
                backgroundColor: 'rgba(15, 15, 20, 0.95)', 
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: '#fff',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
              }}
              formatter={(value: any, name: any, props: any) => {
                const percentage = props.payload.percentage.toFixed(1);
                return [`$${formatCurrency(value as number)} (${percentage}%)`, 'Monto'];
              }}
            />
            <Bar dataKey="total" radius={[6, 6, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center text-sm text-text-muted mt-2">
        Total gastado: <span className="font-bold text-text-primary">${formatCurrency(total)}</span>
      </div>
    </div>
  );
}
