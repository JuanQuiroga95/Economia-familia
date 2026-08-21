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

/**
 * Orden de preferencia. El primero que ande es el que se usa.
 *
 * Los `lite` van primero a propósito: en el plan gratis de Google, el
 * `flash-latest` se queda sin cuota enseguida y encima tarda ~45 segundos en
 * contestar que no puede. Los `lite` leen un ticket igual de bien y responden
 * en 2-7 segundos. Si algún día se habilita facturación en la key, conviene
 * poner `gemini-flash-latest` arriba de todo.
 */
export const VISION_PREFERIDOS = [
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
];

/** Modelos que la API lista pero que no sirven para leer una foto. */
const NO_SIRVE_PARA_VISION =
  /embedding|aqa|imagen|veo|tts|audio|live|learnlm|gemma|image-generation|robotics/i;

const TTL_MS = 6 * 60 * 60 * 1000;
/** Vueltas a la lista entera de modelos. */
const RONDAS = 2;
/** Tope de la tarea entera: el webhook de Telegram tiene que contestar rápido. */
const LIMITE_TOTAL_MS = 40_000;
/**
 * Tope de una sola llamada. Una lectura buena tarda 2-7 segundos; cuando un
 * modelo está tapado se queda colgado 45 y termina en 503, así que se corta
 * antes y se prueba con el siguiente en vez de esperarlo.
 */
const LIMITE_POR_LLAMADA_MS = 20_000;

let cache: { ids: string[]; at: number } | null = null;

export type ParteDeImagen = { inline_data: { mime_type: string; data: string } };

/** Error de visión con la causa ya interpretada, para poder avisar en criollo. */
export class ErrorDeVision extends Error {
  /** true cuando Google está tapado: reintentar en un rato sirve. */
  saturado: boolean;
  /** true cuando se acabó la cuota de la key (429): esperar no alcanza. */
  sinCuota: boolean;
  modelo?: string;

  constructor(
    message: string,
    opciones: { saturado?: boolean; sinCuota?: boolean; modelo?: string } = {}
  ) {
    super(message);
    this.name = 'ErrorDeVision';
    this.saturado = opciones.saturado ?? false;
    this.sinCuota = opciones.sinCuota ?? false;
    this.modelo = opciones.modelo;
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
        // 1500 y no 800: los modelos nuevos gastan tokens "pensando" antes de
        // escribir, y con el tope justo devolvían la lista cortada o vacía.
        generationConfig: { temperature: 0.1, maxOutputTokens: 1500 },
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
 * Lee las imágenes cambiando de modelo apenas uno no contesta.
 *
 * La clave es no insistir con el mismo: cuando un modelo está tapado tarda
 * ~45 segundos en decir 503, y mientras tanto el de al lado contesta en 3. Por
 * eso se recorre la lista entera antes de volver a probar con el primero, y
 * los que fallaron por algo definitivo (no existe, sin cuota) quedan afuera.
 */
export async function leerImagenes(prompt: string, imagenes: ParteDeImagen[]): Promise<string> {
  const limite = Date.now() + LIMITE_TOTAL_MS;
  /** Modelos que ya no vale la pena volver a probar en esta lectura. */
  const descartados = new Map<string, string>();
  let ultimo: { error: any; modelo: string } | null = null;
  let sinCuota = false;

  for (let ronda = 0; ronda < RONDAS; ronda++) {
    let probeAlguno = false;

    for (const modelo of await candidatosVision(ronda > 0)) {
      if (descartados.has(modelo)) continue;
      // No arrancar una llamada que no llega a terminar dentro del tiempo.
      if (Date.now() + 3000 > limite) break;
      probeAlguno = true;

      try {
        const texto = await llamar(modelo, prompt, imagenes);
        if (ronda > 0 || descartados.size > 0) console.log(`[GEMINI] leyó con ${modelo}.`);
        return texto;
      } catch (error: any) {
        ultimo = { error, modelo };
        const status = error?.status ?? null;

        if (status === 429) {
          // Cuota agotada: esperar no arregla nada, este modelo queda afuera.
          descartados.set(modelo, 'sin cuota');
          sinCuota = true;
          console.warn(`[GEMINI] ${modelo} sin cuota, lo descarto.`);
          continue;
        }

        if (status !== null && status < 500) {
          // 404 (ya no existe), 400/403 (no le sirve el pedido o la key).
          descartados.set(modelo, `HTTP ${status}`);
          console.warn(`[GEMINI] ${modelo} no sirve (${status}), lo descarto.`);
          continue;
        }

        // 503 o timeout: es de este momento, pruebo el siguiente sin esperar.
        console.warn(`[GEMINI] ${modelo} no contestó (${status ?? 'timeout'}), voy al siguiente.`);
      }
    }

    if (!probeAlguno) break;
    // Antes de repetir la vuelta, un respiro corto por si fue un pico.
    if (ronda + 1 < RONDAS && Date.now() + 4000 < limite) await dormir(1000);
  }

  const status = ultimo?.error?.status ?? null;
  throw new ErrorDeVision(ultimo?.error?.message || 'Ningún modelo de Gemini respondió', {
    saturado: status === null || status >= 500,
    sinCuota,
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
