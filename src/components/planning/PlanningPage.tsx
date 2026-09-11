import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PlanningClient from './PlanningClient';
import { getPlanning } from '@/actions/planning';
import { getAccountId } from '@/lib/session';
import { getPaydayDeLaCuenta } from '@/lib/accountPeriod';
import { parseMonthYear } from '@/lib/monthParams';

export type PlanningPageProps = { searchParams: Promise<{ month?: string; year?: string; period?: string }> };

export default async function PlanningPage({ searchParams, analytics = false }: PlanningPageProps & { analytics?: boolean }) {
  if (!await getAccountId()) redirect('/login');
  const params = await searchParams;
  const { month, year } = parseMonthYear(params, await getPaydayDeLaCuenta());
  const period = ['month', 'half', 'year'].includes(params.period ?? '') ? params.period! : 'month';
  const data = await getPlanning(year, month);
  return <AppLayout><PlanningClient key={`${year}-${month}-${period}`} data={data} analytics={analytics} initialPeriod={period} /></AppLayout>;
}
