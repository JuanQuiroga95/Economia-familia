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
  const day = date.getDate();
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();
  const lastDay = new Date(year, month, 0).getDate();

  // Si es el último día del mes, pertenece al mes financiero siguiente
  if (day === lastDay) {
    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
    return { month: nextMonth, year: nextYear };
  }

  return { month, year };
}

export function getFinancialMonthRange(month: number, year: number) {
  // Mes anterior
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear--;
  }

  // Inicio: Último día del mes anterior a las 00:00:00
  const prevMonthLastDay = new Date(prevYear, prevMonth, 0).getDate();
  const startDate = new Date(prevYear, prevMonth - 1, prevMonthLastDay, 0, 0, 0);

  // Fin: Penúltimo día del mes actual a las 23:59:59
  const currentMonthLastDay = new Date(year, month, 0).getDate();
  const endDate = new Date(year, month - 1, currentMonthLastDay - 1, 23, 59, 59);

  return { startDate, endDate };
}
