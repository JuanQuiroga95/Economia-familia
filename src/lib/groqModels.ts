import Groq from 'groq-sdk';

/**
 * Groq da de baja modelos cada pocas semanas. Si el nombre del modelo está
 * escrito a mano en el código, el bot se cae hasta que alguien lo cambia y
 * redeploya.
 *
 * Acá el modelo se elige solo: se consulta qué tiene viva la cuenta y se usa el
 * mejor de la lista de preferidos que siga existiendo. Si Groq los da de baja a
 * todos, se cae a cualquier otro modelo de chat disponible en vez de romperse.
 */

/**
 * Modelos que Groq lista pero que no sirven para chat/JSON.
 * Los `compound` quedan afuera aparte: son sistemas con herramientas y no
 * aceptan `response_format: json_object`, que es como le pedimos las acciones.
 */
const NO_SIRVE_PARA_CHAT = /whisper|orpheus|tts|prompt-guard|safeguard|embed|moderation|allam|compound/i;

/** Orden de preferencia para texto. El primero vivo es el que se usa. */
export const TEXTO_PREFERIDOS = [
  'qwen/qwen3.6-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
];

/** Orden de preferencia para transcribir audios. */
export const AUDIO_PREFERIDOS = ['whisper-large-v3', 'whisper-large-v3-turbo'];

const TTL_MS = 6 * 60 * 60 * 1000;
let cache: { ids: string[]; at: number } | null = null;

/** ¿El error es "este modelo ya no existe"? */
export function esModeloInexistente(error: any): boolean {
  return error?.status === 404 || /model_not_found|does not exist/i.test(error?.message || '');
}

/**
 * ¿El modelo no supo devolver el JSON que le pedimos?
 *
 * Groq valida el JSON del lado del servidor y tira un 400 `json_validate_failed`
 * (muchas veces con `failed_generation` vacío) cuando el modelo se va en tokens
 * de razonamiento y no llega a cerrar el objeto. No es un problema del pedido:
 * es este modelo puntual, así que conviene pasar al siguiente en vez de cortar.
 */
export function esFalloDeJson(error: any): boolean {
  const code = error?.error?.error?.code ?? error?.error?.code ?? error?.code;
  return code === 'json_validate_failed' || /json_validate_failed/i.test(error?.message || '');
}

/** Errores que ameritan probar con otro modelo en vez de propagarse. */
export function convieneProbarOtroModelo(error: any): boolean {
  return esModeloInexistente(error) || esFalloDeJson(error);
}

/**
 * ¿Es un problema pasajero de Groq? Saturación (503), cuota momentánea (429),
 * cortes de red. No hay nada que arreglar: alcanza con volver a intentar.
 */
export function esPasajero(error: any): boolean {
  const status = error?.status ?? error?.error?.status ?? null;
  if (status === 429 || (typeof status === 'number' && status >= 500)) return true;
  return /ECONNRESET|ETIMEDOUT|fetch failed|socket hang up|aborted/i.test(error?.message || '');
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera creciente con algo de ruido, para no golpear siempre en el mismo momento. */
function espera(intento: number): number {
  return Math.min(600 * 2 ** intento, 3000) + Math.floor(Math.random() * 300);
}

/** Reintentos por modelo cuando Groq contesta que está saturado. */
const INTENTOS_POR_MODELO = 3;
/** Tope de la tarea entera: el webhook de Telegram tiene que contestar rápido. */
const LIMITE_TOTAL_MS = 15_000;

/** Modelos vivos en la cuenta, cacheados en memoria del lambda. */
export async function modelosVivos(forzarRefresco = false): Promise<string[]> {
  if (!forzarRefresco && cache && Date.now() - cache.at < TTL_MS) return cache.ids;

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const res = await groq.models.list();
  cache = { ids: res.data.map((m) => m.id), at: Date.now() };
  return cache.ids;
}

function ordenar(vivos: string[], preferidos: string[], sirve: (id: string) => boolean): string[] {
  const arriba = preferidos.filter((id) => vivos.includes(id));
  const resto = vivos.filter((id) => sirve(id) && !arriba.includes(id));
  const candidatos = [...arriba, ...resto];
  // Si el listado vino vacío o raro, al menos probamos los que conocemos.
  return candidatos.length > 0 ? candidatos : preferidos;
}

/**
 * Modelos de texto a probar, del mejor al peor.
 * Con GROQ_TEXT_MODEL se puede fijar uno a mano desde Vercel, sin tocar código.
 */
export async function candidatosTexto(forzarRefresco = false): Promise<string[]> {
  if (process.env.GROQ_TEXT_MODEL) return [process.env.GROQ_TEXT_MODEL];

  try {
    const vivos = await modelosVivos(forzarRefresco);
    return ordenar(vivos, TEXTO_PREFERIDOS, (id) => !NO_SIRVE_PARA_CHAT.test(id));
  } catch (error) {
    console.error('[GROQ] No se pudo listar modelos, uso los preferidos:', error);
    return TEXTO_PREFERIDOS;
  }
}

/** Modelos de audio a probar, del mejor al peor. */
export async function candidatosAudio(forzarRefresco = false): Promise<string[]> {
  if (process.env.GROQ_AUDIO_MODEL) return [process.env.GROQ_AUDIO_MODEL];

  try {
    const vivos = await modelosVivos(forzarRefresco);
    return ordenar(vivos, AUDIO_PREFERIDOS, (id) => /whisper/i.test(id));
  } catch (error) {
    console.error('[GROQ] No se pudo listar modelos, uso los preferidos:', error);
    return AUDIO_PREFERIDOS;
  }
}

/**
 * Corre `fn` con el primer modelo que ande.
 *
 * Si Groq está saturado, reintenta con el mismo modelo esperando cada vez un
 * poco más. Si el modelo ya no existe o no sabe devolver el JSON, pasa al
 * siguiente; si se acabaron, refresca la lista y prueba de nuevo.
 */
export async function conModelo<T>(
  candidatos: (forzarRefresco: boolean) => Promise<string[]>,
  fn: (modelo: string) => Promise<T>
): Promise<T> {
  let ultimoError: any;
  const yaProbados = new Set<string>();
  const limite = Date.now() + LIMITE_TOTAL_MS;

  for (const forzarRefresco of [false, true]) {
    for (const modelo of await candidatos(forzarRefresco)) {
      if (yaProbados.has(modelo)) continue;
      if (Date.now() > limite) break;
      yaProbados.add(modelo);

      for (let intento = 0; intento < INTENTOS_POR_MODELO; intento++) {
        try {
          return await fn(modelo);
        } catch (error: any) {
          ultimoError = error;

          if (esPasajero(error)) {
            console.warn(`[GROQ] ${modelo} está saturado, intento ${intento + 1}.`);
            const proxima = espera(intento);
            if (intento + 1 < INTENTOS_POR_MODELO && Date.now() + proxima <= limite) {
              await dormir(proxima);
              continue;
            }
            break;
          }

          if (!convieneProbarOtroModelo(error)) throw error;
          console.warn(
            `[GROQ] ${modelo} no sirvió (${esModeloInexistente(error) ? 'ya no existe' : 'JSON inválido'}), pruebo el siguiente.`
          );
          break;
        }
      }
    }
  }

  throw ultimoError || new Error('Groq no tiene ningún modelo disponible para esta tarea.');
}

/**
 * Estado de los modelos, para el chequeo diario y para /api/debug-models.
 * `degradado` es true cuando ninguno de los preferidos sigue vivo: el bot
 * funciona igual, pero conviene revisar la lista de preferencias.
 */
export async function estadoModelos() {
  const vivos = await modelosVivos(true);
  const texto = await candidatosTexto(false);
  const audio = await candidatosAudio(false);

  return {
    textoEnUso: texto[0] ?? null,
    audioEnUso: audio[0] ?? null,
    degradado: !TEXTO_PREFERIDOS.some((id) => vivos.includes(id)),
    preferidosCaidos: TEXTO_PREFERIDOS.filter((id) => !vivos.includes(id)),
    candidatosTexto: texto,
    candidatosAudio: audio,
    todos: [...vivos].sort(),
  };
}
