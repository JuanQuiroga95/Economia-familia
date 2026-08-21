'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useProfile } from '@/hooks/useProfile';
import { CurrencyInput } from '@/components/CurrencyInput';
import { formatCurrency } from '@/lib/formatUtils';
import { formatPeriod, frenchInstallment, MONTH_NAMES, periodIndex } from '@/lib/loanUtils';
import { createLoan, deleteLoan, deleteLoanPayment, payLoanInstallment } from '@/actions/loans';

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

interface LoanData {
  id: string;
  name: string;
  lender: string | null;
  kind: 'TOMADO' | 'OTORGADO';
  currency: string;
  principal: number;
  totalToRepay: number;
  installments: number;
  installmentAmount: number;
  interestRate: number | null;
  firstMonth: number;
  firstYear: number;
  dueDay: number;
  color: string;
  notes: string | null;
  type: string;
  profile: MiniProfile;
  category: Category | null;
  statement: {
    installmentsTotal: number;
    previousDebt: number;
    totalDue: number;
    paid: number;
    pending: number;
  };
  progress: {
    total: number;
    paid: number;
    remaining: number;
    paidInstallments: number;
    totalInstallments: number;
    percentage: number;
    isSettled: boolean;
  };
  overdue: number;
  future: number;
  nextInstallment: { number: number; amount: number; month: number; year: number } | null;
  monthInstallments: { id: string; number: number; amount: number; month: number; year: number }[];
  schedule: { id: string; number: number; amount: number; month: number; year: number }[];
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

interface PrestamosClientProps {
  loans: LoanData[];
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

const LOAN_COLORS = ['#8b5cf6', '#0ea5e9', '#10b981', '#f97316', '#ec4899', '#eab308'];

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

export default function PrestamosClient({
  loans,
  categories,
  wallets,
  profiles,
  accountInfo,
  month,
  year,
}: PrestamosClientProps) {
  const { activeProfile } = useProfile();
  const confirmar = useConfirm();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [showLoanForm, setShowLoanForm] = useState(false);
  const [openPayment, setOpenPayment] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Record<string, 'plan' | 'pagos'>>({});

  const totals = useMemo(
    () =>
      loans.reduce(
        (acc, l) => {
          if (l.kind === 'TOMADO') {
            acc.due += l.statement.totalDue;
            acc.pending += l.statement.pending;
            acc.remaining += l.progress.remaining;
          } else {
            acc.toCollect += l.statement.pending;
            acc.lent += l.progress.remaining;
          }
          return acc;
        },
        { due: 0, pending: 0, remaining: 0, toCollect: 0, lent: 0 }
      ),
    [loans]
  );

  const hasLent = loans.some((l) => l.kind === 'OTORGADO');
  const refresh = () => router.refresh();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-text-primary">Préstamos</h1>
          <p className="text-text-muted text-sm mt-1">
            Cuotas de {formatPeriod(month, year)} • el gasto se registra cuando pagás la cuota
          </p>
        </div>
        <button
          onClick={() => setShowLoanForm(!showLoanForm)}
          className="gradient-btn px-4 py-2 text-sm whitespace-nowrap"
        >
          {showLoanForm ? '✕ Cerrar' : '+ Préstamo'}
        </button>
      </div>

      {showLoanForm && (
        <LoanForm
          profiles={profiles}
          categories={categories}
          defaultProfileId={activeProfile?.id || profiles[0]?.id || ''}
          month={month}
          year={year}
          isPending={isPending}
          onCancel={() => setShowLoanForm(false)}
          onSubmit={(data) =>
            startTransition(async () => {
              const res = await createLoan(data);
              if (res.success && res.data) {
                toast.success(
                  `Préstamo creado: ${res.data.installments} cuotas de $${formatCurrency(
                    res.data.installmentAmount
                  )} desde ${res.data.firstPeriod}`
                );
                setShowLoanForm(false);
                refresh();
              } else {
                toast.error(res.error || 'Error');
              }
            })
          }
        />
      )}

      {loans.length === 0 ? (
        <div className="glass-card p-8 text-center space-y-3">
          <div className="text-5xl">🏦</div>
          <h2 className="text-lg font-semibold text-text-primary">Todavía no cargaste ningún préstamo</h2>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            Cargá el préstamo una vez (monto, cuotas y cuándo arranca) y la app arma el plan de
            pagos completo. Cada mes ves qué cuota te toca, cuánto llevás pagado y cuánto falta
            para cancelarlo. El gasto aparece en <b>Gastos</b> recién cuando registrás el pago.
          </p>
          <p className="text-xs text-text-muted">
            También podés anotar plata que <b>vos prestaste</b>: ahí cada cobro entra como ingreso.
          </p>
        </div>
      ) : (
        <>
          {/* Totales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon="📆" label="Cuotas del mes" value={totals.due} tone="text-text-primary" />
            <StatCard icon="⏳" label="Falta pagar este mes" value={totals.pending} tone="text-warning" />
            <StatCard icon="🏦" label="Saldo total a pagar" value={totals.remaining} tone="text-danger" />
            {hasLent ? (
              <StatCard icon="🤝" label="Te deben" value={totals.lent} tone="text-success" />
            ) : (
              <StatCard
                icon="✅"
                label="Ya pagaste"
                value={loans.reduce((acc, l) => acc + (l.kind === 'TOMADO' ? l.progress.paid : 0), 0)}
                tone="text-success"
              />
            )}
          </div>

          {loans.map((loan) => {
            const tab = tabs[loan.id] || 'plan';
            const esTomado = loan.kind === 'TOMADO';
            const target = periodIndex(month, year);

            return (
              <div key={loan.id} className="glass-card p-4 lg:p-6 space-y-4">
                {/* Encabezado */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ backgroundColor: `${loan.color}25`, color: loan.color }}
                    >
                      {esTomado ? '🏦' : '🤝'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-semibold text-text-primary truncate">{loan.name}</h2>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                          {loan.currency}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            esTomado ? 'bg-danger/20 text-danger' : 'bg-success/20 text-success'
                          }`}
                        >
                          {esTomado ? 'Lo debo' : 'Me deben'}
                        </span>
                        {loan.progress.isSettled && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success">
                            Cancelado 🎉
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">
                        {loan.profile.avatar || '👤'} {loan.profile.name}
                        {loan.lender ? ` · ${loan.lender}` : ''} · vence el {loan.dueDay} de cada mes
                        {loan.interestRate ? ` · TNA ${loan.interestRate}%` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const ok = await confirmar({
                        titulo: `¿Eliminar el préstamo "${loan.name}"?`,
                        detalle:
                          'Se borran sus cuotas y su historial de pagos. Los gastos ya registrados en Gastos se mantienen.',
                        tono: 'peligro',
                        confirmar: 'Eliminar préstamo',
                      });
                      if (!ok) return;
                      startTransition(async () => {
                        const res = await deleteLoan(loan.id);
                        if (res.success) {
                          toast.success('Préstamo eliminado');
                          refresh();
                        } else toast.error(res.error || 'Error');
                      });
                    }}
                    className="text-text-muted hover:text-danger transition-colors text-sm shrink-0"
                    title="Eliminar préstamo"
                  >
                    ✕
                  </button>
                </div>

                {/* Avance del préstamo */}
                <div className="bg-bg-input rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">
                      Cuota {Math.min(loan.progress.paidInstallments + 1, loan.installments)} de{' '}
                      {loan.installments}
                    </span>
                    <span className="text-xl font-bold text-text-primary">
                      ${formatCurrency(loan.installmentAmount)}
                    </span>
                  </div>

                  <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${loan.progress.percentage}%`,
                        backgroundColor: loan.color,
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <Detail label="Total del plan" value={loan.progress.total} />
                    <Detail label="Ya pagado" value={loan.progress.paid} tone="text-success" />
                    <Detail
                      label={esTomado ? 'Falta pagar' : 'Falta cobrar'}
                      value={loan.progress.remaining}
                      tone={loan.progress.remaining > 0 ? 'text-danger' : 'text-success'}
                    />
                    <Detail
                      label="Cuotas restantes"
                      value={Math.max(0, loan.installments - loan.progress.paidInstallments)}
                      raw
                    />
                  </div>

                  {loan.totalToRepay > loan.principal && (
                    <p className="text-[11px] text-text-muted pt-2 border-t border-border/50">
                      Pediste ${formatCurrency(loan.principal)} y devolvés $
                      {formatCurrency(loan.totalToRepay)} · el costo del préstamo es $
                      {formatCurrency(Math.round((loan.totalToRepay - loan.principal) * 100) / 100)}
                    </p>
                  )}
                </div>

                {/* Estado del mes */}
                <div className="bg-bg-input rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">
                      {esTomado ? 'A pagar' : 'A cobrar'} en {formatPeriod(month, year)}
                    </span>
                    <span className="text-lg font-bold text-text-primary">
                      ${formatCurrency(loan.statement.totalDue)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <Detail label="Cuota del mes" value={loan.statement.installmentsTotal} />
                    <Detail
                      label="Atrasado"
                      value={loan.statement.previousDebt}
                      tone={loan.statement.previousDebt > 0 ? 'text-danger' : undefined}
                    />
                    <Detail label="Pagado" value={loan.statement.paid} tone="text-success" />
                    <Detail
                      label="Pendiente"
                      value={loan.statement.pending}
                      tone={loan.statement.pending > 0 ? 'text-warning' : 'text-success'}
                    />
                  </div>
                  {loan.nextInstallment && (
                    <p className="text-[11px] text-text-muted pt-2 border-t border-border/50">
                      Próxima cuota impaga: la {loan.nextInstallment.number} de{' '}
                      {formatPeriod(loan.nextInstallment.month, loan.nextInstallment.year)} por $
                      {formatCurrency(loan.nextInstallment.amount)}
                    </p>
                  )}
                </div>

                {/* Acción */}
                {!loan.progress.isSettled && (
                  <button
                    onClick={() => setOpenPayment(openPayment === loan.id ? null : loan.id)}
                    className="gradient-btn w-full px-4 py-2.5 text-sm"
                  >
                    {esTomado ? '✅ Pagué la cuota' : '💰 Me pagaron la cuota'}
                  </button>
                )}

                {openPayment === loan.id && (
                  <PaymentForm
                    loan={loan}
                    wallets={wallets}
                    accountInfo={accountInfo}
                    month={month}
                    year={year}
                    defaultProfileId={activeProfile?.id || loan.profile.id}
                    isPending={isPending}
                    onCancel={() => setOpenPayment(null)}
                    onSubmit={(data) =>
                      startTransition(async () => {
                        const res = await payLoanInstallment(data);
                        if (res.success) {
                          toast.success(
                            esTomado
                              ? 'Pago registrado y cargado en Gastos'
                              : 'Cobro registrado y cargado en Ingresos'
                          );
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
                      ['plan', `Plan de cuotas (${loan.schedule.length})`],
                      ['pagos', `Pagos (${loan.payments.length})`],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setTabs({ ...tabs, [loan.id]: key })}
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

                {tab === 'plan' && (
                  <ul className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {loan.schedule.map((inst) => {
                      const pagada = inst.number <= loan.progress.paidInstallments;
                      const esDelMes = inst.month === month && inst.year === year;
                      const atrasada =
                        !pagada && periodIndex(inst.month, inst.year) < target;

                      return (
                        <li
                          key={inst.id}
                          className={`flex items-center justify-between p-3 rounded-xl gap-3 ${
                            esDelMes ? 'bg-bg-card border border-accent/30' : 'bg-bg-input'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-text-primary">
                              {pagada ? '✅' : atrasada ? '🔴' : '⏳'} Cuota {inst.number}/
                              {loan.installments}
                            </p>
                            <p className="text-xs text-text-muted">
                              {formatPeriod(inst.month, inst.year)}
                              {esDelMes ? ' · este mes' : ''}
                              {atrasada ? ' · atrasada' : ''}
                            </p>
                          </div>
                          <span
                            className={`text-sm font-semibold whitespace-nowrap ${
                              pagada ? 'text-success line-through opacity-60' : 'text-text-primary'
                            }`}
                          >
                            ${formatCurrency(inst.amount)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {tab === 'pagos' && (
                  <ul className="space-y-2">
                    {loan.payments.length === 0 && (
                      <li className="text-sm text-text-muted text-center py-4">
                        Todavía no registraste pagos de este préstamo.
                      </li>
                    )}
                    {loan.payments.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between p-3 bg-bg-input rounded-xl gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-text-primary">
                            Cuota de {formatPeriod(p.month, p.year)}
                          </p>
                          <p className="text-xs text-text-muted">
                            {new Date(p.date).toLocaleDateString('es-AR')}
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
                                titulo: esTomado ? '¿Eliminar este pago?' : '¿Eliminar este cobro?',
                                detalle: esTomado
                                  ? 'También se borra el gasto que generó, y la cuota vuelve a figurar impaga.'
                                  : 'También se borra el ingreso que generó, y la cuota vuelve a figurar sin cobrar.',
                                tono: 'peligro',
                                confirmar: 'Eliminar',
                                resumen: [
                                  { etiqueta: 'Monto', valor: `$${formatCurrency(p.amount)}` },
                                ],
                              });
                              if (!ok) return;
                              startTransition(async () => {
                                const res = await deleteLoanPayment(p.id);
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

function Detail({
  label,
  value,
  tone,
  raw,
}: {
  label: string;
  value: number;
  tone?: string;
  raw?: boolean;
}) {
  return (
    <div>
      <p className="text-text-muted mb-0.5">{label}</p>
      <p className={`font-semibold ${tone || 'text-text-primary'}`}>
        {raw ? value : `$${formatCurrency(value)}`}
      </p>
    </div>
  );
}

type AmountMode = 'CUOTA' | 'TOTAL' | 'TNA';

function LoanForm({
  profiles,
  categories,
  defaultProfileId,
  month,
  year,
  isPending,
  onCancel,
  onSubmit,
}: {
  profiles: MiniProfile[];
  categories: Category[];
  defaultProfileId: string;
  month: number;
  year: number;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (data: any) => void;
}) {
  const [name, setName] = useState('');
  const [lender, setLender] = useState('');
  const [kind, setKind] = useState<'TOMADO' | 'OTORGADO'>('TOMADO');
  const [currency, setCurrency] = useState('ARS');
  const [principal, setPrincipal] = useState('');
  const [installments, setInstallments] = useState('12');
  const [mode, setMode] = useState<AmountMode>('CUOTA');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [totalToRepay, setTotalToRepay] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [firstMonth, setFirstMonth] = useState(month);
  const [firstYear, setFirstYear] = useState(year);
  const [dueDay, setDueDay] = useState('10');
  const [color, setColor] = useState(LOAN_COLORS[0]);
  const [categoryId, setCategoryId] = useState('');
  const [profileId, setProfileId] = useState(defaultProfileId);
  const [type, setType] = useState<'PROPIO' | 'COMPARTIDO'>('PROPIO');
  const [notes, setNotes] = useState('');

  const n = Math.max(1, parseInt(installments) || 1);
  const principalNum = parseFloat(principal) || 0;

  // Según cómo lo cargue el usuario, calculamos las dos caras: cuota y total.
  const calc = useMemo(() => {
    if (mode === 'CUOTA') {
      const cuota = parseFloat(installmentAmount) || 0;
      return { cuota, total: Math.round(cuota * n * 100) / 100 };
    }
    if (mode === 'TOTAL') {
      const total = parseFloat(totalToRepay) || 0;
      return { cuota: Math.round((total / n) * 100) / 100, total };
    }
    const tna = parseFloat(interestRate) || 0;
    const cuota = frenchInstallment(principalNum, tna, n);
    return { cuota, total: Math.round(cuota * n * 100) / 100 };
  }, [mode, installmentAmount, totalToRepay, interestRate, principalNum, n]);

  const costo = Math.round((calc.total - principalNum) * 100) / 100;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!profileId) return toast.error('Elegí de quién es el préstamo');
        if (calc.total <= 0) return toast.error('Cargá el valor de la cuota o el total a devolver');
        onSubmit({
          name,
          lender,
          kind,
          currency,
          principal: principalNum || calc.total,
          totalToRepay: calc.total,
          installments: n,
          installmentAmount: calc.cuota,
          interestRate: interestRate ? parseFloat(interestRate) : null,
          firstMonth,
          firstYear,
          dueDay: parseInt(dueDay) || 10,
          color,
          notes,
          categoryId: categoryId || undefined,
          profileId,
          type,
        });
      }}
      className="glass-card p-4 lg:p-6 space-y-4 animate-slide-up"
    >
      <h3 className="text-lg font-semibold text-text-primary">Nuevo préstamo</h3>

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ['TOMADO', '🏦 Me prestaron'],
            ['OTORGADO', '🤝 Yo presté'],
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
      <p className="text-[11px] text-text-muted -mt-2">
        {kind === 'TOMADO'
          ? 'Cada cuota que pagues se registra como gasto.'
          : 'Cada cuota que te devuelvan se registra como ingreso.'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            placeholder="Ej: Préstamo personal"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">
            {kind === 'TOMADO' ? '¿Quién te prestó?' : '¿A quién le prestaste?'} (opcional)
          </label>
          <input
            type="text"
            value={lender}
            onChange={(e) => setLender(e.target.value)}
            className="input-field"
            placeholder="Ej: Banco Nación"
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
          <label className="block text-sm text-text-secondary mb-1">
            {kind === 'TOMADO' ? 'Plata que recibiste' : 'Plata que prestaste'}
          </label>
          <CurrencyInput
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            className="input-field"
            placeholder="0.00"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Cantidad de cuotas</label>
          <input
            type="number"
            min={1}
            max={360}
            value={installments}
            onChange={(e) => setInstallments(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-text-secondary mb-1">¿Qué dato tenés?</label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['CUOTA', 'Valor de cuota'],
              ['TOTAL', 'Total a devolver'],
              ['TNA', 'Calcular con TNA'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-2 py-2 rounded-xl text-xs font-medium transition-all ${
                mode === m ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary border border-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'CUOTA' && (
        <div>
          <label className="block text-sm text-text-secondary mb-1">Valor de cada cuota</label>
          <CurrencyInput
            value={installmentAmount}
            onChange={(e) => setInstallmentAmount(e.target.value)}
            className="input-field"
            placeholder="0.00"
          />
        </div>
      )}

      {mode === 'TOTAL' && (
        <div>
          <label className="block text-sm text-text-secondary mb-1">Total a devolver</label>
          <CurrencyInput
            value={totalToRepay}
            onChange={(e) => setTotalToRepay(e.target.value)}
            className="input-field"
            placeholder="0.00"
          />
        </div>
      )}

      {mode === 'TNA' && (
        <div>
          <label className="block text-sm text-text-secondary mb-1">TNA (% anual)</label>
          <input
            type="number"
            step="0.01"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
            className="input-field"
            placeholder="Ej: 85"
          />
          <p className="text-[11px] text-text-muted mt-1">
            Se calcula por sistema francés (cuota fija). Es una estimación: si el banco te da el
            valor exacto, cargalo con &quot;Valor de cuota&quot;.
          </p>
        </div>
      )}

      {calc.total > 0 && (
        <div className="text-xs text-text-secondary bg-bg-input rounded-xl p-3 border border-border/50">
          {n} cuota{n > 1 ? 's' : ''} de <b>${formatCurrency(calc.cuota)}</b> · total{' '}
          <b>${formatCurrency(calc.total)}</b>
          {principalNum > 0 && costo !== 0 && (
            <>
              <br />
              {costo > 0 ? (
                <>
                  Intereses: <b>${formatCurrency(costo)}</b> (
                  {Math.round((costo / principalNum) * 100)}% sobre lo pedido)
                </>
              ) : (
                <>Sin intereses.</>
              )}
            </>
          )}
          <br />
          Primera cuota en <b>{formatPeriod(firstMonth, firstYear)}</b>, última en{' '}
          <b>
            {formatPeriod(
              ((firstMonth - 1 + n - 1) % 12) + 1,
              firstYear + Math.floor((firstMonth - 1 + n - 1) / 12)
            )}
          </b>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">1ª cuota</label>
          <select
            value={firstMonth}
            onChange={(e) => setFirstMonth(parseInt(e.target.value))}
            className="input-field"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Año</label>
          <input
            type="number"
            value={firstYear}
            onChange={(e) => setFirstYear(parseInt(e.target.value) || year)}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Día de pago</label>
          <input
            type="number"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">Moneda</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input-field">
            <option value="ARS">🇦🇷 ARS</option>
            <option value="USD">🇺🇸 USD</option>
            <option value="EUR">🇪🇺 EUR</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Categoría del gasto</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input-field"
          >
            <option value="">Préstamos (por defecto)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {kind === 'TOMADO' && (
        <div>
          <label className="block text-sm text-text-secondary mb-1">Tipo de gasto por defecto</label>
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
      )}

      <div>
        <label className="block text-sm text-text-secondary mb-1">Color</label>
        <div className="flex gap-2">
          {LOAN_COLORS.map((c) => (
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

      <div>
        <label className="block text-sm text-text-secondary mb-1">Nota (opcional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input-field"
          placeholder="Ej: para la refacción del baño"
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
          {isPending ? 'Guardando...' : 'Crear préstamo'}
        </button>
      </div>
    </form>
  );
}

function PaymentForm({
  loan,
  wallets,
  accountInfo,
  month,
  year,
  defaultProfileId,
  isPending,
  onCancel,
  onSubmit,
}: {
  loan: LoanData;
  wallets: { id: string; name: string; currency: string }[];
  accountInfo?: any;
  month: number;
  year: number;
  defaultProfileId: string;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (data: any) => void;
}) {
  const esTomado = loan.kind === 'TOMADO';
  const sugerido = loan.statement.pending > 0 ? loan.statement.pending : loan.installmentAmount;

  const [amount, setAmount] = useState(String(Math.round(sugerido * 100) / 100));
  const [date, setDate] = useState(getLocalDateString());
  const [type, setType] = useState<'PROPIO' | 'COMPARTIDO'>(
    (loan.type as 'PROPIO' | 'COMPARTIDO') || 'PROPIO'
  );
  const [paidFromPersonal, setPaidFromPersonal] = useState(false);
  const [walletId, setWalletId] = useState('');
  const [note, setNote] = useState('');

  const amountNum = parseFloat(amount) || 0;
  const leftover = Math.max(0, loan.statement.pending - amountNum);
  const adelanto = Math.max(0, amountNum - loan.statement.pending);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          loanId: loan.id,
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
        {esTomado ? 'Pagar cuota de' : 'Registrar cobro de'} {formatPeriod(month, year)} · {loan.name}
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1">
            {esTomado ? '¿Cuánto pagaste?' : '¿Cuánto te pagaron?'}
          </label>
          <CurrencyInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-field"
            placeholder="0.00"
            required
          />
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
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAmount(String(Math.round(loan.installmentAmount * 100) / 100))}
          className="px-3 py-1.5 rounded-lg text-xs bg-bg-card border border-border text-text-secondary"
        >
          Una cuota (${formatCurrency(loan.installmentAmount)})
        </button>
        {loan.statement.pending > 0 && (
          <button
            type="button"
            onClick={() => setAmount(String(Math.round(loan.statement.pending * 100) / 100))}
            className="px-3 py-1.5 rounded-lg text-xs bg-bg-card border border-border text-text-secondary"
          >
            Todo lo pendiente (${formatCurrency(loan.statement.pending)})
          </button>
        )}
        {loan.progress.remaining > 0 && (
          <button
            type="button"
            onClick={() => setAmount(String(Math.round(loan.progress.remaining * 100) / 100))}
            className="px-3 py-1.5 rounded-lg text-xs bg-bg-card border border-border text-text-secondary"
          >
            Cancelar todo (${formatCurrency(loan.progress.remaining)})
          </button>
        )}
      </div>

      {amountNum > 0 && (
        <div className="text-xs bg-bg-card rounded-xl p-3 border border-border/50">
          Se registra un {esTomado ? 'gasto' : 'ingreso'} de <b>${formatCurrency(amountNum)}</b> en{' '}
          {loan.currency}.{' '}
          {leftover > 0 ? (
            <span className="text-warning">
              Quedan <b>${formatCurrency(leftover)}</b> del mes: pasan como atrasado al mes que viene.
            </span>
          ) : adelanto > 0 ? (
            <span className="text-success">
              Estás adelantando <b>${formatCurrency(adelanto)}</b> de las próximas cuotas. 💪
            </span>
          ) : (
            <span className="text-success">Con esto la cuota del mes queda al día. 🎉</span>
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

      {esTomado && (
        <>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Tipo de gasto</label>
            <div className="grid grid-cols-2 gap-2">
              {(['PROPIO', 'COMPARTIDO'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    type === t
                      ? 'bg-accent text-white'
                      : 'bg-bg-card text-text-secondary border border-border'
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
        </>
      )}

      <div>
        <label className="block text-sm text-text-secondary mb-1">Nota (opcional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input-field"
          placeholder="Ej: adelanté dos cuotas"
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
          {isPending ? 'Guardando...' : esTomado ? 'Registrar pago' : 'Registrar cobro'}
        </button>
      </div>
    </form>
  );
}
