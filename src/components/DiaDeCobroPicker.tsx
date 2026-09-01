'use client';

import {
  COBRO_ULTIMO_DIA,
  mesDePresupuesto,
  rangoMesDePresupuesto,
  textoDelPeriodo,
} from '@/lib/budgetPeriod';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

interface Props {
  /** Día elegido. `null` = usar el de la familia (sólo si se pasa `heredaDe`). */
  value: number | null;
  onChange: (valor: number | null) => void;
  /** Día de cobro de la familia, cuando esta persona puede heredarlo. */
  heredaDe?: number;
  disabled?: boolean;
}

/**
 * Elige el día de cobro y muestra en el momento qué días va a abarcar el mes.
 *
 * La regla de qué mes banca cada cobro (el de fin de mes banca el siguiente, el
 * de principio banca el que está en curso) es difícil de explicar con palabras,
 * así que en vez de explicarla se muestra el resultado.
 */
export default function DiaDeCobroPicker({ value, onChange, heredaDe, disabled }: Props) {
  const efectivo = value ?? heredaDe ?? COBRO_ULTIMO_DIA;

  const hoy = new Date();
  const mes = mesDePresupuesto(hoy, efectivo);
  const { startDate, endDate } = rangoMesDePresupuesto(mes.month, mes.year, efectivo);

  return (
    <div>
      <select
        value={value === null ? 'heredado' : String(value)}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value === 'heredado' ? null : Number(e.target.value))
        }
        className="input-field"
      >
        {heredaDe !== undefined && (
          <option value="heredado">
            Igual que la familia ({heredaDe === COBRO_ULTIMO_DIA ? 'último día del mes' : `día ${heredaDe}`})
          </option>
        )}
        <option value={COBRO_ULTIMO_DIA}>El último día del mes</option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((dia) => (
          <option key={dia} value={dia}>
            El día {dia}
          </option>
        ))}
      </select>

      <p className="text-xs text-text-muted mt-2">
        Así, {MESES[mes.month - 1]} va del{' '}
        <span className="text-text-secondary">{textoDelPeriodo(startDate, endDate)}</span>. Lo que
        gastes en esos días cuenta para ese mes.
      </p>
    </div>
  );
}
