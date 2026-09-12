/**
 * Adelantos del bolsillo: traer plata de la quincena que viene.
 *
 * La cuenta es siempre la misma: el período que recibe el adelanto tiene ese
 * monto de más, y el que se lo presta lo tiene de menos. Por eso el mes
 * completo no cambia de total: lo que se adelantó de la 2da a la 1ra se
 * compensa solo.
 *
 * Vive separado de las acciones para poder probar la cuenta sin base.
 */

import { addMonths } from './periodUtils';

/** Una quincena concreta. `half` 0 es el mes entero (bolsillo MENSUAL). */
export interface PeriodoDelBolsillo {
  month: number;
  year: number;
  half: 0 | 1 | 2;
}

/** De dónde sale la plata de un adelanto: siempre del período que sigue. */
export function periodoSiguiente(p: PeriodoDelBolsillo): PeriodoDelBolsillo {
  if (p.half === 1) return { month: p.month, year: p.year, half: 2 };
  const siguiente = addMonths(p.month, p.year, 1);
  return { month: siguiente.month, year: siguiente.year, half: p.half === 2 ? 1 : 0 };
}

export function mismoPeriodo(a: PeriodoDelBolsillo, b: PeriodoDelBolsillo) {
  return a.half === b.half && a.month === b.month && a.year === b.year;
}

export interface Adelanto {
  month: number;
  year: number;
  half: number;
  amount: number;
}

/**
 * Cuánto le suma y cuánto le resta a estos períodos lo que ya se adelantó.
 *
 * Se pasan varios períodos cuando se mira un mes cerrado: ahí las dos quincenas
 * van juntas y un adelanto de una a la otra tiene que dar cero.
 */
export function ajustePorAdelantos(adelantos: Adelanto[], periodos: PeriodoDelBolsillo[]) {
  let recibido = 0;
  let prestado = 0;

  for (const adelanto of adelantos) {
    const destino: PeriodoDelBolsillo = {
      month: adelanto.month,
      year: adelanto.year,
      half: adelanto.half as 0 | 1 | 2,
    };
    if (periodos.some((p) => mismoPeriodo(p, destino))) recibido += adelanto.amount;
    if (periodos.some((p) => mismoPeriodo(p, periodoSiguiente(destino)))) prestado += adelanto.amount;
  }

  return { recibido, prestado, neto: recibido - prestado };
}

/** Los meses que hay que traer de la base para resolver estos períodos. */
export function mesesInvolucrados(periodos: PeriodoDelBolsillo[]) {
  const meses = new Map<string, { month: number; year: number }>();
  for (const p of periodos) {
    for (const salto of [-1, 0]) {
      const { month, year } = addMonths(p.month, p.year, salto);
      meses.set(`${year}-${month}`, { month, year });
    }
  }
  return [...meses.values()];
}

/** Cómo se lee un período en pantalla. */
export function textoDelPeriodo(p: PeriodoDelBolsillo) {
  if (p.half === 0) return 'el mes que viene';
  return p.half === 1 ? 'la 1ra quincena' : 'la 2da quincena';
}
