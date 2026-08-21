export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getArgDate, getCurrentFinancialMonth } from '@/lib/dateUtils';
import { buildStatement } from '@/lib/periodUtils';
import { formatCurrency } from '@/lib/formatUtils';
import { sendTelegramMessage } from '@/lib/telegramSend';
import { sendPushNotification } from '@/lib/push';
import { estadoModelos } from '@/lib/groqModels';
import { estadoVision } from '@/lib/geminiVision';

/**
 * Recordatorio diario: avisa lo que vence hoy y mañana (agenda, cuotas de
 * préstamos y vencimientos de tarjetas). Lo dispara el cron de Vercel.
 *
 * Los ítems atrasados solo se recuerdan los lunes, para no ser pesado.
 */

interface Aviso {
  icon: string;
  texto: string;
  monto: number | null;
  /** Solo para ítems de la agenda: permite el botón "ya lo pagué". */
  plannedId?: string;
}

function autorizado(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    // Vercel manda el header solo si CRON_SECRET está configurado en el proyecto.
    if (request.headers.get('authorization') === `Bearer ${secret}`) return true;
    return request.nextUrl.searchParams.get('secret') === secret;
  }

  // Sin CRON_SECRET: se acepta el cron de Vercel y las pruebas locales.
  return request.headers.get('x-vercel-cron') !== null || process.env.NODE_ENV !== 'production';
}

/**
 * Chequeo diario de los modelos de IA (Groq para texto, Gemini para fotos). El
 * bot se banca solo que le den de baja uno (elige otro), pero avisa para poder
 * actualizar la lista de preferidos antes de que se quede sin respaldo.
 *
 * Va al chat de ADMIN_TELEGRAM_CHAT_ID; si no está seteado, al primer perfil
 * vinculado, así no se le avisa a toda la familia de algo que no les sirve.
 */
async function avisarSiCambiaronLosModelos() {
  try {
    const [estado, vision] = await Promise.all([estadoModelos(), estadoVision()]);
    if (!estado.degradado && !vision.degradado) return;

    const destino =
      process.env.ADMIN_TELEGRAM_CHAT_ID ||
      (
        await prisma.profile.findFirst({
          where: { telegramChatId: { not: null } },
          orderBy: { createdAt: 'asc' },
          select: { telegramChatId: true },
        })
      )?.telegramChatId;

    if (!destino) return;

    const partes = ['🤖 <b>Cambiaron los modelos de IA</b>\n'];

    if (estado.degradado) {
      partes.push(
        `<b>Texto (Groq)</b> — se dieron de baja: ${estado.preferidosCaidos.join(', ')}\n` +
          `Está usando <b>${estado.textoEnUso}</b> como reemplazo automático.\n` +
          '<i>Conviene actualizar TEXTO_PREFERIDOS en src/lib/groqModels.ts.</i>\n'
      );
    }

    if (vision.degradado) {
      partes.push(
        `<b>Fotos (Gemini)</b> — se dieron de baja: ${vision.preferidosCaidos.join(', ')}\n` +
          `Está usando <b>${vision.visionEnUso}</b> como reemplazo automático.\n` +
          '<i>Conviene actualizar VISION_PREFERIDOS en src/lib/geminiVision.ts.</i>\n'
      );
    }

    await sendTelegramMessage(destino, partes.join('\n'));
  } catch (error) {
    console.error('[CRON] No se pudo chequear los modelos de Groq:', error);
  }
}

function linea(aviso: Aviso) {
  const monto = aviso.monto != null ? ` — <b>$${formatCurrency(aviso.monto)}</b>` : '';
  return `• ${aviso.icon} ${aviso.texto}${monto}`;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  await avisarSiCambiaronLosModelos();

  const hoy = getArgDate();
  const { month, year } = getCurrentFinancialMonth(hoy);
  const diaHoy = hoy.getDate();
  const ultimoDia = new Date(year, month, 0).getDate();
  const diaManana = diaHoy < ultimoDia ? diaHoy + 1 : null; // si es fin de mes, mañana ya es otro mes
  const esLunes = hoy.getDay() === 1;

  const accounts = await prisma.account.findMany({
    include: { profiles: true },
  });

  let enviados = 0;

  for (const account of accounts) {
    const hoyAvisos: Aviso[] = [];
    const mananaAvisos: Aviso[] = [];
    const atrasados: Aviso[] = [];

    // ─── Agenda ───
    const planned = await prisma.plannedExpense.findMany({
      where: { accountId: account.id, month, year, status: 'PENDIENTE' },
      include: { category: { select: { icon: true } } },
      orderBy: { day: 'asc' },
    });

    for (const item of planned) {
      if (item.day == null) continue;
      const aviso: Aviso = {
        icon: item.category?.icon || '📌',
        texto: item.title,
        monto: item.amount,
        plannedId: item.id,
      };
      if (item.day === diaHoy) hoyAvisos.push(aviso);
      else if (diaManana != null && item.day === diaManana) mananaAvisos.push(aviso);
      else if (item.day < diaHoy) atrasados.push(aviso);
    }

    // ─── Cuotas de préstamos ───
    const loans = await prisma.loan.findMany({
      where: { profile: { accountId: account.id }, kind: 'TOMADO' },
      include: { schedule: true, payments: true },
    });

    for (const loan of loans) {
      const statement = buildStatement(loan.schedule, loan.payments, month, year);
      if (statement.pending <= 0) continue;

      const aviso: Aviso = {
        icon: '🏦',
        texto: `Cuota de ${loan.name}`,
        monto: statement.pending,
      };
      if (loan.dueDay === diaHoy) hoyAvisos.push(aviso);
      else if (diaManana != null && loan.dueDay === diaManana) mananaAvisos.push(aviso);
      else if (loan.dueDay < diaHoy) atrasados.push(aviso);
    }

    // ─── Vencimiento de tarjetas ───
    const cards = await prisma.creditCard.findMany({
      where: { profile: { accountId: account.id }, isActive: true },
      include: { purchases: { include: { schedule: true } }, payments: true },
    });

    for (const card of cards) {
      const installments = card.purchases.flatMap((p) => p.schedule);
      const statement = buildStatement(installments, card.payments, month, year);
      if (statement.pending <= 0) continue;

      const aviso: Aviso = {
        icon: '💳',
        texto: `Vence la tarjeta ${card.name}`,
        monto: statement.pending,
      };
      if (card.dueDay === diaHoy) hoyAvisos.push(aviso);
      else if (diaManana != null && card.dueDay === diaManana) mananaAvisos.push(aviso);
      else if (card.dueDay < diaHoy) atrasados.push(aviso);
    }

    const hayAlgoUrgente = hoyAvisos.length > 0 || mananaAvisos.length > 0;
    const mencionarAtrasados = atrasados.length > 0 && (hayAlgoUrgente || esLunes);
    if (!hayAlgoUrgente && !mencionarAtrasados) continue;

    // ─── Armar el mensaje ───
    const partes: string[] = ['🔔 <b>Recordatorio de EconoApp</b>'];

    if (hoyAvisos.length > 0) {
      partes.push(`\n📅 <b>Hoy (${diaHoy})</b>\n${hoyAvisos.map(linea).join('\n')}`);
    }
    if (mananaAvisos.length > 0) {
      partes.push(`\n🔜 <b>Mañana (${diaManana})</b>\n${mananaAvisos.map(linea).join('\n')}`);
    }
    if (mencionarAtrasados) {
      const total = atrasados.reduce((acc, a) => acc + (a.monto || 0), 0);
      partes.push(
        `\n⚠️ <b>Sin marcar de antes</b>\n${atrasados.slice(0, 5).map(linea).join('\n')}` +
          (atrasados.length > 5 ? `\n• …y ${atrasados.length - 5} más` : '') +
          (total > 0 ? `\n<i>Total pendiente: $${formatCurrency(total)}</i>` : '')
      );
    }

    const totalHoy = hoyAvisos.reduce((acc, a) => acc + (a.monto || 0), 0);
    if (totalHoy > 0) {
      partes.push(`\n💰 Para hoy necesitás <b>$${formatCurrency(totalHoy)}</b>.`);
    }

    const mensaje = partes.join('\n');

    // Botones para tildar en el momento lo que es de la agenda.
    const botones = [...hoyAvisos, ...mananaAvisos]
      .filter((a) => a.plannedId)
      .slice(0, 3)
      .map((a) => [
        {
          text: `✅ ${a.texto.slice(0, 25)}`,
          callback_data: `done_planned_${a.plannedId}`,
        },
      ]);

    // ─── Enviar ───
    const resumenPush =
      hoyAvisos.length > 0
        ? `Hoy: ${hoyAvisos.map((a) => a.texto).slice(0, 3).join(', ')}`
        : mananaAvisos.length > 0
          ? `Mañana: ${mananaAvisos.map((a) => a.texto).slice(0, 3).join(', ')}`
          : `Tenés ${atrasados.length} cosa(s) sin marcar en la agenda`;

    for (const profile of account.profiles) {
      await sendPushNotification(profile.id, '🔔 Recordatorio del día', resumenPush, '/agenda');
      if (profile.telegramChatId) {
        await sendTelegramMessage(
          profile.telegramChatId,
          mensaje,
          botones.length > 0 ? { inline_keyboard: botones } : undefined
        );
      }
    }

    enviados++;
  }

  return NextResponse.json({ ok: true, cuentasNotificadas: enviados });
}
