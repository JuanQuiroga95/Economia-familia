/**
 * El mes de la app no es el del calendario: va de día de cobro a día de cobro.
 *
 * Con el día de cobro por defecto (el último del mes), septiembre va del 31 de
 * agosto al 29 de septiembre. Es como se vive la plata: el sueldo entra y con
 * eso se banca el mes que viene.
 *
 * Todo el cálculo de fechas vive acá porque antes estaba repetido: el
 * presupuesto usaba el corte del día de cobro y el resto de la app el mes
 * calendario, así que un gasto del 31 se descontaba del presupuesto nuevo pero
 * figuraba en el mes viejo.
 */

import { addMonths } from './periodUtils';

/** Día de cobro "el último del mes", que es el que traían todas las cuentas. */
export const COBRO_ULTIMO_DIA = 0;

/** Cuántos días tiene un mes (month es 1-12). */
export function ultimoDiaDelMes(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

/**
 * Qué día se cobra en un mes concreto. El 0 es "el último", y un día 31 en un
 * mes de 30 se cobra el 30: si no, febrero se quedaba sin cobro.
 */
export function diaDeCobroDe(month: number, year: number, payday: number) {
  const ultimo = ultimoDiaDelMes(month, year);
  if (payday <= 0 || payday >= ultimo) return ultimo;
  return payday;
}

/**
 * Cobrar en la segunda mitad del mes es cobrar el mes siguiente: la plata que
 * entra el 31 de agosto es la de septiembre. Cobrando temprano, en cambio, se
 * cobra el mes en curso.
 */
function elCobroBancaElMesSiguiente(payday: number) {
  return payday <= 0 || payday >= 16;
}

/** Primer instante del mes de la app. */
export function inicioDelMes(month: number, year: number, payday: number) {
  const cobro = elCobroBancaElMesSiguiente(payday)
    ? addMonths(month, year, -1)
    : { month, year };
  return new Date(
    cobro.year,
    cobro.month - 1,
    diaDeCobroDe(cobro.month, cobro.year, payday),
    0, 0, 0
  );
}

/**
 * Rango del mes completo. El fin se calcula como "un segundo antes de que
 * arranque el que viene", así no quedan huecos ni días contados dos veces.
 */
export function rangoMesDePresupuesto(
  month: number,
  year: number,
  payday: number = COBRO_ULTIMO_DIA
) {
  const siguiente = addMonths(month, year, 1);
  const startDate = inicioDelMes(month, year, payday);
  const finExclusivo = inicioDelMes(siguiente.month, siguiente.year, payday);
  return { startDate, endDate: new Date(finExclusivo.getTime() - 1000) };
}

/** A qué mes de la app pertenece una fecha. */
export function mesDePresupuesto(fecha: Date, payday: number = COBRO_ULTIMO_DIA) {
  const calendario = { month: fecha.getMonth() + 1, year: fecha.getFullYear() };
  // El corte nunca se corre más de un mes, así que alcanza con mirar el mes
  // calendario y sus dos vecinos.
  for (const salto of [0, 1, -1]) {
    const candidato = addMonths(calendario.month, calendario.year, salto);
    const { startDate, endDate } = rangoMesDePresupuesto(
      candidato.month,
      candidato.year,
      payday
    );
    if (fecha >= startDate && fecha <= endDate) return candidato;
  }
  return calendario;
}

/**
 * Dónde se parte el mes en dos quincenas: el día 16, como se habla acá. Si con
 * ese día de cobro el 16 cae fuera del mes, se parte al medio.
 */
function corteDeQuincena(month: number, year: number, payday: number) {
  const { startDate, endDate } = rangoMesDePresupuesto(month, year, payday);
  const dia16 = new Date(year, month - 1, 16, 0, 0, 0);
  if (dia16 > startDate && dia16 <= endDate) return dia16;

  const medio = new Date((startDate.getTime() + endDate.getTime()) / 2);
  return new Date(medio.getFullYear(), medio.getMonth(), medio.getDate(), 0, 0, 0);
}

/** Rango de una quincena del mes. */
export function rangoQuincena(
  month: number,
  year: number,
  quincena: 1 | 2,
  payday: number = COBRO_ULTIMO_DIA
) {
  const { startDate, endDate } = rangoMesDePresupuesto(month, year, payday);
  const corte = corteDeQuincena(month, year, payday);
  return quincena === 1
    ? { startDate, endDate: new Date(corte.getTime() - 1000) }
    : { startDate: corte, endDate };
}

/** En qué quincena cae una fecha. */
export function quincenaDe(fecha: Date, payday: number = COBRO_ULTIMO_DIA): 1 | 2 {
  const { month, year } = mesDePresupuesto(fecha, payday);
  return fecha < corteDeQuincena(month, year, payday) ? 1 : 2;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Texto del rango, para que se vea qué días cuenta cada cosa. Sin esto es
 * imposible entender por qué un gasto del día 10 no aparece en la quincena.
 */
export function textoDelPeriodo(startDate: Date, endDate: Date) {
  const dia = (d: Date) => d.getDate();
  const mes = (d: Date) => MESES[d.getMonth()];
  return mes(startDate) === mes(endDate)
    ? `${dia(startDate)} al ${dia(endDate)} de ${mes(endDate)}`
    : `${dia(startDate)} de ${mes(startDate)} al ${dia(endDate)} de ${mes(endDate)}`;
}

/** Cómo se lee un día de cobro en pantalla. */
export function textoDelDiaDeCobro(payday: number) {
  return payday <= 0 ? 'el último día del mes' : `el día ${payday}`;
}
