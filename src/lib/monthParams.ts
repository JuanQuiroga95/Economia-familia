import { getArgDate, getCurrentFinancialMonth } from '@/lib/dateUtils';

/**
 * Lee ?month & ?year de la URL con validación.
 *
 * Antes cada página hacía `parseInt(searchParams.month)` a secas: con
 * `?month=abc` quedaba NaN, las fechas salían inválidas y la consulta fallaba
 * en silencio dejando la pantalla vacía sin ninguna explicación.
 */
export function parseMonthYear(searchParams?: { month?: string; year?: string }) {
  const actual = getCurrentFinancialMonth(getArgDate());

  const mesCrudo = Number.parseInt(searchParams?.month ?? '', 10);
  const anioCrudo = Number.parseInt(searchParams?.year ?? '', 10);

  const month =
    Number.isInteger(mesCrudo) && mesCrudo >= 1 && mesCrudo <= 12 ? mesCrudo : actual.month;

  // Un rango amplio pero finito: fuera de esto seguro es una URL rota.
  const year =
    Number.isInteger(anioCrudo) && anioCrudo >= 2000 && anioCrudo <= 2100
      ? anioCrudo
      : actual.year;

  return { month, year, esMesActual: month === actual.month && year === actual.year };
}
