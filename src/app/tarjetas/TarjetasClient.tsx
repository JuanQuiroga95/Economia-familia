'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useProfile } from '@/hooks/useProfile';
import { CurrencyInput } from '@/components/CurrencyInput';
import { formatCurrency } from '@/lib/formatUtils';
import { addMonths, formatPeriod, MONTH_NAMES } from '@/lib/cardUtils';
import {
  createCardPurchase,
  createCreditCard,
  deleteCardPayment,
  deleteCardPurchase,
  deleteCreditCard,
  payCard,
} from '@/actions/cards';

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

interface CardData {
  id: string;
  name: string;
  bank: string | null;
  lastFour: string | null;
  currency: string;
  creditLimit: number | null;
  closingDay: number;
  dueDay: number;
  color: string;
  profile: MiniProfile;
  statement: {
    installmentsTotal: number;
    previousDebt: number;
    totalDue: number;
    paid: number;
    pending: number;
  };
  debt: number;
  future: number;
  available: number | null;
  monthInstallments: {
    id: string;
    number: number;
    amount: number;
    purchaseId: string;
    description: string;
    installments: number;
    type: string;
    category: Category | null;
    profile: MiniProfile;
    date: string;
  }[];
  purchases: {
    id: string;
    description: string;
    totalAmount: number;
    date: string;
    installments: number;
    type: string;
    category: Category | null;
    profile: MiniProfile;
    remaining: number;
  }[];
  payments: {
    id: string;
    amount: number;
    date: string;
    month: number;
    year: number;
    note: string | null;
    profileId: string;
  }[];
}

interface TarjetasClientProps {
  cards: CardData[];
  categories: Category[];
  wallets: { id: string; name: string; currency: string }[];
  profiles: MiniProfile[];
  accountInfo?: any;
  month: number;
  year: number;
}

const getLocalDateString = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

const CARD_COLORS = ['#f97316', '#6366f1', '#ec4899', '#10b981', '#eab308', '#0ea5e9'];

/**
 * Porcentaje que le corresponde a un perfil cuando la cuenta reparte por %.
 * Devuelve undefined si la cuenta usa fondo común (ahí no aplica).
 */
function splitPercentageFor(accountInfo: any, profileId: string): number | undefined {
  if (accountInfo?.splitMode !== 'PORCENTAJE') return undefined;
  const sorted = accountInfo.profiles || [];
  if (sorted.length < 2) return undefined;
  return profileId === sorted[0].id ? accountInfo.splitPercentA : accountInfo.splitPercentB;
}

export default function TarjetasClient({
  cards,
  categories,
  wallets,
  profiles,
  accountInfo,
  month,
  year,
}: TarjetasClientProps) {
  const { activeProfile } = useProfile();
  const confirmar = useConfirm();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [showCardForm, setShowCardForm] = useState(false);
  const [openPurchase, setOpenPurchase] = useState<string | null>(null);
  const [openPayment, setOpenPayment] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Record<string, 'cuotas' | 'consumos' | 'pagos'>>({});

  const totals = useMemo(
    () =>
      cards.reduce(
        (acc, c) => ({
          due: acc.due + c.statement.totalDue,
          pending: acc.pending + c.statement.pending,
          debt: acc.debt + c.debt,
          future: acc.future + c.future,
        }),
        { due: 0, pending: 0, debt: 0, future: 0 }
      ),
    [cards]
  );

  const refresh = () => router.refresh();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-text-primary">Tarjetas</h1>
          <p className="text-text-muted text-sm mt-1">
            Resumen de {formatPeriod(month, year)} • los consumos se vuelven gasto cuando pagás
          </p>
        </div>
        <button
          onClick={() => setShowCardForm(!showCardForm)}
          className="gradient-btn px-4 py-2 text-sm whitespace-nowrap"
        >
          {showCardForm ? '✕ Cerrar' : '+ Tarjeta'}
        </button>
      </div>

      {showCardForm && (
        <CardForm
          profiles={profiles}
          defaultProfileId={activeProfile?.id || profiles[0]?.id || ''}
          isPending={isPending}
          onCancel={() => setShowCardForm(false)}
          onSubmit={(data) =>
            startTransition(async () => {
              const res = await createCreditCard(data);
              if (res.success) {
                toast.success('Tarjeta creada');
                setShowCardForm(false);
                refresh();
              } else {
                toast.error(res.error || 'Error');
              }
            })
          }
        />
      )}

      {cards.length === 0 ? (
        <div className="glass-card p-8 text-center space-y-3">
          <div className="text-5xl">💳</div>
          <h2 className="text-lg font-semibold text-text-primary">Todavía no cargaste ninguna tarjeta</h2>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            Creá una tarjeta, cargá los consumos con sus cuotas y la app te va a ir mostrando
            cuánto te toca pagar cada mes. El gasto recién aparece en <b>Gastos</b> cuando
            registrás el pago del resumen.
          </p>
        </div>
      ) : (
        <>
          {/* Totales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon="🧾" label="Resumen del mes" value={totals.due} tone="text-text-primary" />
            <StatCard icon="⏳" label="Falta pagar" value={totals.pending} tone="text-warning" />
            <StatCard icon="🔴" label="Deuda acumulada" value={totals.debt} tone="text-danger" />
            <StatCard icon="📅" label="Cuotas a futuro" value={totals.future} tone="text-text-secondary" />
          </div>

          {cards.map((card) => {
            const tab = tabs[card.id] || 'cuotas';
            const progress =
              card.statement.totalDue > 0
                ? Math.min(100, (card.statement.paid / card.statement.totalDue) * 100)
                : 0;

            return (
              <div key={card.id} className="glass-card p-4 lg:p-6 space-y-4">
                {/* Encabezado */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ backgroundColor: `${card.color}25`, color: card.color }}
                    >
                      💳
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-semibold text-text-primary truncate">{card.name}</h2>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                          {card.currency}
                        </span>
                        {card.lastFour && (
                          <span className="text-xs text-text-muted">•••• {card.lastFour}</span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">
                        {card.profile.avatar || '👤'} {card.profile.name}
                        {card.bank ? ` · ${card.bank}` : ''} · cierra el {card.closingDay} · vence el{' '}
                        {card.dueDay}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const ok = await confirmar({
                        titulo: `¿Eliminar la tarjeta "${card.name}"?`,
                        detalle:
                          'Se borran sus consumos y todas sus cuotas. Los gastos ya registrados en Gastos se mantienen.',
                        tono: 'peligro',
                        confirmar: 'Eliminar tarjeta',
                      });
                      if (!ok) return;
                      startTransition(async () => {
                        const res = await deleteCreditCard(card.id);
                        if (res.success) {
                          toast.success('Tarjeta eliminada');
                          refresh();
                        } else toast.error(res.error || 'Error');
                      });
                    }}
                    className="text-text-muted hover:text-danger transition-colors text-sm shrink-0"
                    title="Eliminar tarjeta"
                  >
                    ✕
                  </button>
                </div>

                {/* Resumen del mes */}
                <div className="bg-bg-input rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">
                      A pagar en {formatPeriod(month, year)}
                    </span>
                    <span className="text-xl font-bold text-text-primary">
                      ${formatCurrency(card.statement.totalDue)}
                    </span>
                  </div>

                  <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${progress}%`, backgroundColor: card.color }}
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <Detail label="Cuotas del mes" value={card.statement.installmentsTotal} />
                    <Detail
                      label="Deuda anterior"
                      value={card.statement.previousDebt}
                      tone={card.statement.previousDebt > 0 ? 'text-danger' : undefined}
                    />
                    <Detail label="Pagado" value={card.statement.paid} tone="text-success" />
                    <Detail
                      label="Pendiente"
                      value={card.statement.pending}
                      tone={card.statement.pending > 0 ? 'text-warning' : 'text-success'}
                    />
                  </div>

                  {card.creditLimit != null && (
                    <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                      <span className="text-text-muted">
                        Límite ${formatCurrency(card.creditLimit)}
                      </span>
                      <span className="text-text-secondary">
                        Disponible:{' '}
                        <b className={card.available === 0 ? 'text-danger' : 'text-success'}>
                          ${formatCurrency(card.available ?? 0)}
                        </b>
                      </span>
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setOpenPurchase(openPurchase === card.id ? null : card.id);
                      setOpenPayment(null);
                    }}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium bg-bg-card border border-border text-text-secondary hover:bg-bg-card-hover transition-all"
                  >
                    🛒 Cargar consumo
                  </button>
                  <button
                    onClick={() => {
                      setOpenPayment(openPayment === card.id ? null : card.id);
                      setOpenPurchase(null);
                    }}
                    className="gradient-btn px-4 py-2.5 text-sm"
                  >
                    ✅ Pagué la tarjeta
                  </button>
                </div>

                {openPurchase === card.id && (
                  <PurchaseForm
                    card={card}
                    categories={categories}
                    profiles={profiles}
                    accountInfo={accountInfo}
                    defaultProfileId={activeProfile?.id || card.profile.id}
                    isPending={isPending}
                    onCancel={() => setOpenPurchase(null)}
                    onSubmit={(data) =>
                      startTransition(async () => {
                        const res = await createCardPurchase(data);
                        if (res.success && res.data) {
                          toast.success(
                            `Consumo cargado: ${res.data.installments} cuota(s) de $${formatCurrency(
                              res.data.installmentAmount
                            )} desde ${res.data.firstPeriod}`
                          );
                          setOpenPurchase(null);
                          refresh();
                        } else {
                          toast.error(res.error || 'Error');
                        }
                      })
                    }
                  />
                )}

                {openPayment === card.id && (
                  <PaymentForm
                    card={card}
                    wallets={wallets}
                    accountInfo={accountInfo}
                    month={month}
                    year={year}
                    defaultProfileId={activeProfile?.id || card.profile.id}
                    isPending={isPending}
                    onCancel={() => setOpenPayment(null)}
                    onSubmit={(data) =>
                      startTransition(async () => {
                        const res = await payCard(data);
                        if (res.success) {
                          toast.success('Pago registrado y cargado en Gastos');
                          setOpenPayment(null);
                          refresh();
                        } else {
                          toast.error(res.error || 'Error');
                        }
                      })
                    }
                  />
                )}

                {/* Tabs */}
                <div className="flex gap-2 border-b border-border/50">
                  {(
                    [
                      ['cuotas', `Cuotas del mes (${card.monthInstallments.length})`],
                      ['consumos', `Consumos (${card.purchases.length})`],
                      ['pagos', `Pagos (${card.payments.length})`],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setTabs({ ...tabs, [card.id]: key })}
                      className={`px-3 py-2 text-xs font-medium transition-all border-b-2 -mb-px ${
                        tab === key
                          ? 'border-accent text-accent'
                          : 'border-transparent text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === 'cuotas' && (
                  <ul className="space-y-2">
                    {card.monthInstallments.length === 0 && (
                      <li className="text-sm text-text-muted text-center py-4">
                        No hay cuotas que caigan en {formatPeriod(month, year)}.
                      </li>
                    )}
                    {card.monthInstallments.map((inst) => (
                      <li
                        key={inst.id}
                        className="flex items-center justify-between p-3 bg-bg-input rounded-xl gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-text-primary truncate">
                            {inst.category?.icon || '📦'} {inst.description}
                          </p>
                          <p className="text-xs text-text-muted">
                            Cuota {inst.number}/{inst.installments} ·{' '}
                            {inst.type === 'COMPARTIDO' ? '👥 Compartido' : '👤 Propio'} ·{' '}
                            {inst.profile.name}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-text-primary whitespace-nowrap">
                          ${formatCurrency(inst.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {tab === 'consumos' && (
                  <ul className="space-y-2">
                    {card.purchases.length === 0 && (
                      <li className="text-sm text-text-muted text-center py-4">
                        Todavía no cargaste consumos en esta tarjeta.
                      </li>
                    )}
                    {card.purchases.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between p-3 bg-bg-input rounded-xl gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-text-primary truncate">
                            {p.category?.icon || '📦'} {p.description}
                          </p>
                          <p className="text-xs text-text-muted">
                            {new Date(p.date).toLocaleDateString('es-AR')} · {p.installments} cuota(s)
                            {p.remaining > 0 ? ` · quedan ${p.remaining}` : ' · terminada'} ·{' '}
                            {p.type === 'COMPARTIDO' ? '👥' : '👤'} {p.profile.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-semibold text-text-primary">
                            ${formatCurrency(p.totalAmount)}
                          </span>
                          <button
                            onClick={async () => {
                              const ok = await confirmar({
                                titulo: '¿Eliminar este consumo?',
                                detalle: 'Se borran también todas sus cuotas futuras.',
                                tono: 'peligro',
                                confirmar: 'Eliminar consumo',
                              });
                              if (!ok) return;
                              startTransition(async () => {
                                const res = await deleteCardPurchase(p.id);
                                if (res.success) {
                                  toast.success('Consumo eliminado');
                                  refresh();
                                } else toast.error(res.error || 'Error');
                              });
                            }}
                            className="text-text-muted hover:text-danger text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {tab === 'pagos' && (
                  <ul className="space-y-2">
                    {card.payments.length === 0 && (
                      <li className="text-sm text-text-muted text-center py-4">
                        Todavía no registraste pagos de esta tarjeta.
                      </li>
                    )}
                    {card.payments.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between p-3 bg-bg-input rounded-xl gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-text-primary">
                            Resumen de {formatPeriod(p.month, p.year)}
                          </p>
                          <p className="text-xs text-text-muted">
                            Pagado el {new Date(p.date).toLocaleDateString('es-AR')}
                            {p.note ? ` · ${p.note}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-semibold text-success">
                            ${formatCurrency(p.amount)}
                          </span>
                          <button
                            onClick={async () => {
                              const ok = await confirmar({
                                titulo: '¿Eliminar este pago?',
                                detalle:
                                  'También se borra el gasto que generó, y la deuda del resumen vuelve a figurar.',
                                tono: 'peligro',
                                confirmar: 'Eliminar pago',
                                resumen: [
                                  { etiqueta: 'Monto', valor: `$${formatCurrency(p.amount)}` },
                                ],
                              });
                              if (!ok) return;
                              startTransition(async () => {
                                const res = await deleteCardPayment(p.id);
                                if (res.success) {
                                  toast.success('Pago eliminado');
                                  refresh();
                                } else toast.error(res.error || 'Error');
                              });
                            }}
                            className="text-text-muted hover:text-danger text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ============================================
// Subcomponentes
// ============================================

function StatCard({
  icon,
  label,
  value,
  tone = 'text-text-primary',
}: {
  icon: string;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
      <p className={`text-lg font-bold ${tone}`}>${formatCurrency(value)}</p>
    </div>
  );
}

function Detail({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className="text-text-muted mb-0.5">{label}</p>
      <p className={`font-semibold ${tone || 'text-text-primary'}`}>${formatCurrency(value)}</p>
    </div>
  );
}

function CardForm({
  profiles,
  defaultProfileId,
  isPending,
  onCancel,
  onSubmit,
}: {
  profiles: MiniProfile[];
  defaultProfileId: string;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (data: any) => void;
}) {
  const [name, setName] = useState('');
  const [bank, setBank] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [creditLimit, setCreditLimit] = useState('');
  const [closingDay, setClosingDay] = useState('25');
  const [dueDay, setDueDay] = useState('10');
  const [color, setColor] = useState(CARD_COLORS[0]);
  const [profileId, setProfileId] = useState(defaultProfileId);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!profileId) return toast.error('Elegí de quién es la tarjeta');
        onSubmit({
          name,
          bank,
          lastFour,
          currency,
          creditLimit: creditLimit ? parseFloat(creditLimit) : null,
          closingDay: parseInt(closingDay) || 25,
          dueDay: parseInt(dueDay) || 10,
          color,
          profileId,
        });
      }}
      className="glass-card p-4 lg:p-6 space-y-4 animate-slide-up"
    >
      <h3 className="text-lg font-semibold text-text-primary">Nueva tarjeta</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            placeholder="Ej: Naranja"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Banco (opcional)</label>
          <input
            type="text"
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            className="input-field"
            placeholder="Ej: Galicia"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-text-secondary mb-1">¿De quién es?</label>
        <div className="grid grid-cols-2 gap-2">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProfileId(p.id)}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">Límite (opcional)</label>
          <CurrencyInput
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            className="input-field"
            placeholder="0.00"
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

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">Día de cierre</label>
          <input
            type="number"
            min={1}
            max={31}
            value={closingDay}
            onChange={(e) => setClosingDay(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Vencimiento</label>
          <input
            type="number"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Últimos 4</label>
          <input
            type="text"
            maxLength={4}
            value={lastFour}
            onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))}
            className="input-field"
            placeholder="1234"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-text-secondary mb-1">Color</label>
        <div className="flex gap-2">
          {CARD_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full transition-all ${
                color === c ? 'ring-2 ring-offset-2 ring-offset-bg-card ring-white scale-110' : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-bg-card border border-border text-text-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="gradient-btn flex-1 px-4 py-2.5 text-sm">
          {isPending ? 'Guardando...' : 'Crear tarjeta'}
        </button>
      </div>
    </form>
  );
}

function PurchaseForm({
  card,
  categories,
  profiles,
  accountInfo,
  defaultProfileId,
  isPending,
  onCancel,
  onSubmit,
}: {
  card: CardData;
  categories: Category[];
  profiles: MiniProfile[];
  accountInfo?: any;
  defaultProfileId: string;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (data: any) => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [amountIsPerInstallment, setAmountIsPerInstallment] = useState(false);
  const [installments, setInstallments] = useState('1');
  const [date, setDate] = useState(getLocalDateString());
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState<'PROPIO' | 'COMPARTIDO'>('PROPIO');
  const [profileId, setProfileId] = useState(defaultProfileId);
  const [overrideStart, setOverrideStart] = useState(false);

  const parsedDate = useMemo(() => new Date(`${date}T12:00:00`), [date]);
  const suggested = useMemo(() => {
    const day = parsedDate.getDate();
    return addMonths(parsedDate.getMonth() + 1, parsedDate.getFullYear(), day <= card.closingDay ? 1 : 2);
  }, [parsedDate, card.closingDay]);

  const [startMonth, setStartMonth] = useState(suggested.month);
  const [startYear, setStartYear] = useState(suggested.year);

  const n = Math.max(1, parseInt(installments) || 1);
  const amountNum = parseFloat(amount) || 0;
  const total = amountIsPerInstallment ? amountNum * n : amountNum;
  const perInstallment = total / n;
  const firstPeriod = overrideStart ? { month: startMonth, year: startYear } : suggested;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!profileId) return toast.error('Elegí quién hizo el consumo');
        onSubmit({
          cardId: card.id,
          description,
          amount: amountNum,
          amountIsPerInstallment,
          installments: n,
          date,
          categoryId: categoryId || undefined,
          profileId,
          type,
          splitPercentage:
            type === 'COMPARTIDO' ? splitPercentageFor(accountInfo, profileId) : undefined,
          ...(overrideStart ? { firstMonth: startMonth, firstYear: startYear } : {}),
        });
      }}
      className="bg-bg-input rounded-xl p-4 space-y-4 animate-slide-up"
    >
      <h3 className="text-sm font-semibold text-text-primary">
        Nuevo consumo en {card.name}
      </h3>

      <div>
        <label className="block text-sm text-text-secondary mb-1">¿Qué compraste?</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input-field"
          placeholder="Ej: Heladera nueva"
          required
        />
      </div>

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
          <label className="block text-sm text-text-secondary mb-1">Cuotas</label>
          <input
            type="number"
            min={1}
            max={120}
            value={installments}
            onChange={(e) => setInstallments(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAmountIsPerInstallment(false)}
          className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
            !amountIsPerInstallment
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary border border-border'
          }`}
        >
          El monto es el total
        </button>
        <button
          type="button"
          onClick={() => setAmountIsPerInstallment(true)}
          className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
            amountIsPerInstallment
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary border border-border'
          }`}
        >
          El monto es por cuota
        </button>
      </div>

      {amountNum > 0 && (
        <div className="text-xs text-text-secondary bg-bg-card rounded-xl p-3 border border-border/50">
          {n} cuota{n > 1 ? 's' : ''} de <b>${formatCurrency(Math.round(perInstallment * 100) / 100)}</b> ·
          total <b>${formatCurrency(total)}</b>
          <br />
          Primera cuota en el resumen de <b>{formatPeriod(firstPeriod.month, firstPeriod.year)}</b>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">Fecha de la compra</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-field"
            required
          />
        </div>
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
      </div>

      <div>
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={overrideStart}
            onChange={(e) => {
              setOverrideStart(e.target.checked);
              if (e.target.checked) {
                setStartMonth(suggested.month);
                setStartYear(suggested.year);
              }
            }}
            className="accent-accent"
          />
          La primera cuota cae en otro mes
        </label>
        {overrideStart && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <select
              value={startMonth}
              onChange={(e) => setStartMonth(parseInt(e.target.value))}
              className="input-field"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={startYear}
              onChange={(e) => setStartYear(parseInt(e.target.value))}
              className="input-field"
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm text-text-secondary mb-1">¿Quién lo gastó?</label>
        <div className="grid grid-cols-2 gap-2">
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

      <div>
        <label className="block text-sm text-text-secondary mb-1">Tipo de gasto</label>
        <div className="grid grid-cols-2 gap-2">
          {(['PROPIO', 'COMPARTIDO'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                type === t ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary border border-border'
              }`}
            >
              {t === 'PROPIO' ? '👤 Propio' : '👥 Compartido'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-bg-card border border-border text-text-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="gradient-btn flex-1 px-4 py-2.5 text-sm">
          {isPending ? 'Guardando...' : 'Cargar consumo'}
        </button>
      </div>
    </form>
  );
}

function PaymentForm({
  card,
  wallets,
  accountInfo,
  month,
  year,
  defaultProfileId,
  isPending,
  onCancel,
  onSubmit,
}: {
  card: CardData;
  wallets: { id: string; name: string; currency: string }[];
  accountInfo?: any;
  month: number;
  year: number;
  defaultProfileId: string;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (data: any) => void;
}) {
  const [amount, setAmount] = useState(
    card.statement.pending > 0 ? String(Math.round(card.statement.pending * 100) / 100) : ''
  );
  const [date, setDate] = useState(getLocalDateString());
  const [type, setType] = useState<'PROPIO' | 'COMPARTIDO'>('PROPIO');
  const [paidFromPersonal, setPaidFromPersonal] = useState(false);
  const [walletId, setWalletId] = useState('');
  const [note, setNote] = useState('');

  const amountNum = parseFloat(amount) || 0;
  const leftover = Math.max(0, card.statement.pending - amountNum);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          cardId: card.id,
          amount: amountNum,
          date,
          month,
          year,
          profileId: defaultProfileId,
          type,
          splitPercentage:
            type === 'COMPARTIDO' ? splitPercentageFor(accountInfo, defaultProfileId) : undefined,
          paidFromPersonalBudget: paidFromPersonal,
          walletId: walletId || undefined,
          note,
        });
      }}
      className="bg-bg-input rounded-xl p-4 space-y-4 animate-slide-up"
    >
      <h3 className="text-sm font-semibold text-text-primary">
        Pagar resumen de {formatPeriod(month, year)} · {card.name}
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">¿Cuánto pagaste?</label>
          <CurrencyInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-field"
            placeholder="0.00"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Fecha del pago</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-field"
            required
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAmount(String(Math.round(card.statement.pending * 100) / 100))}
          className="px-3 py-1.5 rounded-lg text-xs bg-bg-card border border-border text-text-secondary"
        >
          Total pendiente (${formatCurrency(card.statement.pending)})
        </button>
        <button
          type="button"
          onClick={() =>
            setAmount(String(Math.round(card.statement.installmentsTotal * 100) / 100))
          }
          className="px-3 py-1.5 rounded-lg text-xs bg-bg-card border border-border text-text-secondary"
        >
          Solo cuotas del mes (${formatCurrency(card.statement.installmentsTotal)})
        </button>
      </div>

      {amountNum > 0 && (
        <div className="text-xs bg-bg-card rounded-xl p-3 border border-border/50">
          Se registra un gasto de <b>${formatCurrency(amountNum)}</b> en {card.currency}.{' '}
          {leftover > 0 ? (
            <span className="text-warning">
              Quedan <b>${formatCurrency(leftover)}</b> impagos: pasan como deuda al mes siguiente.
            </span>
          ) : (
            <span className="text-success">Con esto el resumen queda al día. 🎉</span>
          )}
        </div>
      )}

      {wallets.length > 0 && (
        <div>
          <label className="block text-sm text-text-secondary mb-1">Billetera / Banco (opcional)</label>
          <select value={walletId} onChange={(e) => setWalletId(e.target.value)} className="input-field">
            <option value="">Saldo General</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.currency})
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm text-text-secondary mb-1">Tipo de gasto</label>
        <div className="grid grid-cols-2 gap-2">
          {(['PROPIO', 'COMPARTIDO'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                type === t ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary border border-border'
              }`}
            >
              {t === 'PROPIO' ? '👤 Propio' : '👥 Compartido'}
            </button>
          ))}
        </div>
      </div>

      {type === 'COMPARTIDO' && (
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={paidFromPersonal}
            onChange={(e) => setPaidFromPersonal(e.target.checked)}
            className="accent-accent"
          />
          Lo pagué con mi plata personal (el fondo compartido me lo debe)
        </label>
      )}

      <div>
        <label className="block text-sm text-text-secondary mb-1">Nota (opcional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input-field"
          placeholder="Ej: pago mínimo"
        />
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-bg-card border border-border text-text-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="gradient-btn flex-1 px-4 py-2.5 text-sm">
          {isPending ? 'Guardando...' : 'Registrar pago'}
        </button>
      </div>
    </form>
  );
}
