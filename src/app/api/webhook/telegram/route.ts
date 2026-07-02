import { formatCurrency } from '@/lib/formatUtils';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Groq from 'groq-sdk';
import crypto from 'crypto';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ============================================
// Telegram helpers
// ============================================

async function sendTelegramMessage(chatId: number | string, text: string, replyMarkup?: any) {
  const body: any = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  tipo?: 'gasto' | 'ingreso';
  monto?: number;
  moneda?: 'ARS' | 'USD' | 'EUR';
  descripcion?: string;
  categoria?: string;
  tipo_gasto?: 'propio' | 'compartido';
  persona?: string;
  pague_yo?: boolean;
  billetera?: string;
}

const SYSTEM_PROMPT_BASE = (profileName: string, categories: string[], context: string) => `Sos el cerebro de un bot financiero para Telegram de EconoApp. Tu trabajo es interpretar la intención del usuario.

El usuario actual se llama "${profileName}".
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

REGLAS DE EXTRACCIÓN (Aplica siempre que el dato exista o pueda inferirse, incluso para la acción "link"):
- tipo: "gasto" o "ingreso"
- tipo_gasto: "compartido" o "propio" (por defecto "propio")
- moneda: "ARS", "USD" o "EUR" (por defecto "ARS")
- persona: nombre de quien lo hace (por defecto "${profileName}")
- pague_yo: por defecto TRUE (asumiendo que el usuario actual lo pagó). Solo será false si el usuario indica explícitamente que NO lo pagó él, o que lo pagó la otra persona. (Aplica a gastos compartidos)
- Multiplicadores: "mil" o "k" = x1000, "luca(s)" = x1000.
- Si analizas IMÁGENES de comprobantes o listas, es OBLIGATORIO que crees una "accion" separada en el array "acciones" por CADA movimiento individual que figure en el texto/imagen (no importa si son 2 o 10).
- REGLA CRÍTICA PARA IMÁGENES: NUNCA omitas el primer elemento de la lista ni el último. Lee cuidadosamente desde el principio hasta el final. Si hay 5 transacciones en la imagen, el JSON DEBE tener 5 acciones.
- NO agrupes, NO sumes, y NO omitas transacciones a menos que el usuario te pida EXPLÍCITAMENTE "sumalos" o "juntalos en uno solo".
- Para identificar el tipo: si dice "pago", "enviada", "transferencia enviada", "QR" o tiene un monto negativo (-), es "gasto". Si dice "rendimiento", "recibida", "deposito" o tiene un monto positivo (+), es "ingreso".

Devuelve ÚNICAMENTE un JSON válido (sin texto extra) con esta estructura:
{
  "acciones": [
    {
      "accion": "crear" | "modificar" | "eliminar" | "link",
      "entidad_id": "id_string",
      "tipo": "gasto" | "ingreso",
      "monto": numero,
      "moneda": "ARS",
      "descripcion": "texto",
      "categoria": "categoria",
      "tipo_gasto": "propio" | "compartido",
      "persona": "nombre",
      "pague_yo": boolean,
      "billetera": "nombre_billetera" // Si menciona una (ej: MP, Galicia, Uala)
    }
  ]
}`;

async function parseTransactionWithAI(
  text: string,
  profileName: string,
  categories: string[],
  wallets: { id: string; name: string }[],
  context: string
): Promise<{ acciones: ParsedAction[] }> {
  const walletsStr = wallets.length > 0 ? wallets.map(w => w.name).join(', ') : 'Ninguna';
  const groq = new Groq({ apiKey: GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_BASE(profileName, categories, context) + `\n\nBilleteras disponibles: ${walletsStr}` },
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
  customInstruction: string = ''
): Promise<{ acciones: ParsedAction[] }> {
  const groq = new Groq({ apiKey: GROQ_API_KEY });
  
  const contentArray: any[] = [
    { type: 'text', text: `Eres un asistente experto en finanzas. Analiza cuidadosamente estas imágenes y extrae una LISTA DETALLADA Y EXHAUSTIVA de TODOS los movimientos financieros que aparezcan.\n\nPara CADA movimiento, indica claramente:\n1. Descripción exacta.\n2. Monto.\n3. Si es Ingreso o Gasto (por ejemplo, pagos o montos con signo '-' son Gastos; rendimientos, depósitos o montos con signo '+' son Ingresos).\n\nNO OMITAS NINGÚN MOVIMIENTO. Debes enumerar cada uno por separado.${customInstruction ? `\n\nInstrucción especial del usuario: "${customInstruction}"` : ''}` }
  ];
  
  for (const id of fileIds) {
    const buffer = await downloadTelegramFile(id);
    const base64 = buffer.toString('base64');
    contentArray.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${base64}` }
    });
  }

  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'user', content: contentArray },
    ],
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    temperature: 0.1,
    max_tokens: 500
  });

  const rawVisionText = completion.choices[0]?.message?.content || '';

  // Paso 2: Forzar JSON con el modelo de texto
  const walletsStr = wallets.length > 0 ? wallets.map(w => w.name).join(', ') : 'Ninguna';
  const jsonCompletion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_BASE(profileName, categories, context) + `\n\nBilleteras disponibles: ${walletsStr}` },
      { role: 'user', content: `Basado en esta extracción de imagen, armá el JSON final:\n\n${rawVisionText}` },
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

    // ─── /start command ───
    if (text === '/start') {
      await sendTelegramMessage(
        chatId,
        '👋 ¡Hola! Soy tu bot de gastos de <b>EconoApp</b>.\n\n' +
          '📌 Para vincular tu cuenta, andá a <b>Configuración → Telegram</b> en la app web, generá tu PIN y enviámelo acá.\n\n' +
          '💡 Una vez vinculado, podés enviarme mensajes como:\n' +
          '• "Gasto 4500 en el chino compartido"\n' +
          '• "Me equivoqué, el gasto del chino era de 5000"\n' +
          '• "Borrá el último ingreso"\n' +
          '• "gasto" (para abrir la app sin contraseña)'
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
          `✅ ¡Vinculación exitosa!\n👤 Perfil: <b>${profile.name}</b>\n🏠 Cuenta: <b>${profile.account?.label}</b>\n\nAhora podés enviarme tus gastos e ingresos por texto, fotos o audio. 🎙️📸`
        );
      } else {
        await sendTelegramMessage(chatId, '❌ Código no válido o ya expirado.');
      }
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

    const [categories, wallets] = await Promise.all([
      prisma.category.findMany({ where: { accountId: profile.accountId } }),
      prisma.wallet.findMany({ where: { accountId: profile.accountId } })
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
        parsed = await parseImagesWithAI(fileIdsToProcess, profile.name, categoryNames, wallets, contextStr, customInstruction);
      } else {
        parsed = await parseTransactionWithAI(messageText, profile.name, categoryNames, wallets, contextStr);
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
        
        const { parseArgDate, getArgDate } = require('@/lib/dateUtils');
        const today = getArgDate();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
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
                categoryId: matchedCategory.id,
                type: action.tipo_gasto === 'compartido' ? 'COMPARTIDO' : 'PROPIO'
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
      if (!action.monto || action.monto <= 0) {
        await sendTelegramMessage(chatId, '❌ No pude detectar un monto válido.');
        continue;
      }

      const matchedCategory = categories.find((c) => c.name.toLowerCase() === action.categoria?.toLowerCase()) || categories.find((c) => c.name === 'Otros') || categories[0];
      
      let targetProfile = profile;
      if (action.persona && action.persona.toLowerCase() !== profile.name.toLowerCase()) {
        const otherProfile = await prisma.profile.findFirst({ where: { accountId: profile.accountId, name: { contains: action.persona, mode: 'insensitive' } } });
        if (otherProfile) targetProfile = { ...otherProfile, account: profile.account, accountId: profile.accountId };
      }

      const { parseArgDate, getArgDate } = require('@/lib/dateUtils');
      const { revalidatePath } = require('next/cache');
      const today = getArgDate();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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
