const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

/** Escapa lo mínimo para que un texto ajeno no rompa el parse_mode HTML. */
export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function postear(body: Record<string, unknown>) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: res.ok, detalle: res.ok ? '' : ((await res.json().catch(() => ({})))?.description ?? `HTTP ${res.status}`) };
}

/**
 * Manda un mensaje al chat de Telegram. Se usa desde el webhook y desde el cron.
 *
 * Si Telegram rechaza el HTML (un `<` suelto dentro de un mensaje de error
 * alcanza), reintenta en texto plano: es preferible un mensaje sin negritas a
 * que la familia no reciba nada y crea que el bot está caído.
 */
export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: any
) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  const body: any = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;

  try {
    const { ok, detalle } = await postear(body);
    if (ok) return;

    console.error('[TELEGRAM] Rechazó el mensaje:', detalle);
    delete body.parse_mode;
    body.text = text.replace(/<[^>]+>/g, '');
    const segundo = await postear(body);
    if (!segundo.ok) console.error('[TELEGRAM] Tampoco entró en texto plano:', segundo.detalle);
  } catch (error) {
    console.error('[TELEGRAM] Error enviando mensaje:', error);
  }
}
