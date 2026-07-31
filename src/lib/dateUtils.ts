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

export function getCurrentFinancialMonth(date = getArgDate()) {
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();

  return { month, year };
}

export function getFinancialMonthRange(month: number, year: number) {
  // Inicio: Día 1 del mes actual a las 00:00:00
  const startDate = new Date(year, month - 1, 1, 0, 0, 0);

  // Fin: Último día del mes actual a las 23:59:59
  const currentMonthLastDay = new Date(year, month, 0).getDate();
  const endDate = new Date(year, month - 1, currentMonthLastDay, 23, 59, 59);

  return { startDate, endDate };
}
