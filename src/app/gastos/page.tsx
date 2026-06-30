export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import GastosClient from './GastosClient';
import { getExpenses, getCategories } from '@/actions/expenses';

export default async function GastosPage() {
  const now = new Date();
  const [expenses, categories] = await Promise.all([
    getExpenses({
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    }),
    getCategories(),
  ]);

  return (
    <AppLayout>
      <GastosClient
        initialExpenses={JSON.parse(JSON.stringify(expenses))}
        categories={JSON.parse(JSON.stringify(categories))}
      />
    </AppLayout>
  );
}
