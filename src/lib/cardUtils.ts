import { addMonths } from './periodUtils';

// Las tarjetas y los préstamos comparten la lógica de cuotas y de "estado del mes".
// Vive en periodUtils; se re-exporta acá para no romper los imports existentes.
export {
  MONTH_NAMES,
  formatPeriod,
  addMonths,
  periodIndex,
  buildInstallments,
  buildStatement,
  totalDebt,
  futureInstallments,
} from './periodUtils';
export type { PeriodAmount, PeriodStatement as CardStatement } from './periodUtils';

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
