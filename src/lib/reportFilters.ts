/**
 * Reglas compartidas por todos los reportes (dashboard, patrimonio, bot).
 *
 * Antes cada lectura decidía por su cuenta qué gastos contar y en qué moneda,
 * así que el mismo mes daba números distintos según dónde lo mirabas.
 * Todo eso vive acá para que no se vuelva a desincronizar.
 */

/**
 * Categorías cuyos gastos NO son consumo: son plata que se movió a un ahorro
 * o a una inversión. Se excluyen de los totales para no contarla dos veces
 * (el movimiento de ahorro ya la descuenta del balance).
 */
export const CATEGORIAS_DE_AHORRO = ['Ahorro / Inversión', 'Ahorros'];

/** Filtro de Prisma para la relación `category` de un gasto. */
export const categoriaDeConsumo = { name: { notIn: CATEGORIAS_DE_AHORRO } };

/**
 * Moneda en la que se consolidan los reportes.
 *
 * La app guarda movimientos en ARS, USD y EUR, pero todavía no convierte entre
 * monedas en los totales. Para que las tarjetas de arriba y los gráficos de
 * abajo cuenten exactamente lo mismo, TODOS los reportes consolidados filtran
 * por esta moneda. Los movimientos en otras monedas siguen visibles en sus
 * listas y en Ahorros / Inversiones, que sí los muestran por separado.
 */
export const MONEDA_BASE = 'ARS';
