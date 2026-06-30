export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import AhorrosClient from './AhorrosClient';
import { getSavingsGoals, getPatrimonioStats } from '@/actions/savings';

export default async function AhorrosPage() {
  const [goals, patrimonio] = await Promise.all([
    getSavingsGoals(),
    getPatrimonioStats(),
  ]);

  return (
    <AppLayout>
      <AhorrosClient
        initialGoals={JSON.parse(JSON.stringify(goals))}
        patrimonio={patrimonio}
      />
    </AppLayout>
  );
}
