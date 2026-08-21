'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useProfile } from '@/hooks/useProfile';
import { CurrencyInput } from '@/components/CurrencyInput';
import { formatCurrency } from '@/lib/formatUtils';
import { addMonths, formatPeriod } from '@/lib/periodUtils';
import {
  copyFromPreviousMonth,
  createPlannedExpense,
  deletePlannedExpense,
  registerPlannedAsExpense,
  setPlannedStatus,
  updatePlannedExpense,
} from '@/actions/agenda';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface MiniProfile {
  id: string;
  name: string;
  avatar: string | null;
}

interface AgendaItem {
  id: string;
  title: string;
  amount: number | null;
  currency: string;
  day: number | null;
  month: number;
  year: number;
  kind: 'FIJO' | 'EVENTUAL';
  status: 'PENDIENTE' | 'HECHO' | 'OMITIDO';
  notes: string | null;
  isRecurring: boolean;
  seriesId: string | null;
  categoryId: string | null;
  profileId: string | null;
  expenseId: string | null;
  category: Category | null;
  profile: MiniProfile | null;
}

interface AgendaClientProps {
  items: AgendaItem[];
  categories: Category[];
  wallets: { id: string; name: string; currency: string }[];
  profiles: MiniProfile[];
  accountInfo?: any;
  month: number;
  year: number;
  /** Día de hoy, solo si estamos mirando el mes en curso. */
  today: number | null;
}

type Filter = 'TODOS' | 'PENDIENTES' | 'FIJO' | 'EVENTUAL';

const getLocalDateString = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

function splitPercentageFor(accountInfo: any, profileId: string): number | undefined {
  if (accountInfo?.splitMode !== 'PORCENTAJE') return undefined;
  const sorted = accountInfo.profiles || [];
  if (sorted.length < 2) return undefined;
  return profileId === sorted[0].id ? accountInfo.splitPercentA : accountInfo.splitPercentB;
}

export default function AgendaClient({
  items,
  categories,
  wallets,
  profiles,
  accountInfo,
  month,
  year,
  today,
}: AgendaClientProps) {
  const { activeProfile } = useProfile();
  const confirmar = useConfirm();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AgendaItem | null>(null);
  const [registering, setRegistering] = useState<AgendaItem | null>(null);
  const [filter, setFilter] = useState<Filter>('TODOS');

  const refresh = () => router.refresh();

  const totals = useMemo(() => {
    const activos = items.filter((i) => i.status !== 'OMITIDO');
    const hechos = activos.filter((i) => i.status === 'HECHO');
    const pendientes = activos.filter((i) => i.status === 'PENDIENTE');

    return {
      planned: activos.reduce((acc, i) => acc + (i.amount || 0), 0),
      done: hechos.reduce((acc, i) => acc + (i.amount || 0), 0),
      pending: pendientes.reduce((acc, i) => acc + (i.amount || 0), 0),
      fijos: activos.filter((i) => i.kind === 'FIJO').reduce((acc, i) => acc + (i.amount || 0), 0),
      countDone: hechos.length,
      countTotal: activos.length,
      countPending: pendientes.length,
      sinMonto: activos.filter((i) => !i.amount).length,
      omitidos: items.length - activos.length,
    };
  }, [items]);

  const visibles = useMemo(() => {
    switch (filter) {
      case 'PENDIENTES':
        return items.filter((i) => i.status === 'PENDIENTE');
      case 'FIJO':
        return items.filter((i) => i.kind === 'FIJO');
      case 'EVENTUAL':
        return items.filter((i) => i.kind === 'EVENTUAL');
      default:
        return items;
    }
  }, [items, filter]);

  // Agrupar por momento del mes ayuda a saber cuánta plata hace falta y cuándo.
  const grupos = useMemo(() => {
    const primera = visibles.filter((i) => i.day != null && i.day <= 15);
    const segunda = visibles.filter((i) => i.day != null && i.day > 15);
    const sinFecha = visibles.filter((i) => i.day == null);
    return [
      { key: 'q1', label: 'Del 1 al 15', items: primera },
      { key: 'q2', label: 'Del 16 en adelante', items: segunda },
      { key: 'sf', label: 'Sin fecha definida', items: sinFecha },
    ].filter((g) => g.items.length > 0);
  }, [visibles]);

  const progreso = totals.planned > 0 ? (totals.done / totals.planned) * 100 : 0;
  const mesAnterior = addMonths(month, year, -1);

  const handleToggle = (item: AgendaItem) => {
    const next = item.status === 'HECHO' ? 'PENDIENTE' : 'HECHO';
    startTransition(async () => {
      const res = await setPlannedStatus(item.id, next);
      if (res.success) refresh();
      else toast.error(res.error || 'Error');
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-bold text-text-primary">Agenda</h1>
          <p className="text-text-muted text-sm mt-1">
            Lo que tenés previsto gastar en {formatPeriod(month, year)} • no afecta el balance
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditing(null);
          }}
          className="gradient-btn px-4 py-2 text-sm whitespace-nowrap"
        >
          {showForm ? '✕ Cerrar' : '+ Anotar'}
        </button>
      </div>

      {(showForm || editing) && (
        <ItemForm
          key={editing?.id || 'nuevo'}
          initial={editing}
          categories={categories}
          profiles={profiles}
          month={month}
          year={year}
          isPending={isPending}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSubmit={(data, applyToSeries) =>
            startTransition(async () => {
              const res = editing
                ? await updatePlannedExpense(editing.id, { ...data, applyToSeries })
                : await createPlannedExpense(data);
              if (res.success) {
                toast.success(editing ? 'Ítem actualizado' : 'Anotado en la agenda');
                setShowForm(false);
                setEditing(null);
                refresh();
              } else {
                toast.error(res.error || 'Error');
              }
            })
          }
        />
      )}

      {items.length === 0 ? (
        <div className="glass-card p-8 text-center space-y-3">
          <div className="text-5xl">🗓️</div>
          <h2 className="text-lg font-semibold text-text-primary">Tu agenda de {formatPeriod(month, year)} está vacía</h2>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            Anotá acá los gastos que ya sabés que vienen: alquiler, expensas, la cuota del colegio,
            el cumpleaños de alguien. <b>No mueve el balance</b>: es una ayuda memoria para saber
            cuánta plata vas a necesitar y cuándo.
          </p>
          <p className="text-xs text-text-muted">
            Los que marques como &quot;se repite todos los meses&quot; van a aparecer solos el mes que viene.
          </p>
          <button
            onClick={() =>
              startTransition(async () => {
                const res = await copyFromPreviousMonth(month, year);
                if (res.success) {
                  const copied = res.data?.copied ?? 0;
                  toast.success(
                    copied > 0
                      ? `Se trajeron ${copied} ítem(s) de ${formatPeriod(mesAnterior.month, mesAnterior.year)}`
                      : `No había nada nuevo en ${formatPeriod(mesAnterior.month, mesAnterior.year)}`
                  );
                  refresh();
                } else toast.error(res.error || 'Error');
              })
            }
            disabled={isPending}
            className="px-4 py-2.5 rounded-xl text-sm bg-bg-card border border-border text-text-secondary hover:bg-bg-card-hover transition-all"
          >
            📋 Traer lo de {formatPeriod(mesAnterior.month, mesAnterior.year)}
          </button>
        </div>
      ) : (
        <>
          {/* Totales */}
          <div className="glass-card p-4 lg:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-text-muted">Plata que necesitás este mes</p>
                <p className="text-2xl font-bold text-text-primary">
                  ${formatCurrency(totals.planned)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-text-muted">Marcados</p>
                <p className="text-lg font-semibold text-success">
                  {totals.countDone}/{totals.countTotal}
                </p>
              </div>
            </div>

            <div className="h-2 bg-bg-input rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-success transition-all duration-500"
                style={{ width: `${progreso}%` }}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-text-muted mb-0.5">Ya resuelto</p>
                <p className="font-semibold text-success">${formatCurrency(totals.done)}</p>
              </div>
              <div>
                <p className="text-text-muted mb-0.5">Todavía falta</p>
                <p className="font-semibold text-warning">${formatCurrency(totals.pending)}</p>
              </div>
              <div>
                <p className="text-text-muted mb-0.5">Gastos fijos</p>
                <p className="font-semibold text-text-primary">${formatCurrency(totals.fijos)}</p>
              </div>
              <div>
                <p className="text-text-muted mb-0.5">Pendientes</p>
                <p className="font-semibold text-text-primary">{totals.countPending}</p>
              </div>
            </div>

            {totals.sinMonto > 0 && (
              <p className="text-[11px] text-text-muted">
                {totals.sinMonto} ítem(s) sin monto estimado: no entran en los totales.
              </p>
            )}
          </div>

          {/* Filtros */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  ['TODOS', `Todos (${items.length})`],
                  ['PENDIENTES', `Pendientes (${totals.countPending})`],
                  ['FIJO', 'Fijos'],
                  ['EVENTUAL', 'Eventuales'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filter === key
                      ? 'bg-accent text-white'
                      : 'bg-bg-card text-text-secondary border border-border'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() =>
                startTransition(async () => {
                  const res = await copyFromPreviousMonth(month, year);
                  if (res.success) {
                    const copied = res.data?.copied ?? 0;
                    toast.success(
                      copied > 0 ? `Se trajeron ${copied} ítem(s)` : 'No había nada nuevo para traer'
                    );
                    refresh();
                  } else toast.error(res.error || 'Error');
                })
              }
              disabled={isPending}
              className="text-xs text-accent hover:underline whitespace-nowrap"
            >
              📋 Traer lo de {formatPeriod(mesAnterior.month, mesAnterior.year)}
            </button>
          </div>

          {/* Listado */}
          <div className="space-y-5">
            {grupos.map((grupo) => {
              const subtotal = grupo.items
                .filter((i) => i.status !== 'OMITIDO')
                .reduce((acc, i) => acc + (i.amount || 0), 0);

              return (
                <div key={grupo.key} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                      {grupo.label}
                    </h3>
                    <span className="text-xs text-text-muted">${formatCurrency(subtotal)}</span>
                  </div>

                  <ul className="space-y-2">
                    {grupo.items.map((item) => {
                      const hecho = item.status === 'HECHO';
                      const omitido = item.status === 'OMITIDO';
                      const vencido =
                        !hecho && !omitido && today != null && item.day != null && item.day < today;

                      return (
                        <li
                          key={item.id}
                          className={`glass-card p-3 lg:p-4 flex items-start gap-3 transition-all ${
                            omitido ? 'opacity-50' : ''
                          }`}
                        >
                          <button
                            onClick={() => handleToggle(item)}
                            disabled={isPending || omitido}
                            className={`mt-0.5 w-6 h-6 rounded-lg border-2 shrink-0 flex items-center justify-center text-xs transition-all ${
                              hecho
                                ? 'bg-success border-success text-white'
                                : 'border-border text-transparent hover:border-accent'
                            }`}
                            title={hecho ? 'Desmarcar' : 'Marcar como resuelto'}
                          >
                            ✓
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-sm font-medium ${
                                  hecho ? 'text-text-muted line-through' : 'text-text-primary'
                                }`}
                              >
                                {item.category?.icon || '📌'} {item.title}
                              </span>
                              {item.isRecurring && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                                  🔁 mensual
                                </span>
                              )}
                              {item.kind === 'EVENTUAL' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input text-text-muted">
                                  eventual
                                </span>
                              )}
                              {vencido && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/20 text-danger">
                                  vencido
                                </span>
                              )}
                              {item.expenseId && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success">
                                  💸 en Gastos
                                </span>
                              )}
                              {omitido && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input text-text-muted">
                                  omitido
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-text-muted mt-0.5">
                              {item.day ? `Día ${item.day}` : 'Sin fecha'}
                              {item.profile ? ` · ${item.profile.avatar || '👤'} ${item.profile.name}` : ''}
                              {item.notes ? ` · ${item.notes}` : ''}
                            </p>

                            <div className="flex items-center gap-3 mt-2 text-xs">
                              {!item.expenseId && !omitido && (
                                <button
                                  onClick={() =>
                                    setRegistering(registering?.id === item.id ? null : item)
                                  }
                                  className="text-accent hover:underline"
                                >
                                  Registrar gasto
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setEditing(item);
                                  setShowForm(false);
                                }}
                                className="text-text-muted hover:text-text-secondary"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() =>
                                  startTransition(async () => {
                                    const res = await setPlannedStatus(
                                      item.id,
                                      omitido ? 'PENDIENTE' : 'OMITIDO'
                                    );
                                    if (res.success) refresh();
                                    else toast.error(res.error || 'Error');
                                  })
                                }
                                className="text-text-muted hover:text-text-secondary"
                              >
                                {omitido ? 'Reactivar' : 'Este mes no'}
                              </button>
                              <button
                                onClick={async () => {
                                  const enSerie = !!item.seriesId && item.isRecurring;

                                  // En una serie hay dos borrados posibles, así que
                                  // cada opción es un botón con su propio texto.
                                  const soloEste = enSerie
                                    ? await confirmar({
                                        titulo: `"${item.title}" se repite todos los meses`,
                                        detalle: `¿Querés sacarlo solo de ${formatPeriod(month, year)} o dejar de repetirlo del todo?`,
                                        confirmar: `Solo ${formatPeriod(month, year)}`,
                                        cancelar: 'Dejar de repetirlo',
                                      })
                                    : await confirmar({
                                        titulo: `¿Sacar "${item.title}" de la agenda?`,
                                        tono: 'peligro',
                                        confirmar: 'Sacar de la agenda',
                                      });

                                  if (enSerie) {
                                    startTransition(async () => {
                                      const res = await deletePlannedExpense(
                                        item.id,
                                        soloEste ? 'ONE' : 'SERIES'
                                      );
                                      if (res.success) {
                                        toast.success(soloEste ? 'Ítem eliminado' : 'Ya no se repite');
                                        refresh();
                                      } else toast.error(res.error || 'Error');
                                    });
                                    return;
                                  }

                                  if (!soloEste) return;
                                  startTransition(async () => {
                                    const res = await deletePlannedExpense(item.id, 'ONE');
                                    if (res.success) {
                                      toast.success('Ítem eliminado');
                                      refresh();
                                    } else toast.error(res.error || 'Error');
                                  });
                                }}
                                className="text-text-muted hover:text-danger"
                              >
                                Eliminar
                              </button>
                            </div>

                            {registering?.id === item.id && (
                              <RegisterForm
                                item={item}
                                wallets={wallets}
                                categories={categories}
                                profiles={profiles}
                                accountInfo={accountInfo}
                                defaultProfileId={
                                  item.profileId || activeProfile?.id || profiles[0]?.id || ''
                                }
                                isPending={isPending}
                                onCancel={() => setRegistering(null)}
                                onSubmit={(data) =>
                                  startTransition(async () => {
                                    const res = await registerPlannedAsExpense(data);
                                    if (res.success) {
                                      toast.success('Gasto registrado y marcado en la agenda');
                                      setRegistering(null);
                                      refresh();
                                    } else {
                                      toast.error(res.error || 'Error');
                                    }
                                  })
                                }
                              />
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <p
                              className={`text-sm font-semibold ${
                                hecho ? 'text-text-muted' : 'text-text-primary'
                              }`}
                            >
                              {item.amount ? `$${formatCurrency(item.amount)}` : '—'}
                            </p>
                            {item.currency !== 'ARS' && (
                              <p className="text-[10px] text-text-muted">{item.currency}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// Subcomponentes
// ============================================

function ItemForm({
  initial,
  categories,
  profiles,
  month,
  year,
  isPending,
  onCancel,
  onSubmit,
}: {
  initial: AgendaItem | null;
  categories: Category[];
  profiles: MiniProfile[];
  month: number;
  year: number;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (data: any, applyToSeries?: boolean) => void;
}) {
  const [title, setTitle] = useState(initial?.title || '');
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [currency, setCurrency] = useState(initial?.currency || 'ARS');
  const [day, setDay] = useState(initial?.day ? String(initial.day) : '');
  const [kind, setKind] = useState<'FIJO' | 'EVENTUAL'>(initial?.kind || 'FIJO');
  const [categoryId, setCategoryId] = useState(initial?.categoryId || '');
  const [profileId, setProfileId] = useState(initial?.profileId || '');
  const [isRecurring, setIsRecurring] = useState(initial?.isRecurring ?? true);
  const [notes, setNotes] = useState(initial?.notes || '');
  const [applyToSeries, setApplyToSeries] = useState(false);

  const esEdicion = !!initial;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          {
            title,
            amount: amount ? parseFloat(amount) : null,
            currency,
            day: day ? parseInt(day) : null,
            month,
            year,
            kind,
            notes,
            isRecurring,
            categoryId: categoryId || undefined,
            profileId: profileId || undefined,
          },
          applyToSeries
        );
      }}
      className="glass-card p-4 lg:p-6 space-y-4 animate-slide-up"
    >
      <h3 className="text-lg font-semibold text-text-primary">
        {esEdicion ? 'Editar ítem' : `Anotar en ${formatPeriod(month, year)}`}
      </h3>

      <div>
        <label className="block text-sm text-text-secondary mb-1">¿Qué gasto viene?</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input-field"
          placeholder="Ej: Alquiler, Expensas, Cumple de mamá"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">¿Cuánto? (estimado)</label>
          <CurrencyInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-field"
            placeholder="Opcional"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">¿Qué día?</label>
          <input
            type="number"
            min={1}
            max={31}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="input-field"
            placeholder="Opcional"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-text-secondary mb-1">Tipo</label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['FIJO', '📌 Fijo'],
              ['EVENTUAL', '🤔 Puede pasar'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                kind === k ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary border border-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">Categoría</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input-field"
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
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
        <label className="block text-sm text-text-secondary mb-1">¿Quién se encarga? (opcional)</label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setProfileId('')}
            className={`px-3 py-2 rounded-xl text-sm transition-all ${
              !profileId ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary border border-border'
            }`}
          >
            👥 Los dos
          </button>
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProfileId(p.id)}
              className={`px-3 py-2 rounded-xl text-sm transition-all ${
                profileId === p.id
                  ? 'bg-accent text-white'
                  : 'bg-bg-card text-text-secondary border border-border'
              }`}
            >
              {p.avatar || '👤'} {p.name}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={(e) => setIsRecurring(e.target.checked)}
          className="accent-accent"
        />
        Se repite todos los meses (aparece solo el mes que viene)
      </label>

      {esEdicion && initial?.seriesId && (
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={applyToSeries}
            onChange={(e) => setApplyToSeries(e.target.checked)}
            className="accent-accent"
          />
          Aplicar también a los meses siguientes
        </label>
      )}

      <div>
        <label className="block text-sm text-text-secondary mb-1">Nota (opcional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input-field"
          placeholder="Ej: se paga por transferencia"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-bg-card border border-border text-text-secondary"
        >
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="gradient-btn flex-1 px-4 py-2.5 text-sm">
          {isPending ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Anotar'}
        </button>
      </div>
    </form>
  );
}

function RegisterForm({
  item,
  wallets,
  categories,
  profiles,
  accountInfo,
  defaultProfileId,
  isPending,
  onCancel,
  onSubmit,
}: {
  item: AgendaItem;
  wallets: { id: string; name: string; currency: string }[];
  categories: Category[];
  profiles: MiniProfile[];
  accountInfo?: any;
  defaultProfileId: string;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (data: any) => void;
}) {
  const [amount, setAmount] = useState(item.amount ? String(item.amount) : '');
  const [date, setDate] = useState(getLocalDateString());
  const [profileId, setProfileId] = useState(defaultProfileId);
  const [type, setType] = useState<'PROPIO' | 'COMPARTIDO'>('COMPARTIDO');
  const [paidFromPersonal, setPaidFromPersonal] = useState(false);
  const [walletId, setWalletId] = useState('');
  const [categoryId, setCategoryId] = useState(item.categoryId || '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSubmit({
          id: item.id,
          amount: parseFloat(amount) || 0,
          date,
          profileId,
          type,
          splitPercentage:
            type === 'COMPARTIDO' ? splitPercentageFor(accountInfo, profileId) : undefined,
          paidFromPersonalBudget: paidFromPersonal,
          walletId: walletId || undefined,
          categoryId: categoryId || undefined,
        });
      }}
      className="bg-bg-input rounded-xl p-3 mt-3 space-y-3 animate-slide-up"
    >
      <p className="text-xs text-text-secondary">
        Esto sí carga el gasto real en <b>Gastos</b> y lo descuenta del balance.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Monto real</label>
          <CurrencyInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-field"
            placeholder="0.00"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-field"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Categoría</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input-field"
          >
            <option value="">Otros</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
        {wallets.length > 0 && (
          <div>
            <label className="block text-xs text-text-secondary mb-1">Billetera</label>
            <select
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className="input-field"
            >
              <option value="">Saldo General</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.currency})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs text-text-secondary mb-1">¿Quién lo pagó?</label>
        <div className="grid grid-cols-2 gap-2">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProfileId(p.id)}
              className={`px-3 py-2 rounded-xl text-xs transition-all ${
                profileId === p.id
                  ? 'bg-accent text-white'
                  : 'bg-bg-card text-text-secondary border border-border'
              }`}
            >
              {p.avatar || '👤'} {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(['PROPIO', 'COMPARTIDO'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              type === t ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary border border-border'
            }`}
          >
            {t === 'PROPIO' ? '👤 Propio' : '👥 Compartido'}
          </button>
        ))}
      </div>

      {type === 'COMPARTIDO' && (
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={paidFromPersonal}
            onChange={(e) => setPaidFromPersonal(e.target.checked)}
            className="accent-accent"
          />
          Lo pagué con mi plata personal
        </label>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2 rounded-xl text-xs bg-bg-card border border-border text-text-secondary"
        >
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="gradient-btn flex-1 px-3 py-2 text-xs">
          {isPending ? 'Guardando...' : 'Registrar gasto'}
        </button>
      </div>
    </form>
  );
}
