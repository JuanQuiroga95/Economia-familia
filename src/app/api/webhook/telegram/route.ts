import { formatCurrency } from '@/lib/formatUtils';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getCardCategory } from '@/lib/cardCategory';
import {
  buildInstallments,
  buildStatement,
  firstInstallmentPeriod,
  formatPeriod,
} from '@/lib/cardUtils';
import { getLoanCategory } from '@/lib/loanCategory';
import { loanProgress, nextPendingInstallment } from '@/lib/loanUtils';
import { escaparHtml, sendTelegramMessage } from '@/lib/telegramSend';
import { getArgDate, getCurrentFinancialMonth, parseArgDate } from '@/lib/dateUtils';
import Groq from 'groq-sdk';
import { candidatosAudio, candidatosTexto, conModelo, esFalloDeJson, estadoModelos } from '@/lib/groqModels';
import { ErrorDeVision, leerImagenes, type ParteDeImagen } from '@/lib/geminiVision';
import crypto from 'crypto';

// El bot habla con dos IAs y a veces hay que reintentar. Sin esto Vercel corta
// la función antes de tiempo y Telegram reenvía el mismo mensaje.
export const maxDuration = 60;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ============================================
// Telegram helpers
// ============================================

// sendTelegramMessage vive en @/lib/telegramSend: lo comparte el cron de recordatorios.

/**
 * Vincula un perfil usando el PIN de 6 dígitos.
 * Lo usa tanto el envío manual del código como el deep link "/start <PIN>".
 */
async function linkProfileWithCode(chatId: string, fromId: string, code: string) {
  const profile = await prisma.profile.findFirst({
    where: {
      telegramLinkCode: code,
      // El PIN vale 15 minutos. Los códigos viejos sin vencimiento (de antes de
      // este cambio) se tratan como vencidos: hay que generar uno nuevo.
      telegramLinkCodeExpiresAt: { gt: new Date() },
    },
    include: { account: true },
  });

  if (!profile) {
    await sendTelegramMessage(
      chatId,
      '❌ Código no válido o vencido. Generá uno nuevo en Configuración → Telegram (dura 15 minutos).'
    );
    return;
  }

  await prisma.profile.update({
    where: { id: profile.id },
    data: { telegramChatId: fromId, telegramLinkCode: null, telegramLinkCodeExpiresAt: null },
  });
  await sendTelegramMessage(
    chatId,
    `✅ ¡Vinculación exitosa!\n👤 Perfil: <b>${profile.name}</b>\n🏠 Cuenta: <b>${profile.account?.label}</b>\n\nAhora podés enviarme tus gastos e ingresos por texto, fotos o audio. 🎙️📸`
  );
}

// ============================================
// Tarjetas de crédito
// ============================================

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/**
 * Busca por nombre la tarjeta o el préstamo que mencionó el usuario.
 * Si no nombró ninguno y hay uno solo, asume ese.
 */
function resolveByName<T extends { name: string }>(cards: T[], name?: string): T | null {
  if (cards.length === 0) return null;
  if (!name) return cards.length === 1 ? cards[0] : null;

  const target = normalize(name);
  if (!target) return cards.length === 1 ? cards[0] : null;

  return (
    cards.find((c) => normalize(c.name) === target) ||
    cards.find((c) => normalize(c.name).includes(target) || target.includes(normalize(c.name))) ||
    (cards.length === 1 ? cards[0] : null)
  );
}

/** Estado del resumen de una tarjeta para un mes dado. */
async function getCardStatement(cardId: string, month: number, year: number) {
  const [installments, payments] = await Promise.all([
    prisma.cardInstallment.findMany({
      where: { purchase: { cardId } },
      select: { amount: true, month: true, year: true },
    }),
    prisma.cardPayment.findMany({
      where: { cardId },
      select: { amount: true, month: true, year: true },
    }),
  ]);
  return buildStatement(installments, payments, month, year);
}

async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  const filePath = fileData.result.file_path;
  const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
  const response = await fetch(downloadUrl);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ============================================
// Groq AI processing
// ============================================

async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const groq = new Groq({ apiKey: GROQ_API_KEY });
  const file = new File([new Uint8Array(audioBuffer)], 'audio.ogg', { type: 'audio/ogg' });

  return conModelo(candidatosAudio, async (model) => {
    const transcription = await groq.audio.transcriptions.create({ file, model, language: 'es' });
    return transcription.text;
  });
}

interface ParsedAction {
  accion: 'crear' | 'modificar' | 'eliminar' | 'link';
  entidad_id?: string;
  tipo?: 'gasto' | 'ingreso' | 'consumo_tarjeta' | 'pago_tarjeta' | 'pago_prestamo' | 'agenda';
  monto?: number;
  moneda?: 'ARS' | 'USD' | 'EUR';
  descripcion?: string;
  categoria?: string;
  tipo_gasto?: 'propio' | 'compartido';
  persona?: string;
  pague_yo?: boolean;
  billetera?: string;
  fecha?: string;
  tarjeta?: string;
  cuotas?: number;
  monto_es_por_cuota?: boolean;
  prestamo?: string;
  dia?: number;
  recurrente?: boolean;
  agenda_tipo?: 'fijo' | 'eventual';
}

const SYSTEM_PROMPT_BASE = (profileName: string, categories: string[], context: string) => {
  const today = getArgDate();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return `Sos el cerebro de un bot financiero para Telegram de EconoApp. Tu trabajo es interpretar la intención del usuario.

El usuario actual se llama "${profileName}".
FECHA DE HOY: ${todayStr} (Usa esta fecha como referencia para calcular "ayer", "hoy", fechas relativas, etc.)
Categorías disponibles: ${categories.join(', ')}.

CONTEXTO DE ÚLTIMOS MOVIMIENTOS:
${context}

REGLAS DE CLASIFICACIÓN DE ACCIÓN:
1. accion = "crear": El usuario reporta un nuevo gasto o ingreso. (Ej: "Gasto 5000 en nafta", "Cobré 20 lucas", o provee imágenes).
2. accion = "modificar": El usuario pide corregir o editar un movimiento existente. (Ej: "El gasto de la nafta era de 6000").
   -> DEBES identificar el 'entidad_id' usando el CONTEXTO DE ÚLTIMOS MOVIMIENTOS y proveer todos los datos corregidos (los que no menciona se mantienen igual que en el contexto).
3. accion = "eliminar": El usuario pide borrar un movimiento. (Ej: "Borrá el último gasto", "Eliminá el ingreso de ayer").
   -> DEBES identificar el 'entidad_id' usando el contexto.
4. accion = "link": El usuario escribe palabras cortas como "app", "gasto", "ingreso", "menu", "modificar" solas, pidiendo acceder a la app.

REGLAS DE TARJETAS DE CRÉDITO (solo si hay tarjetas disponibles listadas más abajo):
- tipo = "consumo_tarjeta": el usuario compró algo CON una tarjeta de la lista, normalmente en cuotas.
  (Ej: "Gasto con tarjeta Naranja de 120000 en 6 cuotas en el super", "compré una heladera con la Visa en 12 cuotas").
  -> Devolvé también "tarjeta" (el nombre de la lista que mejor coincida) y "cuotas" (número; si no aclara, 1).
  -> "monto" es el TOTAL de la compra. Si el usuario aclara que ese monto es el valor de CADA cuota
     (ej: "6 cuotas de 20000"), poné "monto_es_por_cuota": true.
- tipo = "pago_tarjeta": el usuario pagó el resumen de una tarjeta.
  (Ej: "Pagué 80000 de la tarjeta Naranja", "pago del resumen de la Visa 50 lucas").
  -> Devolvé "tarjeta" y "monto".
- IMPORTANTE: si el nombre que dice NO coincide con ninguna tarjeta de la lista, tratalo como un gasto normal ("gasto").

REGLAS DE PRÉSTAMOS (solo si hay préstamos disponibles listados más abajo):
- tipo = "pago_prestamo": el usuario pagó (o cobró) una cuota de un préstamo de la lista.
  (Ej: "Pagué la cuota del préstamo Nación", "pagué 95000 del préstamo del auto", "me pagaron la cuota que le presté a Marcos").
  -> Devolvé "prestamo" (el nombre de la lista que mejor coincida) y "monto".
  -> Si NO dice el monto pero sí el préstamo, omití "monto": se usa el valor de la cuota.
- IMPORTANTE: si el nombre no coincide con ningún préstamo de la lista, tratalo como un gasto normal.

REGLAS DE AGENDA (ayuda memoria de gastos previstos, NO afecta el balance):
- tipo = "agenda": el usuario quiere ANOTAR o RECORDAR un gasto que todavía no ocurrió.
  (Ej: "anotá en la agenda el alquiler de 450 mil el día 5", "acordate que el 20 hay que pagar el seguro",
   "recordame pagar las expensas", "agendá el cumpleaños de mamá, unos 50 lucas").
  -> Palabras clave: "anotá", "agendá", "recordame", "acordate", "no te olvides", "tengo que pagar", "viene".
  -> Devolvé "descripcion" (qué es), "monto" (si lo dice; puede faltar) y "dia" (día del mes, si lo dice).
  -> "recurrente": true si dice que es todos los meses ("el alquiler todos los meses", "fijo").
  -> "agenda_tipo": "fijo" si es un gasto que se repite o es seguro; "eventual" si es algo que puede pasar.
- CRÍTICO: si el gasto YA ocurrió (lo pagó), es "gasto", NO "agenda". La agenda es solo para lo que viene.

REGLAS DE EXTRACCIÓN (Aplica siempre que el dato exista o pueda inferirse, incluso para la acción "link"):
- fecha: Si el usuario menciona cuándo ocurrió (ej: "ayer", "el 13 de julio", "hace 3 días"), calcúlalo en base a la FECHA DE HOY y devuélvelo en formato "YYYY-MM-DD". Si no menciona fecha explícita, omítelo o devuelve la de hoy.
- tipo: "gasto", "ingreso", "consumo_tarjeta" o "pago_tarjeta"
- tipo_gasto: "compartido" o "propio" (por defecto "propio")
- moneda: "ARS", "USD" o "EUR" (por defecto "ARS")
- persona: nombre de quien lo hace (por defecto "${profileName}")
- pague_yo: por defecto TRUE (asumiendo que el usuario actual lo pagó). Solo será false si el usuario indica explícitamente que NO lo pagó él, o que lo pagó la otra persona. (Aplica a gastos compartidos)
- Multiplicadores: "mil" o "k" = x1000, "luca(s)" = x1000.
- Si analizas IMÁGENES de comprobantes o listas, es OBLIGATORIO que crees una "accion" separada en el array "acciones" por CADA movimiento individual que figure en el texto/imagen (no importa si son 2 o 10).
- REGLA CRÍTICA PARA IMÁGENES: NUNCA omitas el primer elemento de la lista ni el último. Lee cuidadosamente desde el principio hasta el final. Si hay 5 transacciones en la imagen, el JSON DEBE tener 5 acciones.
- NO agrupes, NO sumes, y NO omitas transacciones a menos que el usuario te pida EXPLÍCITAMENTE "sumalos" o "juntalos en uno solo".
- Para identificar el tipo: si dice "pago", "enviada", "transferencia enviada", "QR" o tiene un monto negativo (-), es "gasto". Si dice "rendimiento", "recibida", "deposito" o tiene un monto positivo (+), es "ingreso".
- CRÍTICO: Asume SIEMPRE que la transacción le pertenece al usuario actual, aunque los nombres en el comprobante sean otros (ej. De Gisela para Tania). Si te llega información de un comprobante, DEBES OBLIGATORIAMENTE devolver un "crear" en el JSON, NUNCA devuelvas un array vacío.

Devuelve ÚNICAMENTE un JSON válido (sin texto extra) con esta estructura:
{
  "acciones": [
    {
      "accion": "crear" | "modificar" | "eliminar" | "link",
      "entidad_id": "id_string",
      "fecha": "YYYY-MM-DD",
      "tipo": "gasto" | "ingreso" | "consumo_tarjeta" | "pago_tarjeta",
      "monto": numero,
      "moneda": "ARS",
      "descripcion": "texto",
      "categoria": "categoria",
      "tipo_gasto": "propio" | "compartido",
      "persona": "nombre",
      "pague_yo": boolean,
      "billetera": "nombre_billetera", // Si menciona una (ej: MP, Galicia, Uala)
      "tarjeta": "nombre_tarjeta", // Solo para consumo_tarjeta / pago_tarjeta
      "cuotas": numero, // Solo para consumo_tarjeta
      "monto_es_por_cuota": boolean, // Solo para consumo_tarjeta
      "prestamo": "nombre_prestamo", // Solo para pago_prestamo
      "dia": numero, // Solo para agenda: día del mes
      "recurrente": boolean, // Solo para agenda: se repite todos los meses
      "agenda_tipo": "fijo" | "eventual" // Solo para agenda
    }
  ]
}`;
};

/** Bloque de contexto extra (billeteras, tarjetas y préstamos) que se agrega al prompt base. */
function buildResourcesBlock(
  wallets: { name: string }[],
  cards: { name: string }[],
  loans: { name: string }[] = []
) {
  const walletsStr = wallets.length > 0 ? wallets.map((w) => w.name).join(', ') : 'Ninguna';
  const cardsStr = cards.length > 0 ? cards.map((c) => c.name).join(', ') : 'Ninguna';
  const loansStr = loans.length > 0 ? loans.map((l) => l.name).join(', ') : 'Ninguno';
  return `\n\nBilleteras disponibles: ${walletsStr}\nTarjetas de crédito disponibles: ${cardsStr}\nPréstamos disponibles: ${loansStr}`;
}

/**
 * Limpia la respuesta del modelo: los modelos de razonamiento (Qwen, gpt-oss)
 * pueden anteponer bloques <think> o envolver el JSON en fences.
 */
function extractJsonObject(raw: string): string {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  return start !== -1 && end > start ? s.slice(start, end + 1) : '{}';
}

/**
 * Cuánto puede razonar cada familia de modelos antes de contestar.
 *
 * El razonamiento se come el presupuesto de tokens y deja el JSON a medio
 * cerrar, que es lo que Groq rechaza con `json_validate_failed`. Para esta
 * tarea (mapear un mensaje a acciones) no hace falta razonar: Qwen acepta
 * apagarlo del todo con 'none' y gpt-oss sólo baja hasta 'low'.
 */
function esfuerzoDeRazonamiento(model: string): 'none' | 'low' | undefined {
  if (/qwen/i.test(model)) return 'none';
  if (/gpt-oss/i.test(model)) return 'low';
  return undefined;
}

/** Completion JSON contra Groq probando los modelos de GROQ_TEXT_MODELS en orden. */
async function groqJsonCompletion(
  messages: { role: 'system' | 'user'; content: string }[]
): Promise<any> {
  const groq = new Groq({ apiKey: GROQ_API_KEY });

  return conModelo(candidatosTexto, async (model) => {
    const base = {
      messages,
      model,
      temperature: 0.1,
      // Con `max_tokens` chico el razonamiento se comía el JSON entero.
      max_completion_tokens: 4000,
      reasoning_effort: esfuerzoDeRazonamiento(model),
    };

    let contenido: string | null | undefined;
    try {
      const completion = await groq.chat.completions.create({
        ...base,
        response_format: { type: 'json_object' },
      });
      contenido = completion.choices[0]?.message?.content;
    } catch (error) {
      // El modo JSON de Groq valida del lado del servidor y rechaza la
      // respuesta entera. Le damos una segunda chance en texto libre: el
      // JSON suele estar bien, sólo viene con <think> o fences alrededor.
      if (!esFalloDeJson(error)) throw error;
      console.warn(`[GROQ] ${model} falló el modo JSON, reintento en texto libre.`);
      const completion = await groq.chat.completions.create(base);
      contenido = completion.choices[0]?.message?.content;
    }

    const json = JSON.parse(extractJsonObject(contenido || '{}'));
    // Un objeto vacío es respuesta basura: que conModelo pruebe el siguiente.
    if (!Array.isArray(json?.acciones)) {
      throw Object.assign(new Error(`json_validate_failed: ${model} no devolvió acciones`), {
        code: 'json_validate_failed',
      });
    }
    return json;
  });
}

async function parseTransactionWithAI(
  text: string,
  profileName: string,
  categories: string[],
  wallets: { id: string; name: string }[],
  context: string,
  cards: { name: string }[] = [],
  loans: { name: string }[] = []
): Promise<{ acciones: ParsedAction[] }> {
  return groqJsonCompletion([
    { role: 'system', content: SYSTEM_PROMPT_BASE(profileName, categories, context) + buildResourcesBlock(wallets, cards, loans) },
    { role: 'user', content: text },
  ]);
}

async function parseImagesWithAI(
  fileIds: string[],
  profileName: string,
  categories: string[],
  wallets: { id: string; name: string }[],
  context: string,
  customInstruction: string = '',
  cards: { name: string }[] = [],
  loans: { name: string }[] = []
): Promise<{ acciones: ParsedAction[] }> {
  // Paso 1: Usar Google Gemini para analizar las imágenes (Groq ya no tiene modelos de visión)
  const imageParts: ParteDeImagen[] = [];
  for (const id of fileIds) {
    const buffer = await downloadTelegramFile(id);
    const base64 = buffer.toString('base64');
    imageParts.push({
      inline_data: { mime_type: 'image/jpeg', data: base64 }
    });
  }

  const visionPrompt = `Eres un asistente experto en finanzas. Analiza cuidadosamente estas imágenes y extrae una LISTA DETALLADA Y EXHAUSTIVA de TODOS los movimientos financieros que aparezcan.

Para CADA movimiento, indica claramente:
1. Descripción exacta.
2. Monto.
3. Si es Ingreso o Gasto (por ejemplo, pagos o montos con signo '-' son Gastos; rendimientos, depósitos o montos con signo '+' son Ingresos).

NO OMITAS NINGÚN MOVIMIENTO. Debes enumerar cada uno por separado.${customInstruction ? `\n\nInstrucción especial del usuario: "${customInstruction}"` : ''}`;

  // leerImagenes reintenta sola y cambia de modelo si Google está saturado.
  const rawVisionText = await leerImagenes(visionPrompt, imageParts);

  // Paso 2: Forzar JSON con Groq (modelo de texto)
  return groqJsonCompletion([
    { role: 'system', content: SYSTEM_PROMPT_BASE(profileName, categories, context) + buildResourcesBlock(wallets, cards, loans) },
    { role: 'user', content: `Basado en esta extracción de imagen, armá el JSON final:\n\n${rawVisionText}\n\nInstrucción del usuario original: "${customInstruction}"` },
  ]);
}

/**
 * Qué contestarle a la familia cuando la IA no responde.
 *
 * Antes se mandaba el JSON crudo del error más la lista entera de modelos de
 * Groq: ilegible, y encima daba la sensación de que el bot estaba roto cuando
 * en realidad el proveedor estaba saturado un minuto. Ahora se separa lo
 * pasajero (se reintenta y listo) de lo que hay que ir a mirar.
 */
async function mensajeDeFalloDeIA(error: any, habiaFotos: boolean): Promise<string> {
  const comoReintentar = habiaFotos
    ? '\n\n📸 Tus fotos quedaron guardadas: escribí <b>"procesar"</b> para reintentar.'
    : '\n\nMandame el mensaje de nuevo en un ratito.';

  const status = error?.status ?? error?.error?.status ?? null;
  const saturado =
    (error instanceof ErrorDeVision && error.saturado) ||
    status === 429 ||
    (typeof status === 'number' && status >= 500);

  if (saturado) {
    return (
      '⏳ La IA está saturada en este momento (probé con varios modelos y ninguno contestó).' +
      comoReintentar
    );
  }

  // No es pasajero: puede ser un modelo dado de baja o la key vencida. Va el
  // detalle técnico corto, con el modelo que quedó en el camino.
  let detalle = '';
  if (error instanceof ErrorDeVision) {
    detalle = `\n\n<i>Leyendo la foto con ${escaparHtml(error.modelo ?? 'Gemini')}.</i>`;
  } else {
    try {
      const estado = await estadoModelos();
      detalle = `\n\n<i>Texto: ${estado.textoEnUso ?? 'ninguno'}${estado.degradado ? ' (degradado)' : ''}</i>`;
    } catch {
      detalle = '\n\n<i>Tampoco pude consultar el estado de los modelos.</i>';
    }
  }

  return `❌ No pude interpretar el mensaje.\n<i>${escaparHtml(error?.message || 'Error desconocido')}</i>${detalle}${comoReintentar}`;
}

// ============================================
// Budget calculation helper
// ============================================

async function getBudgetRemaining(profileId: string): Promise<string> {
  try {
    const config = await prisma.budgetConfig.findFirst({
      where: { profileId, isActive: true },
    });
    if (!config) return '';

    const now = getArgDate();
    const day = now.getDate();
    const year = now.getFullYear();
    const month = now.getMonth();

    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const isFirstHalf = day >= lastDayOfMonth || day <= 15;
    const budget = isFirstHalf ? config.firstHalfBudget : config.secondHalfBudget;
    const half = isFirstHalf ? '1ra' : '2da';

    let startDate: Date;
    let endDate: Date;

    if (isFirstHalf) {
      if (day >= lastDayOfMonth) {
        startDate = new Date(year, month, lastDayOfMonth);
        endDate = new Date(year, month + 1, 15, 23, 59, 59);
      } else {
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        startDate = new Date(year, month - 1, prevMonthLastDay);
        endDate = new Date(year, month, 15, 23, 59, 59);
      }
    } else {
      startDate = new Date(year, month, 16);
      endDate = new Date(year, month, lastDayOfMonth - 1, 23, 59, 59);
    }

    const expenses = await prisma.expense.aggregate({
      where: {
        profileId,
        date: { gte: startDate, lte: endDate },
        currency: config.currency,
        type: 'PROPIO',
        category: { name: { notIn: ['Ahorro / Inversión', 'Ahorros'] } },
      },
      _sum: { amount: true },
    });

    const spent = expenses._sum?.amount || 0;
    const remaining = budget - spent;

    return `\n💰 Quincena ${half}: $${formatCurrency(remaining)} restante de $${formatCurrency(budget)}`;
  } catch {
    return '';
  }
}

async function createMagicLink(accountId: string, path: string = '/gastos', appUrl: string) {
  const token = crypto.randomUUID();
  await prisma.account.update({
    where: { id: accountId },
    data: { magicToken: token },
  });
  return `${appUrl}/magic?token=${token}&redirect=${path}`;
}



// ============================================
// Seguridad del webhook
// ============================================

/**
 * Telegram manda este header en cada update si se configuró `secret_token`
 * en setWebhook. Sin esto, cualquiera puede POSTear al endpoint y disparar
 * los botones de "deshacer" con el id que quiera.
 *
 * Si la variable no está seteada se acepta igual, para no dejar el bot mudo
 * en un deploy viejo, pero se avisa por consola.
 */
function webhookAutorizado(request: NextRequest) {
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secreto) {
    console.warn('[TELEGRAM] Sin TELEGRAM_WEBHOOK_SECRET: el webhook acepta cualquier origen.');
    return true;
  }
  return request.headers.get('x-telegram-bot-api-secret-token') === secreto;
}

/** El perfil vinculado a este chat de Telegram, o null si no está vinculado. */
async function perfilDelChat(fromId: string) {
  const profile = await prisma.profile.findFirst({
    where: { telegramChatId: fromId },
    include: { account: true },
  });
  return profile && profile.accountId ? profile : null;
}

// ============================================
// Resumen para confirmar
// ============================================

const NOMBRE_TIPO: Record<string, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  consumo_tarjeta: 'Consumo con tarjeta',
  pago_tarjeta: 'Pago de tarjeta',
  pago_prestamo: 'Cuota de préstamo',
  agenda: 'Anotación en la agenda',
};

const ICONO_TIPO: Record<string, string> = {
  gasto: '💸',
  ingreso: '💰',
  consumo_tarjeta: '💳',
  pago_tarjeta: '🧾',
  pago_prestamo: '🏦',
  agenda: '🗓️',
};

/**
 * Arma el mensaje que se muestra ANTES de guardar nada, para que la persona
 * revise que la IA entendió bien lo que dijo o lo que decía la foto.
 */
function resumenDeAcciones(
  acciones: ParsedAction[],
  origen: string,
  categories: { name: string; icon: string }[]
) {
  const fuente = origen === 'imagen' ? 'la imagen' : 'el audio';
  const cabecera =
    acciones.length === 1
      ? `🤔 <b>Esto entendí de ${fuente}:</b>`
      : `🤔 <b>Esto entendí de ${fuente}</b> (${acciones.length} movimientos):`;

  const items = acciones.map((a, i) => {
    const tipo = a.tipo || 'gasto';
    const icono = ICONO_TIPO[tipo] || '📌';
    const nombre = NOMBRE_TIPO[tipo] || 'Movimiento';
    const numero = acciones.length > 1 ? `<b>${i + 1}.</b> ` : '';

    const partes: string[] = [];
    partes.push(`${numero}${icono} <b>${nombre}</b>`);
    if (a.descripcion) partes.push(`   📝 ${a.descripcion}`);
    if (a.monto && a.monto > 0) {
      partes.push(`   💵 <b>$${formatCurrency(a.monto)}</b> ${a.moneda || 'ARS'}`);
    } else if (tipo === 'agenda') {
      partes.push('   💵 <i>sin monto estimado</i>');
    } else if (tipo === 'pago_prestamo') {
      partes.push('   💵 <i>el valor de la cuota</i>');
    }

    if (a.categoria) {
      const cat = categories.find((c) => c.name.toLowerCase() === a.categoria?.toLowerCase());
      partes.push(`   📂 ${cat ? `${cat.icon} ${cat.name}` : a.categoria}`);
    }
    if (a.tarjeta) partes.push(`   💳 Tarjeta: ${a.tarjeta}`);
    if (a.cuotas && a.cuotas > 1) partes.push(`   📆 ${a.cuotas} cuotas`);
    if (a.prestamo) partes.push(`   🏦 Préstamo: ${a.prestamo}`);
    if (a.fecha) partes.push(`   📅 ${a.fecha}`);
    if (a.dia) partes.push(`   📅 Día ${a.dia}`);
    if (a.tipo_gasto === 'compartido') partes.push('   👥 Compartido');
    if (a.recurrente) partes.push('   🔁 Todos los meses');

    return partes.join('\n');
  });

  const total = acciones
    .filter((a) => a.tipo !== 'agenda' && a.monto && a.monto > 0)
    .reduce((acc, a) => acc + (a.monto || 0), 0);

  const pie =
    acciones.length > 1 && total > 0
      ? `\n\n➕ <b>Total: $${formatCurrency(total)}</b>`
      : '';

  return (
    `${cabecera}\n\n${items.join('\n\n')}${pie}\n\n` +
    '<i>Todavía no guardé nada. Si está bien, dale Confirmar; si no, descartalo y escribimelo.</i>'
  );
}

// ============================================
// Ejecutor de acciones
// ============================================

type PerfilDeBot = { id: string; name: string; accountId: string };

/**
 * Aplica en la base las acciones que interpretó la IA.
 *
 * Vive aparte del handler porque se llama desde dos lados: directo cuando el
 * mensaje es de texto, y desde el botón "Confirmar" cuando vino de un audio o
 * de una foto (ahí la persona ve primero lo que se va a cargar).
 */
async function ejecutarAcciones(
  acciones: ParsedAction[],
  profile: PerfilDeBot,
  chatId: string,
  appUrl: string,
  textoOriginal: string
) {
  const messageText = textoOriginal;

  // Se vuelven a leer acá y no se reciben por parámetro porque esta función
  // también corre desde el botón "Confirmar", que llega en otro request.
  const [categories, cards, loans] = await Promise.all([
    prisma.category.findMany({ where: { accountId: profile.accountId } }),
    prisma.creditCard.findMany({ where: { profile: { accountId: profile.accountId } } }),
    prisma.loan.findMany({
      where: { profile: { accountId: profile.accountId }, isActive: true },
      include: { schedule: true, payments: true },
    }),
  ]);

  for (const action of acciones) {
      // ─── Link Action ───
      if (action.accion === 'link') {
        const textLower = messageText.toLowerCase();
        let path = '/gastos';
        let label = 'Gastos';
        
        if (action.tipo?.toLowerCase().includes('ingreso') || textLower.includes('ingreso')) {
        path = '/ingresos';
        label = 'Ingresos';
      } else if (textLower.includes('ahorro') || action.tipo?.toLowerCase().includes('ahorro')) {
        path = '/ahorros';
        label = 'Ahorros';
      } else if (textLower.includes('inversion') || textLower.includes('inversión')) {
        path = '/inversiones';
        label = 'Inversiones';
      } else if (textLower.includes('tarjeta')) {
        path = '/tarjetas';
        label = 'Tarjetas';
      } else if (textLower.includes('prestamo') || textLower.includes('préstamo')) {
        path = '/prestamos';
        label = 'Préstamos';
      } else if (textLower.includes('agenda') || textLower.includes('recordatorio')) {
        path = '/agenda';
        label = 'Agenda';
      } else if (textLower.includes('config')) {
        path = '/configuracion';
        label = 'Configuración';
      }

        const link = await createMagicLink(profile.accountId, path, appUrl);
        await sendTelegramMessage(chatId, `🪄 <b>Acceso rápido a EconoApp</b>`, {
          inline_keyboard: [[{ text: `Abrir app (${label})`, url: link }]]
        });
        continue;
      }

      // ─── Delete Action ───
      if (action.accion === 'eliminar') {
        if (!action.entidad_id) {
          await sendTelegramMessage(chatId, '❌ No encontré el registro a eliminar en tus últimos movimientos.');
          continue;
        }
        try {
          await prisma.expense.delete({ where: { id: action.entidad_id } }).catch(() => {});
          await prisma.income.delete({ where: { id: action.entidad_id } }).catch(() => {});
          await sendTelegramMessage(chatId, '🗑️ Registro eliminado correctamente.');
          continue;
        } catch {
          await sendTelegramMessage(chatId, '❌ Error al eliminar.');
          continue;
        }
      }

      // ─── Modify Action ───
      if (action.accion === 'modificar') {
        if (!action.entidad_id) {
          await sendTelegramMessage(chatId, '❌ No encontré el registro a modificar en tus últimos movimientos.');
          continue;
        }
        
        const matchedCategory = categories.find(c => c.name.toLowerCase() === action.categoria?.toLowerCase()) || categories.find((c) => c.name === 'Otros') || categories[0];
        
        let updated = false;
        
        try {
          const exp = await prisma.expense.findUnique({ where: { id: action.entidad_id }});
          if (exp) {
            await prisma.expense.update({
              where: { id: action.entidad_id },
              data: {
                amount: action.monto || exp.amount,
                description: action.descripcion || exp.description,
                categoryId: action.categoria ? matchedCategory.id : exp.categoryId,
                type: action.tipo_gasto === 'compartido' ? 'COMPARTIDO' : 'PROPIO',
                ...(action.fecha ? { date: parseArgDate(action.fecha) } : {})
              }
            });
            await sendTelegramMessage(chatId, `✏️ <b>Gasto modificado:</b>\nNuevo monto: $${formatCurrency(action.monto || exp.amount)}\nDesc: ${action.descripcion || exp.description}`);
            updated = true;
          }
        } catch {}

        if (!updated) {
          try {
            const inc = await prisma.income.findUnique({ where: { id: action.entidad_id }});
            if (inc) {
              await prisma.income.update({
                where: { id: action.entidad_id },
                data: {
                  amount: action.monto || inc.amount,
                  description: action.descripcion || inc.description,
                  ...(action.fecha ? { date: parseArgDate(action.fecha) } : {})
                }
              });
              await sendTelegramMessage(chatId, `✏️ <b>Ingreso modificado:</b>\nNuevo monto: $${formatCurrency(action.monto || inc.amount)}\nDesc: ${action.descripcion || inc.description}`);
              updated = true;
            }
          } catch {}
        }

        if (!updated) await sendTelegramMessage(chatId, '❌ No se pudo modificar. ¿Seguro que es un registro reciente?');
        continue;
      }

      // ─── Create Action ───
      // La agenda y las cuotas de préstamo pueden venir sin monto: se completan solas.
      const montoOpcional = action.tipo === 'agenda' || action.tipo === 'pago_prestamo';
      if ((!action.monto || action.monto <= 0) && !montoOpcional) {
        await sendTelegramMessage(chatId, '❌ No pude detectar un monto válido.');
        continue;
      }

      const matchedCategory = categories.find((c) => c.name.toLowerCase() === action.categoria?.toLowerCase()) || categories.find((c) => c.name === 'Otros') || categories[0];
      
      let targetProfile: PerfilDeBot = profile;
      if (action.persona && action.persona.toLowerCase() !== profile.name.toLowerCase()) {
        const otherProfile = await prisma.profile.findFirst({ where: { accountId: profile.accountId, name: { contains: action.persona, mode: 'insensitive' } } });
        // Solo se acepta un perfil de la misma cuenta.
        if (otherProfile) {
          targetProfile = {
            id: otherProfile.id,
            name: otherProfile.name,
            accountId: profile.accountId,
          };
        }
      }

      const today = getArgDate();
      const dateStr = action.fecha || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      // ─── Agenda: ayuda memoria, NO toca el balance ───
      if (action.tipo === 'agenda') {
        const actual = getCurrentFinancialMonth(getArgDate());
        const fecha = action.fecha ? parseArgDate(action.fecha) : null;
        const mes = fecha ? fecha.getMonth() + 1 : actual.month;
        const anio = fecha ? fecha.getFullYear() : actual.year;
        // Si la IA solo puso la fecha de hoy por defecto, no la tomamos como el día del gasto.
        const dia =
          action.dia ??
          (fecha && fecha.toDateString() !== today.toDateString() ? fecha.getDate() : null);
        const esRecurrente = action.recurrente === true;

        const item = await prisma.plannedExpense.create({
          data: {
            title: action.descripcion || 'Gasto previsto',
            amount: action.monto && action.monto > 0 ? action.monto : null,
            currency: action.moneda || 'ARS',
            day: dia ? Math.min(31, Math.max(1, dia)) : null,
            month: mes,
            year: anio,
            kind: action.agenda_tipo === 'eventual' ? 'EVENTUAL' : 'FIJO',
            isRecurring: esRecurrente,
            categoryId: action.categoria ? matchedCategory.id : null,
            profileId: action.persona ? targetProfile.id : null,
            accountId: profile.accountId,
          },
        });

        // La serie se identifica con el id del primer ítem.
        if (esRecurrente) {
          await prisma.plannedExpense.update({
            where: { id: item.id },
            data: { seriesId: item.id },
          });
        }

        const agendaLink = await createMagicLink(profile.accountId, '/agenda', appUrl);
        await sendTelegramMessage(
          chatId,
          `🗓️ <b>Anotado en la agenda</b>\n\n` +
            `📌 ${item.title}\n` +
            (item.amount ? `💰 Estimado: <b>$${formatCurrency(item.amount)}</b> ${item.currency}\n` : '') +
            (item.day ? `📅 Día ${item.day} de ${formatPeriod(mes, anio)}\n` : `📅 ${formatPeriod(mes, anio)}\n`) +
            (esRecurrente ? `🔁 Se repite todos los meses\n` : '') +
            `\n<i>Esto no mueve el balance: es para acordarte. Cuando lo pagues, avisame y lo cargo como gasto.</i>`,
          {
            inline_keyboard: [
              [
                { text: '🗑️ Deshacer', callback_data: `undo_planned_${item.id}` },
                { text: '🗓️ Ver agenda', url: agendaLink },
              ],
            ],
          }
        );
        continue;
      }

      // ─── Cuota de préstamo: esto sí genera un movimiento real ───
      if (action.tipo === 'pago_prestamo') {
        const loan = resolveByName(loans, action.prestamo);

        if (!loan) {
          const names = loans.map((l) => l.name).join(', ');
          await sendTelegramMessage(
            chatId,
            loans.length === 0
              ? '🏦 Todavía no cargaste ningún préstamo. Crealo en la app (sección <b>Préstamos</b>) y después me lo podés usar por acá.'
              : `🏦 No supe a qué préstamo te referís. Los que tenés son: <b>${names}</b>.`
          );
          continue;
        }

        const { month: payMonth, year: payYear } = getCurrentFinancialMonth(getArgDate());
        const paymentDate = parseArgDate(dateStr);
        const period = formatPeriod(payMonth, payYear);
        const monto = action.monto && action.monto > 0 ? action.monto : loan.installmentAmount;
        const esTomado = loan.kind === 'TOMADO';

        let expenseId: string | null = null;
        let incomeId: string | null = null;

        if (esTomado) {
          const propia = loan.categoryId ? categories.find((c) => c.id === loan.categoryId) : null;
          const loanCategory = propia || (await getLoanCategory(profile.accountId));
          const expense = await prisma.expense.create({
            data: {
              amount: monto,
              currency: loan.currency,
              date: paymentDate,
              description: `Cuota ${loan.name} (${period})`,
              categoryId: loanCategory.id,
              profileId: targetProfile.id,
              type: action.tipo_gasto === 'compartido' ? 'COMPARTIDO' : loan.type,
              paidFromPersonalBudget:
                action.tipo_gasto === 'compartido' ? action.pague_yo === true : false,
            },
          });
          expenseId = expense.id;
        } else {
          const income = await prisma.income.create({
            data: {
              amount: monto,
              currency: loan.currency,
              date: paymentDate,
              description: `Cobro ${loan.name} (${period})`,
              profileId: targetProfile.id,
            },
          });
          incomeId = income.id;
        }

        const payment = await prisma.loanPayment.create({
          data: {
            amount: monto,
            currency: loan.currency,
            date: paymentDate,
            month: payMonth,
            year: payYear,
            loanId: loan.id,
            profileId: targetProfile.id,
            expenseId,
            incomeId,
          },
        });

        const pagosActualizados = [
          ...loan.payments,
          { amount: monto, month: payMonth, year: payYear },
        ];
        const prog = loanProgress(loan.schedule, pagosActualizados);
        const next = nextPendingInstallment(loan.schedule, pagosActualizados, payMonth, payYear);
        const loansLink = await createMagicLink(profile.accountId, '/prestamos', appUrl);

        await sendTelegramMessage(
          chatId,
          `${esTomado ? '✅' : '💰'} <b>${esTomado ? 'Cuota pagada' : 'Cobro registrado'}: ${loan.name}</b>\n\n` +
            `${esTomado ? '💸 Pagaste' : '💰 Cobraste'}: <b>$${formatCurrency(monto)}</b> ${loan.currency}\n` +
            `📆 Cuotas: <b>${prog.paidInstallments}/${prog.totalInstallments}</b>\n` +
            `🏦 ${esTomado ? 'Te falta pagar' : 'Te deben'}: <b>$${formatCurrency(prog.remaining)}</b>\n` +
            (prog.isSettled
              ? `\n🎉 <b>¡Préstamo cancelado!</b>`
              : next
                ? `\n▶️ Próxima: cuota ${next.number} de ${formatPeriod(next.month, next.year)} ($${formatCurrency(next.amount)})`
                : '') +
            `\n\n<i>Ya lo cargué como ${esTomado ? 'gasto' : 'ingreso'} de ${targetProfile.name}.</i>`,
          {
            inline_keyboard: [
              [
                { text: '🗑️ Deshacer', callback_data: `undo_loanpay_${payment.id}` },
                { text: '🏦 Ver préstamos', url: loansLink },
              ],
            ],
          }
        );
        continue;
      }

      // De acá en adelante (tarjetas, gastos e ingresos) el monto es obligatorio.
      if (!action.monto || action.monto <= 0) {
        await sendTelegramMessage(chatId, '❌ No pude detectar un monto válido.');
        continue;
      }

      // ─── Tarjetas de crédito ───
      if (action.tipo === 'consumo_tarjeta' || action.tipo === 'pago_tarjeta') {
        const card = resolveByName(cards, action.tarjeta);

        if (!card) {
          const names = cards.map((c) => c.name).join(', ');
          await sendTelegramMessage(
            chatId,
            cards.length === 0
              ? '💳 Todavía no cargaste ninguna tarjeta. Creala en la app (sección <b>Tarjetas</b>) y después me la podés usar por acá.'
              : `💳 No supe a qué tarjeta te referís. Las que tenés son: <b>${names}</b>.`
          );
          continue;
        }

        if (action.tipo === 'consumo_tarjeta') {
          const cuotas = Math.max(1, Math.floor(action.cuotas || 1));
          const total = action.monto_es_por_cuota ? action.monto * cuotas : action.monto;
          const purchaseDate = parseArgDate(dateStr);
          const first = firstInstallmentPeriod(purchaseDate, card.closingDay);
          const schedule = buildInstallments(total, cuotas, first.month, first.year);

          const purchase = await prisma.cardPurchase.create({
            data: {
              description: action.descripcion || 'Consumo desde Telegram',
              totalAmount: total,
              currency: card.currency,
              date: purchaseDate,
              installments: cuotas,
              categoryId: action.categoria ? matchedCategory.id : null,
              profileId: targetProfile.id,
              type: action.tipo_gasto === 'compartido' ? 'COMPARTIDO' : 'PROPIO',
              cardId: card.id,
              schedule: { create: schedule },
            },
          });

          const link = await createMagicLink(profile.accountId, '/tarjetas', appUrl);
          await sendTelegramMessage(
            chatId,
            `💳 <b>Consumo cargado en ${card.name}</b>\n\n` +
              `🛒 ${action.descripcion || 'Consumo'}\n` +
              `💰 Total: <b>$${formatCurrency(total)}</b> ${card.currency}\n` +
              `📆 ${cuotas} cuota${cuotas > 1 ? 's' : ''} de <b>$${formatCurrency(schedule[0].amount)}</b>\n` +
              `▶️ Arranca en el resumen de <b>${formatPeriod(first.month, first.year)}</b>\n` +
              `${action.tipo_gasto === 'compartido' ? '👥 Compartido' : '👤 Propio'} · ${targetProfile.name}\n\n` +
              `<i>Ojo: esto todavía no cuenta como gasto. Cuando pagues la tarjeta, avisame y ahí lo registro.</i>`,
            {
              inline_keyboard: [
                [
                  { text: '🗑️ Deshacer', callback_data: `undo_purchase_${purchase.id}` },
                  { text: '💳 Ver tarjetas', url: link },
                ],
              ],
            }
          );
          continue;
        }

        // ─── Pago del resumen: esto sí genera un gasto real ───
        const { month: payMonth, year: payYear } = getCurrentFinancialMonth(getArgDate());
        const cardCategory = await getCardCategory(profile.accountId);
        const paymentDate = parseArgDate(dateStr);

        const expense = await prisma.expense.create({
          data: {
            amount: action.monto,
            currency: card.currency,
            date: paymentDate,
            description: `Pago tarjeta ${card.name} (${formatPeriod(payMonth, payYear)})`,
            categoryId: cardCategory.id,
            profileId: targetProfile.id,
            type: action.tipo_gasto === 'compartido' ? 'COMPARTIDO' : 'PROPIO',
            paidFromPersonalBudget: action.tipo_gasto === 'compartido' ? action.pague_yo === true : false,
          },
        });

        await prisma.cardPayment.create({
          data: {
            amount: action.monto,
            currency: card.currency,
            date: paymentDate,
            month: payMonth,
            year: payYear,
            cardId: card.id,
            profileId: targetProfile.id,
            expenseId: expense.id,
          },
        });

        const statement = await getCardStatement(card.id, payMonth, payYear);
        const link = await createMagicLink(profile.accountId, '/tarjetas', appUrl);
        await sendTelegramMessage(
          chatId,
          `✅ <b>Pago de ${card.name} registrado</b>\n\n` +
            `💸 Pagaste: <b>$${formatCurrency(action.monto)}</b> ${card.currency}\n` +
            `🧾 Resumen de ${formatPeriod(payMonth, payYear)}: $${formatCurrency(statement.totalDue)}\n` +
            (statement.pending > 0
              ? `⚠️ Queda una deuda de <b>$${formatCurrency(statement.pending)}</b> que pasa al mes que viene.`
              : `🎉 La tarjeta queda al día.`) +
            `\n\n<i>Ya lo cargué como gasto de ${targetProfile.name}.</i>`,
          {
            inline_keyboard: [
              [
                { text: '🗑️ Deshacer', callback_data: `undo_expense_${expense.id}` },
                { text: '💳 Ver tarjetas', url: link },
              ],
            ],
          }
        );
        continue;
      }

      if (action.tipo === 'ingreso') {
        const inc = await prisma.income.create({
          data: { amount: action.monto, currency: action.moneda || 'ARS', date: parseArgDate(dateStr), description: action.descripcion || 'Ingreso desde Telegram', profileId: targetProfile.id },
        });
        const link = await createMagicLink(profile.accountId, '/ingresos', appUrl);
        await sendTelegramMessage(
          chatId,
          `✅ <b>Ingreso registrado</b>\n\n💰 Monto: <b>$${formatCurrency(action.monto)}</b> ${action.moneda || 'ARS'}\n📝 Descripción: ${action.descripcion}\n👤 Perfil: ${targetProfile.name}`,
          { inline_keyboard: [[{ text: '🗑️ Deshacer', callback_data: `undo_income_${inc.id}` }, { text: '✏️ Editar en App', url: link }]] }
        );
      } else {
        const isPagueYo = action.pague_yo === true;
        const exp = await prisma.expense.create({
          data: { amount: action.monto, currency: action.moneda || 'ARS', date: parseArgDate(dateStr), description: action.descripcion || 'Gasto desde Telegram', categoryId: matchedCategory.id, profileId: targetProfile.id, type: action.tipo_gasto === 'compartido' ? 'COMPARTIDO' : 'PROPIO', paidFromPersonalBudget: isPagueYo },
        });
        const budgetInfo = await getBudgetRemaining(targetProfile.id);
        const link = await createMagicLink(profile.accountId, '/gastos', appUrl);
        await sendTelegramMessage(
          chatId,
          `✅ <b>Gasto registrado</b>\n\n💸 Monto: <b>$${formatCurrency(action.monto)}</b> ${action.moneda || 'ARS'}\n📂 Categoría: ${matchedCategory.icon} ${matchedCategory.name}\n📝 ${action.descripcion}\n${action.tipo_gasto === 'compartido' ? '👥 Compartido' : '👤 Propio'} · ${targetProfile.name}${budgetInfo}`,
          { inline_keyboard: [[{ text: '🗑️ Deshacer', callback_data: `undo_expense_${exp.id}` }, { text: '✏️ Editar en App', url: link }]] }
        );
      }
  }

  revalidatePath('/gastos');
  revalidatePath('/ingresos');
  revalidatePath('/tarjetas');
  revalidatePath('/prestamos');
  revalidatePath('/agenda');
  revalidatePath('/dashboard');
}

// ============================================
// Main webhook handler
// ============================================

export async function POST(request: NextRequest) {
  // Se guarda afuera del try para poder avisar si algo explota a mitad de camino:
  // quedarse callado es lo que hace parecer que el bot está caído.
  let chatDelMensaje: string | null = null;

  try {
    // Solo Telegram puede hablar con este endpoint. Sin esto, un POST armado a
    // mano podía borrar cualquier gasto pasando su id en `callback_query`.
    if (!webhookAutorizado(request)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 401 });
    }

    const appUrl = request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://economia-familia.vercel.app';
    const body = await request.json();

    // Handle callback query (inline buttons)
    if (body.callback_query) {
      const cb = body.callback_query;
      const chatId = cb.message.chat.id;
      const data: string = cb.data;

      const responder = async (texto: string) => {
        await sendTelegramMessage(chatId, texto);
      };
      const cerrar = async () => {
        await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: cb.id }),
        });
        return NextResponse.json({ ok: true });
      };

      // Cada botón se resuelve contra el perfil del chat que lo apretó: nadie
      // puede tocar los movimientos de otra familia adivinando un id.
      const quien = await perfilDelChat(String(cb.from?.id ?? ''));
      if (!quien) {
        await responder('⚠️ Tu cuenta no está vinculada. Generá un PIN en Configuración → Telegram.');
        return cerrar();
      }
      const cuenta = quien.accountId!;

      if (data.startsWith('confirmar_')) {
        const id = data.replace('confirmar_', '');
        const pendiente = await prisma.telegramPending.findFirst({
          where: { id, profileId: quien.id },
        });
        if (!pendiente) {
          await responder('❌ Eso ya se confirmó o se descartó.');
          return cerrar();
        }
        await prisma.telegramPending.delete({ where: { id } }).catch(() => {});
        await responder('👌 Dale, lo cargo...');
        await ejecutarAcciones(
          pendiente.actions as unknown as ParsedAction[],
          { id: quien.id, name: quien.name, accountId: cuenta },
          String(chatId),
          appUrl,
          ''
        );
        return cerrar();
      }

      if (data.startsWith('descartar_')) {
        const id = data.replace('descartar_', '');
        await prisma.telegramPending
          .deleteMany({ where: { id, profileId: quien.id } })
          .catch(() => {});
        await responder('🗑️ Listo, no cargué nada. Escribime de nuevo cómo es y lo hacemos bien.');
        return cerrar();
      }

      if (data.startsWith('undo_expense_')) {
        const id = data.replace('undo_expense_', '');
        const borrado = await prisma.expense
          .deleteMany({ where: { id, profile: { accountId: cuenta } } })
          .catch(() => ({ count: 0 }));
        await responder(borrado.count ? '🗑️ Gasto eliminado con éxito.' : '❌ No encontré ese gasto.');
      } else if (data.startsWith('undo_purchase_')) {
        const id = data.replace('undo_purchase_', '');
        const borrado = await prisma.cardPurchase
          .deleteMany({ where: { id, card: { profile: { accountId: cuenta } } } })
          .catch(() => ({ count: 0 }));
        await responder(
          borrado.count
            ? '🗑️ Consumo de tarjeta eliminado (con todas sus cuotas).'
            : '❌ No encontré ese consumo.'
        );
      } else if (data.startsWith('undo_loanpay_')) {
        const id = data.replace('undo_loanpay_', '');
        const payment = await prisma.loanPayment.findFirst({
          where: { id, loan: { profile: { accountId: cuenta } } },
        });
        if (!payment) {
          await responder('❌ No encontré ese pago.');
        } else {
          if (payment.expenseId) {
            await prisma.expense.delete({ where: { id: payment.expenseId } }).catch(() => {});
          }
          if (payment.incomeId) {
            await prisma.income.delete({ where: { id: payment.incomeId } }).catch(() => {});
          }
          await prisma.loanPayment.delete({ where: { id } }).catch(() => {});
          await responder('🗑️ Pago de préstamo eliminado.');
        }
      } else if (data.startsWith('undo_planned_')) {
        const id = data.replace('undo_planned_', '');
        const borrado = await prisma.plannedExpense
          .deleteMany({ where: { id, accountId: cuenta } })
          .catch(() => ({ count: 0 }));
        await responder(borrado.count ? '🗑️ Lo saqué de la agenda.' : '❌ No encontré ese ítem.');
      } else if (data.startsWith('done_planned_')) {
        const id = data.replace('done_planned_', '');
        const item = await prisma.plannedExpense.findFirst({ where: { id, accountId: cuenta } });
        if (!item) {
          await responder('❌ No encontré ese ítem en la agenda.');
        } else {
          await prisma.plannedExpense.update({ where: { id }, data: { status: 'HECHO' } });
          await responder(
            `✅ Marqué <b>${item.title}</b> como resuelto en la agenda.\n\n<i>Ojo: esto no carga el gasto. Si querés que impacte en el balance, decime "gasté X en ${item.title}".</i>`
          );
        }
      } else if (data.startsWith('undo_income_')) {
        const id = data.replace('undo_income_', '');
        const borrado = await prisma.income
          .deleteMany({ where: { id, profile: { accountId: cuenta } } })
          .catch(() => ({ count: 0 }));
        await responder(borrado.count ? '🗑️ Ingreso eliminado con éxito.' : '❌ No encontré ese ingreso.');
      }

      return cerrar();
    }


    const message = body.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message.chat.id.toString();
    chatDelMensaje = chatId;
    const fromId = message.from.id.toString();
    const text = message.text || '';

    // ─── /start command (con o sin payload de deep link: "/start 123456") ───
    if (text === '/start' || text.startsWith('/start ')) {
      const payload = text.slice('/start'.length).trim();

      // Deep link desde la web: t.me/<bot>?start=<PIN>
      if (/^\d{6}$/.test(payload)) {
        await linkProfileWithCode(chatId, fromId, payload);
        return NextResponse.json({ ok: true });
      }

      await sendTelegramMessage(
        chatId,
        '👋 ¡Hola! Soy tu bot de gastos de <b>EconoApp</b>.\n\n' +
          '📌 Para vincular tu cuenta, andá a <b>Configuración → Telegram</b> en la app web, generá tu PIN y enviámelo acá.\n\n' +
          '💡 Una vez vinculado, podés enviarme mensajes como:\n' +
          '• "Gasto 4500 en el chino compartido"\n' +
          '• "Gasto con tarjeta Naranja de 120000 en 6 cuotas en el super"\n' +
          '• "Pagué 80000 de la tarjeta Naranja"\n' +
          '• "Pagué la cuota del préstamo Nación"\n' +
          '• "Anotá en la agenda el alquiler de 450 mil el día 5"\n' +
          '• /agenda o /prestamos para ver cómo venís\n' +
          '• "Me equivoqué, el gasto del chino era de 5000"\n' +
          '• "Borrá el último ingreso"\n' +
          '• "gasto" (para abrir la app sin contraseña)'
      );
      return NextResponse.json({ ok: true });
    }

    // ─── Try to link with PIN ───
    if (/^\d{6}$/.test(text.trim())) {
      await linkProfileWithCode(chatId, fromId, text.trim());
      return NextResponse.json({ ok: true });
    }

    // ─── Check if user is linked ───
    const profile = await prisma.profile.findFirst({
      where: { telegramChatId: fromId },
      include: { account: true },
    });

    if (!profile || !profile.accountId) {
      await sendTelegramMessage(chatId, '⚠️ Tu cuenta no está vinculada. Generá un PIN en Configuración → Telegram.');
      return NextResponse.json({ ok: true });
    }

    // ─── /estado command ───
    if (text === '/estado') {
      const budgetInfo = await getBudgetRemaining(profile.id);
      await sendTelegramMessage(chatId, budgetInfo ? `📊 <b>Estado de ${profile.name}</b>${budgetInfo}` : `📊 No tenés presupuesto configurado.`);
      return NextResponse.json({ ok: true });
    }

    // ─── /agenda command ───
    if (text === '/agenda') {
      const { month: aMonth, year: aYear } = getCurrentFinancialMonth(getArgDate());
      const items = await prisma.plannedExpense.findMany({
        where: { accountId: profile.accountId, month: aMonth, year: aYear, status: { not: 'OMITIDO' } },
        include: { category: { select: { icon: true } } },
        orderBy: [{ day: 'asc' }, { createdAt: 'asc' }],
      });

      if (items.length === 0) {
        await sendTelegramMessage(
          chatId,
          `🗓️ Tu agenda de <b>${formatPeriod(aMonth, aYear)}</b> está vacía.\n\n<i>Podés anotar cosas diciéndome "anotá en la agenda el alquiler de 450 mil el día 5".</i>`
        );
        return NextResponse.json({ ok: true });
      }

      const pendientes = items.filter((i) => i.status === 'PENDIENTE');
      const total = items.reduce((acc, i) => acc + (i.amount || 0), 0);
      const falta = pendientes.reduce((acc, i) => acc + (i.amount || 0), 0);

      const lista = items
        .map((i) => {
          const check = i.status === 'HECHO' ? '✅' : '⬜';
          const cuando = i.day ? ` (día ${i.day})` : '';
          const monto = i.amount ? ` — $${formatCurrency(i.amount)}` : '';
          return `${check} ${i.category?.icon || '📌'} ${i.title}${cuando}${monto}`;
        })
        .join('\n');

      const agendaLink = await createMagicLink(profile.accountId, '/agenda', appUrl);
      await sendTelegramMessage(
        chatId,
        `🗓️ <b>Agenda de ${formatPeriod(aMonth, aYear)}</b>\n\n${lista}\n\n` +
          `💰 Previsto: <b>$${formatCurrency(total)}</b>\n` +
          `⏳ Falta: <b>$${formatCurrency(falta)}</b> (${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'})`,
        { inline_keyboard: [[{ text: '🗓️ Abrir agenda', url: agendaLink }]] }
      );
      return NextResponse.json({ ok: true });
    }

    // ─── /prestamos command ───
    if (text === '/prestamos') {
      const { month: lMonth, year: lYear } = getCurrentFinancialMonth(getArgDate());
      const misLoans = await prisma.loan.findMany({
        where: { profile: { accountId: profile.accountId }, isActive: true },
        include: { schedule: true, payments: true },
      });

      if (misLoans.length === 0) {
        await sendTelegramMessage(chatId, '🏦 Todavía no cargaste ningún préstamo en la app.');
        return NextResponse.json({ ok: true });
      }

      const lista = misLoans
        .map((l) => {
          const prog = loanProgress(l.schedule, l.payments);
          const next = nextPendingInstallment(l.schedule, l.payments, lMonth, lYear);
          const icono = l.kind === 'TOMADO' ? '🏦' : '🤝';
          const detalle = next
            ? `próxima: cuota ${next.number} de ${formatPeriod(next.month, next.year)} ($${formatCurrency(next.amount)})`
            : 'sin cuotas pendientes';
          return (
            `${icono} <b>${l.name}</b>\n` +
            `   ${prog.paidInstallments}/${prog.totalInstallments} cuotas · falta <b>$${formatCurrency(prog.remaining)}</b>\n` +
            `   ${detalle}`
          );
        })
        .join('\n\n');

      const loansLink = await createMagicLink(profile.accountId, '/prestamos', appUrl);
      await sendTelegramMessage(chatId, `🏦 <b>Tus préstamos</b>\n\n${lista}`, {
        inline_keyboard: [[{ text: '🏦 Ver préstamos', url: loansLink }]],
      });
      return NextResponse.json({ ok: true });
    }

    let messageText = (message.text || message.caption || '').trim();

    // ─── Process Photos (Draft logic) ───
    if (message.photo) {
      const photo = message.photo[message.photo.length - 1]; // highest res
      const draft = await prisma.telegramDraft.findUnique({ where: { chatId } });
      if (draft) {
        await prisma.telegramDraft.update({
          where: { chatId },
          data: { fileIds: { push: photo.file_id } }
        });
      } else {
        await prisma.telegramDraft.create({
          data: { chatId, fileIds: [photo.file_id] }
        });
      }
      
      if (messageText.length === 0) {
        await sendTelegramMessage(chatId, '📸 <i>Imagen guardada en borrador.</i>\n\nPodés mandarme <b>más fotos</b> si querés agruparlas, o escribí <b>"procesar"</b> para unirlas todas en un solo gasto.');
        return NextResponse.json({ ok: true });
      }
    }

    // De dónde salió el mensaje: si vino de un audio o de una foto, después se
    // pide confirmación antes de guardar (transcribir o leer una imagen puede
    // salir mal). El texto escrito a mano se carga directo.
    let origenIA: 'audio' | 'imagen' | null = null;

    if (message.voice) {
      try {
        await sendTelegramMessage(chatId, '🎙️ Procesando audio...');
        const audioBuffer = await downloadTelegramFile(message.voice.file_id);
        messageText = await transcribeAudio(audioBuffer);
        origenIA = 'audio';
      } catch {
        await sendTelegramMessage(chatId, '❌ No pude procesar el audio.');
        return NextResponse.json({ ok: true });
      }
    }

    // ─── Process Draft ───
    const isProcesar = messageText.toLowerCase().replace(/[^a-z]/g, '') === 'procesar';
    let fileIdsToProcess: string[] = [];
    let customInstruction = '';
    
    const draft = await prisma.telegramDraft.findUnique({ where: { chatId } });
    if (draft && draft.fileIds.length > 0) {
      // Si hay un draft, cualquier texto que llegue (o si dice procesar) gatilla el procesamiento.
      if (isProcesar || messageText.length > 0) {
        fileIdsToProcess = draft.fileIds;
        customInstruction = isProcesar ? '' : messageText;
        origenIA = 'imagen';
        await prisma.telegramDraft.delete({ where: { chatId } });
        await sendTelegramMessage(chatId, `🔍 Analizando ${fileIdsToProcess.length} imagen/es con IA Visual...`);
      } else if (!message.photo) {
        // No hay foto ni texto nuevo, no hacemos nada
        return NextResponse.json({ ok: true });
      }
    } else if (messageText.length === 0 && !message.photo) {
       return NextResponse.json({ ok: true });
    }

    const [categories, wallets, cards, loans] = await Promise.all([
      prisma.category.findMany({ where: { accountId: profile.accountId } }),
      prisma.wallet.findMany({ where: { accountId: profile.accountId } }),
      prisma.creditCard.findMany({ where: { profile: { accountId: profile.accountId } } }),
      prisma.loan.findMany({
        where: { profile: { accountId: profile.accountId }, isActive: true },
        include: { schedule: true, payments: true },
      }),
    ]);
    const categoryNames = categories.map((c) => c.name);

    const recentExpenses = await prisma.expense.findMany({ where: { profile: { accountId: profile.accountId } }, orderBy: { createdAt: 'desc' }, take: 10 });
    const recentIncomes = await prisma.income.findMany({ where: { profile: { accountId: profile.accountId } }, orderBy: { createdAt: 'desc' }, take: 5 });
    
    const contextStr = [
      ...recentExpenses.map(e => `[Gasto] ID: ${e.id}, Monto: ${e.amount}, Desc: ${e.description}`),
      ...recentIncomes.map(i => `[Ingreso] ID: ${i.id}, Monto: ${i.amount}, Desc: ${i.description}`)
    ].join('\n');

    // ─── Parse with AI ───
    let parsed: { acciones: ParsedAction[] };
    try {
      if (fileIdsToProcess.length > 0) {
        parsed = await parseImagesWithAI(fileIdsToProcess, profile.name, categoryNames, wallets, contextStr, customInstruction, cards, loans);
      } else {
        parsed = await parseTransactionWithAI(messageText, profile.name, categoryNames, wallets, contextStr, cards, loans);
      }
    } catch (error: any) {
      console.error('Parse Error:', error);

      // Las fotos ya se habían borrado del borrador para procesarlas. Si la IA
      // falló, se devuelven: así alcanza con escribir "procesar" de nuevo en
      // vez de tener que sacar y mandar todas las fotos otra vez.
      if (fileIdsToProcess.length > 0) {
        try {
          await prisma.telegramDraft.upsert({
            where: { chatId },
            create: { chatId, fileIds: fileIdsToProcess },
            update: { fileIds: fileIdsToProcess },
          });
        } catch (e) {
          console.error('No se pudo devolver el borrador:', e);
        }
      }

      await sendTelegramMessage(chatId, await mensajeDeFalloDeIA(error, fileIdsToProcess.length > 0));
      return NextResponse.json({ ok: true });
    }

    if (!parsed.acciones || !Array.isArray(parsed.acciones) || parsed.acciones.length === 0) {
      await sendTelegramMessage(chatId, '❌ No encontré ninguna acción válida.');
      return NextResponse.json({ ok: true });
    }

    const perfilBot: PerfilDeBot = {
      id: profile.id,
      name: profile.name,
      accountId: profile.accountId,
    };

    // ─── Audio y fotos: se confirma antes de tocar la base ───
    // Transcribir o leer una imagen puede salir mal, así que primero se muestra
    // lo interpretado y recién con "Confirmar" se carga. El texto escrito a mano
    // se carga directo: ya lo estás viendo, y queda el botón de deshacer.
    if (origenIA) {
      const pendiente = await prisma.telegramPending.create({
        data: {
          chatId,
          profileId: profile.id,
          actions: parsed.acciones as unknown as Prisma.InputJsonValue,
          origen: origenIA,
        },
      });

      await sendTelegramMessage(
        chatId,
        resumenDeAcciones(parsed.acciones, origenIA, categories),
        {
          inline_keyboard: [
            [
              { text: '✅ Confirmar', callback_data: `confirmar_${pendiente.id}` },
              { text: '❌ Descartar', callback_data: `descartar_${pendiente.id}` },
            ],
          ],
        }
      );
      return NextResponse.json({ ok: true });
    }

    await ejecutarAcciones(parsed.acciones, perfilBot, chatId, appUrl, messageText);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);

    if (chatDelMensaje) {
      // Si el aviso también falla, no importa: lo que no puede pasar es que
      // Telegram reciba un error y reenvíe el mismo mensaje en loop.
      await sendTelegramMessage(
        chatDelMensaje,
        '⚠️ Se me trabó algo procesando eso. Probá de nuevo en un ratito.'
      ).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Telegram webhook active' });
}
