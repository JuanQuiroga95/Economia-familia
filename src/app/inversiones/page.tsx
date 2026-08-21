export const dynamic = 'force-dynamic';

import AppLayout from '@/components/layout/AppLayout';
import InversionesClient from './InversionesClient';
import { getInvestments } from '@/actions/investments';
import { getCurrentExchangeRate } from '@/actions/config';


export default async function InversionesPage() {
  const [investments, rates] = await Promise.all([
    getInvestments(),
    getCurrentExchangeRate(),
  ]);

  return (
    <AppLayout>
      <InversionesClient 
        initialInvestments={JSON.parse(JSON.stringify(investments))} 
        rates={rates}
      />
    </AppLayout>
  );
}
