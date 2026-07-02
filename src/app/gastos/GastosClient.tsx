'use client';
import { formatCurrency } from '@/lib/formatUtils';
import { useState, useTransition } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { createExpense, deleteExpense, updateExpense } from '@/actions/expenses';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface Expense {
  id: string;
  amount: number;
  currency: string;
  date: string;
  description: string;
  type: string;
  paidFromPersonalBudget: boolean;
  receiptUrl: string | null;
  profile: { id: string; name: string; avatar: string | null };
  category: { id: string; name: string; icon: string; color: string };
}

interface GastosClientProps {
  initialExpenses: Expense[];
  categories: Category[];
  savings?: { id: string; name: string; currency: string; currentAmount: number }[];
  investments?: { id: string; name: string; currency: string; amount: number }[];
  accountInfo?: any;
}

export default function GastosClient({ initialExpenses, categories, savings = [], investments = [], accountInfo }: GastosClientProps) {
  const { activeProfile } = useProfile();
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [filterType, setFilterType] = useState<string>('');
  const router = useRouter();
  
  // Animation state
  const [animatingExpense, setAnimatingExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

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
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState<'PROPIO' | 'COMPARTIDO'>('PROPIO');
  const [paidFromPersonal, setPaidFromPersonal] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [fundingSource, setFundingSource] = useState('balance');
  const [splitPercentage, setSplitPercentage] = useState<string>('');

  // Handle setting default split percentage when choosing COMPARTIDO
  const handleTypeChange = (newType: 'PROPIO' | 'COMPARTIDO') => {
    setType(newType);
    if (newType === 'COMPARTIDO' && accountInfo?.splitMode === 'PORCENTAJE' && activeProfile) {
      const sortedProfiles = accountInfo.profiles || [];
      if (sortedProfiles.length >= 2) {
        if (activeProfile.id === sortedProfiles[0].id) {
          setSplitPercentage(accountInfo.splitPercentA.toString());
        } else {
          setSplitPercentage(accountInfo.splitPercentB.toString());
        }
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        setReceiptUrl(data.url);
        toast.success('Imagen subida correctamente');
      } else {
        toast.error('Error al subir imagen');
      }
    } catch {
      toast.error('Error al subir imagen');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) {
      toast.error('Seleccioná un perfil primero');
      return;
    }
    if (!categoryId) {
      toast.error('Seleccioná una categoría');
      return;
    }

    if (editingExpenseId) {
      if (!window.confirm('¿Estás seguro que querés guardar estos cambios?')) return;
    }

    startTransition(async () => {
      const expenseData = {
        amount: parseFloat(amount),
        currency: currency as 'ARS' | 'USD' | 'EUR',
        date,
        description,
        categoryId,
        profileId: activeProfile.id,
        type,
        paidFromPersonalBudget: type === 'COMPARTIDO' ? paidFromPersonal : false,
        splitPercentage: type === 'COMPARTIDO' && accountInfo?.splitMode === 'PORCENTAJE' ? parseFloat(splitPercentage) : undefined,
        receiptUrl: receiptUrl || undefined,
        fundingSource,
      };

      const result = editingExpenseId 
        ? await updateExpense(editingExpenseId, expenseData)
        : await createExpense(expenseData);

      if (result.success) {
        toast.success(editingExpenseId ? 'Gasto actualizado' : 'Gasto registrado');
        
        // Trigger subtle animation
        if (!editingExpenseId) {
          setAnimatingExpense(true);
          setTimeout(() => setAnimatingExpense(false), 1500);
        }

        setAmount('');
        setDescription('');
        setCategoryId('');
        setReceiptUrl('');
        setPaidFromPersonal(false);
        setFundingSource('balance');
        setSplitPercentage('');
        setEditingExpenseId(null);
        setShowForm(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Error al guardar');
      }
    });
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setAmount(expense.amount.toString());
    setCurrency(expense.currency);
    setDate(expense.date.split('T')[0]);
    setDescription(expense.description);
    setCategoryId(expense.category.id);
    setType(expense.type as 'PROPIO' | 'COMPARTIDO');
    setPaidFromPersonal(expense.paidFromPersonalBudget);
    setReceiptUrl(expense.receiptUrl || '');
    setFundingSource('balance');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingExpenseId(null);
    setAmount('');
    setDescription('');
    setCategoryId('');
    setReceiptUrl('');
    setPaidFromPersonal(false);
    setFundingSource('balance');
    setSplitPercentage('');
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('¿Estás seguro que querés eliminar este gasto?')) return;
    startTransition(async () => {
      const result = await deleteExpense(id);
      if (result.success) {
        toast.success('Gasto eliminado');
        router.refresh();
      } else {
        toast.error(result.error || 'Error al eliminar');
      }
    });
  };

  const filteredExpenses = filterType
    ? initialExpenses.filter((e) => e.type === filterType)
    : initialExpenses;

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-text-primary">Gastos</h1>
          <p className="text-text-muted text-sm mt-1">Registra y controla tus gastos</p>
        </div>
        <button
          onClick={showForm ? handleCloseForm : () => setShowForm(true)}
          className="gradient-btn px-4 py-2 text-sm"
        >
          {showForm ? '✕ Cerrar' : '+ Nuevo'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {['', 'PROPIO', 'COMPARTIDO'].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              filterType === t
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover'
            }`}
          >
            {t === '' ? 'Todos' : t === 'PROPIO' ? '👤 Propio' : '👥 Compartido'}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="glass-card p-4 lg:p-6 space-y-4 animate-slide-up">
          <h3 className="text-lg font-semibold text-text-primary">{editingExpenseId ? 'Editar Gasto' : 'Nuevo Gasto'}</h3>

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
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input-field">
                <option value="ARS">🇦🇷 ARS</option>
                <option value="USD">🇺🇸 USD</option>
                <option value="EUR">🇪🇺 EUR</option>
              </select>
            </div>
          </div>

          {/* Origen de los fondos */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">Origen de los fondos</label>
            <select value={fundingSource} onChange={(e) => setFundingSource(e.target.value)} className="input-field">
              <option value="balance">🏦 Balance General (Cuenta corriente)</option>
              
              {savings.filter(s => s.currency === currency && s.currentAmount > 0).length > 0 && (
                <optgroup label="Mis Ahorros">
                  {savings.filter(s => s.currency === currency && s.currentAmount > 0).map(s => (
                    <option key={s.id} value={`ahorro_${s.id}`}>
                      🎯 {s.name} (${formatCurrency(s.currentAmount)})
                    </option>
                  ))}
                </optgroup>
              )}
              
              {investments.filter(i => i.currency === currency && i.amount > 0).length > 0 && (
                <optgroup label="Mis Inversiones">
                  {investments.filter(i => i.currency === currency && i.amount > 0).map(i => (
                    <option key={i.id} value={`inversion_${i.id}`}>
                      📈 {i.name} (${formatCurrency(i.amount)})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Fecha</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field" required />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Descripción</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
              placeholder="Ej: Compra en supermercado"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">Categoría</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
                    categoryId === cat.id
                      ? 'text-white shadow-lg'
                      : 'bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover'
                  }`}
                  style={categoryId === cat.id ? { backgroundColor: cat.color } : {}}
                >
                  <span>{cat.icon}</span>
                  <span className="truncate">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tipo de gasto */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">Tipo de Gasto</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { handleTypeChange('PROPIO'); setPaidFromPersonal(false); }}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  type === 'PROPIO'
                    ? 'bg-accent text-white shadow-lg shadow-accent/25'
                    : 'bg-bg-card text-text-secondary border border-border'
                }`}
              >
                👤 Propio
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('COMPARTIDO')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  type === 'COMPARTIDO'
                    ? 'bg-accent text-white shadow-lg shadow-accent/25'
                    : 'bg-bg-card text-text-secondary border border-border'
                }`}
              >
                👥 Compartido
              </button>
            </div>
          </div>

          {/* Paid from personal budget (only for shared) */}
          {type === 'COMPARTIDO' && (
            <div className="animate-fade-in">
              <div
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  paidFromPersonal
                    ? 'border-warning bg-warning/10'
                    : 'border-border bg-bg-card hover:border-border-hover'
                }`}
                onClick={() => setPaidFromPersonal(!paidFromPersonal)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                    paidFromPersonal ? 'bg-warning border-warning' : 'border-text-muted'
                  }`}>
                    {paidFromPersonal && <span className="text-white text-xs">✓</span>}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">Pagué yo</p>
                    <p className="text-xs text-text-muted">El fondo compartido te deberá este monto</p>
                  </div>
                </div>
              </div>
              
              {accountInfo?.splitMode === 'PORCENTAJE' && (
                <div className="mt-4 p-4 rounded-xl border border-border bg-bg-card">
                  <label className="block text-sm text-text-secondary mb-2">Porcentaje que me corresponde pagar (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={splitPercentage}
                    onChange={(e) => setSplitPercentage(e.target.value)}
                    className="input-field"
                    placeholder="Ej: 50"
                  />
                  <p className="text-xs text-text-muted mt-2">
                    Dejar vacío para usar tu {splitPercentage}% configurado por defecto.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Image upload */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">Comprobante (opcional)</label>
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageUpload}
                className="hidden"
                id="receipt-upload"
              />
              <label
                htmlFor="receipt-upload"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-border text-text-muted hover:border-accent hover:text-accent transition-all cursor-pointer"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                    <span>Subiendo...</span>
                  </>
                ) : receiptUrl ? (
                  <>
                    <span>✅</span>
                    <span>Imagen subida</span>
                  </>
                ) : (
                  <>
                    <span>📷</span>
                    <span>Subir foto del comprobante</span>
                  </>
                )}
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending || uploading}
            className="w-full gradient-btn py-3 disabled:opacity-50"
          >
            {isPending ? 'Guardando...' : editingExpenseId ? 'Actualizar Gasto' : 'Guardar Gasto'}
          </button>
        </form>
      )}

      {/* List */}
      <div className="space-y-3">
        {filteredExpenses.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <span className="text-4xl">💸</span>
            <p className="text-text-muted mt-2">No hay gastos registrados</p>
          </div>
        ) : (
          filteredExpenses.map((expense) => (
            <div key={expense.id} className="glass-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                  style={{ backgroundColor: `${expense.category.color}20` }}
                >
                  {expense.category.icon}
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{expense.description}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-text-muted">
                      {new Date(expense.date).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
                    </span>
                    <span className="text-xs text-text-muted">•</span>
                    <span className="text-xs text-text-muted">{expense.profile.name}</span>
                    {expense.type === 'COMPARTIDO' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
                        👥 Compartido
                      </span>
                    )}
                    {expense.type === 'COMPARTIDO' && expense.paidFromPersonalBudget && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-warning/20 text-warning">
                        💳 Pagó {expense.profile.name}
                      </span>
                    )}
                    {expense.receiptUrl && (
                      <a
                        href={expense.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:underline"
                      >
                        📷
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-bold text-danger">
                    -${formatCurrency(expense.amount)}
                  </p>
                  <p className="text-xs text-text-muted">{expense.currency}</p>
                </div>
                <div className="flex">
                  <button
                    onClick={() => handleEdit(expense)}
                    className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-all"
                    title="Editar"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(expense.id)}
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

      {/* Expense Animation Overlay */}
      <AnimatePresence>
        {animatingExpense && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.5 }}
            animate={{ opacity: 1, y: -100, scale: 1.2 }}
            exit={{ opacity: 0, y: -200, scale: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="fixed inset-0 pointer-events-none flex items-center justify-center z-50"
          >
            <div className="bg-danger/20 text-danger p-6 rounded-full shadow-2xl shadow-danger/50 backdrop-blur-md text-6xl">
              💸
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
