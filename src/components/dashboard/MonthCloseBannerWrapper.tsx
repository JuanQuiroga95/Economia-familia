import { checkPreviousMonthStatus } from '@/actions/monthClose';
import { prisma } from '@/lib/prisma';
import MonthCloseBanner from './MonthCloseBanner';
import { getAccountId } from '@/lib/session';
import { getArgDate, getCurrentFinancialMonth } from '@/lib/dateUtils';
import { getPaydayDeLaCuenta } from '@/lib/accountPeriod';

export default async function MonthCloseBannerWrapper({ currentMonth, currentYear }: { currentMonth: number, currentYear: number }) {
  const accountId = await getAccountId();
  if (!accountId) return null;

  // Solo mostrar banner si estamos viendo el mes actual real, no en meses
  // históricos. Va en hora argentina: con la del servidor (UTC), después de
  // las 21 del último día del mes el cartel no aparecía.
  const { month: realCurrentMonth, year: realCurrentYear } = getCurrentFinancialMonth(
    getArgDate(),
    await getPaydayDeLaCuenta()
  );

  if (currentMonth !== realCurrentMonth || currentYear !== realCurrentYear) {
    return null;
  }

  const prevStatus = await checkPreviousMonthStatus(currentMonth, currentYear);
  if (!prevStatus) return null;

  // Obtener metas de ahorro de la cuenta para mostrar en el modal
  const savingsGoals = await prisma.savingsGoal.findMany({
    where: { accountId },
    orderBy: { name: 'asc' }
  });

  return (
    <MonthCloseBanner 
      prevStatus={prevStatus} 
      savingsGoals={savingsGoals} 
    />
  );
}
