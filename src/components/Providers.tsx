'use client';

import { SessionProvider } from 'next-auth/react';
import { ProfileProvider } from '@/hooks/useProfile';
import { Toaster } from 'react-hot-toast';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ProfileProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1e1b4b',
              color: '#e0e7ff',
              border: '1px solid rgba(129, 140, 248, 0.2)',
              borderRadius: '12px',
              fontSize: '14px',
            },
            success: {
              iconTheme: {
                primary: '#34d399',
                secondary: '#1e1b4b',
              },
            },
            error: {
              iconTheme: {
                primary: '#f87171',
                secondary: '#1e1b4b',
              },
            },
          }}
        />
      </ProfileProvider>
    </SessionProvider>
  );
}
