'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Las 4 secciones del día a día quedan a mano; el resto vive en el menú "Más".
const navItems = [
  { href: '/dashboard', label: 'Inicio', icon: '🏠' },
  { href: '/gastos', label: 'Gastos', icon: '💸' },
  { href: '/agenda', label: 'Agenda', icon: '🗓️' },
  { href: '/tarjetas', label: 'Tarjetas', icon: '💳' },
];

const moreItems = [
  { href: '/ingresos', label: 'Ingresos', icon: '💰' },
  { href: '/prestamos', label: 'Préstamos', icon: '🏦' },
  { href: '/ahorros', label: 'Ahorros', icon: '🏦' },
  { href: '/inversiones', label: 'Inversiones', icon: '📈' },
  { href: '/configuracion', label: 'Configuración', icon: '⚙️' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');
  const moreIsActive = moreItems.some((item) => isActive(item.href));

  return (
    <>
      {showMore && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowMore(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-bg-secondary border-t border-border rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
            <div className="grid grid-cols-3 gap-3">
              {moreItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setShowMore(false)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${
                    isActive(item.href)
                      ? 'bg-accent/20 text-accent border border-accent/20'
                      : 'bg-bg-card text-text-secondary border border-border'
                  }`}
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-[11px] font-medium text-center">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-secondary/95 backdrop-blur-lg border-t border-border">
        <div className="flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setShowMore(false)}
                className={`relative flex flex-col items-center gap-0.5 py-2 px-2 min-w-[3.25rem] transition-all duration-200 ${
                  active ? 'text-accent' : 'text-text-muted'
                }`}
              >
                <span className={`text-xl transition-transform duration-200 ${active ? 'scale-110' : ''}`}>
                  {item.icon}
                </span>
                <span className={`text-[10px] font-medium ${active ? 'text-accent' : ''}`}>
                  {item.label}
                </span>
                {active && <div className="absolute top-0 w-8 h-0.5 bg-accent rounded-full" />}
              </Link>
            );
          })}

          <button
            onClick={() => setShowMore(!showMore)}
            className={`relative flex flex-col items-center gap-0.5 py-2 px-2 min-w-[3.25rem] transition-all duration-200 ${
              showMore || moreIsActive ? 'text-accent' : 'text-text-muted'
            }`}
          >
            <span
              className={`text-xl transition-transform duration-200 ${
                showMore ? 'scale-110 rotate-90' : ''
              }`}
            >
              {showMore ? '✕' : '⋯'}
            </span>
            <span className={`text-[10px] font-medium ${showMore || moreIsActive ? 'text-accent' : ''}`}>
              Más
            </span>
            {moreIsActive && !showMore && (
              <div className="absolute top-0 w-8 h-0.5 bg-accent rounded-full" />
            )}
          </button>
        </div>
      </nav>
    </>
  );
}
