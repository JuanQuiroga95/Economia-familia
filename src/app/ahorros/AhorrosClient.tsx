'use client';
import { formatCurrency } from '@/lib/formatUtils';
import { useState, useTransition } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { createSavingsGoal, addSavingsTransaction, deleteSavingsGoal, distributeSurplus, updateSavingsGoal, withdrawToBalanceFromSavings } from '@/actions/savings';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CurrencyInput } from '@/components/CurrencyInput';

interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  accountId: string;
  monthsToAchieve: number | null;
  monthlySplits: Record<string, number> | null;
  transactions: {
    id: string;
    amount: number;
    type: string;
    description: string | null;
    date: string;
    profileId: string;
    profile: { id: string; name: string; avatar: string | null };
  }[];
}

interface PatrimonioStats {
  savingsByCurrency: Record<string, number>;
  investmentsByCurrency: Record<string, number>;
  surplusByCurrency: Record<string, number>;
  totalByCurrency: Record<string, number>;
  savingsCount: number;
  investmentsCount: number;
}

interface ProfileData {
  id: string;
  name: string;
  avatar: string | null;
}

interface AhorrosClientProps {
  initialGoals: SavingsGoal[];
  patrimonio: PatrimonioStats;
  rates?: { usdToArs: number; eurToArs: number } | null;
  profiles?: ProfileData[];
  accountSplits?: { a: number; b: number };
}

const currencyFlags: Record<string, string> = {
  ARS: '🇦🇷',
  USD: '🇺🇸',
  EUR: '🇪🇺',
};

export default function AhorrosClient({ initialGoals, patrimonio, rates, profiles = [], accountSplits }: AhorrosClientProps) {
  const { activeProfile } = useProfile();
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<'patrimonio' | 'metas'>('patrimonio');
  
  // Modal for distributing surplus
  const [distributeModal, setDistributeModal] = useState<{ currency: string; amount: number } | null>(null);
  const [distributeAmount, setDistributeAmount] = useState('');
  const [distributeGoalId, setDistributeGoalId] = useState('');
  
  const router = useRouter();

  const handleDistributeSurplus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile || !distributeModal || !distributeGoalId) {
      toast.error('Completá todos los campos');
      return;
    }

    startTransition(async () => {
      const result = await distributeSurplus({
        amount: parseFloat(distributeAmount),
        currency: distributeModal.currency,
        savingsGoalId: distributeGoalId,
        profileId: activeProfile.id,
      });

      if (result.success) {
        toast.success('Sobrante distribuido correctamente');
        setDistributeModal(null);
        setDistributeAmount('');
        setDistributeGoalId('');
        router.refresh();
      } else {
        toast.error(result.error || 'Error al distribuir sobrante');
      }
    });
  };

  // Goal form
  const [goalName, setGoalName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [initialAmount, setInitialAmount] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [monthsToAchieve, setMonthsToAchieve] = useState('');
  
  // State for monthly splits: Record<profileId, amount>
  const [monthlySplits, setMonthlySplits] = useState<Record<string, number>>({});
  const [isFreeEditMode, setIsFreeEditMode] = useState(false);
  
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  const handleSplitChange = (profileId: string, val: string) => {
    const newVal = parseFloat(val) || 0;
    setMonthlySplits(prev => {
      const newSplits = { ...prev, [profileId]: newVal };
      if (!isFreeEditMode && profiles.length === 2) {
        const otherProfileId = profiles.find(p => p.id !== profileId)?.id;
        if (otherProfileId) {
          const tAmt = parseFloat(targetAmount) || 0;
          const mths = parseInt(monthsToAchieve) || 1;
          const monthlyTotal = tAmt > 0 && mths > 0 ? tAmt / mths : 0;
          
          if (monthlyTotal > 0) {
            newSplits[otherProfileId] = Math.max(0, Number((monthlyTotal - newVal).toFixed(2)));
          }
        }
      }
      return newSplits;
    });
  };

  const handleAmountOrMonthsChange = (newTargetAmount: string, newMonths: string) => {
    const tAmt = parseFloat(newTargetAmount) || 0;
    const mths = parseInt(newMonths) || 1; // Default to 1 to avoid infinity

    if (tAmt > 0 && mths > 0 && accountSplits && profiles.length >= 2) {
      const monthlyTotal = tAmt / mths;
      const sortedProfiles = [...profiles].sort((a, b) => a.name.localeCompare(b.name));
      const splitA = (accountSplits.a / 100) * monthlyTotal;
      const splitB = (accountSplits.b / 100) * monthlyTotal;
      
      setMonthlySplits({
        [sortedProfiles[0].id]: splitA,
        [sortedProfiles[1].id]: splitB,
      });
    }
  };

  const resetGoalForm = () => {
    setGoalName('');
    setTargetAmount('');
    setInitialAmount('');
    setCurrency('ARS');
    setMonthsToAchieve('');
    setMonthlySplits({});
    setEditingGoalId(null);
  };

  // Transaction form
  const [txAmount, setTxAmount] = useState('');
  const [txType, setTxType] = useState<'DEPOSITO' | 'RETIRO'>('DEPOSITO');
  const [txDescription, setTxDescription] = useState('');

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) { toast.error('Seleccioná un perfil'); return; }

    if (editingGoalId) {
      if (!window.confirm('¿Estás seguro que querés guardar estos cambios?')) return;
    }

    startTransition(async () => {
      const payload = {
        name: goalName,
        targetAmount: targetAmount ? parseFloat(targetAmount) : 0,
        initialAmount: initialAmount ? parseFloat(initialAmount) : 0,
        currency: currency as 'ARS' | 'USD' | 'EUR',
        profileId: activeProfile.id,
        monthsToAchieve: monthsToAchieve ? parseInt(monthsToAchieve) : null,
        monthlySplits
      };

      const result = editingGoalId 
        ? await updateSavingsGoal(editingGoalId, payload)
        : await createSavingsGoal(payload);

      if (result.success) {
        toast.success(editingGoalId ? 'Meta actualizada' : 'Meta creada');
        resetGoalForm();
        setShowGoalForm(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Error');
      }
    });
  };

  const handleEditGoal = (goal: SavingsGoal) => {
    setEditingGoalId(goal.id);
    setGoalName(goal.name);
    setTargetAmount(goal.targetAmount.toString());
    setCurrency(goal.currency);
    setMonthsToAchieve(goal.monthsToAchieve?.toString() || '');
    setMonthlySplits(goal.monthlySplits || {});
    setInitialAmount(''); // Initial amount only makes sense when creating
    setShowGoalForm(true);
    setActiveTab('metas');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddTransaction = async (goalId: string) => {
    if (!activeProfile) { toast.error('Seleccioná un perfil'); return; }

    startTransition(async () => {
      const result = await addSavingsTransaction({
        savingsGoalId: goalId,
        amount: parseFloat(txAmount),
        type: txType,
        description: txDescription || undefined,
        profileId: activeProfile.id,
      });

      if (result.success) {
        toast.success(txType === 'DEPOSITO' ? 'Depósito registrado' : 'Retiro registrado');
        setTxAmount('');
        setTxDescription('');
        setShowTransactionForm(null);
        router.refresh();
      } else {
        toast.error(result.error || 'Error');
      }
    });
  };

  const handleWithdrawToBalance = (goalId: string, currentAmount: number) => {
    if (!activeProfile) { toast.error('Seleccioná un perfil'); return; }
    
    const amountStr = prompt(`¿Cuánto querés transferir al Balance General? (Máximo: ${currentAmount})`);
    if (!amountStr) return;
    
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0 || amount > currentAmount) {
      toast.error('Monto inválido');
      return;
    }

    startTransition(async () => {
      const result = await withdrawToBalanceFromSavings(goalId, amount, activeProfile.id);
      if (result.success) {
        toast.success('Fondos transferidos al balance');
        router.refresh();
      } else {
        toast.error(result.error || 'Error al transferir');
      }
    });
  };

  const handleDeleteGoal = (id: string) => {
    if (!window.confirm('¿Estás seguro que querés eliminar esta meta?')) return;
    startTransition(async () => {
      const result = await deleteSavingsGoal(id);
      if (result.success) {
        toast.success('Meta eliminada');
        router.refresh();
      } else {
        toast.error(result.error || 'Error');
      }
    });
  };

  const hasSavings = Object.values(patrimonio.savingsByCurrency).some((v) => v > 0);
  const hasInvestments = Object.values(patrimonio.investmentsByCurrency).some((v) => v > 0);
  const hasSurplus = Object.values(patrimonio.surplusByCurrency).some((v) => v !== 0);

  // Agrupamos metas por moneda para la nueva vista tipo Excel
  const goalsByCurrency = initialGoals.reduce((acc, goal) => {
    if (!acc[goal.currency]) acc[goal.currency] = [];
    acc[goal.currency].push(goal);
    return acc;
  }, {} as Record<string, SavingsGoal[]>);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-text-primary">Ahorros</h1>
          <p className="text-text-muted text-sm mt-1">Tu plata guardada y metas de ahorro</p>
        </div>
        <button onClick={() => {
          if (showGoalForm) {
            setShowGoalForm(false);
            resetGoalForm();
          } else {
            setShowGoalForm(true);
            setActiveTab('metas');
          }
        }} className="gradient-btn px-4 py-2 text-sm">
          {showGoalForm ? '✕ Cerrar' : '+ Nueva Meta'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('patrimonio')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'patrimonio'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover'
          }`}
        >
          💰 Plata Guardada
        </button>
        <button
          onClick={() => setActiveTab('metas')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'metas'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover'
          }`}
        >
          🎯 Metas ({initialGoals.length})
        </button>
      </div>

      {/* New goal form */}
      {showGoalForm && (
        <form onSubmit={handleCreateGoal} className="glass-card p-4 lg:p-6 space-y-4 animate-slide-up">
          <h3 className="text-lg font-semibold">{editingGoalId ? 'Editar Meta' : 'Nueva Meta'}</h3>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Nombre</label>
            <input
              type="text"
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              className="input-field"
              placeholder="Ej: Vacaciones, Auto, etc."
              required
            />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                Que Necesitamos
              </label>
              <CurrencyInput
                value={targetAmount}
                onChange={(e) => {
                  setTargetAmount(e.target.value);
                  handleAmountOrMonthsChange(e.target.value, monthsToAchieve);
                }}
                className="input-field"
                placeholder="Monto objetivo"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                Meses Para Lograrlo
              </label>
              <input
                type="number"
                value={monthsToAchieve}
                onChange={(e) => {
                  setMonthsToAchieve(e.target.value);
                  handleAmountOrMonthsChange(targetAmount, e.target.value);
                }}
                className="input-field"
                placeholder="Ej: 3"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Moneda</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input-field">
                <option value="ARS">🇦🇷 ARS</option>
                <option value="USD">🇺🇸 USD</option>
                <option value="EUR">🇪🇺 EUR</option>
              </select>
            </div>
            {!editingGoalId && (
              <div>
                <label className="block text-sm text-text-secondary mb-1">Ahorro inicial</label>
                <CurrencyInput value={initialAmount} onChange={(e) => setInitialAmount(e.target.value)} className="input-field" placeholder="Monto ya ahorrado" />
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-border mt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-text-primary">Aporte Mensual por Persona</h4>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-text-secondary hover:text-text-primary transition-colors">
                <input 
                  type="checkbox" 
                  checked={isFreeEditMode}
                  onChange={(e) => setIsFreeEditMode(e.target.checked)}
                  className="rounded border-border text-accent focus:ring-accent/30 bg-bg-input"
                />
                Edición libre
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {profiles.map(p => (
                <div key={p.id}>
                  <label className="block text-xs text-text-secondary mb-1">{p.name}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={monthlySplits[p.id] || ''}
                    onChange={(e) => handleSplitChange(p.id, e.target.value)}
                    className="input-field py-2"
                    placeholder={`Aporte de ${p.name}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <button type="submit" disabled={isPending} className="w-full gradient-btn py-3 disabled:opacity-50 mt-4">
            {isPending ? 'Guardando...' : (editingGoalId ? 'Actualizar Meta' : 'Crear Meta')}
          </button>
        </form>
      )}

      {/* ========== TAB: PATRIMONIO ========== */}
      {activeTab === 'patrimonio' && (
        <div className="space-y-4 animate-fade-in">
          {/* Totales por moneda */}
          {Object.keys(patrimonio.totalByCurrency).length > 0 && (
            <div className="glass-card p-4 lg:p-6">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                🏦 Total Guardado
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {Object.entries(patrimonio.totalByCurrency).map(([cur, total]) => (
                  <div key={cur} className="p-4 rounded-xl bg-gradient-to-br from-accent/10 to-purple-500/10 border border-accent/20">
                    <p className="text-xs text-text-muted">{currencyFlags[cur] || '💱'} {cur}</p>
                    <p className="text-2xl font-bold text-accent mt-1">
                      ${formatCurrency(total)}
                    </p>
                    {cur === 'USD' && rates?.usdToArs && total > 0 && (
                      <p className="text-xs text-text-muted mt-1 opacity-70">
                        ≈ ARS ${formatCurrency(total * rates.usdToArs)} (Cotización: ${formatCurrency(rates.usdToArs)})
                      </p>
                    )}
                    {cur === 'EUR' && rates?.eurToArs && total > 0 && (
                      <p className="text-xs text-text-muted mt-1 opacity-70">
                        ≈ ARS ${formatCurrency(total * rates.eurToArs)} (Cotización: ${formatCurrency(rates.eurToArs)})
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Desglose */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ahorros */}
            <div className="glass-card p-4 lg:p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🐖</span>
                <h3 className="text-base font-semibold text-text-primary">Ahorros</h3>
                <span className="text-xs text-text-muted ml-auto">{patrimonio.savingsCount} metas</span>
              </div>
              {hasSavings ? (
                <div className="space-y-2">
                  {Object.entries(patrimonio.savingsByCurrency).map(([cur, total]) => (
                    total > 0 && (
                      <div key={cur} className="flex items-center justify-between p-3 rounded-xl bg-bg-input">
                        <span className="text-sm text-text-secondary">{currencyFlags[cur]} {cur}</span>
                        <span className="text-sm font-bold text-success">${formatCurrency(total)}</span>
                      </div>
                    )
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted text-center py-4">No hay ahorros registrados</p>
              )}
            </div>

            {/* Inversiones */}
            <div className="glass-card p-4 lg:p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">📈</span>
                <h3 className="text-base font-semibold text-text-primary">Inversiones</h3>
                <span className="text-xs text-text-muted ml-auto">{patrimonio.investmentsCount} activas</span>
              </div>
              {hasInvestments ? (
                <div className="space-y-2">
                  {Object.entries(patrimonio.investmentsByCurrency).map(([cur, total]) => (
                    total > 0 && (
                      <div key={cur} className="flex items-center justify-between p-3 rounded-xl bg-bg-input">
                        <span className="text-sm text-text-secondary">{currencyFlags[cur]} {cur}</span>
                        <span className="text-sm font-bold text-accent">${formatCurrency(total)}</span>
                      </div>
                    )
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted text-center py-4">No hay inversiones registradas</p>
              )}
            </div>
          </div>

          {/* Sobrante del mes */}
          {hasSurplus && (
            <div className="glass-card p-4 lg:p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">📊</span>
                <h3 className="text-base font-semibold text-text-primary">Sobrante del Mes</h3>
                <span className="text-xs text-text-muted ml-auto">Ingresos − Gastos de este mes</span>
              </div>
              <p className="text-xs text-text-muted mb-3">
                Lo que queda a fin de mes pasa a ser plata guardada. Registralo como depósito en una meta o cuenta.
              </p>
              <div className="space-y-2">
                {Object.entries(patrimonio.surplusByCurrency).map(([cur, surplus]) => (
                  <div key={cur} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-bg-input gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-secondary">{currencyFlags[cur]} {cur}</span>
                      <span className={`text-sm font-bold ${surplus >= 0 ? 'text-success' : 'text-danger'}`}>
                        {surplus >= 0 ? '+' : ''}${formatCurrency(surplus)}
                      </span>
                    </div>
                    {surplus > 0 && (
                      <button
                        onClick={() => setDistributeModal({ currency: cur, amount: surplus })}
                        className="px-3 py-1.5 rounded-lg bg-accent/20 text-accent text-xs font-medium hover:bg-accent/30 transition-all text-center"
                      >
                        Distribuir Sobrante
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasSavings && !hasInvestments && !hasSurplus && (
            <div className="glass-card p-8 text-center">
              <span className="text-4xl">💰</span>
              <p className="text-text-muted mt-2">Creá una meta de ahorro o registrá una inversión para empezar</p>
            </div>
          )}
        </div>
      )}

      {/* ========== TAB: METAS ========== */}
      {activeTab === 'metas' && (
        <div className="space-y-6 animate-fade-in">
          {initialGoals.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <span className="text-4xl">🎯</span>
              <p className="text-text-muted mt-2">No hay metas de ahorro creadas</p>
            </div>
          ) : (
            Object.entries(goalsByCurrency).map(([cur, goalsList]) => (
              <div key={cur} className="glass-card overflow-hidden">
                <div className="bg-bg-input p-4 border-b border-border">
                  <h2 className="text-lg font-bold text-text-primary uppercase tracking-wider">
                    {currencyFlags[cur]} OBJETIVO DE AHORRO EN {cur}
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-bg-card text-text-secondary border-b border-border">
                      <tr>
                        <th className="px-4 py-3 font-semibold uppercase min-w-[200px]">Detalle</th>
                        {goalsList.map(g => (
                          <th key={g.id} className="px-4 py-3 font-semibold text-right min-w-[150px] group">
                            <div className="flex justify-end items-center gap-2">
                              <span>{g.name}</span>
                              <div className="flex gap-2 mt-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEditGoal(g)} className="text-accent bg-bg-card px-2 py-1 rounded border border-border text-xs" title="Editar">✏️ Editar</button>
                                <button onClick={() => handleDeleteGoal(g.id)} className="text-danger bg-bg-card px-2 py-1 rounded border border-border text-xs" title="Eliminar">🗑️ Borrar</button>
                              </div>
                            </div>
                            <div className="text-xs text-text-muted font-normal mt-2">Acumulado: ${formatCurrency(g.currentAmount)}</div>
                          </th>
                        ))}
                        <th className="px-4 py-3 font-semibold text-right text-accent min-w-[120px]">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr className="hover:bg-bg-input/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-text-primary">{cur} QUE NECESITAMOS</td>
                        {goalsList.map(g => (
                          <td key={g.id} className="px-4 py-3 text-right font-medium">${formatCurrency(g.targetAmount)}</td>
                        ))}
                        <td className="px-4 py-3 text-right font-bold text-accent">
                          ${formatCurrency(goalsList.reduce((acc, g) => acc + (g.targetAmount || 0), 0))}
                        </td>
                      </tr>
                      <tr className="hover:bg-bg-input/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-text-primary">MESES PARA LOGRARLO</td>
                        {goalsList.map(g => (
                          <td key={g.id} className="px-4 py-3 text-right text-text-secondary">{g.monthsToAchieve || '-'}</td>
                        ))}
                        <td className="px-4 py-3 text-right text-text-secondary">-</td>
                      </tr>
                      <tr className="hover:bg-bg-input/50 transition-colors bg-bg-input/20">
                        <td className="px-4 py-3 font-bold text-text-primary">AHORRO POR MES</td>
                        {goalsList.map(g => {
                          const perMonth = g.targetAmount && g.monthsToAchieve ? g.targetAmount / g.monthsToAchieve : 0;
                          return <td key={g.id} className="px-4 py-3 text-right font-semibold text-text-primary">${formatCurrency(perMonth)}</td>;
                        })}
                        <td className="px-4 py-3 text-right font-bold text-accent">
                          ${formatCurrency(goalsList.reduce((acc, g) => {
                            const perMonth = g.targetAmount && g.monthsToAchieve ? g.targetAmount / g.monthsToAchieve : 0;
                            return acc + perMonth;
                          }, 0))}
                        </td>
                      </tr>
                      {/* Filas por perfil */}
                      {profiles.map(p => {
                        return (
                          <tr key={p.id} className="hover:bg-bg-input/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-text-primary uppercase flex items-center gap-2">
                              <span>👤</span> {p.name}
                            </td>
                            {goalsList.map(g => {
                              const split = g.monthlySplits ? (g.monthlySplits[p.id] || 0) : 0;
                              return <td key={g.id} className="px-4 py-3 text-right text-text-secondary">${formatCurrency(split)}</td>;
                            })}
                            <td className="px-4 py-3 text-right font-semibold text-text-secondary">
                              ${formatCurrency(goalsList.reduce((acc, g) => {
                                return acc + (g.monthlySplits ? (g.monthlySplits[p.id] || 0) : 0);
                              }, 0))}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Action Row for Transacting */}
                      <tr className="bg-bg-card">
                        <td className="px-4 py-4 text-xs text-text-muted">Operaciones rápidas</td>
                        {goalsList.map(g => (
                          <td key={g.id} className="px-4 py-4 text-right">
                             {showTransactionForm === g.id ? (
                                <div className="p-3 bg-bg-input rounded-xl space-y-2 text-left animate-fade-in shadow-lg border border-border">
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setTxType('DEPOSITO')}
                                      className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
                                        txType === 'DEPOSITO' ? 'bg-success text-white' : 'bg-bg-card border border-border'
                                      }`}
                                    >⬆️ Depósito</button>
                                    <button
                                      type="button"
                                      onClick={() => setTxType('RETIRO')}
                                      className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
                                        txType === 'RETIRO' ? 'bg-danger text-white' : 'bg-bg-card border border-border'
                                      }`}
                                    >⬇️ Retiro</button>
                                  </div>
                                  <CurrencyInput value={txAmount} onChange={(e) => setTxAmount(e.target.value)} className="input-field py-1 text-xs" placeholder="Monto" />
                                  <input type="text" value={txDescription} onChange={(e) => setTxDescription(e.target.value)} className="input-field py-1 text-xs" placeholder="Detalle (opcional)" />
                                  <div className="flex gap-2 pt-1">
                                    <button onClick={() => setShowTransactionForm(null)} className="flex-1 py-1 text-xs text-text-muted hover:text-text-primary">Cancelar</button>
                                    <button onClick={() => handleAddTransaction(g.id)} disabled={isPending || !txAmount} className="flex-1 gradient-btn py-1 text-xs disabled:opacity-50">Guardar</button>
                                  </div>
                                </div>
                             ) : (
                              <button
                                onClick={() => setShowTransactionForm(g.id)}
                                className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-all border border-accent/20"
                              >
                                + Movimiento
                              </button>
                             )}
                          </td>
                        ))}
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal: Distribuir Sobrante */}
      {distributeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-bg-card w-full max-w-md rounded-2xl shadow-xl border border-border overflow-hidden animate-slide-up">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold text-text-primary">Distribuir Sobrante ({distributeModal.currency})</h3>
              <button 
                onClick={() => setDistributeModal(null)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleDistributeSurplus} className="p-4 space-y-4">
              <p className="text-sm text-text-secondary">
                Tenés un sobrante de <strong className="text-accent">${formatCurrency(distributeModal.amount)}</strong> este mes. ¿Dónde querés guardarlo?
              </p>
              
              <div>
                <input
                  type="number"
                  step="0.01"
                  max={distributeModal.amount}
                  value={distributeAmount}
                  onChange={(e) => setDistributeAmount(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder={`Ej: ${distributeModal.amount}`}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Destino (Meta o Cuenta)</label>
                <select
                  value={distributeGoalId}
                  onChange={(e) => setDistributeGoalId(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="" disabled>Seleccioná un destino...</option>
                  {initialGoals
                    .filter((g) => g.currency === distributeModal.currency)
                    .map((g) => (
                      <option key={g.id} value={g.id}>{g.name} (Saldo: ${g.currentAmount})</option>
                  ))}
                </select>
                <div className="mt-2 text-right">
                  <span className="text-xs text-text-muted">¿Querés invertirlo? </span>
                  <Link href="/inversiones" className="text-xs text-accent hover:underline font-medium">
                    Ir a Inversiones →
                  </Link>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isPending || !distributeAmount || !distributeGoalId} 
                className="w-full gradient-btn py-3 disabled:opacity-50 mt-4"
              >
                {isPending ? 'Distribuyendo...' : 'Confirmar Distribución'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
