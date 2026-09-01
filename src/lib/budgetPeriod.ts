/**
 * El presupuesto no va del 1 al 30 del calendario: arranca el último día del
 * mes anterior, que es el día de cobro. O sea, el "mes de presupuesto" de
 * septiembre va del 31 de agosto al 29 de septiembre.
 *
 * Todo el cálculo de fechas vive acá porque antes estaba repetido: la vista en
 * vivo usaba el corte del día de cobro y la vista de un mes ya cerrado usaba el
 * mes calendario, así que lo gastado el último día del mes se contaba dos veces
 * (en el mes viejo cerrado y en la quincena nueva).
 */

import { addMonths } from './periodUtils';

/** Cuántos días tiene un mes (month es 1-12). */
export function ultimoDiaDelMes(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

/**
 * A qué mes de presupuesto pertenece una fecha. Desde el último día del mes
 * ya se está cobrando el mes siguiente.
 */
export function mesDePresupuesto(fecha: Date) {
  const month = fecha.getMonth() + 1;
  const year = fecha.getFullYear();
  return fecha.getDate() >= ultimoDiaDelMes(month, year)
    ? addMonths(month, year, 1)
    : { month, year };
}

/** En qué quincena del mes de presupuesto cae una fecha. */
export function quincenaDe(fecha: Date): 1 | 2 {
  const dia = fecha.getDate();
  const ultimo = ultimoDiaDelMes(fecha.getMonth() + 1, fecha.getFullYear());
  return dia >= ultimo || dia <= 15 ? 1 : 2;
}

/** Rango de una quincena del mes de presupuesto. */
export function rangoQuincena(month: number, year: number, quincena: 1 | 2) {
  if (quincena === 1) {
    const previo = addMonths(month, year, -1);
    return {
      startDate: new Date(
        previo.year,
        previo.month - 1,
        ultimoDiaDelMes(previo.month, previo.year),
        0, 0, 0
      ),
      endDate: new Date(year, month - 1, 15, 23, 59, 59),
    };
  }
  return {
    startDate: new Date(year, month - 1, 16, 0, 0, 0),
    endDate: new Date(year, month - 1, ultimoDiaDelMes(month, year) - 1, 23, 59, 59),
  };
}

/** Rango del mes de presupuesto completo (las dos quincenas juntas). */
export function rangoMesDePresupuesto(month: number, year: number) {
  return {
    startDate: rangoQuincena(month, year, 1).startDate,
    endDate: rangoQuincena(month, year, 2).endDate,
  };
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Texto del rango, para que se vea qué días cuenta el presupuesto. Sin esto es
 * imposible entender por qué un gasto del día 10 no aparece en la quincena.
 */
export function textoDelPeriodo(startDate: Date, endDate: Date) {
  const dia = (d: Date) => d.getDate();
  const mes = (d: Date) => MESES[d.getMonth()];
  return mes(startDate) === mes(endDate)
    ? `${dia(startDate)} al ${dia(endDate)} de ${mes(endDate)}`
    : `${dia(startDate)} de ${mes(startDate)} al ${dia(endDate)} de ${mes(endDate)}`;
}
