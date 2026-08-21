import { buildInstallments, periodIndex, type PeriodAmount } from './periodUtils';

export {
  MONTH_NAMES,
  formatPeriod,
  addMonths,
  periodIndex,
  buildStatement,
  totalDebt,
  futureInstallments,
} from './periodUtils';

/**
 * Valor de la cuota por sistema francés (cuota fija).
 * `annualRate` es la TNA en porcentaje (ej: 85 para 85%).
 */
export function frenchInstallment(principal: number, annualRate: number, installments: number) {
  const n = Math.max(1, Math.floor(installments));
  const i = annualRate / 100 / 12;
  if (!i) return Math.round((principal / n) * 100) / 100;

  const factor = Math.pow(1 + i, n);
  const cuota = (principal * i * factor) / (factor - 1);
  return Math.round(cuota * 100) / 100;
}

/** Plan de cuotas del préstamo: N cuotas iguales desde el mes de la primera. */
export function buildLoanSchedule(
  totalToRepay: number,
  installments: number,
  firstMonth: number,
  firstYear: number
) {
  return buildInstallments(totalToRepay, installments, firstMonth, firstYear);
}

export interface LoanProgress {
  /** Total del plan de pagos (suma de todas las cuotas). */
  total: number;
  /** Todo lo que se pagó hasta hoy, sin importar a qué mes se imputó. */
  paid: number;
  /** Lo que falta para cancelarlo. */
  remaining: number;
  /** Cuotas equivalentes ya cubiertas (redondeado hacia abajo). */
  paidInstallments: number;
  /** Cantidad total de cuotas. */
  totalInstallments: number;
  percentage: number;
  /** true cuando ya no queda nada por pagar. */
  isSettled: boolean;
}

/** Avance del préstamo: cuánto se pagó del total y cuántas cuotas quedan. */
export function loanProgress(installments: PeriodAmount[], payments: PeriodAmount[]): LoanProgress {
  const total = installments.reduce((acc, r) => acc + r.amount, 0);
  const paidRaw = payments.reduce((acc, r) => acc + r.amount, 0);
  const paid = Math.min(paidRaw, total);
  const remaining = Math.max(0, Math.round((total - paidRaw) * 100) / 100);

  // Los pagos se imputan en orden a las cuotas: cuántas quedaron cubiertas enteras.
  const ordered = [...installments].sort(
    (a, b) => periodIndex(a.month, a.year) - periodIndex(b.month, b.year)
  );
  let left = paidRaw;
  let paidInstallments = 0;
  for (const inst of ordered) {
    if (left + 0.01 < inst.amount) break;
    left -= inst.amount;
    paidInstallments++;
  }

  return {
    total,
    paid,
    remaining,
    paidInstallments,
    totalInstallments: installments.length,
    percentage: total > 0 ? Math.min(100, (paid / total) * 100) : 0,
    isSettled: remaining <= 0.01,
  };
}

/** Próxima cuota impaga a partir del mes consultado (inclusive). */
export function nextPendingInstallment<T extends PeriodAmount>(
  installments: T[],
  payments: PeriodAmount[],
  month: number,
  year: number
): T | null {
  const ordered = [...installments].sort(
    (a, b) => periodIndex(a.month, a.year) - periodIndex(b.month, b.year)
  );
  let covered = payments.reduce((acc, r) => acc + r.amount, 0);
  const target = periodIndex(month, year);

  // La primera cuota que los pagos no llegan a cubrir es la próxima a pagar,
  // esté atrasada o no. `target` queda como referencia del mes consultado.
  void target;
  for (const inst of ordered) {
    if (covered + 0.01 >= inst.amount) {
      covered -= inst.amount;
      continue;
    }
    return inst;
  }
  return null;
}
