'use client';
import { formatCurrency } from '@/lib/formatUtils';
import { coincideBusqueda } from '@/lib/searchUtils';
import { useMemo, useState, useTransition } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { createExpense, deleteExpense, updateExpense } from '@/actions/expenses';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CurrencyInput } from '@/components/CurrencyInput';
import { useConfirm } from '@/components/ui/ConfirmDialog';

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
  splitPercentage?: number;
  receiptUrl: string | null;
  walletId?: string | null;
  paymentMethod?: string;
  profile: { id: string; name: string; avatar: string | null };
  category: { id: string; name: string; icon: string; color: string };
  // De dónde nació el gasto. Si viene de otra sección, allá se edita.
  cardPayment?: { id: string; card: { name: string } } | null;
  loanPayment?: { id: string; loan: { name: string } } | null;
  plannedExpense?: { id: string } | null;
}

/** Etiqueta de origen para los gastos que nacieron en otra sección. */
function origenDelGasto(e: Expense) {
  if (e.cardPayment) {
    return { icono: '💳', texto: `Tarjeta ${e.cardPayment.card.name}`, seccion: 'Tarjetas' };
  }
  if (e.loanPayment) {
    return { icono: '🏦', texto: `Cuota ${e.loanPayment.loan.name}`, seccion: 'Préstamos' };
  }
  if (e.plannedExpense) {
    return { icono: '🗓️', texto: 'Desde la agenda', seccion: null };
  }
  return null;
}

/** Totales separados por moneda: la app no convierte entre monedas, así que no se suman entre sí. */
type TotalPorMoneda = Record<string, number>;

const SIMBOLO_MONEDA: Record<string, string> = { ARS: '$', USD: 'US$', EUR: '€' };

function sumarPorMoneda(gastos: Expense[]): TotalPorMoneda {
  const total: TotalPorMoneda = {};
  for (const gasto of gastos) {
    total[gasto.currency] = (total[gasto.currency] || 0) + gasto.amount;
  }
  return total;
}

/** "$130.000", o "$130.000 + US$50" cuando lo que estás mirando mezcla monedas. */
function textoTotal(total: TotalPorMoneda): string {
  const partes = Object.entries(total)
    .sort(([a], [b]) => (a === 'ARS' ? -1 : b === 'ARS' ? 1 : a.localeCompare(b)))
    .map(([moneda, monto]) => `${SIMBOLO_MONEDA[moneda] ?? `${moneda} `}${formatCurrency(monto)}`);
  return partes.length > 0 ? partes.join(' + ') : '$0';
}

interface GastosClientProps {
  initialExpenses: Expense[];
  categories: Category[];
  savings?: { id: string; name: string; currency: string; currentAmount: number }[];
  investments?: { id: string; name: string; currency: string; amount: number }[];
  wallets?: { id: string; name: string; currency: string }[];
  accountInfo?: any;
}

export default function GastosClient({ initialExpenses, categories, savings = [], investments = [], wallets = [], accountInfo }: GastosClientProps) {
  const { activeProfile } = useProfile();
  const confirmar = useConfirm();
  const [creandoCategoria, setCreandoCategoria] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [filterType, setFilterType] = useState<string>('');
  const [busqueda, setBusqueda] = useState('');
  const [categoriasElegidas, setCategoriasElegidas] = useState<string[]>([]);
  const [mostrarCategorias, setMostrarCategorias] = useState(false);
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
  const [walletId, setWalletId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'EFECTIVO' | 'TRANSFERENCIA'>('TRANSFERENCIA');

  const handleCreateCategory = () => {
    setNuevaCategoria('');
    setCreandoCategoria(true);
  };

  const guardarCategoria = () => {
    const name = nuevaCategoria.trim();
    if (!name) {
      toast.error('Poné un nombre para la categoría');
      return;
    }

    startTransition(async () => {
      const { createCategory } = await import('@/actions/config');
      const res = await createCategory({
        name: name.trim(),
        icon: '🏷️',
        color: '#8b5cf6'
      });
      if (res.success && res.data) {
        toast.success('Categoría creada');
        setCategoryId(res.data.id);
        setCreandoCategoria(false);
        setNuevaCategoria('');
        router.refresh();
      } else {
        toast.error(res.error || 'Error al crear categoría');
      }
    });
  };

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

    const montoNumero = parseFloat(amount);
    if (!montoNumero || montoNumero <= 0) {
      toast.error('Poné un monto mayor a cero');
      return;
    }

    const categoria = categories.find((c) => c.id === categoryId);
    const ok = await confirmar({
      titulo: editingExpenseId ? '¿Guardar los cambios?' : '¿Registrar este gasto?',
      confirmar: editingExpenseId ? 'Guardar cambios' : 'Registrar gasto',
      resumen: [
        { etiqueta: 'Monto', valor: `$${formatCurrency(montoNumero)} ${currency}` },
        { etiqueta: 'Concepto', valor: description || '(sin descripción)' },
        {
          etiqueta: 'Categoría',
          valor: categoria ? `${categoria.icon} ${categoria.name}` : '—',
        },
        { etiqueta: 'Fecha', valor: date },
        {
          etiqueta: 'Tipo',
          valor: type === 'COMPARTIDO' ? 'Compartido' : `Propio de ${activeProfile.name}`,
        },
        ...(fundingSource !== 'balance'
          ? [{ etiqueta: 'Sale de', valor: fundingSource.startsWith('ahorro') ? 'Un ahorro' : 'Una inversión' }]
          : []),
      ],
    });
    if (!ok) return;

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
        splitPercentage: type === 'COMPARTIDO' && accountInfo?.splitMode === 'PORCENTAJE' ? (isNaN(parseFloat(splitPercentage)) ? undefined : parseFloat(splitPercentage)) : undefined,
        receiptUrl: receiptUrl || undefined,
        fundingSource,
        walletId: walletId || undefined,
        paymentMethod,
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
        setWalletId('');
        setSplitPercentage('');
        setPaymentMethod('TRANSFERENCIA');
        setEditingExpenseId(null);
        setShowForm(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Error al guardar');
      }
    });
  };

  const handleEdit = (expense: Expense) => {
    const origen = origenDelGasto(expense);
    if (origen?.seccion) {
      toast.error(`Este gasto se edita desde ${origen.seccion}, así no se desincronizan los números.`);
      return;
    }
    setEditingExpenseId(expense.id);
    setAmount(expense.amount.toString());
    setCurrency(expense.currency);
    setDate(expense.date.split('T')[0]);
    setDescription(expense.description);
    setCategoryId(expense.category.id);
    setType(expense.type as 'PROPIO' | 'COMPARTIDO');
    setPaidFromPersonal(expense.paidFromPersonalBudget);
    setSplitPercentage(expense.splitPercentage?.toString() || '');
    setReceiptUrl(expense.receiptUrl || '');
    setFundingSource('balance');
    setWalletId(expense.walletId || '');
    setPaymentMethod((expense.paymentMethod as 'EFECTIVO' | 'TRANSFERENCIA') || 'TRANSFERENCIA');
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
    setWalletId('');
    setSplitPercentage('');
    setPaymentMethod('TRANSFERENCIA');
  };

  const handleDelete = async (expense: Expense) => {
    const origen = origenDelGasto(expense);
    const ok = await confirmar({
      titulo: '¿Eliminar este gasto?',
      tono: 'peligro',
      confirmar: 'Eliminar',
      detalle: origen?.seccion
        ? `Este gasto es el pago registrado en ${origen.seccion}. Al borrarlo, esa deuda vuelve a figurar como impaga.`
        : undefined,
      resumen: [
        { etiqueta: 'Concepto', valor: expense.description },
        { etiqueta: 'Monto', valor: `$${formatCurrency(expense.amount)} ${expense.currency}` },
        {
          etiqueta: 'Fecha',
          valor: new Date(expense.date).toLocaleDateString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
          }),
        },
      ],
    });
    if (!ok) return;

    const id = expense.id;
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

  const alternarCategoria = (id: string) => {
    setCategoriasElegidas((actual) =>
      actual.includes(id) ? actual.filter((c) => c !== id) : [...actual, id]
    );
  };

  const limpiarFiltros = () => {
    setFilterType('');
    setBusqueda('');
    setCategoriasElegidas([]);
  };

  // El tipo y la búsqueda se aplican ANTES que las categorías. Así el total que
  // muestra cada categoría no cambia cuando tocás una, y podés comparar "Hogar"
  // contra "Servicios" mirando siempre el mismo recorte.
  const gastosAntesDeCategoria = useMemo(
    () =>
      initialExpenses.filter(
        (e) =>
          (!filterType || e.type === filterType) &&
          coincideBusqueda(`${e.description} ${e.category.name} ${e.profile.name}`, busqueda)
      ),
    [initialExpenses, filterType, busqueda]
  );

  const resumenPorCategoria = useMemo(() => {
    const acumulado = new Map<
      string,
      { categoria: Category; total: TotalPorMoneda; cantidad: number }
    >();

    // Las categorías elegidas figuran siempre, aunque el recorte actual las deje
    // en cero: si desaparecieran, no quedaría forma de destildarlas.
    for (const id of categoriasElegidas) {
      const categoria = categories.find((c) => c.id === id);
      if (categoria) acumulado.set(id, { categoria, total: {}, cantidad: 0 });
    }

    for (const gasto of gastosAntesDeCategoria) {
      const fila = acumulado.get(gasto.category.id) ?? {
        categoria: gasto.category,
        total: {} as TotalPorMoneda,
        cantidad: 0,
      };
      fila.total[gasto.currency] = (fila.total[gasto.currency] || 0) + gasto.amount;
      fila.cantidad += 1;
      acumulado.set(gasto.category.id, fila);
    }

    const peso = (total: TotalPorMoneda) => Object.values(total).reduce((a, b) => a + b, 0);
    return [...acumulado.values()].sort((a, b) => peso(b.total) - peso(a.total));
  }, [gastosAntesDeCategoria, categoriasElegidas, categories]);

  const filteredExpenses = useMemo(
    () =>
      categoriasElegidas.length > 0
        ? gastosAntesDeCategoria.filter((e) => categoriasElegidas.includes(e.category.id))
        : gastosAntesDeCategoria,
    [gastosAntesDeCategoria, categoriasElegidas]
  );

  const totalVisible = useMemo(() => sumarPorMoneda(filteredExpenses), [filteredExpenses]);
  const totalDeTodasLasCategorias = useMemo(
    () => sumarPorMoneda(gastosAntesDeCategoria),
    [gastosAntesDeCategoria]
  );

  // Con una sola categoría elegida conviene mostrar cuál es; con varias, cuántas.
  const categoriaUnicaElegida =
    categoriasElegidas.length === 1
      ? categories.find((c) => c.id === categoriasElegidas[0])
      : undefined;
  const textoCategoriasElegidas = categoriaUnicaElegida
    ? `${categoriaUnicaElegida.icon} ${categoriaUnicaElegida.name}`
    : categoriasElegidas.length === 0
      ? 'Todas las categorías'
      : `${categoriasElegidas.length} categorías elegidas`;
  const hayFiltroActivo = Boolean(filterType || busqueda.trim() || categoriasElegidas.length > 0);

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

      {/* Filtros: tipo, búsqueda y categorías, todo junto arriba de la lista */}
      <div className="space-y-3">
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

        {/* Buscador: no importan mayúsculas, acentos ni palabras completas */}
        <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-input px-3">
          <span className="text-text-muted">🔎</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar: gas, luz, super…"
            aria-label="Buscar gastos por concepto, categoría o persona"
            className="flex-1 bg-transparent py-3 text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              className="text-text-muted hover:text-text-primary transition-colors"
              aria-label="Limpiar la búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        {/* Categorías: se despliega hacia abajo, en vertical, para que la
            página no se estire a lo ancho en el celular. */}
        {resumenPorCategoria.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setMostrarCategorias((abierto) => !abierto)}
              aria-expanded={mostrarCategorias}
              className="w-full flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-input px-3 py-3 text-sm text-text-primary hover:border-border-focus transition-all"
            >
              <span className="truncate text-left">🏷️ {textoCategoriasElegidas}</span>
              <span className="shrink-0 text-text-muted">{mostrarCategorias ? '▲' : '▼'}</span>
            </button>

            {mostrarCategorias && (
              <div className="mt-2 rounded-xl border border-border bg-bg-card p-2 space-y-1 max-h-80 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setCategoriasElegidas([])}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left text-sm transition-all ${
                    categoriasElegidas.length === 0
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-bg-card-hover'
                  }`}
                >
                  <span>Todas las categorías</span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {textoTotal(totalDeTodasLasCategorias)}
                  </span>
                </button>

                {resumenPorCategoria.map(({ categoria, total, cantidad }) => {
                  const elegida = categoriasElegidas.includes(categoria.id);
                  return (
                    <button
                      key={categoria.id}
                      type="button"
                      onClick={() => alternarCategoria(categoria.id)}
                      aria-pressed={elegida}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-all ${
                        elegida
                          ? 'bg-accent/15 text-accent'
                          : 'text-text-secondary hover:bg-bg-card-hover'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                            elegida ? 'bg-accent border-accent text-white' : 'border-border'
                          }`}
                        >
                          {elegida ? '✓' : ''}
                        </span>
                        <span className="truncate text-sm">
                          {categoria.icon} {categoria.name}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-medium">{textoTotal(total)}</span>
                        <span className="block text-xs text-text-muted">
                          {cantidad === 1 ? '1 gasto' : `${cantidad} gastos`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Cuánto suma exactamente lo que estás mirando ahora */}
        {initialExpenses.length > 0 && (
          <div className="glass-card px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-text-secondary">
                {hayFiltroActivo
                  ? `${filteredExpenses.length} de ${initialExpenses.length} gastos del mes`
                  : `${initialExpenses.length} ${initialExpenses.length === 1 ? 'gasto' : 'gastos'} del mes`}
              </p>
              {hayFiltroActivo && (
                <button onClick={limpiarFiltros} className="text-xs text-accent hover:underline mt-0.5">
                  Limpiar filtros
                </button>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-text-muted">
                {hayFiltroActivo ? 'Suma de lo filtrado' : 'Total del mes'}
              </p>
              <p className="text-base font-bold text-danger">{textoTotal(totalVisible)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="glass-card p-4 lg:p-6 space-y-4 animate-slide-up">
          <h3 className="text-lg font-semibold text-text-primary">{editingExpenseId ? 'Editar Gasto' : 'Nuevo Gasto'}</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Monto</label>
              <CurrencyInput
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
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={isPending}
                className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-sm transition-all bg-bg-card text-accent border border-dashed border-accent/50 hover:bg-accent/10"
              >
                <span>➕</span>
                <span className="truncate">Nueva</span>
              </button>
            </div>

            {creandoCategoria && (
              <div className="mt-3 p-3 rounded-xl bg-bg-input border border-border space-y-2 animate-fade-in">
                <label className="block text-xs text-text-secondary">
                  Nombre de la categoría nueva
                </label>
                <input
                  type="text"
                  autoFocus
                  value={nuevaCategoria}
                  onChange={(e) => setNuevaCategoria(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      guardarCategoria();
                    }
                    if (e.key === 'Escape') setCreandoCategoria(false);
                  }}
                  className="input-field"
                  placeholder="Ej: Alimento perro"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreandoCategoria(false)}
                    className="flex-1 py-2 rounded-lg text-sm bg-bg-card border border-border text-text-secondary hover:bg-bg-card-hover"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isPending || !nuevaCategoria.trim()}
                    onClick={guardarCategoria}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-accent hover:opacity-90 disabled:opacity-50"
                  >
                    Crear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Wallet / Billetera */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">Billetera / Banco (Opcional)</label>
            <select
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className="input-field"
            >
              <option value="">Saldo General</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
              ))}
            </select>
          </div>

          {/* Método de Pago */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">Método de Pago</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('EFECTIVO')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  paymentMethod === 'EFECTIVO'
                    ? 'bg-accent text-white shadow-lg shadow-accent/25'
                    : 'bg-bg-card text-text-secondary border border-border'
                }`}
              >
                💵 Efectivo
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('TRANSFERENCIA')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  paymentMethod === 'TRANSFERENCIA'
                    ? 'bg-accent text-white shadow-lg shadow-accent/25'
                    : 'bg-bg-card text-text-secondary border border-border'
                }`}
              >
                💳 Transferencia
              </button>
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
                    step="any"
                    value={splitPercentage}
                    onChange={(e) => setSplitPercentage(e.target.value)}
                    className="input-field"
                    placeholder="Ej: 50"
                  />
                  <p className="text-xs text-text-muted mt-2">
                    Dejalo vacío para usar el porcentaje configurado en Configuración.
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
            <span className="text-4xl">{hayFiltroActivo ? '🔎' : '💸'}</span>
            {hayFiltroActivo ? (
              <>
                <p className="text-text-muted mt-2">Nada coincide con este filtro</p>
                <p className="text-xs text-text-muted mt-1">
                  Ojo: busca solo dentro del mes que estás mirando. Si el pago fue en otro mes,
                  cambiá el mes ahí arriba.
                </p>
                <button onClick={limpiarFiltros} className="text-sm text-accent hover:underline mt-3">
                  Limpiar filtros
                </button>
              </>
            ) : (
              <p className="text-text-muted mt-2">No hay gastos registrados</p>
            )}
          </div>
        ) : (
          filteredExpenses.map((expense) => (
            <div key={expense.id} className="glass-card p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                  style={{ backgroundColor: `${expense.category.color}20` }}
                >
                  {expense.category.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary break-words">{expense.description}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-text-muted">
                      {new Date(expense.date).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
                    </span>
                    <span className="text-xs text-text-muted">•</span>
                    <span className="text-xs text-text-muted">{expense.profile.name}</span>
                    <span className="text-xs text-text-muted">•</span>
                    <span className="text-xs text-text-muted">
                      {expense.paymentMethod === 'EFECTIVO' ? '💵 Efectivo' : '💳 Transferencia'}
                    </span>
                    {(() => {
                      const origen = origenDelGasto(expense);
                      return origen ? (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full bg-info/20 text-info"
                          title={
                            origen.seccion
                              ? `Se edita desde ${origen.seccion}`
                              : 'Nació de un ítem de la agenda'
                          }
                        >
                          {origen.icono} {origen.texto}
                        </span>
                      ) : null;
                    })()}
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
              <div className="shrink-0 flex items-center gap-3">
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
                    onClick={() => handleDelete(expense)}
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
