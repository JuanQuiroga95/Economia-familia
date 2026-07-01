'use client';

import { useEffect } from 'react';
import { signOut } from 'next-auth/react';

export default function LogoutPage() {
  useEffect(() => {
    signOut({ callbackUrl: '/login' });
  }, []);

  return (
    <div className="flex h-screen items-center justify-center bg-bg-primary text-text-primary">
      <p>Cerrando sesión...</p>
    </div>
  );
}
