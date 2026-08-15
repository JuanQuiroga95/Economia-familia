/**
 * Username del bot de Telegram (sin @).
 * Se puede sobrescribir con NEXT_PUBLIC_TELEGRAM_BOT_USERNAME si algún día se cambia el bot.
 */
export const TELEGRAM_BOT_USERNAME =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'Juan_tania_econo_bot';

/**
 * Link al bot. Si se pasa el PIN, Telegram se lo manda solo como "/start <PIN>"
 * y la vinculación queda hecha sin que el usuario tenga que copiar nada.
 */
export function telegramBotUrl(linkCode?: string | null) {
  const base = `https://t.me/${TELEGRAM_BOT_USERNAME}`;
  return linkCode ? `${base}?start=${linkCode}` : base;
}
