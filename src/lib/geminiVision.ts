/**
 * Lectura de imágenes con Gemini.
 *
 * Groq no tiene modelos de visión, así que las fotos de comprobantes las lee
 * Gemini. El problema es que una sola llamada suelta se cae por cualquier
 * motivo pasajero —"503 high demand", un 429 por cuota, un timeout— y el bot
 * le contestaba a la familia con el JSON crudo del error.
 *
 * Acá la llamada se hace resistente:
 *  - reintenta los errores pasajeros con esperas crecientes;
 *  - si un modelo sigue sin responder, pasa al siguiente de la lista;
 *  - la lista de modelos se consulta a la API (igual que en `groqModels`), así
 *    que si Google jubila uno, el bot no se cae esperando un deploy;
 *  - todo corre con una fecha límite, para no comerse el timeout de Vercel.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta';

/** Orden de preferencia. El primero que ande es el que se usa. */
export const VISION_PREFERIDOS = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
];

/** Modelos que la API lista pero que no sirven para leer una foto. */
const NO_SIRVE_PARA_VISION =
  /embedding|aqa|imagen|veo|tts|audio|live|learnlm|gemma|image-generation|robotics/i;

const TTL_MS = 6 * 60 * 60 * 1000;
const INTENTOS_POR_MODELO = 3;
/** Tope de la tarea entera: el webhook de Telegram tiene que contestar rápido. */
const LIMITE_TOTAL_MS = 25_000;
/** Tope de una sola llamada: si Google se cuelga, cortamos y probamos de nuevo. */
const LIMITE_POR_LLAMADA_MS = 15_000;

let cache: { ids: string[]; at: number } | null = null;

export type ParteDeImagen = { inline_data: { mime_type: string; data: string } };

/** Error de visión con la causa ya interpretada, para poder avisar en criollo. */
export class ErrorDeVision extends Error {
  /** true cuando Google está saturado o sin cuota: reintentar más tarde sirve. */
  saturado: boolean;
  modelo?: string;

  constructor(message: string, opciones: { saturado?: boolean; modelo?: string } = {}) {
    super(message);
    this.name = 'ErrorDeVision';
    this.saturado = opciones.saturado ?? false;
    this.modelo = opciones.modelo;
  }
}

/** ¿Conviene reintentar? Saturación, cuota, cortes de red y timeouts. */
function esPasajero(status: number | null): boolean {
  return status === null || status === 429 || (status >= 500 && status <= 599);
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera creciente con algo de ruido, para no golpear siempre en el mismo momento. */
function espera(intento: number): number {
  return Math.min(700 * 2 ** intento, 4000) + Math.floor(Math.random() * 300);
}

/** Modelos de la cuenta que aceptan `generateContent`, cacheados en memoria. */
export async function modelosVisionVivos(forzarRefresco = false): Promise<string[]> {
  if (!forzarRefresco && cache && Date.now() - cache.at < TTL_MS) return cache.ids;

  const res = await fetch(`${API}/models?pageSize=200&key=${process.env.GOOGLE_API_KEY}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`No se pudo listar modelos de Gemini (HTTP ${res.status})`);

  const data = await res.json();
  const ids: string[] = (data?.models || [])
    .filter((m: any) => (m?.supportedGenerationMethods || []).includes('generateContent'))
    .map((m: any) => String(m?.name || '').replace(/^models\//, ''))
    .filter(Boolean);

  cache = { ids, at: Date.now() };
  return ids;
}

/**
 * Modelos a probar, del mejor al peor.
 * Con GEMINI_VISION_MODEL se puede fijar uno a mano desde Vercel, sin tocar código.
 */
export async function candidatosVision(forzarRefresco = false): Promise<string[]> {
  if (process.env.GEMINI_VISION_MODEL) return [process.env.GEMINI_VISION_MODEL];

  try {
    const vivos = await modelosVisionVivos(forzarRefresco);
    const arriba = VISION_PREFERIDOS.filter((id) => vivos.includes(id));
    const resto = vivos.filter((id) => !arriba.includes(id) && !NO_SIRVE_PARA_VISION.test(id));
    const candidatos = [...arriba, ...resto];
    return candidatos.length > 0 ? candidatos : VISION_PREFERIDOS;
  } catch (error) {
    console.error('[GEMINI] No se pudo listar modelos, uso los preferidos:', error);
    return VISION_PREFERIDOS;
  }
}

/** Una llamada. Devuelve el texto, o tira un error con el status para decidir. */
async function llamar(modelo: string, prompt: string, imagenes: ParteDeImagen[]): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API}/models/${modelo}:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...imagenes] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
      }),
      signal: AbortSignal.timeout(LIMITE_POR_LLAMADA_MS),
    });
  } catch (error: any) {
    // Se cortó la red o se venció el tiempo: cuenta como pasajero.
    throw Object.assign(new Error(`Gemini no respondió (${error?.name || 'red'})`), { status: null });
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detalle = data?.error?.message || `HTTP ${res.status}`;
    throw Object.assign(new Error(detalle), { status: res.status });
  }

  const texto = (data?.candidates?.[0]?.content?.parts || [])
    .map((p: any) => p?.text || '')
    .join('')
    .trim();

  if (!texto) {
    // Sin texto y sin error HTTP: puede ser un corte por filtros o una respuesta
    // vacía. El corte es definitivo; una respuesta vacía suele arreglarse solo.
    const motivo = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
    const bloqueado = motivo && !['STOP', 'MAX_TOKENS'].includes(motivo);
    throw Object.assign(
      new Error(
        bloqueado ? `Gemini rechazó la imagen (${motivo})` : 'Gemini devolvió una respuesta vacía'
      ),
      { status: bloqueado ? 400 : null }
    );
  }

  return texto;
}

/**
 * Lee las imágenes reintentando y cambiando de modelo hasta que salga.
 * Si se acaban las chances, tira un `ErrorDeVision` que ya sabe si fue
 * saturación (reintentar más tarde sirve) o un problema real.
 */
export async function leerImagenes(prompt: string, imagenes: ParteDeImagen[]): Promise<string> {
  const limite = Date.now() + LIMITE_TOTAL_MS;
  const yaProbados = new Set<string>();
  let ultimo: { error: any; modelo: string } | null = null;

  for (const forzarRefresco of [false, true]) {
    for (const modelo of await candidatosVision(forzarRefresco)) {
      if (yaProbados.has(modelo)) continue;
      yaProbados.add(modelo);

      for (let intento = 0; intento < INTENTOS_POR_MODELO; intento++) {
        try {
          return await llamar(modelo, prompt, imagenes);
        } catch (error: any) {
          ultimo = { error, modelo };
          const status = error?.status ?? null;

          // 404: el modelo ya no existe, probamos el siguiente. 400/403: el
          // pedido o la key están mal, reintentar no cambia nada.
          if (!esPasajero(status)) {
            if (status === 404) break;
            throw new ErrorDeVision(error.message || 'Gemini rechazó el pedido', { modelo });
          }

          console.warn(`[GEMINI] ${modelo} falló (${status ?? 'red'}), intento ${intento + 1}.`);
          const proxima = espera(intento);
          if (intento + 1 >= INTENTOS_POR_MODELO || Date.now() + proxima > limite) break;
          await dormir(proxima);
        }
      }

      if (Date.now() > limite) {
        throw new ErrorDeVision(ultimo?.error?.message || 'Gemini tardó demasiado', {
          saturado: true,
          modelo: ultimo?.modelo,
        });
      }
    }
  }

  throw new ErrorDeVision(ultimo?.error?.message || 'Ningún modelo de Gemini respondió', {
    saturado: esPasajero(ultimo?.error?.status ?? null),
    modelo: ultimo?.modelo,
  });
}

/** Estado de la visión, para /api/debug-models y el chequeo diario. */
export async function estadoVision(): Promise<{
  visionEnUso: string | null;
  /** true cuando ninguno de los preferidos sigue vivo: anda igual, pero revisá la lista. */
  degradado: boolean;
  preferidosCaidos: string[];
  candidatosVision: string[];
  error?: string;
}> {
  try {
    const vivos = await modelosVisionVivos(true);
    const candidatos = await candidatosVision(false);
    return {
      visionEnUso: candidatos[0] ?? null,
      degradado: !VISION_PREFERIDOS.some((id) => vivos.includes(id)),
      preferidosCaidos: VISION_PREFERIDOS.filter((id) => !vivos.includes(id)),
      candidatosVision: candidatos,
    };
  } catch (error: any) {
    // Si no se puede ni listar, no avisamos "degradado": puede ser un corte de
    // Google de un minuto y el aviso diario se volvería ruido.
    return {
      visionEnUso: null,
      degradado: false,
      preferidosCaidos: [],
      candidatosVision: VISION_PREFERIDOS,
      error: error?.message || 'No se pudo consultar Gemini',
    };
  }
}
