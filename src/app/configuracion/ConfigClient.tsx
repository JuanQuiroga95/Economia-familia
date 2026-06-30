'use client';

import { useState, useTransition } from 'react';
import { upsertExchangeRate, createCategory, deleteCategory, updateBudgetConfig } from '@/actions/config';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

interface ExchangeRate {
  id: string;
  month: number;
  year: number;
  usdToArs: number;
  eurToArs: number;
  eurToUsd: number;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface BudgetConfig {
  id: string;
  profileId: string;
  firstHalfBudget: number;
  secondHalfBudget: number;
  profile: { id: string; name: string };
}

interface ConfigClientProps {
  exchangeRates: ExchangeRate[];
  categories: Category[];
  budgetConfigs: BudgetConfig[];
}

const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function ConfigClient({ exchangeRates, categories, budgetConfigs }: ConfigClientProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const now = new Date();

  // Exchange rate form
  const [erMonth, setErMonth] = useState(now.getMonth() + 1);
  const [erYear, setErYear] = useState(now.getFullYear());
  const [usdToArs, setUsdToArs] = useState('');
  const [eurToArs, setEurToArs] = useState('');
  const [eurToUsd, setEurToUsd] = useState('');

  // Category form
  const [showCatForm, setShowCatForm] = useState(false);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('📦');
  const [catColor, setCatColor] = useState('#6366f1');

  const handleExchangeRate = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await upsertExchangeRate({
        month: erMonth,
        year: erYear,
        usdToArs: parseFloat(usdToArs),
        eurToArs: parseFloat(eurToArs),
        eurToUsd: parseFloat(eurToUsd),
      });
      if (result.success) { toast.success('Tipo de cambio actualizado'); router.refresh(); }
      else { toast.error(result.error || 'Error'); }
    });
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await createCategory({ name: catName, icon: catIcon, color: catColor });
      if (result.success) {
        toast.success('Categoría creada');
        setCatName(''); setShowCatForm(false);
        router.refresh();
      } else { toast.error(result.error || 'Error'); }
    });
  };

  const handleDeleteCategory = (id: string) => {
    startTransition(async () => {
      const result = await deleteCategory(id);
      if (result.success) { toast.success('Categoría eliminada'); router.refresh(); }
      else { toast.error(result.error || 'Error'); }
    });
  };

  const handleBudgetUpdate = (config: BudgetConfig, first: string, second: string) => {
    startTransition(async () => {
      const result = await updateBudgetConfig({
        profileId: config.profileId,
        firstHalfBudget: parseFloat(first),
        secondHalfBudget: parseFloat(second),
      });
      if (result.success) { toast.success('Presupuesto actualizado'); router.refresh(); }
      else { toast.error(result.error || 'Error'); }
    });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-text-primary">Configuración</h1>
        <p className="text-text-muted text-sm mt-1">Tipo de cambio, categorías y presupuestos</p>
      </div>

      {/* Exchange Rates */}
      <section className="glass-card p-4 lg:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">💱 Tipo de Cambio</h2>
        <form onSubmit={handleExchangeRate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Mes</label>
              <select value={erMonth} onChange={(e) => setErMonth(parseInt(e.target.value))} className="input-field">
                {monthNames.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Año</label>
              <input type="number" value={erYear} onChange={(e) => setErYear(parseInt(e.target.value))} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">USD → ARS</label>
              <input type="number" step="0.01" value={usdToArs} onChange={(e) => setUsdToArs(e.target.value)} className="input-field" placeholder="1200" required />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">EUR → ARS</label>
              <input type="number" step="0.01" value={eurToArs} onChange={(e) => setEurToArs(e.target.value)} className="input-field" placeholder="1350" required />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">EUR → USD</label>
              <input type="number" step="0.01" value={eurToUsd} onChange={(e) => setEurToUsd(e.target.value)} className="input-field" placeholder="1.08" required />
            </div>
          </div>
          <button type="submit" disabled={isPending} className="gradient-btn px-6 py-2 text-sm disabled:opacity-50">
            {isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </form>

        {/* History */}
        {exchangeRates.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-text-secondary mb-2">Historial</h3>
            <div className="space-y-2">
              {exchangeRates.slice(0, 6).map((rate) => (
                <div key={rate.id} className="flex items-center justify-between p-3 bg-bg-input rounded-xl text-sm">
                  <span className="text-text-secondary">{monthNames[rate.month - 1]} {rate.year}</span>
                  <div className="flex gap-4 text-text-muted">
                    <span>USD: ${rate.usdToArs}</span>
                    <span>EUR: ${rate.eurToArs}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Categories */}
      <section className="glass-card p-4 lg:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">🏷️ Categorías</h2>
          <button onClick={() => setShowCatForm(!showCatForm)} className="text-sm text-accent hover:text-accent-hover">
            {showCatForm ? '✕ Cerrar' : '+ Nueva'}
          </button>
        </div>

        {showCatForm && (
          <form onSubmit={handleCreateCategory} className="p-3 bg-bg-input rounded-xl space-y-3 animate-fade-in">
            <div className="grid grid-cols-3 gap-3">
              <input type="text" value={catIcon} onChange={(e) => setCatIcon(e.target.value)} className="input-field text-center" placeholder="📦" maxLength={2} />
              <input type="text" value={catName} onChange={(e) => setCatName(e.target.value)} className="input-field col-span-2" placeholder="Nombre" required />
            </div>
            <div className="flex items-center gap-3">
              <input type="color" value={catColor} onChange={(e) => setCatColor(e.target.value)} className="w-10 h-10 rounded-lg border-0 cursor-pointer" />
              <button type="submit" disabled={isPending} className="gradient-btn px-4 py-2 text-sm flex-1 disabled:opacity-50">
                Crear
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between p-3 bg-bg-input rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                <span className="text-sm text-text-secondary">{cat.icon} {cat.name}</span>
              </div>
              <button
                onClick={() => handleDeleteCategory(cat.id)}
                className="text-text-muted hover:text-danger transition-colors text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Budget Config */}
      <section className="glass-card p-4 lg:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">💳 Presupuesto Quincenal</h2>
        {budgetConfigs.map((config) => (
          <BudgetConfigForm key={config.id} config={config} onSave={handleBudgetUpdate} isPending={isPending} />
        ))}
      </section>
    </div>
  );
}

function BudgetConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: BudgetConfig;
  onSave: (config: BudgetConfig, first: string, second: string) => void;
  isPending: boolean;
}) {
  const [first, setFirst] = useState(config.firstHalfBudget.toString());
  const [second, setSecond] = useState(config.secondHalfBudget.toString());

  return (
    <div className="p-3 bg-bg-input rounded-xl space-y-3">
      <p className="text-sm font-medium text-text-secondary">{config.profile.name}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1">1ra Quincena (ARS)</label>
          <input type="number" value={first} onChange={(e) => setFirst(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">2da Quincena (ARS)</label>
          <input type="number" value={second} onChange={(e) => setSecond(e.target.value)} className="input-field" />
        </div>
      </div>
      <button onClick={() => onSave(config, first, second)} disabled={isPending} className="gradient-btn px-4 py-2 text-sm disabled:opacity-50">
        Guardar
      </button>
    </div>
  );
}
