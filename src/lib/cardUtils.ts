export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function formatPeriod(month: number, year: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Suma meses a un período (month es 1-12). */
export function addMonths(month: number, year: number, monthsToAdd: number) {
  const zeroBased = month - 1 + monthsToAdd;
  return {
    month: ((zeroBased % 12) + 12) % 12 + 1,
    year: year + Math.floor(zeroBased / 12),
  };
}

/** Convierte un período a un número comparable (Marzo 2026 -> 24303). */
export function periodIndex(month: number, year: number) {
  return year * 12 + (month - 1);
}

/**
 * En qué resumen cae la primera cuota de un consumo.
 * Si la compra entró antes del cierre, se paga el mes siguiente;
 * si entró después del cierre, recién el subsiguiente.
 */
export function firstInstallmentPeriod(purchaseDate: Date, closingDay: number) {
  const month = purchaseDate.getMonth() + 1;
  const year = purchaseDate.getFullYear();
  return addMonths(month, year, purchaseDate.getDate() <= closingDay ? 1 : 2);
}

/**
 * Divide un consumo en cuotas. El redondeo sobrante se ajusta en la última
 * cuota para que la suma dé exactamente el total.
 */
export function buildInstallments(
  totalAmount: number,
  installments: number,
  firstMonth: number,
  firstYear: number
) {
  const count = Math.max(1, Math.floor(installments));
  const base = Math.round((totalAmount / count) * 100) / 100;

  return Array.from({ length: count }, (_, i) => {
    const isLast = i === count - 1;
    const amount = isLast
      ? Math.round((totalAmount - base * (count - 1)) * 100) / 100
      : base;
    const { month, year } = addMonths(firstMonth, firstYear, i);
    return { number: i + 1, amount, month, year };
  });
}

export interface CardStatement {
  /** Cuotas que vencen en este resumen. */
  installmentsTotal: number;
  /** Deuda que quedó impaga de resúmenes anteriores. */
  previousDebt: number;
  /** Lo que hay que pagar este mes (cuotas + deuda arrastrada). */
  totalDue: number;
  /** Lo que ya se pagó de este resumen. */
  paid: number;
  /** Lo que falta pagar. Si queda > 0 al cerrar el mes, pasa a ser deuda. */
  pending: number;
}

interface PeriodAmount {
  month: number;
  year: number;
  amount: number;
}

/**
 * Estado del resumen de un mes. Los pagos se imputan de forma acumulada:
 * lo que se pagó de más en meses anteriores reduce la deuda arrastrada.
 */
export function buildStatement(
  installments: PeriodAmount[],
  payments: PeriodAmount[],
  month: number,
  year: number
): CardStatement {
  const target = periodIndex(month, year);
  const sumBefore = (rows: PeriodAmount[]) =>
    rows
      .filter((r) => periodIndex(r.month, r.year) < target)
      .reduce((acc, r) => acc + r.amount, 0);
  const sumAt = (rows: PeriodAmount[]) =>
    rows
      .filter((r) => periodIndex(r.month, r.year) === target)
      .reduce((acc, r) => acc + r.amount, 0);

  const previousDebt = Math.max(0, sumBefore(installments) - sumBefore(payments));
  const installmentsTotal = sumAt(installments);
  const paid = sumAt(payments);
  const totalDue = previousDebt + installmentsTotal;

  return {
    installmentsTotal,
    previousDebt,
    totalDue,
    paid,
    pending: Math.max(0, totalDue - paid),
  };
}

/**
 * Deuda total real de la tarjeta: todo lo que ya venció menos todo lo pagado.
 */
export function totalDebt(installments: PeriodAmount[], payments: PeriodAmount[], month: number, year: number) {
  const target = periodIndex(month, year);
  const due = installments
    .filter((r) => periodIndex(r.month, r.year) <= target)
    .reduce((acc, r) => acc + r.amount, 0);
  const paid = payments.reduce((acc, r) => acc + r.amount, 0);
  return Math.max(0, due - paid);
}

/** Cuotas que todavía no vencieron (compromiso a futuro). */
export function futureInstallments(installments: PeriodAmount[], month: number, year: number) {
  const target = periodIndex(month, year);
  return installments
    .filter((r) => periodIndex(r.month, r.year) > target)
    .reduce((acc, r) => acc + r.amount, 0);
}
