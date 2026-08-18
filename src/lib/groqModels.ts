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

/** Modelos que Groq lista pero que no sirven para chat/JSON. */
const NO_SIRVE_PARA_CHAT = /whisper|orpheus|tts|prompt-guard|safeguard|embed|moderation|allam/i;

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
 * Corre `fn` con el primer modelo que ande. Si Groq responde "no existe",
 * pasa al siguiente; si se acabaron, refresca la lista y prueba de nuevo.
 */
export async function conModelo<T>(
  candidatos: (forzarRefresco: boolean) => Promise<string[]>,
  fn: (modelo: string) => Promise<T>
): Promise<T> {
  let ultimoError: any;
  const yaProbados = new Set<string>();

  for (const forzarRefresco of [false, true]) {
    for (const modelo of await candidatos(forzarRefresco)) {
      if (yaProbados.has(modelo)) continue;
      yaProbados.add(modelo);
      try {
        return await fn(modelo);
      } catch (error: any) {
        if (!esModeloInexistente(error)) throw error;
        console.warn(`[GROQ] ${modelo} ya no existe, pruebo el siguiente.`);
        ultimoError = error;
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
