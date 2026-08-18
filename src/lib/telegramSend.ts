const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

/** Manda un mensaje al chat de Telegram. Se usa desde el webhook y desde el cron. */
export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: any
) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  const body: any = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;

  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error('[TELEGRAM] Error enviando mensaje:', error);
  }
}
