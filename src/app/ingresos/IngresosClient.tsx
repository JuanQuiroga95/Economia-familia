'use client';
import { formatCurrency } from '@/lib/formatUtils';
import { useState, useTransition } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { createIncome, deleteIncome, updateIncome } from '@/actions/income';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';

interface Income {
  id: string;
  amount: number;
  currency: string;
  date: string;
  description: string;
  profileId: string;
  profile: { id: string; name: string; avatar: string | null };
}

interface IngresosClientProps {
  initialIncomes: Income[];
  currentMonth: number;
  currentYear: number;
}

export default function IngresosClient({ initialIncomes }: IngresosClientProps) {
  const { activeProfile } = useProfile();
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const router = useRouter();

  // Form state
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('ARS');
  // Generar fecha actual en la zona horaria local, no en UTC
  const getLocalDateString = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  };

  const [date, setDate] = useState(getLocalDateString());
  const [description, setDescription] = useState('');

  const triggerConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#26ff52', '#a8ff78']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#26ff52', '#a8ff78']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) {
      toast.error('Seleccioná un perfil primero');
      return;
    }

    startTransition(async () => {
      const incomeData = {
        amount: parseFloat(amount),
        currency: currency as 'ARS' | 'USD' | 'EUR',
        date,
        description,
        profileId: activeProfile.id,
      };

      const result = editingIncomeId
        ? await updateIncome(editingIncomeId, incomeData)
        : await createIncome(incomeData);

      if (result.success) {
        toast.success(editingIncomeId ? 'Ingreso actualizado' : 'Ingreso registrado');
        if (!editingIncomeId) triggerConfetti();
        setAmount('');
        setDescription('');
        setEditingIncomeId(null);
        setShowForm(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Error al guardar');
      }
    });
  };

  const handleEdit = (income: Income) => {
    setEditingIncomeId(income.id);
    setAmount(income.amount.toString());
    setCurrency(income.currency);
    setDate(income.date.split('T')[0]);
    setDescription(income.description);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingIncomeId(null);
    setAmount('');
    setDescription('');
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteIncome(id);
      if (result.success) {
        toast.success('Ingreso eliminado');
        router.refresh();
      } else {
        toast.error(result.error || 'Error al eliminar');
      }
    });
  };

  const totalByProfile = initialIncomes.reduce((acc, inc) => {
    const name = inc.profile.name;
    acc[name] = (acc[name] || 0) + inc.amount;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-text-primary">Ingresos</h1>
          <p className="text-text-muted text-sm mt-1">Registra tus ingresos mensuales</p>
        </div>
        <button
          onClick={showForm ? handleCloseForm : () => setShowForm(true)}
          className="gradient-btn px-4 py-2 text-sm"
        >
          {showForm ? '✕ Cerrar' : '+ Nuevo'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        {Object.entries(totalByProfile).map(([name, total]) => (
          <div key={name} className="glass-card p-4">
            <p className="text-xs text-text-muted">{name}</p>
            <p className="text-lg font-bold text-success">${formatCurrency(total)}</p>
          </div>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="glass-card p-4 lg:p-6 space-y-4 animate-slide-up">
          <h3 className="text-lg font-semibold text-text-primary">{editingIncomeId ? 'Editar Ingreso' : 'Nuevo Ingreso'}</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Monto</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-field"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="input-field"
              >
                <option value="ARS">🇦🇷 ARS</option>
                <option value="USD">🇺🇸 USD</option>
                <option value="EUR">🇪🇺 EUR</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Descripción</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
              placeholder="Ej: Sueldo junio"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full gradient-btn py-3 disabled:opacity-50"
          >
            {isPending ? 'Guardando...' : editingIncomeId ? 'Actualizar Ingreso' : 'Guardar Ingreso'}
          </button>
        </form>
      )}

      {/* List */}
      <div className="space-y-3">
        {initialIncomes.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <span className="text-4xl">💰</span>
            <p className="text-text-muted mt-2">No hay ingresos registrados este mes</p>
          </div>
        ) : (
          initialIncomes.map((income) => (
            <div key={income.id} className="glass-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center text-lg">
                  {income.profile.avatar || '👤'}
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{income.description}</p>
                  <p className="text-xs text-text-muted">
                    {new Date(income.date).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} • {income.profile.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-bold text-success">
                    +${formatCurrency(income.amount)}
                  </p>
                  <p className="text-xs text-text-muted">{income.currency}</p>
                </div>
                <div className="flex">
                  <button
                    onClick={() => handleEdit(income)}
                    className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-all"
                    title="Editar"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(income.id)}
                    className="p-2 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-all"
                    title="Eliminar"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
