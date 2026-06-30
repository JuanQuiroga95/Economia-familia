export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import IngresosClient from './IngresosClient';
import { getIncomes } from '@/actions/income';

export default async function IngresosPage() {
  const now = new Date();
  const incomes = await getIncomes({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });

  return (
    <AppLayout>
      <IngresosClient
        initialIncomes={JSON.parse(JSON.stringify(incomes))}
        currentMonth={now.getMonth() + 1}
        currentYear={now.getFullYear()}
      />
    </AppLayout>
  );
}
