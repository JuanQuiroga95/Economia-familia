'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Confirmación visual, para reemplazar los `window.confirm` grises del
 * navegador. Se usa como una promesa:
 *
 *   const confirmar = useConfirm();
 *   if (!(await confirmar({ titulo: '¿Borrar el gasto?' }))) return;
 *
 * Y cuando además hay que pedir un monto (reemplaza a `window.prompt`):
 *
 *   const pedirMonto = usePedirMonto();
 *   const monto = await pedirMonto({ titulo: '¿Cuánto rescatás?', ... });
 *   if (monto === null) return;
 */

export interface ConfirmOptions {
  titulo: string;
  /** Detalle debajo del título. Acepta varias líneas. */
  detalle?: string;
  /** Texto del botón que sigue adelante. */
  confirmar?: string;
  cancelar?: string;
  /** `peligro` pinta el botón en rojo: borrados y cosas que no se deshacen. */
  tono?: 'normal' | 'peligro';
  /** Datos a repasar antes de aceptar (ej: monto, categoría, fecha). */
  resumen?: { etiqueta: string; valor: string }[];
  /**
   * Pide un monto además de confirmar. Reemplaza los `window.prompt`:
   * el resultado llega en `monto` y el botón queda deshabilitado si no es
   * un número válido dentro del máximo.
   */
  pedirMonto?: { etiqueta: string; maximo?: number; moneda?: string };
}

export interface ConfirmResult {
  ok: boolean;
  monto?: number;
}

type Resolver = (r: ConfirmResult) => void;

interface ConfirmApi {
  /** true si apretó el botón de confirmar. */
  confirmar: (opts: ConfirmOptions) => Promise<boolean>;
  /** El monto ingresado, o null si canceló. */
  pedirMonto: (opts: ConfirmOptions & { pedirMonto: NonNullable<ConfirmOptions['pedirMonto']> }) => Promise<number | null>;
}

const ConfirmContext = createContext<ConfirmApi | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [monto, setMonto] = useState('');
  const resolverRef = useRef<Resolver | null>(null);

  const abrir = useCallback((options: ConfirmOptions) => {
    setMonto('');
    setOpts(options);
    return new Promise<ConfirmResult>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  // Dos funciones distintas a propósito: si `confirmar` devolviera el objeto,
  // el `if (!ok)` de cada llamada sería siempre falso (todo objeto es truthy)
  // y TypeScript no lo marcaría.
  const api = useMemo<ConfirmApi>(
    () => ({
      confirmar: async (options) => (await abrir(options)).ok,
      pedirMonto: async (options) => {
        const r = await abrir(options);
        return r.ok && r.monto !== undefined ? r.monto : null;
      },
    }),
    [abrir]
  );

  const cerrar = useCallback(
    (ok: boolean, valor?: number) => {
      resolverRef.current?.({ ok, monto: valor });
      resolverRef.current = null;
      setOpts(null);
      setMonto('');
    },
    []
  );

  const peligro = opts?.tono === 'peligro';
  const numero = Number.parseFloat(monto.replace(',', '.'));
  const montoValido =
    !opts?.pedirMonto ||
    (Number.isFinite(numero) &&
      numero > 0 &&
      (opts.pedirMonto.maximo === undefined || numero <= opts.pedirMonto.maximo));

  return (
    <ConfirmContext.Provider value={api}>
      {children}

      <AnimatePresence>
        {opts && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => cerrar(false)}
            role="dialog"
            aria-modal="true"
            aria-label={opts.titulo}
          >
            <motion.div
              className="glass-card w-full max-w-md p-5 space-y-4"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-xl ${
                    peligro ? 'bg-danger/20' : 'bg-accent/20'
                  }`}
                >
                  {peligro ? '🗑️' : '❓'}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-text-primary">{opts.titulo}</h3>
                  {opts.detalle && (
                    <p className="text-sm text-text-muted mt-1 whitespace-pre-line">
                      {opts.detalle}
                    </p>
                  )}
                </div>
              </div>

              {opts.resumen && opts.resumen.length > 0 && (
                <div className="rounded-xl bg-bg-input/60 border border-border divide-y divide-border">
                  {opts.resumen.map((fila) => (
                    <div
                      key={fila.etiqueta}
                      className="flex items-baseline justify-between gap-4 px-3 py-2"
                    >
                      <span className="text-xs text-text-muted shrink-0">{fila.etiqueta}</span>
                      <span className="text-sm font-medium text-text-primary text-right break-words">
                        {fila.valor}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {opts.pedirMonto && (
                <div>
                  <label className="block text-xs text-text-secondary mb-1">
                    {opts.pedirMonto.etiqueta}
                    {opts.pedirMonto.maximo !== undefined && (
                      <span className="text-text-muted">
                        {' '}
                        · máximo {opts.pedirMonto.moneda || '$'}
                        {opts.pedirMonto.maximo.toLocaleString('es-AR')}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && montoValido) cerrar(true, numero);
                    }}
                    className="input-field"
                    placeholder="0"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => cerrar(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-bg-card border border-border text-text-secondary hover:bg-bg-card-hover transition-colors"
                >
                  {opts.cancelar || 'Cancelar'}
                </button>
                <button
                  type="button"
                  autoFocus={!opts.pedirMonto}
                  disabled={!montoValido}
                  onClick={() => cerrar(true, opts.pedirMonto ? numero : undefined)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 ${
                    peligro ? 'bg-danger' : 'bg-accent'
                  }`}
                >
                  {opts.confirmar || 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

function useConfirmApi() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm necesita estar dentro de ConfirmProvider');
  return ctx;
}

export function useConfirm() {
  return useConfirmApi().confirmar;
}

export function usePedirMonto() {
  return useConfirmApi().pedirMonto;
}
