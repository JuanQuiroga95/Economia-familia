import { formatCurrency } from '@/lib/formatUtils';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Groq from 'groq-sdk';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ============================================
// Telegram helpers
// ============================================

async function sendTelegramMessage(chatId: number | string, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
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

  // Create a File-like object from buffer for Groq SDK
  const file = new File([new Uint8Array(audioBuffer)], 'audio.ogg', { type: 'audio/ogg' });

  const transcription = await groq.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3',
    language: 'es',
  });

  return transcription.text;
}

interface ParsedTransaction {
  tipo: 'gasto' | 'ingreso';
  monto: number;
  moneda: 'ARS' | 'USD' | 'EUR';
  descripcion: string;
  categoria: string;
  tipo_gasto: 'propio' | 'compartido';
  persona: string;
}

async function parseTransactionWithAI(
  text: string,
  profileName: string,
  categories: string[]
): Promise<ParsedTransaction> {
  const groq = new Groq({ apiKey: GROQ_API_KEY });

  const systemPrompt = `Sos un asistente financiero argentino. Tu trabajo es extraer datos de transacciones financieras de mensajes de texto informales.

El usuario actual se llama "${profileName}".
Las categorías de gasto disponibles son: ${categories.join(', ')}.

REGLAS:
- Si el usuario dice "gasto" o menciona comprar algo, tipo = "gasto"
- Si el usuario dice "ingreso", "cobré", "me pagaron", "sueldo", "me transfirieron", tipo = "ingreso"
- Si dice "compartido", tipo_gasto = "compartido". Si no aclara, tipo_gasto = "propio"
- Si menciona "dólares" o "USD", moneda = "USD". Si dice "euros", moneda = "EUR". Por defecto "ARS"
- Elegí la categoría más cercana de la lista. Si ninguna aplica, usá "Otros"
- El campo "persona" debe ser el nombre de la persona que realiza la transacción. Por defecto "${profileName}"
- Si dice "mil" o "k" multiplicá por 1000 (ej: "45 mil" = 45000, "4.5k" = 4500)
- Si dice "luca" o "lucas" multiplicá por 1000 (ej: "25 lucas" = 25000)

Respondé ÚNICAMENTE con un JSON válido, sin texto adicional ni markdown:
{
  "tipo": "gasto" | "ingreso",
  "monto": number,
  "moneda": "ARS" | "USD" | "EUR",
  "descripcion": "descripción corta",
  "categoria": "nombre de la categoría",
  "tipo_gasto": "propio" | "compartido",
  "persona": "nombre"
}`;

  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
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

// ============================================
// Main webhook handler
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = body.message;

    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const fromId = message.from.id.toString();
    const text = message.text || '';

    // ─── /start command ───
    if (text === '/start') {
      await sendTelegramMessage(
        chatId,
        '👋 ¡Hola! Soy tu bot de gastos de <b>EconoApp</b>.\n\n' +
          '📌 Para vincular tu cuenta, andá a <b>Configuración → Telegram</b> en la app web, generá tu PIN y enviámelo acá.\n\n' +
          '💡 Una vez vinculado, podés enviarme mensajes como:\n' +
          '• "Gasto 4500 en el chino compartido"\n' +
          '• "Cobré 350 mil de sueldo"\n' +
          '• Un audio describiendo el gasto\n\n' +
          '📊 /estado - Ver tu saldo quincenal'
      );
      return NextResponse.json({ ok: true });
    }

    // ─── Try to link with PIN ───
    if (/^\d{6}$/.test(text.trim())) {
      const code = text.trim();
      const profile = await prisma.profile.findFirst({
        where: { telegramLinkCode: code },
        include: { account: true },
      });

      if (profile) {
        await prisma.profile.update({
          where: { id: profile.id },
          data: { telegramChatId: fromId, telegramLinkCode: null },
        });
        await sendTelegramMessage(
          chatId,
          `✅ ¡Vinculación exitosa!\n\n` +
            `👤 Perfil: <b>${profile.name}</b>\n` +
            `🏠 Cuenta: <b>${profile.account?.label || 'Sin nombre'}</b>\n\n` +
            `Ahora podés enviarme tus gastos e ingresos por texto o audio. 🎙️`
        );
      } else {
        await sendTelegramMessage(
          chatId,
          '❌ Código no válido o ya expirado. Generá uno nuevo desde la app web en Configuración → Telegram.'
        );
      }
      return NextResponse.json({ ok: true });
    }

    // ─── Check if user is linked ───
    const profile = await prisma.profile.findFirst({
      where: { telegramChatId: fromId },
      include: { account: true },
    });

    if (!profile || !profile.accountId) {
      await sendTelegramMessage(
        chatId,
        '⚠️ Tu cuenta no está vinculada. Andá a <b>Configuración → Telegram</b> en la app web y seguí las instrucciones.'
      );
      return NextResponse.json({ ok: true });
    }

    // ─── /estado command ───
    if (text === '/estado') {
      const budgetInfo = await getBudgetRemaining(profile.id);
      if (budgetInfo) {
        await sendTelegramMessage(
          chatId,
          `📊 <b>Estado de ${profile.name}</b>${budgetInfo}`
        );
      } else {
        await sendTelegramMessage(
          chatId,
          `📊 No tenés un presupuesto quincenal configurado. Activalo desde la app web.`
        );
      }
      return NextResponse.json({ ok: true });
    }

    // ─── Process voice note or text ───
    let messageText = text;

    if (message.voice) {
      try {
        await sendTelegramMessage(chatId, '🎙️ Procesando audio...');
        const audioBuffer = await downloadTelegramFile(message.voice.file_id);
        messageText = await transcribeAudio(audioBuffer);
      } catch (error) {
        console.error('Error transcribing audio:', error);
        await sendTelegramMessage(chatId, '❌ No pude procesar el audio. Intentá de nuevo o escribí el gasto.');
        return NextResponse.json({ ok: true });
      }
    }

    if (!messageText || messageText.trim().length === 0) {
      await sendTelegramMessage(chatId, '🤔 No entendí tu mensaje. Probá escribir algo como "gasto 5000 en nafta".');
      return NextResponse.json({ ok: true });
    }

    // ─── Get categories for this account ───
    const categories = await prisma.category.findMany({
      where: { accountId: profile.accountId },
    });
    const categoryNames = categories.map((c) => c.name);

    // ─── Parse with AI ───
    let parsed: ParsedTransaction;
    try {
      parsed = await parseTransactionWithAI(messageText, profile.name, categoryNames);
    } catch (error) {
      console.error('Error parsing with AI:', error);
      await sendTelegramMessage(chatId, '❌ No pude interpretar tu mensaje. Probá de nuevo con más detalle.');
      return NextResponse.json({ ok: true });
    }

    if (!parsed.monto || parsed.monto <= 0) {
      await sendTelegramMessage(chatId, '❌ No pude detectar un monto válido. Probá de nuevo (ej: "gasto 5000 en nafta").');
      return NextResponse.json({ ok: true });
    }

    // ─── Find matching category ───
    const matchedCategory = categories.find(
      (c) => c.name.toLowerCase() === parsed.categoria?.toLowerCase()
    ) || categories.find((c) => c.name === 'Otros') || categories[0];

    // ─── Find the correct profile ───
    // If the user mentioned a different person's name, look it up
    let targetProfile = profile;
    if (parsed.persona && parsed.persona.toLowerCase() !== profile.name.toLowerCase()) {
      const otherProfile = await prisma.profile.findFirst({
        where: {
          accountId: profile.accountId,
          name: { contains: parsed.persona, mode: 'insensitive' },
        },
      });
      if (otherProfile) targetProfile = { ...otherProfile, account: profile.account, accountId: profile.accountId };
    }

    // ─── Create transaction ───
    const { parseArgDate, getArgDate } = require('@/lib/dateUtils');
    const { revalidatePath } = require('next/cache');
    const today = getArgDate();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    if (parsed.tipo === 'ingreso') {
      await prisma.income.create({
        data: {
          amount: parsed.monto,
          currency: parsed.moneda || 'ARS',
          date: parseArgDate(dateStr),
          description: parsed.descripcion || 'Ingreso desde Telegram',
          profileId: targetProfile.id,
        },
      });

      const emoji = parsed.moneda === 'USD' ? '💵' : parsed.moneda === 'EUR' ? '💶' : '💰';
      await sendTelegramMessage(
        chatId,
        `✅ <b>Ingreso registrado</b>\n\n` +
          `${emoji} Monto: <b>$${formatCurrency(parsed.monto)}</b> ${parsed.moneda}\n` +
          `📝 Descripción: ${parsed.descripcion}\n` +
          `👤 Perfil: ${targetProfile.name}`
      );
    } else {
      // Gasto
      if (!matchedCategory) {
        await sendTelegramMessage(chatId, '❌ No encontré una categoría válida. Agregá categorías desde la app web.');
        return NextResponse.json({ ok: true });
      }

      await prisma.expense.create({
        data: {
          amount: parsed.monto,
          currency: parsed.moneda || 'ARS',
          date: parseArgDate(dateStr),
          description: parsed.descripcion || 'Gasto desde Telegram',
          categoryId: matchedCategory.id,
          profileId: targetProfile.id,
          type: parsed.tipo_gasto === 'compartido' ? 'COMPARTIDO' : 'PROPIO',
          paidFromPersonalBudget: false,
        },
      });

      const budgetInfo = await getBudgetRemaining(targetProfile.id);
      const tipoLabel = parsed.tipo_gasto === 'compartido' ? '👥 Compartido' : '👤 Propio';

      await sendTelegramMessage(
        chatId,
        `✅ <b>Gasto registrado</b>\n\n` +
          `💸 Monto: <b>$${formatCurrency(parsed.monto)}</b> ${parsed.moneda}\n` +
          `📂 Categoría: ${matchedCategory.icon} ${matchedCategory.name}\n` +
          `📝 ${parsed.descripcion}\n` +
          `${tipoLabel} · ${targetProfile.name}` +
          budgetInfo
      );
    }

    revalidatePath('/gastos');
    revalidatePath('/ingresos');
    revalidatePath('/dashboard');

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}

// Telegram sends GET to verify webhook
export async function GET() {
  return NextResponse.json({ status: 'Telegram webhook active' });
}
