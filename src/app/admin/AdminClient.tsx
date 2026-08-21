'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatCurrency } from '@/lib/formatUtils';
import WebhookCard from './WebhookCard';
import type { EstadoWebhook } from '@/actions/telegramWebhook';
import {
  cambiarPasswordDeFamilia,
  cambiarUsuarioDeFamilia,
  marcarComoAdmin,
  type ResumenAdmin,
  type FamiliaAdmin,
} from '@/actions/admin';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function fecha(iso: string | null) {
  if (!iso) return 'nunca';
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

function diasDesde(iso: string | null) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86_400_000);
}

export default function AdminClient({
  resumen,
  webhook,
}: {
  resumen: ResumenAdmin;
  webhook: EstadoWebhook | null;
}) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [usuario, setUsuario] = useState('');

  const cerrarFormulario = () => {
    setEditando(null);
    setPassword('');
    setPassword2('');
    setUsuario('');
  };

  const guardarPassword = async (familia: FamiliaAdmin) => {
    if (password.length < 8) {
      toast.error('La contraseña tiene que tener al menos 8 caracteres');
      return;
    }
    if (password !== password2) {
      toast.error('Las dos contraseñas no coinciden');
      return;
    }

    const ok = await confirmar({
      titulo: `¿Cambiar la contraseña de ${familia.label}?`,
      detalle:
        'La contraseña anterior deja de funcionar en el acto. Anotá la nueva antes de seguir: no se puede volver a ver.',
      tono: 'peligro',
      confirmar: 'Cambiar contraseña',
      resumen: [
        { etiqueta: 'Familia', valor: familia.label },
        { etiqueta: 'Usuario', valor: familia.username },
        { etiqueta: 'Nueva contraseña', valor: password },
      ],
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await cambiarPasswordDeFamilia(familia.id, password);
      if (res.success) {
        toast.success(`Contraseña de ${familia.label} actualizada`);
        cerrarFormulario();
        router.refresh();
      } else {
        toast.error(res.error || 'Error');
      }
    });
  };

  const guardarUsuario = async (familia: FamiliaAdmin) => {
    const nuevo = usuario.trim().toLowerCase();
    if (nuevo.length < 3) {
      toast.error('El usuario tiene que tener al menos 3 caracteres');
      return;
    }
    if (nuevo === familia.username) return cerrarFormulario();

    const ok = await confirmar({
      titulo: `¿Cambiar el usuario de ${familia.label}?`,
      detalle: 'Va a tener que entrar con el usuario nuevo desde ahora.',
      confirmar: 'Cambiar usuario',
      resumen: [
        { etiqueta: 'Antes', valor: familia.username },
        { etiqueta: 'Ahora', valor: nuevo },
      ],
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await cambiarUsuarioDeFamilia(familia.id, nuevo);
      if (res.success) {
        toast.success('Usuario actualizado');
        cerrarFormulario();
        router.refresh();
      } else {
        toast.error(res.error || 'Error');
      }
    });
  };

  const alternarAdmin = async (familia: FamiliaAdmin) => {
    const ok = await confirmar({
      titulo: familia.esAdmin
        ? `¿Sacarle el acceso de admin a ${familia.label}?`
        : `¿Darle acceso de admin a ${familia.label}?`,
      detalle: familia.esAdmin
        ? 'Deja de ver este panel y de poder cambiar contraseñas.'
        : 'Va a poder ver todas las familias y cambiar cualquier contraseña, incluida la tuya.',
      tono: familia.esAdmin ? 'normal' : 'peligro',
      confirmar: familia.esAdmin ? 'Sacar acceso' : 'Dar acceso',
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await marcarComoAdmin(familia.id, !familia.esAdmin);
      if (res.success) {
        toast.success('Permisos actualizados');
        router.refresh();
      } else {
        toast.error(res.error || 'Error');
      }
    });
  };

  const { totales } = resumen;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-text-primary">Administración</h1>
        <p className="text-text-muted text-sm mt-1">
          Todas las familias de EconoApp · {MESES[resumen.mes - 1]} {resumen.anio}
        </p>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { etiqueta: 'Familias', valor: totales.familias, icono: '🏠' },
          { etiqueta: 'Integrantes', valor: totales.integrantes, icono: '👥' },
          { etiqueta: 'Activas este mes', valor: totales.activasEsteMes, icono: '🔥' },
          { etiqueta: 'Gastos cargados', valor: totales.gastos, icono: '💸' },
          { etiqueta: 'Ingresos cargados', valor: totales.ingresos, icono: '💰' },
        ].map((t) => (
          <div key={t.etiqueta} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{t.icono}</span>
              <p className="text-xs text-text-muted">{t.etiqueta}</p>
            </div>
            <p className="text-2xl font-bold text-text-primary tabular-nums">{t.valor}</p>
          </div>
        ))}
      </div>

      {/* Estado del bot */}
      {webhook && <WebhookCard estado={webhook} />}

      {/* Aviso sobre las contraseñas */}
      <div className="glass-card p-4 border-l-2 border-l-warning">
        <p className="text-sm text-text-secondary">
          <span className="font-semibold text-warning">Sobre las contraseñas:</span> no se pueden
          ver. La base guarda un hash bcrypt, que es de una sola vía y no se puede revertir — ni
          desde acá ni desde la base. Lo que sí podés hacer es ponerle una nueva a cualquier familia
          y pasársela.
        </p>
      </div>

      {/* Familias */}
      <div className="space-y-3">
        {resumen.familias.map((familia) => {
          const dias = diasDesde(familia.ultimoMovimiento);
          const activa = dias !== null && dias <= 30;
          const desplegada = abierta === familia.id;

          return (
            <div key={familia.id} className="glass-card overflow-hidden">
              <button
                onClick={() => setAbierta(desplegada ? null : familia.id)}
                className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-bg-card-hover transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text-primary">
                      {familia.label}
                    </span>
                    {familia.esAdmin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">
                        ADMIN
                      </span>
                    )}
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        activa ? 'bg-success/20 text-success' : 'bg-bg-input text-text-muted'
                      }`}
                    >
                      {activa ? 'activa' : dias === null ? 'sin movimientos' : `${dias} días sin usar`}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-1 truncate">
                    <span className="font-mono">{familia.username}</span>
                    {' · '}
                    {familia.integrantes.length} integrante
                    {familia.integrantes.length === 1 ? '' : 's'}
                    {' · desde '}
                    {fecha(familia.creada)}
                  </p>
                </div>
                <svg
                  className={`w-4 h-4 shrink-0 text-text-muted transition-transform ${
                    desplegada ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <AnimatePresence initial={false}>
                {desplegada && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t border-border"
                  >
                    <div className="p-4 space-y-4">
                      {/* Actividad */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {[
                          ['Gastos', familia.gastos],
                          ['Ingresos', familia.ingresos],
                          ['Tarjetas', familia.tarjetas],
                          ['Préstamos', familia.prestamos],
                          ['Metas', familia.metasDeAhorro],
                        ].map(([etiqueta, valor]) => (
                          <div key={etiqueta} className="bg-bg-input/50 rounded-lg px-3 py-2">
                            <p className="text-[10px] text-text-muted uppercase tracking-wide">
                              {etiqueta}
                            </p>
                            <p className="text-sm font-semibold text-text-primary tabular-nums">
                              {valor}
                            </p>
                          </div>
                        ))}
                        <div className="bg-bg-input/50 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-text-muted uppercase tracking-wide">
                            Balance mes
                          </p>
                          <p
                            className={`text-sm font-semibold tabular-nums ${
                              familia.balanceDelMes >= 0 ? 'text-success' : 'text-danger'
                            }`}
                          >
                            ${formatCurrency(Math.round(familia.balanceDelMes))}
                          </p>
                        </div>
                      </div>

                      {/* Integrantes */}
                      <div>
                        <p className="text-xs text-text-muted uppercase tracking-wide mb-2">
                          Integrantes
                        </p>
                        <div className="space-y-2">
                          {familia.integrantes.length === 0 && (
                            <p className="text-sm text-text-muted">Esta familia no tiene perfiles.</p>
                          )}
                          {familia.integrantes.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between gap-3 bg-bg-input/40 rounded-lg px-3 py-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-7 h-7 shrink-0 rounded-lg bg-accent/15 flex items-center justify-center text-sm">
                                  {p.avatar || p.name.charAt(0).toUpperCase()}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-text-primary truncate">
                                    {p.name}
                                  </p>
                                  <p className="text-[11px] text-text-muted">
                                    {p.movimientos} movimiento{p.movimientos === 1 ? '' : 's'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    p.telegramVinculado
                                      ? 'bg-info/20 text-info'
                                      : 'bg-bg-card text-text-muted'
                                  }`}
                                  title={
                                    p.telegramVinculado
                                      ? 'Telegram vinculado'
                                      : 'Telegram sin vincular'
                                  }
                                >
                                  ✈️ {p.telegramVinculado ? 'sí' : 'no'}
                                </span>
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-bg-card text-text-muted"
                                  title="Dispositivos con notificaciones"
                                >
                                  🔔 {p.dispositivosPush}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Acciones */}
                      {editando === familia.id ? (
                        <div className="space-y-3 pt-1">
                          <div>
                            <label className="block text-xs text-text-secondary mb-1">
                              Usuario
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={usuario}
                                onChange={(e) => setUsuario(e.target.value)}
                                className="input-field flex-1"
                                autoComplete="off"
                              />
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => guardarUsuario(familia)}
                                className="px-3 rounded-xl text-sm bg-bg-card border border-border text-text-secondary hover:bg-bg-card-hover disabled:opacity-50"
                              >
                                Guardar
                              </button>
                            </div>
                          </div>

                          <div className="grid sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-text-secondary mb-1">
                                Contraseña nueva
                              </label>
                              <input
                                type="text"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="input-field"
                                placeholder="mínimo 8 caracteres"
                                autoComplete="new-password"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-text-secondary mb-1">
                                Repetir
                              </label>
                              <input
                                type="text"
                                value={password2}
                                onChange={(e) => setPassword2(e.target.value)}
                                className="input-field"
                                placeholder="la misma otra vez"
                                autoComplete="new-password"
                              />
                            </div>
                          </div>
                          <p className="text-[11px] text-text-muted">
                            Se muestra en texto plano a propósito: es la única vez que vas a poder
                            leerla, después queda hasheada.
                          </p>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={cerrarFormulario}
                              className="flex-1 py-2 rounded-xl text-sm bg-bg-card border border-border text-text-secondary hover:bg-bg-card-hover"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => guardarPassword(familia)}
                              className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-danger hover:opacity-90 disabled:opacity-50"
                            >
                              Cambiar contraseña
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditando(familia.id);
                              setUsuario(familia.username);
                              setPassword('');
                              setPassword2('');
                            }}
                            className="px-3 py-2 rounded-xl text-sm bg-bg-card border border-border text-text-secondary hover:bg-bg-card-hover"
                          >
                            🔑 Cambiar acceso
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => alternarAdmin(familia)}
                            className="px-3 py-2 rounded-xl text-sm bg-bg-card border border-border text-text-secondary hover:bg-bg-card-hover disabled:opacity-50"
                          >
                            {familia.esAdmin ? '🚫 Sacar admin' : '⭐ Hacer admin'}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
