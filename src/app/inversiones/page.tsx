export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import InversionesClient from './InversionesClient';
import { getInvestments } from '@/actions/investments';

export default async function InversionesPage() {
  const investments = await getInvestments();

  return (
    <AppLayout>
      <InversionesClient initialInvestments={JSON.parse(JSON.stringify(investments))} />
    </AppLayout>
  );
}
