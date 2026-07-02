'use client';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useEffect, Suspense, useRef } from 'react';

function MagicLinkContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const redirect = searchParams.get('redirect') || '/dashboard';
  const hasAttemptedSignIn = useRef(false);

  useEffect(() => {
    if (token && !hasAttemptedSignIn.current) {
      hasAttemptedSignIn.current = true;
      signIn('credentials', { token, callbackUrl: redirect });
    }
  }, [token, redirect]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-main">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-text-secondary text-lg">Iniciando sesión mágicamente...</p>
      </div>
    </div>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-bg-main">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>
    }>
      <MagicLinkContent />
    </Suspense>
  );
}
