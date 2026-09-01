import { mesDePresupuesto, rangoMesDePresupuesto } from './budgetPeriod';

export function getArgDate() {
  // Obtiene la fecha/hora actual en la zona horaria de Buenos Aires
  const argTimeStr = new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" });
  // Al crear un Date con este string, JS lo interpreta en la zona horaria local del servidor (Vercel UTC).
  // Esto hace que los métodos como .getDate(), .getMonth(), etc., devuelvan los valores de Argentina.
  return new Date(argTimeStr);
}

export function parseArgDate(dateStr: string) {
  // Los inputs type="date" mandan "YYYY-MM-DD".
  // Si hacemos new Date("YYYY-MM-DD"), JS asume que es a las 00:00:00 UTC.
  // Cuando se muestra en Argentina (UTC-3), pasa a ser el día anterior a las 21:00.
  // Para solucionarlo, forzamos la hora a las 12:00 del mediodía.
  if (dateStr.includes('T')) {
    return new Date(dateStr); // Ya tiene hora
  }
  return new Date(`${dateStr}T12:00:00-03:00`);
}

/**
 * El mes de la app NO es el mes del calendario: va de día de cobro a día de
 * cobro. Septiembre son del 31 de agosto al 29 de septiembre.
 *
 * Es como se vive la plata acá: el sueldo entra el último día del mes y con eso
 * se banca el mes siguiente. Antes el presupuesto usaba este corte y todo el
 * resto (gastos, fondo compartido, dashboard) usaba el mes calendario, así que
 * un gasto del 31 se descontaba del presupuesto nuevo pero figuraba en el mes
 * viejo, y no había forma de hacer coincidir los números.
 */
export function getCurrentFinancialMonth(date: Date, payday: number) {
  return mesDePresupuesto(date, payday);
}

export function getFinancialMonthRange(month: number, year: number, payday: number) {
  return rangoMesDePresupuesto(month, year, payday);
}
