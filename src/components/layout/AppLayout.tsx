'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import Header from '@/components/layout/Header';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
          <p className="text-text-muted text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-4 lg:p-8 pb-safe">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
