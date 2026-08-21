/**
 * Las secciones de la app, en un solo lugar.
 *
 * Antes el sidebar y la barra de abajo tenían cada uno su propia lista, en
 * distinto orden y con dos links copiados a mano: cambiar una sección obligaba
 * a acordarse de tocar los dos archivos.
 */

export interface Seccion {
  href: string;
  label: string;
  icon: string;
  /** Las 4 del día a día van fijas en la barra de abajo; el resto, en "Más". */
  principal?: boolean;
  /** Depende del mes elegido: al navegar se le arrastra ?month&year. */
  porMes?: boolean;
  /** Solo visible para cuentas administradoras. */
  soloAdmin?: boolean;
}

export const SECCIONES: Seccion[] = [
  { href: '/dashboard', label: 'Inicio', icon: '🏠', principal: true, porMes: true },
  { href: '/gastos', label: 'Gastos', icon: '💸', principal: true, porMes: true },
  { href: '/ingresos', label: 'Ingresos', icon: '💰', principal: true, porMes: true },
  { href: '/ahorros', label: 'Ahorros', icon: '🐷', principal: true, porMes: true },
  { href: '/agenda', label: 'Agenda', icon: '🗓️', porMes: true },
  { href: '/tarjetas', label: 'Tarjetas', icon: '💳', porMes: true },
  { href: '/prestamos', label: 'Préstamos', icon: '🏦', porMes: true },
  { href: '/inversiones', label: 'Inversiones', icon: '📈' },
  { href: '/configuracion', label: 'Configuración', icon: '⚙️' },
  { href: '/admin', label: 'Administración', icon: '🛡️', soloAdmin: true },
];

export const seccionesVisibles = (esAdmin: boolean) =>
  SECCIONES.filter((s) => !s.soloAdmin || esAdmin);

/**
 * El href de una sección conservando el mes que se está mirando.
 *
 * Sin esto, ir de Gastos a Tarjetas te devolvía al mes actual y había que
 * volver a elegir el mes en cada sección.
 */
export function hrefConMes(seccion: Seccion, month?: string | null, year?: string | null) {
  if (!seccion.porMes || !month || !year) return seccion.href;
  return `${seccion.href}?month=${month}&year=${year}`;
}
