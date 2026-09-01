/**
 * Búsqueda "como uno la espera", no como la de WhatsApp.
 *
 * Escribir `gas` tiene que encontrar `Ecogas`, `GAS NATURAL` y `Gas`. O sea:
 * no importan las mayúsculas, ni los acentos, ni que la palabra esté cortada
 * por la mitad, ni el orden en que se escriban las palabras.
 */

/** Pasa todo a minúsculas y le saca los acentos, para poder comparar de igual a igual. */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD') // separa la letra de su tilde
    .replace(/[\u0300-\u036f]/g, '') // y acá se van las tildes y diéresis
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `true` si cada palabra de la consulta aparece en algún lado del texto,
 * en cualquier orden y aunque esté incompleta.
 *
 * Una consulta vacía no filtra nada (devuelve `true` siempre).
 */
export function coincideBusqueda(texto: string, consulta: string): boolean {
  const palabras = normalizarTexto(consulta).split(' ').filter(Boolean);
  if (palabras.length === 0) return true;
  const objetivo = normalizarTexto(texto);
  return palabras.every((palabra) => objetivo.includes(palabra));
}
