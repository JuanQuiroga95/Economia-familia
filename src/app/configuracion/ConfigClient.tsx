'use client';

import { useState, useTransition } from 'react';
import { upsertExchangeRate, createCategory, deleteCategory, updateBudgetConfig, updateSplitMode } from '@/actions/config';
import { generateTelegramLinkCode, unlinkTelegram } from '@/actions/telegram';
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
  isActive: boolean;
  profile: { id: string; name: string };
}

interface ProfileData {
  id: string;
  name: string;
  avatar: string | null;
  telegramChatId: string | null;
  telegramLinkCode: string | null;
}

interface ConfigClientProps {
  exchangeRates: ExchangeRate[];
  categories: Category[];
  budgetConfigs: BudgetConfig[];
  profiles: ProfileData[];
  splitMode: string;
  splitPercentA: number;
  splitPercentB: number;
}

const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function ConfigClient({ exchangeRates, categories, budgetConfigs, profiles, splitMode: initialSplitMode, splitPercentA: initialPercentA, splitPercentB: initialPercentB }: ConfigClientProps) {
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

  // Split mode
  const [splitMode, setSplitMode] = useState(initialSplitMode);
  const [percentA, setPercentA] = useState(initialPercentA.toString());
  const [percentB, setPercentB] = useState(initialPercentB.toString());

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

  const handleBudgetUpdate = (profileId: string, first: string, second: string, isActive: boolean) => {
    startTransition(async () => {
      const result = await updateBudgetConfig({
        profileId,
        firstHalfBudget: parseFloat(first) || 0,
        secondHalfBudget: parseFloat(second) || 0,
        isActive,
      });
      if (result.success) { toast.success('Presupuesto actualizado'); router.refresh(); }
      else { toast.error(result.error || 'Error'); }
    });
  };

  const handleSplitMode = () => {
    startTransition(async () => {
      const result = await updateSplitMode({
        splitMode: splitMode as 'FONDO_COMUN' | 'PORCENTAJE',
        splitPercentA: parseFloat(percentA) || 50,
        splitPercentB: parseFloat(percentB) || 50,
      });
      if (result.success) { toast.success('Modo de división actualizado'); router.refresh(); }
      else { toast.error(result.error || 'Error'); }
    });
  };

  // Sort profiles alphabetically for consistent A/B assignment
  const sortedProfiles = [...profiles].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-text-primary">Configuración</h1>
        <p className="text-text-muted text-sm mt-1">Tipo de cambio, categorías, presupuestos y más</p>
      </div>

      {/* Exchange Rates */}
      <section className="glass-card p-4 lg:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">💱 Tipo de Cambio</h2>
          <span className="text-xs px-2 py-1 bg-success/20 text-success rounded-full border border-success/30">DolarAPI (Automático)</span>
        </div>
        <p className="text-xs text-text-muted">Las cotizaciones del mes actual se sincronizan automáticamente cada día usando los valores del Dólar Blue y Euro oficial. Podés sobreescribirlas manualmente si lo necesitás.</p>
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

      {/* Telegram Link */}
      <section className="glass-card p-4 lg:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">🤖 Telegram Bot</h2>
        <p className="text-xs text-text-muted">
          Vinculá tu cuenta con Telegram para registrar gastos e ingresos mandando mensajes o audios.
        </p>
        <div className="space-y-3">
          {profiles.map((profile) => (
            <div key={profile.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-bg-input rounded-xl border border-border/50">
              <div className="flex items-center gap-3 mb-3 sm:mb-0">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-lg">
                  {profile.avatar || '👤'}
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{profile.name}</p>
                  <p className="text-xs text-text-muted">
                    {profile.telegramChatId ? '✅ Vinculado' : profile.telegramLinkCode ? '⏳ Esperando vinculación' : '❌ No vinculado'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {profile.telegramChatId ? (
                  <button
                    onClick={() => {
                      startTransition(async () => {
                        const res = await unlinkTelegram(profile.id);
                        if (res.success) toast.success('Desvinculado');
                        else toast.error(res.error || 'Error');
                      });
                    }}
                    disabled={isPending}
                    className="px-3 py-1.5 text-xs text-danger hover:bg-danger/10 rounded-lg transition-colors"
                  >
                    Desvincular
                  </button>
                ) : profile.telegramLinkCode ? (
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <div className="px-4 py-2 bg-bg-secondary rounded-lg font-mono text-accent text-lg tracking-widest text-center w-full sm:w-auto">
                      {profile.telegramLinkCode}
                    </div>
                    <div className="text-xs text-text-muted text-center sm:text-left max-w-[200px]">
                      Enviá este código al bot en Telegram para vincular tu cuenta.
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      startTransition(async () => {
                        const res = await generateTelegramLinkCode(profile.id);
                        if (res.success) toast.success('Código generado');
                        else toast.error(res.error || 'Error');
                      });
                    }}
                    disabled={isPending}
                    className="gradient-btn px-4 py-2 text-sm w-full sm:w-auto"
                  >
                    Generar PIN
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="mt-2 text-center">
            <a
              href="https://t.me/TuEconoAppBot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent hover:underline flex items-center justify-center gap-2"
            >
              <span>Abrir bot en Telegram</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Budget Config - for all profiles */}
      <section className="glass-card p-4 lg:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">💳 Presupuesto Quincenal</h2>
        <p className="text-xs text-text-muted">Configurá el límite de gasto para cada integrante. Si no querés límite, dejalo desactivado.</p>
        {profiles.map((profile) => {
          const config = budgetConfigs.find((c) => c.profileId === profile.id);
          return (
            <BudgetConfigForm
              key={profile.id}
              profile={profile}
              config={config || null}
              onSave={handleBudgetUpdate}
              isPending={isPending}
            />
          );
        })}
      </section>

      {/* Split Mode */}
      <section className="glass-card p-4 lg:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">🤝 Gastos Compartidos</h2>
        <p className="text-xs text-text-muted">Elegí cómo se dividen los gastos compartidos entre los integrantes.</p>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setSplitMode('FONDO_COMUN')}
            className={`p-4 rounded-xl text-sm font-medium transition-all border ${
              splitMode === 'FONDO_COMUN'
                ? 'bg-accent/20 text-accent border-accent/30'
                : 'bg-bg-input text-text-secondary border-border hover:border-accent/20'
            }`}
          >
            <span className="text-lg block mb-1">🏦</span>
            Fondo Común
            <span className="block text-xs text-text-muted mt-1">100% va al fondo compartido</span>
          </button>
          <button
            type="button"
            onClick={() => setSplitMode('PORCENTAJE')}
            className={`p-4 rounded-xl text-sm font-medium transition-all border ${
              splitMode === 'PORCENTAJE'
                ? 'bg-accent/20 text-accent border-accent/30'
                : 'bg-bg-input text-text-secondary border-border hover:border-accent/20'
            }`}
          >
            <span className="text-lg block mb-1">📊</span>
            Porcentaje
            <span className="block text-xs text-text-muted mt-1">Cada uno paga su %</span>
          </button>
        </div>

        {splitMode === 'PORCENTAJE' && sortedProfiles.length >= 2 && (
          <div className="p-3 bg-bg-input rounded-xl space-y-3 animate-fade-in">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">{sortedProfiles[0].name} (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={percentA}
                  onChange={(e) => {
                    setPercentA(e.target.value);
                    setPercentB((100 - parseFloat(e.target.value || '0')).toString());
                  }}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">{sortedProfiles[1].name} (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={percentB}
                  onChange={(e) => {
                    setPercentB(e.target.value);
                    setPercentA((100 - parseFloat(e.target.value || '0')).toString());
                  }}
                  className="input-field"
                />
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleSplitMode}
          disabled={isPending}
          className="gradient-btn px-6 py-2 text-sm disabled:opacity-50"
        >
          {isPending ? 'Guardando...' : 'Guardar Modo'}
        </button>
      </section>
    </div>
  );
}

function BudgetConfigForm({
  profile,
  config,
  onSave,
  isPending,
}: {
  profile: ProfileData;
  config: BudgetConfig | null;
  onSave: (profileId: string, first: string, second: string, isActive: boolean) => void;
  isPending: boolean;
}) {
  const [first, setFirst] = useState(config?.firstHalfBudget.toString() || '');
  const [second, setSecond] = useState(config?.secondHalfBudget.toString() || '');
  const [isActive, setIsActive] = useState(config?.isActive ?? false);

  return (
    <div className="p-3 bg-bg-input rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-secondary">{profile.avatar} {profile.name}</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-text-muted">{isActive ? 'Activo' : 'Inactivo'}</span>
          <div
            className={`relative w-10 h-5 rounded-full transition-colors ${isActive ? 'bg-accent' : 'bg-border'}`}
            onClick={() => setIsActive(!isActive)}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </label>
      </div>
      {isActive && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">1ra Quincena (ARS)</label>
              <input type="number" value={first} onChange={(e) => setFirst(e.target.value)} className="input-field" placeholder="50000" />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">2da Quincena (ARS)</label>
              <input type="number" value={second} onChange={(e) => setSecond(e.target.value)} className="input-field" placeholder="50000" />
            </div>
          </div>
        </>
      )}
      <button
        onClick={() => onSave(profile.id, first, second, isActive)}
        disabled={isPending}
        className="gradient-btn px-4 py-2 text-sm disabled:opacity-50"
      >
        Guardar
      </button>
    </div>
  );
}
