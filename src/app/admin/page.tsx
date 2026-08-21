export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import AdminClient from './AdminClient';
import { getAdminOverview } from '@/actions/admin';
import { getEstadoWebhook } from '@/actions/telegramWebhook';

export default async function AdminPage() {
  const [resumen, webhook] = await Promise.all([getAdminOverview(), getEstadoWebhook()]);

  // Sin permiso no se muestra que el panel existe: se manda al dashboard.
  if (!resumen) redirect('/dashboard');

  return (
    <AppLayout>
      <AdminClient resumen={resumen} webhook={webhook} />
    </AppLayout>
  );
}
