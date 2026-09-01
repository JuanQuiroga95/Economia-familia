import { cache } from 'react';
import { prisma } from './prisma';
import { getAccountId } from './session';
import { COBRO_ULTIMO_DIA } from './budgetPeriod';

/**
 * El día de cobro define de qué día a qué día va el mes en toda la app, así que
 * casi cualquier lectura lo necesita. Va con `cache` para no consultarlo una vez
 * por tarjeta del dashboard.
 */
export const getPaydayDeLaCuenta = cache(async (): Promise<number> => {
  const accountId = await getAccountId();
  return paydayDeCuenta(accountId);
});

/** Para el bot y el cron, que trabajan sobre cuentas ajenas a la sesión. */
export async function paydayDeCuenta(accountId: string | null | undefined): Promise<number> {
  if (!accountId) return COBRO_ULTIMO_DIA;
  const cuenta = await prisma.account.findUnique({
    where: { id: accountId },
    select: { payday: true },
  });
  return cuenta?.payday ?? COBRO_ULTIMO_DIA;
}
