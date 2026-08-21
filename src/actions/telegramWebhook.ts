'use server';

import { revalidatePath } from 'next/cache';
import { getAdminAccount } from '@/lib/admin';

/**
 * Registro del webhook de Telegram desde el panel.
 *
 * La app ya tiene el token del bot y el secreto en sus variables de entorno,
 * así que puede configurarse sola. Antes había que sacar el token de Vercel
 * (que lo esconde si está marcado como Sensitive) o de BotFather, y armar un
 * curl a mano — un paso manual, fácil de olvidar, que si no se hacía dejaba el
 * endpoint aceptando mensajes de cualquiera.
 */

const TELEGRAM_API = 'https://api.telegram.org';

/** La URL pública de esta app, la misma lógica que usa el envío de push. */
function urlDeLaApp() {
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return process.env.NEXTAUTH_URL || 'http://localhost:3000';
}

export interface EstadoWebhook {
  /** Falta alguna variable de entorno: sin esto no se puede hacer nada. */
  faltaToken: boolean;
  faltaSecreto: boolean;
  /** URL que Telegram tiene registrada hoy. */
  urlRegistrada: string;
  /** URL a la que debería apuntar. */
  urlEsperada: string;
  coincide: boolean;
  /** Mensajes que Telegram no pudo entregar y tiene encolados. */
  pendientes: number;
  /** Último error de entrega, si hubo. Acá aparece el 401 si falta el secreto. */
  ultimoError: string | null;
  ultimoErrorFecha: string | null;
  error?: string;
}

export async function getEstadoWebhook(): Promise<EstadoWebhook | null> {
  if (!(await getAdminAccount())) return null;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
  const urlEsperada = `${urlDeLaApp()}/api/webhook/telegram`;

  const base: EstadoWebhook = {
    faltaToken: !token,
    faltaSecreto: !secreto,
    urlRegistrada: '',
    urlEsperada,
    coincide: false,
    pendientes: 0,
    ultimoError: null,
    ultimoErrorFecha: null,
  };

  if (!token) return base;

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getWebhookInfo`, {
      cache: 'no-store',
    });
    const data = await res.json();
    if (!data.ok) return { ...base, error: data.description || 'Telegram rechazó la consulta' };

    const info = data.result;
    return {
      ...base,
      urlRegistrada: info.url || '',
      coincide: info.url === urlEsperada,
      pendientes: info.pending_update_count || 0,
      ultimoError: info.last_error_message || null,
      ultimoErrorFecha: info.last_error_date
        ? new Date(info.last_error_date * 1000).toISOString()
        : null,
    };
  } catch (error) {
    console.error('Error consultando el webhook:', error);
    return { ...base, error: 'No se pudo consultar a Telegram' };
  }
}

/**
 * Registra el webhook con el secreto configurado.
 *
 * Desde acá en adelante Telegram manda el header en cada update y el endpoint
 * rechaza cualquier cosa que no venga de Telegram.
 */
export async function configurarWebhook() {
  try {
    if (!(await getAdminAccount())) return { success: false, error: 'No tenés permiso' };

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return { success: false, error: 'Falta TELEGRAM_BOT_TOKEN en las variables de entorno' };
    }

    const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secreto) {
      return {
        success: false,
        error:
          'Falta TELEGRAM_WEBHOOK_SECRET. Sin secreto el webhook queda abierto, así que no se registra.',
      };
    }

    const url = `${urlDeLaApp()}/api/webhook/telegram`;

    const res = await fetch(`${TELEGRAM_API}/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, secret_token: secreto }),
    });
    const data = await res.json();

    if (!data.ok) {
      return { success: false, error: data.description || 'Telegram rechazó el registro' };
    }

    revalidatePath('/admin');
    return { success: true, url };
  } catch (error) {
    console.error('Error configurando el webhook:', error);
    return { success: false, error: 'No se pudo hablar con Telegram' };
  }
}
