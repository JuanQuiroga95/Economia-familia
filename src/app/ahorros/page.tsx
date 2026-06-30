export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import AhorrosClient from './AhorrosClient';
import { getSavingsGoals } from '@/actions/savings';

export default async function AhorrosPage() {
  const goals = await getSavingsGoals();

  return (
    <AppLayout>
      <AhorrosClient initialGoals={JSON.parse(JSON.stringify(goals))} />
    </AppLayout>
  );
}
