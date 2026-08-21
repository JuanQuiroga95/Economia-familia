'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { configurarWebhook, type EstadoWebhook } from '@/actions/telegramWebhook';

function fechaCorta(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

export default function WebhookCard({ estado }: { estado: EstadoWebhook }) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [verDetalle, setVerDetalle] = useState(false);

  const listo = estado.coincide && !estado.faltaSecreto && !estado.ultimoError;
  const bloqueado = estado.faltaToken || estado.faltaSecreto;

  const registrar = async () => {
    const ok = await confirmar({
      titulo: '¿Registrar el webhook con el secreto?',
      detalle:
        'Desde acá en adelante Telegram manda una contraseña en cada mensaje y el bot rechaza todo lo que no venga de Telegram. Si algo sale mal, se vuelve a apretar este botón.',
      confirmar: 'Registrar',
      resumen: [{ etiqueta: 'Dirección', valor: estado.urlEsperada }],
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await configurarWebhook();
      if (res.success) {
        toast.success('Webhook registrado. El bot ya está protegido.');
        router.refresh();
      } else {
        toast.error(res.error || 'Error');
      }
    });
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">Bot de Telegram</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                listo
                  ? 'bg-success/20 text-success'
                  : bloqueado
                    ? 'bg-danger/20 text-danger'
                    : 'bg-warning/20 text-warning'
              }`}
            >
              {listo ? 'protegido' : bloqueado ? 'falta configurar' : 'sin registrar'}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1">
            {listo
              ? 'Telegram manda el secreto en cada mensaje y el bot verifica que sea suyo.'
              : 'Mientras no esté registrado, cualquiera que conozca la dirección puede mandarle órdenes al bot.'}
          </p>
        </div>

        {!bloqueado && (
          <button
            type="button"
            disabled={isPending}
            onClick={registrar}
            className="shrink-0 px-3 py-2 rounded-xl text-sm font-medium bg-accent/15 text-accent border border-accent/25 hover:bg-accent/25 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Registrando…' : listo ? 'Volver a registrar' : 'Registrar webhook'}
          </button>
        )}
      </div>

      {/* Lo que falta, si falta algo */}
      {bloqueado && (
        <div className="rounded-xl bg-danger/10 border border-danger/25 px-3 py-2 space-y-1">
          <p className="text-xs text-text-secondary">
            Faltan variables de entorno en Vercel. Agregalas y volvé a deployar:
          </p>
          <ul className="text-xs text-text-muted list-disc pl-4">
            {estado.faltaToken && (
              <li>
                <code>TELEGRAM_BOT_TOKEN</code> — el token del bot
              </li>
            )}
            {estado.faltaSecreto && (
              <li>
                <code>TELEGRAM_WEBHOOK_SECRET</code> — cualquier texto largo y aleatorio
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Problema de entrega: acá aparece el 401 si el secreto no coincide */}
      {estado.ultimoError && (
        <div className="rounded-xl bg-warning/10 border border-warning/25 px-3 py-2">
          <p className="text-xs text-text-secondary">
            <b>Último error de Telegram</b>
            {estado.ultimoErrorFecha ? ` (${fechaCorta(estado.ultimoErrorFecha)})` : ''}:{' '}
            <span className="text-text-muted">{estado.ultimoError}</span>
          </p>
          {estado.ultimoError.includes('401') && (
            <p className="text-xs text-text-muted mt-1">
              Un 401 acá significa que Telegram no está mandando el secreto que el bot espera.
              Apretá <b>Registrar webhook</b> y se arregla.
            </p>
          )}
        </div>
      )}

      {estado.pendientes > 0 && (
        <p className="text-xs text-warning">
          ⚠️ Hay {estado.pendientes} mensaje{estado.pendientes === 1 ? '' : 's'} que Telegram no
          pudo entregar y tiene en cola.
        </p>
      )}

      {estado.error && <p className="text-xs text-danger">{estado.error}</p>}

      {/* Detalle técnico, plegado */}
      <button
        type="button"
        onClick={() => setVerDetalle(!verDetalle)}
        className="text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        {verDetalle ? '− Ocultar detalle' : '+ Ver detalle'}
      </button>

      {verDetalle && (
        <div className="rounded-xl bg-bg-input/60 border border-border divide-y divide-border text-xs">
          <div className="px-3 py-2">
            <p className="text-text-muted mb-0.5">Dirección esperada</p>
            <p className="text-text-primary break-all font-mono">{estado.urlEsperada}</p>
          </div>
          <div className="px-3 py-2">
            <p className="text-text-muted mb-0.5">Dirección registrada en Telegram</p>
            <p className="text-text-primary break-all font-mono">
              {estado.urlRegistrada || '(ninguna)'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
