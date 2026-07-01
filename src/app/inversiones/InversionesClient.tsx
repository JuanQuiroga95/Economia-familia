'use client';

import { useState, useTransition } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { createInvestment, deleteInvestment } from '@/actions/investments';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

interface Investment {
  id: string;
  name: string;
  type: string;
  amount: number;
  currency: string;
  returnRate: number | null;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  profile: { id: string; name: string; avatar: string | null };
}

const investmentTypeLabels: Record<string, string> = {
  PLAZO_FIJO: '🏦 Plazo Fijo',
  FCI: '📊 FCI',
  ACCIONES: '📈 Acciones',
  CRYPTO: '🪙 Crypto',
  BONOS: '📜 Bonos',
  OTRO: '📦 Otro',
};

export default function InversionesClient({ initialInvestments }: { initialInvestments: Investment[] }) {
  const { activeProfile } = useProfile();
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [name, setName] = useState('');
  const [type, setType] = useState('PLAZO_FIJO');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [returnRate, setReturnRate] = useState('');
  // Generar fecha actual en la zona horaria local, no en UTC
  const getLocalDateString = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  };

  const [startDate, setStartDate] = useState(getLocalDateString());
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) { toast.error('Seleccioná un perfil'); return; }

    startTransition(async () => {
      const result = await createInvestment({
        name,
        type: type as 'PLAZO_FIJO' | 'FCI' | 'ACCIONES' | 'CRYPTO' | 'BONOS' | 'OTRO',
        amount: parseFloat(amount),
        currency: currency as 'ARS' | 'USD' | 'EUR',
        returnRate: returnRate ? parseFloat(returnRate) : undefined,
        startDate,
        endDate: endDate || undefined,
        notes: notes || undefined,
        profileId: activeProfile.id,
      });

      if (result.success) {
        toast.success('Inversión registrada');
        setName(''); setAmount(''); setReturnRate(''); setEndDate(''); setNotes('');
        setShowForm(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Error');
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteInvestment(id);
      if (result.success) { toast.success('Inversión eliminada'); router.refresh(); }
      else { toast.error(result.error || 'Error'); }
    });
  };

  // Group by currency
  const totalByCurrency = initialInvestments.reduce((acc, inv) => {
    acc[inv.currency] = (acc[inv.currency] || 0) + inv.amount;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-text-primary">Inversiones</h1>
          <p className="text-text-muted text-sm mt-1">Plazos fijos, fondos y más</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="gradient-btn px-4 py-2 text-sm">
          {showForm ? '✕ Cerrar' : '+ Nueva'}
        </button>
      </div>

      {/* Summary */}
      {Object.keys(totalByCurrency).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(totalByCurrency).map(([cur, total]) => (
            <div key={cur} className="glass-card p-4">
              <p className="text-xs text-text-muted">Total {cur}</p>
              <p className="text-lg font-bold text-accent">${total.toLocaleString('es-AR')}</p>
            </div>
          ))}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="glass-card p-4 lg:p-6 space-y-4 animate-slide-up">
          <h3 className="text-lg font-semibold">Nueva Inversión</h3>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Nombre</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="Ej: Plazo fijo Banco Nación" required />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="input-field">
              {Object.entries(investmentTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Monto</label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input-field" placeholder="0.00" required />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Moneda</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input-field">
                <option value="ARS">🇦🇷 ARS</option>
                <option value="USD">🇺🇸 USD</option>
                <option value="EUR">🇪🇺 EUR</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Tasa de retorno anual % (opcional)</label>
            <input type="number" step="0.01" value={returnRate} onChange={(e) => setReturnRate(e.target.value)} className="input-field" placeholder="Ej: 45.5" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Fecha inicio</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Vencimiento (opcional)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Notas (opcional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" rows={2} placeholder="Observaciones..." />
          </div>
          <button type="submit" disabled={isPending} className="w-full gradient-btn py-3 disabled:opacity-50">
            {isPending ? 'Guardando...' : 'Registrar Inversión'}
          </button>
        </form>
      )}

      {/* List */}
      {initialInvestments.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <span className="text-4xl">📈</span>
          <p className="text-text-muted mt-2">No hay inversiones registradas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {initialInvestments.map((inv) => (
            <div key={inv.id} className="glass-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-lg">
                  {investmentTypeLabels[inv.type]?.split(' ')[0] || '📦'}
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{inv.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-text-muted">{inv.profile.name}</span>
                    <span className="text-xs text-text-muted">•</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
                      {investmentTypeLabels[inv.type]?.split(' ').slice(1).join(' ') || inv.type}
                    </span>
                    {inv.returnRate && (
                      <span className="text-xs text-success">{inv.returnRate}% TNA</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-bold text-accent">${inv.amount.toLocaleString('es-AR')}</p>
                  <p className="text-xs text-text-muted">{inv.currency}</p>
                </div>
                <button
                  onClick={() => handleDelete(inv.id)}
                  className="p-2 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-all"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
