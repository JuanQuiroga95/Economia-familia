import { formatCurrency } from '@/lib/formatUtils';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCardCategory } from '@/lib/cardCategory';
import {
  buildInstallments,
  buildStatement,
  firstInstallmentPeriod,
  formatPeriod,
} from '@/lib/cardUtils';
import { getLoanCategory } from '@/lib/loanCategory';
import { loanProgress, nextPendingInstallment } from '@/lib/loanUtils';
import { sendTelegramMessage } from '@/lib/telegramSend';
import { getArgDate, getCurrentFinancialMonth, parseArgDate } from '@/lib/dateUtils';
import Groq from 'groq-sdk';
import crypto from 'crypto';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;
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
    where: { telegramLinkCode: code },
    include: { account: true },
  });

  if (!profile) {
    await sendTelegramMessage(chatId, '❌ Código no válido o ya expirado.');
    return;
  }

  await prisma.profile.update({
    where: { id: profile.id },
    data: { telegramChatId: fromId, telegramLinkCode: null },
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
  const transcription = await groq.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3',
    language: 'es',
  });
  return transcription.text;
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
  const { getArgDate } = require('@/lib/dateUtils');
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

async function parseTransactionWithAI(
  text: string,
  profileName: string,
  categories: string[],
  wallets: { id: string; name: string }[],
  context: string,
  cards: { name: string }[] = [],
  loans: { name: string }[] = []
): Promise<{ acciones: ParsedAction[] }> {
  const groq = new Groq({ apiKey: GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_BASE(profileName, categories, context) + buildResourcesBlock(wallets, cards, loans) },
      { role: 'user', content: text },
    ],
    model: 'llama-3.3-70b-versatile',
    temperature: 0.1,
    max_tokens: 300,
    response_format: { type: 'json_object' },
  });

  const content = completion.choices[0]?.message?.content || '{}';
  return JSON.parse(content);
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
  const imageParts: any[] = [];
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

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: visionPrompt },
            ...imageParts
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 800 }
      })
    }
  );

  const geminiData = await geminiRes.json();
  const rawVisionText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (!rawVisionText) {
    throw new Error(`Gemini no devolvió texto. Respuesta: ${JSON.stringify(geminiData).slice(0, 200)}`);
  }

  // Paso 2: Forzar JSON con Groq (modelo de texto)
  const groq = new Groq({ apiKey: GROQ_API_KEY });
  const jsonCompletion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_BASE(profileName, categories, context) + buildResourcesBlock(wallets, cards, loans) },
      { role: 'user', content: `Basado en esta extracción de imagen, armá el JSON final:\n\n${rawVisionText}\n\nInstrucción del usuario original: "${customInstruction}"` },
    ],
    model: 'llama-3.3-70b-versatile',
    temperature: 0.1,
    max_tokens: 300,
    response_format: { type: 'json_object' },
  });

  const jsonContent = jsonCompletion.choices[0]?.message?.content || '{}';
  return JSON.parse(jsonContent);
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

    const { getArgDate } = require('@/lib/dateUtils');
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
// Main webhook handler
// ============================================

export async function POST(request: NextRequest) {
  try {
    const appUrl = request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://economia-familia.vercel.app';
    const body = await request.json();
    
    // Handle callback query (inline buttons)
    if (body.callback_query) {
      const cb = body.callback_query;
      const chatId = cb.message.chat.id;
      const data = cb.data; 
      
      if (data.startsWith('undo_expense_')) {
        const id = data.replace('undo_expense_', '');
        await prisma.expense.delete({ where: { id } }).catch(() => {});
        await sendTelegramMessage(chatId, '🗑️ Gasto eliminado con éxito.');
      } else if (data.startsWith('undo_purchase_')) {
        const id = data.replace('undo_purchase_', '');
        await prisma.cardPurchase.delete({ where: { id } }).catch(() => {});
        await sendTelegramMessage(chatId, '🗑️ Consumo de tarjeta eliminado (con todas sus cuotas).');
      } else if (data.startsWith('undo_loanpay_')) {
        const id = data.replace('undo_loanpay_', '');
        const payment = await prisma.loanPayment.findUnique({ where: { id } });
        if (payment?.expenseId) {
          await prisma.expense.delete({ where: { id: payment.expenseId } }).catch(() => {});
        }
        if (payment?.incomeId) {
          await prisma.income.delete({ where: { id: payment.incomeId } }).catch(() => {});
        }
        await prisma.loanPayment.delete({ where: { id } }).catch(() => {});
        await sendTelegramMessage(chatId, '🗑️ Pago de préstamo eliminado.');
      } else if (data.startsWith('undo_planned_')) {
        const id = data.replace('undo_planned_', '');
        await prisma.plannedExpense.delete({ where: { id } }).catch(() => {});
        await sendTelegramMessage(chatId, '🗑️ Lo saqué de la agenda.');
      } else if (data.startsWith('done_planned_')) {
        const id = data.replace('done_planned_', '');
        const item = await prisma.plannedExpense
          .update({ where: { id }, data: { status: 'HECHO' } })
          .catch(() => null);
        await sendTelegramMessage(
          chatId,
          item
            ? `✅ Marqué <b>${item.title}</b> como resuelto en la agenda.\n\n<i>Ojo: esto no carga el gasto. Si querés que impacte en el balance, decime "gasté X en ${item.title}".</i>`
            : '❌ No encontré ese ítem en la agenda.'
        );
      } else if (data.startsWith('undo_income_')) {
        const id = data.replace('undo_income_', '');
        await prisma.income.delete({ where: { id } }).catch(() => {});
        await sendTelegramMessage(chatId, '🗑️ Ingreso eliminado con éxito.');
      }
      
      await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cb.id }),
      });
      return NextResponse.json({ ok: true });
    }

    const message = body.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message.chat.id.toString();
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
      let draft = await prisma.telegramDraft.findUnique({ where: { chatId } });
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

    if (message.voice) {
      try {
        await sendTelegramMessage(chatId, '🎙️ Procesando audio...');
        const audioBuffer = await downloadTelegramFile(message.voice.file_id);
        messageText = await transcribeAudio(audioBuffer);
      } catch (error) {
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
      let activeModels = 'No se pudo obtener la lista de modelos.';
      try {
        const groq = new Groq({ apiKey: GROQ_API_KEY });
        const models = await groq.models.list();
        activeModels = models.data.map(m => m.id).filter(id => id.includes('vision') || id.includes('llama') || id.includes('qwen')).join(', ');
      } catch (e) {
        console.error('Error fetching models:', e);
      }
      await sendTelegramMessage(chatId, `❌ Falló la IA.\nError: ${error.message || 'Desconocido'}\nModelos activos en Groq: ${activeModels}`);
      return NextResponse.json({ ok: true });
    }

    // ─── Execute Actions ───
    if (!parsed.acciones || !Array.isArray(parsed.acciones) || parsed.acciones.length === 0) {
      await sendTelegramMessage(chatId, '❌ No encontré ninguna acción válida.');
      return NextResponse.json({ ok: true });
    }

    for (const action of parsed.acciones) {
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
        } catch (e) {
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
        } catch (e) {}

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
          } catch (e) {}
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
      
      let targetProfile = profile;
      if (action.persona && action.persona.toLowerCase() !== profile.name.toLowerCase()) {
        const otherProfile = await prisma.profile.findFirst({ where: { accountId: profile.accountId, name: { contains: action.persona, mode: 'insensitive' } } });
        if (otherProfile) targetProfile = { ...otherProfile, account: profile.account, accountId: profile.accountId };
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
    } // End of for (const action of parsed.acciones)

    const { revalidatePath } = require('next/cache');
    revalidatePath('/gastos');
    revalidatePath('/ingresos');
    revalidatePath('/tarjetas');
    revalidatePath('/prestamos');
    revalidatePath('/agenda');
    revalidatePath('/dashboard');

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ ok: true }); 
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Telegram webhook active' });
}
