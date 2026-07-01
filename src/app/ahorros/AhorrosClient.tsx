'use client';
import { formatCurrency } from '@/lib/formatUtils';
import { useState, useTransition } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { createSavingsGoal, addSavingsTransaction, deleteSavingsGoal, distributeSurplus, updateSavingsGoal, withdrawToBalanceFromSavings } from '@/actions/savings';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  profileId: string;
  profile: { id: string; name: string; avatar: string | null };
  transactions: {
    id: string;
    amount: number;
    type: string;
    description: string | null;
    date: string;
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

interface AhorrosClientProps {
  initialGoals: SavingsGoal[];
  patrimonio: PatrimonioStats;
}

const currencyFlags: Record<string, string> = {
  ARS: '🇦🇷',
  USD: '🇺🇸',
  EUR: '🇪🇺',
};

export default function AhorrosClient({ initialGoals, patrimonio }: AhorrosClientProps) {
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
  
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  const resetGoalForm = () => {
    setGoalName('');
    setTargetAmount('');
    setInitialAmount('');
    setCurrency('ARS');
    setEditingGoalId(null);
  };

  // Transaction form
  const [txAmount, setTxAmount] = useState('');
  const [txType, setTxType] = useState<'DEPOSITO' | 'RETIRO'>('DEPOSITO');
  const [txDescription, setTxDescription] = useState('');

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) { toast.error('Seleccioná un perfil'); return; }

    startTransition(async () => {
      const payload = {
        name: goalName,
        targetAmount: targetAmount ? parseFloat(targetAmount) : 0,
        initialAmount: initialAmount ? parseFloat(initialAmount) : 0,
        currency: currency as 'ARS' | 'USD' | 'EUR',
        profileId: activeProfile.id,
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
              placeholder="Ej: Viaje a Italia, Cuenta general, etc."
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">
                Monto Objetivo
                <span className="text-text-muted text-xs ml-1">(opcional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="input-field"
                placeholder="0 = sin objetivo"
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
          </div>
          {!editingGoalId && (
            <div>
              <label className="block text-sm text-text-secondary mb-1">Ahorro inicial (opcional)</label>
              <input type="number" step="0.01" value={initialAmount} onChange={(e) => setInitialAmount(e.target.value)} className="input-field" placeholder="Monto ya ahorrado" />
            </div>
          )}
          <button type="submit" disabled={isPending} className="w-full gradient-btn py-3 disabled:opacity-50">
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
        <div className="space-y-4 animate-fade-in">
          {initialGoals.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <span className="text-4xl">🎯</span>
              <p className="text-text-muted mt-2">No hay metas de ahorro creadas</p>
            </div>
          ) : (
            initialGoals.map((goal) => {
              const progress = goal.targetAmount > 0
                ? (goal.currentAmount / goal.targetAmount) * 100
                : 0;

              return (
                <div key={goal.id} className="glass-card p-4 lg:p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-text-primary">🎯 {goal.name}</h3>
                      <p className="text-xs text-text-muted">{goal.profile.name} • {goal.currency}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowTransactionForm(showTransactionForm === goal.id ? null : goal.id)}
                        className="px-3 py-1.5 rounded-lg bg-accent/20 text-accent text-xs font-medium hover:bg-accent/30 transition-all"
                      >
                        💵 Movimiento
                      </button>
                      <button
                        onClick={() => handleWithdrawToBalance(goal.id, goal.currentAmount)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-all text-xs"
                        title="Transferir a Balance"
                      >
                        🏦
                      </button>
                      <button
                        onClick={() => handleEditGoal(goal)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-all text-xs"
                        title="Editar Meta"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteGoal(goal.id)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-all"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Progress */}
                  <div>
                    {goal.targetAmount > 0 ? (
                      <>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-text-secondary">
                            ${formatCurrency(goal.currentAmount)}
                          </span>
                          <span className="text-text-muted">
                            de ${formatCurrency(goal.targetAmount)}
                          </span>
                        </div>
                        <div className="w-full h-3 bg-bg-input rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-accent to-purple-500 transition-all duration-500"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-text-muted text-right mt-1">{progress.toFixed(1)}%</p>
                      </>
                    ) : (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-bg-input">
                        <span className="text-sm text-text-secondary">Saldo actual</span>
                        <span className="text-lg font-bold text-accent">
                          ${formatCurrency(goal.currentAmount)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Transaction form */}
                  {showTransactionForm === goal.id && (
                    <div className="p-3 bg-bg-input rounded-xl space-y-3 animate-fade-in">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setTxType('DEPOSITO')}
                          className={`py-2 rounded-lg text-sm font-medium transition-all ${
                            txType === 'DEPOSITO'
                              ? 'bg-success text-white'
                              : 'bg-bg-card text-text-secondary border border-border'
                          }`}
                        >
                          ⬆️ Depósito
                        </button>
                        <button
                          type="button"
                          onClick={() => setTxType('RETIRO')}
                          className={`py-2 rounded-lg text-sm font-medium transition-all ${
                            txType === 'RETIRO'
                              ? 'bg-danger text-white'
                              : 'bg-bg-card text-text-secondary border border-border'
                          }`}
                        >
                          ⬇️ Retiro
                        </button>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        value={txAmount}
                        onChange={(e) => setTxAmount(e.target.value)}
                        className="input-field"
                        placeholder="Monto"
                      />
                      <input
                        type="text"
                        value={txDescription}
                        onChange={(e) => setTxDescription(e.target.value)}
                        className="input-field"
                        placeholder="Descripción (opcional)"
                      />
                      <button
                        onClick={() => handleAddTransaction(goal.id)}
                        disabled={isPending || !txAmount}
                        className="w-full gradient-btn py-2 text-sm disabled:opacity-50"
                      >
                        {isPending ? 'Guardando...' : 'Registrar'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
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
                <label className="block text-sm text-text-secondary mb-1">Monto a distribuir</label>
                <input
                  type="number"
                  step="0.01"
                  max={distributeModal.amount}
                  value={distributeAmount}
                  onChange={(e) => setDistributeAmount(e.target.value)}
                  className="input-field"
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
