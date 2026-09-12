'use client';
import { formatCurrency } from '@/lib/formatUtils';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import type { BudgetStatus, BudgetCloseStatus } from '@/types';
import { closeBudgetMonth } from '@/actions/budgetClose';
import {
  createBudgetAdvance,
  deleteBudgetAdvance,
  getBudgetAdvances,
} from '@/actions/budgetAdvance';
import { CurrencyInput } from '@/components/CurrencyInput';
import { useConfirm } from '@/components/ui/ConfirmDialog';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Aviso de cierre: el mes de presupuesto ya terminó (va de día de cobro a día
 * de cobro) y todavía no se cerró. Hasta cerrarlo, lo que sobró queda colgado.
 */
function CierrePendiente({ cierre }: { cierre: BudgetCloseStatus }) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [isPending, startTransition] = useTransition();
  const sobro = cierre.leftover > 0;

  const cerrar = (accion: 'ARRASTRAR' | 'IGNORAR') => {
    startTransition(async () => {
      const res = await closeBudgetMonth(cierre.profileId, cierre.month, cierre.year, accion);
      if (res.success) {
        toast.success(
          accion === 'ARRASTRAR'
            ? `Se sumaron $${formatCurrency(cierre.leftover)} al mes nuevo`
            : `${MESES[cierre.month - 1]} quedó cerrado`
        );
        router.refresh();
      } else {
        toast.error(res.error || 'Error al cerrar el bolsillo');
      }
    });
  };

  const confirmarYCerrar = async (accion: 'ARRASTRAR' | 'IGNORAR') => {
    const ok = await confirmar({
      titulo: `¿Cerrar el bolsillo de ${MESES[cierre.month - 1]}?`,
      detalle:
        accion === 'ARRASTRAR'
          ? 'Lo que sobró se suma a la primera quincena del mes nuevo. Después no se cuentan más gastos en ese mes.'
          : 'El mes queda cerrado tal cual está y el aviso no vuelve a aparecer.',
      confirmar: accion === 'ARRASTRAR' ? 'Cerrar y arrastrar' : 'Cerrar sin arrastrar',
      resumen: [
        { etiqueta: 'Período', valor: cierre.periodo },
        { etiqueta: 'Bolsillo', valor: `$${formatCurrency(cierre.budget)}` },
        { etiqueta: 'Gastado', valor: `$${formatCurrency(cierre.spent)}` },
        {
          etiqueta: sobro ? 'Sobró' : 'Se pasó',
          valor: `$${formatCurrency(Math.abs(cierre.leftover))}`,
        },
      ],
    });
    if (ok) cerrar(accion);
  };

  return (
    <div className="mb-4 p-3 rounded-xl bg-info/10 border border-info/30">
      <p className="text-sm font-medium text-text-primary">
        👛 Terminó el bolsillo de {MESES[cierre.month - 1]}
      </p>
      <p className="text-xs text-text-muted mt-1">
        Del {cierre.periodo}: gastaste ${formatCurrency(cierre.spent)} de $
        {formatCurrency(cierre.budget)}.{' '}
        {sobro
          ? `Te sobraron $${formatCurrency(cierre.leftover)}.`
          : `Te pasaste por $${formatCurrency(Math.abs(cierre.leftover))}.`}
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        {sobro && (
          <button
            onClick={() => confirmarYCerrar('ARRASTRAR')}
            disabled={isPending}
            className="px-3 py-1.5 rounded-lg bg-info/20 text-info text-xs font-medium hover:bg-info/30 transition-colors disabled:opacity-50"
          >
            Cerrar y sumar lo que sobró
          </button>
        )}
        <button
          onClick={() => confirmarYCerrar('IGNORAR')}
          disabled={isPending}
          className="px-3 py-1.5 rounded-lg bg-bg-card border border-border text-text-secondary text-xs font-medium hover:bg-bg-card-hover transition-colors disabled:opacity-50"
        >
          {sobro ? 'Cerrar sin arrastrar' : 'Cerrar el mes'}
        </button>
      </div>
    </div>
  );
}

/**
 * Adelanto: traer plata de la quincena que viene porque con la de ahora no se
 * llega. No suma plata al mes, sólo la corre de una quincena a la otra, así que
 * la próxima arranca con menos y el total del mes no cambia.
 */
function Adelanto({ status }: { status: BudgetStatus }) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [recibidos, setRecibidos] = useState<
    { id: string; amount: number; note: string | null }[] | null
  >(null);

  const deQuien =
    status.budgetType === 'MENSUAL'
      ? 'del mes que viene'
      : status.currentHalf === 1
        ? 'de la 2da quincena'
        : 'de la 1ra quincena del mes que viene';

  const abrir = () => {
    const yaEstaba = abierto;
    setAbierto(!yaEstaba);
    if (yaEstaba || recibidos !== null) return;

    const half = status.budgetType === 'MENSUAL' ? 0 : status.currentHalf;
    startTransition(async () => {
      const filas = await getBudgetAdvances(status.profileId, status.month, status.year, half);
      setRecibidos(filas.map((f) => ({ id: f.id, amount: f.amount, note: f.note })));
    });
  };

  const pedir = async () => {
    const cantidad = parseFloat(monto);
    if (!cantidad || cantidad <= 0) {
      toast.error('Poné un monto mayor a cero');
      return;
    }
    if (cantidad > status.adelantoDisponible) {
      toast.error(`Como mucho podés adelantar $${formatCurrency(status.adelantoDisponible)}`);
      return;
    }

    const ok = await confirmar({
      titulo: '¿Adelantar esta plata?',
      confirmar: 'Adelantar',
      detalle: `No es plata nueva: la próxima quincena arranca con $${formatCurrency(cantidad)} menos.`,
      resumen: [
        { etiqueta: 'Monto', valor: `$${formatCurrency(cantidad)}` },
        { etiqueta: 'Sale', valor: deQuien },
        {
          etiqueta: 'Te queda para gastar',
          valor: `$${formatCurrency(status.remaining + cantidad)}`,
        },
      ],
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await createBudgetAdvance({
        profileId: status.profileId,
        amount: cantidad,
        note: nota,
      });
      if (res.success) {
        toast.success(`Adelantaste $${formatCurrency(cantidad)}`);
        setMonto('');
        setNota('');
        setRecibidos(null);
        setAbierto(false);
        router.refresh();
      } else {
        toast.error(res.error || 'Error al adelantar');
      }
    });
  };

  const devolver = async (id: string, amount: number) => {
    const ok = await confirmar({
      titulo: '¿Devolver este adelanto?',
      tono: 'peligro',
      confirmar: 'Devolver',
      detalle: `Se te descuentan $${formatCurrency(amount)} de ahora y vuelven a la quincena que los prestó.`,
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await deleteBudgetAdvance(id);
      if (res.success) {
        toast.success('Adelanto devuelto');
        setRecibidos(null);
        setAbierto(false);
        router.refresh();
      } else {
        toast.error(res.error || 'Error al devolver el adelanto');
      }
    });
  };

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <button
        onClick={abrir}
        className="w-full flex items-center justify-between text-xs text-text-secondary hover:text-accent transition-colors"
      >
        <span>🤝 Adelantar plata {deQuien}</span>
        <span>{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <div className="mt-3 space-y-3 animate-fade-in">
          {recibidos && recibidos.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-text-muted">Ya adelantaste en esta quincena:</p>
              {recibidos.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border"
                >
                  <span className="text-xs text-text-primary truncate">
                    ${formatCurrency(a.amount)}
                    {a.note ? ` · ${a.note}` : ''}
                  </span>
                  <button
                    onClick={() => devolver(a.id, a.amount)}
                    disabled={isPending}
                    className="shrink-0 text-xs text-danger hover:underline disabled:opacity-50"
                  >
                    Devolver
                  </button>
                </div>
              ))}
            </div>
          )}

          {status.adelantoDisponible > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <CurrencyInput
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="input-field"
                  placeholder="Cuánto"
                />
                <input
                  type="text"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  className="input-field"
                  placeholder="Para qué (opcional)"
                />
              </div>
              <p className="text-xs text-text-muted">
                Podés traer hasta ${formatCurrency(status.adelantoDisponible)} {deQuien}. No es
                plata nueva: esa quincena arranca con eso de menos.
              </p>
              <button
                onClick={pedir}
                disabled={isPending}
                className="w-full py-2 rounded-lg bg-accent/20 text-accent text-xs font-medium hover:bg-accent/30 transition-colors disabled:opacity-50"
              >
                {isPending ? 'Guardando...' : 'Adelantar'}
              </button>
            </>
          ) : (
            <p className="text-xs text-text-muted">
              No queda nada para adelantar: ya trajiste todo lo que había {deQuien}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function BudgetTracker({
  status,
  cierrePendiente,
}: {
  status: BudgetStatus | null;
  cierrePendiente?: BudgetCloseStatus | null;
}) {
  if (!status) return null;

  const getStatusColor = () => {
    if (status.percentage >= 90) return 'danger';
    if (status.percentage >= 70) return 'warning';
    return 'success';
  };

  const color = getStatusColor();
  const colorMap = {
    success: { bg: 'bg-success', text: 'text-success', light: 'bg-success/20' },
    warning: { bg: 'bg-warning', text: 'text-warning', light: 'bg-warning/20' },
    danger: { bg: 'bg-danger', text: 'text-danger', light: 'bg-danger/20' },
  };

  const colors = colorMap[color];
  const pulseClass = color === 'danger' ? 'pulse-danger' : color === 'warning' ? 'pulse-warning' : '';

  return (
    <div className={`glass-card p-4 lg:p-6 ${pulseClass}`}>
      {cierrePendiente && <CierrePendiente cierre={cierrePendiente} />}

      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          {/* "Bolsillo" y no "Presupuesto": el Presupuesto es el de la familia,
              con sus categorías y su plan anual. Esto es la plata suelta de una
              sola persona, y con el mismo nombre se confundían. */}
          <h3 className="text-lg font-semibold text-text-primary">
            👛 Bolsillo de {status.profileName}
          </h3>
          {/* Solo cuenta los gastos de este rango. Un gasto de otra quincena
              del mismo mes no aparece acá, y sin decirlo parece un bug. */}
          <p className="text-xs text-text-muted mt-0.5">
            Cuenta gastos propios del {status.periodo}
          </p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${colors.light} ${colors.text}`}>
          {status.budgetType === 'MENSUAL'
            ? 'Mensual'
            : !status.esMesActual
              ? 'Mes completo'
              : status.currentHalf === 1
                ? '1ra Quincena'
                : '2da Quincena'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-text-secondary">Gastado</span>
          <span className={`font-semibold ${colors.text}`}>
            {status.percentage.toFixed(0)}%
          </span>
        </div>
        <div className="w-full h-3 bg-bg-input rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${colors.bg}`}
            style={{ width: `${Math.min(status.percentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-text-muted">Bolsillo</p>
          <p className="text-sm font-bold text-text-primary">
            ${formatCurrency(status.budget)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Gastado</p>
          <p className={`text-sm font-bold ${colors.text}`}>
            ${formatCurrency(status.spent)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Disponible</p>
          <p className={`text-sm font-bold ${status.remaining < 0 ? 'text-danger' : 'text-success'}`}>
            ${formatCurrency(status.remaining)}
          </p>
        </div>
      </div>

      {/* De dónde sale el bolsillo, si hay algo sumado además de la base. El
          saldo extra se suma a TODAS las quincenas hasta que alguien lo borre,
          así que conviene que se vea y no quede escondido en Configuración. */}
      {(status.extraBudget > 0 || status.carryOver > 0 || status.adelantoRecibido > 0 || status.adelantoPrestado > 0) && (
        <p className="mt-3 text-xs text-text-muted text-center">
          Base: $
          {formatCurrency(
            status.budget -
              status.extraBudget -
              status.carryOver -
              status.adelantoRecibido +
              status.adelantoPrestado
          )}
          {status.extraBudget > 0 && (
            <>
              {' · '}incluye ${formatCurrency(status.extraBudget)} de{' '}
              <span className="text-warning">saldo extra</span> de Configuración
            </>
          )}
          {status.carryOver > 0 && (
            <>
              {' · '}incluye ${formatCurrency(status.carryOver)}{' '}
              <span className="text-info">que sobró del mes pasado</span>
            </>
          )}
          {status.adelantoRecibido > 0 && (
            <>
              {' · '}incluye ${formatCurrency(status.adelantoRecibido)}{' '}
              <span className="text-accent">que adelantaste</span>
            </>
          )}
          {status.adelantoPrestado > 0 && (
            <>
              {' · '}menos ${formatCurrency(status.adelantoPrestado)}{' '}
              <span className="text-warning">que ya te gastaste antes</span>
            </>
          )}
        </p>
      )}

      {/* Sólo sobre la quincena en curso: adelantarle plata a un mes cerrado no
          querría decir nada. */}
      {status.esMesActual && <Adelanto status={status} />}

      {status.percentage >= 90 && (
        <div className="mt-3 p-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs text-center animate-fade-in">
          ⚠️ ¡Estás cerca del límite de tu bolsillo!
        </div>
      )}
    </div>
  );
}
