'use client';

import { signOut } from 'next-auth/react';
import ProfileSelector from './ProfileSelector';

export default function Header() {
  return (
    <header className="sticky top-0 z-30 bg-bg-primary/80 backdrop-blur-lg border-b border-border">
      <div className="flex items-center justify-between px-4 lg:px-8 py-3">
        {/* Logo (mobile only) */}
        <h1 className="lg:hidden text-xl font-bold gradient-text">EconoApp</h1>

        {/* Spacer for desktop */}
        <div className="hidden lg:block" />

        {/* Profile selector + logout */}
        <div className="flex items-center gap-3">
          <ProfileSelector />
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="p-2 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-all duration-200"
            title="Cerrar sesión"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
