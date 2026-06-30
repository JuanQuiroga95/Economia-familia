'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Inicio', icon: '🏠' },
  { href: '/ingresos', label: 'Ingresos', icon: '💰' },
  { href: '/gastos', label: 'Gastos', icon: '💸' },
  { href: '/ahorros', label: 'Ahorros', icon: '🏦' },
  { href: '/configuracion', label: 'Config', icon: '⚙️' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-secondary/95 backdrop-blur-lg border-t border-border">
      <div className="flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 py-2 px-3 min-w-[4rem] transition-all duration-200 ${
                isActive
                  ? 'text-accent'
                  : 'text-text-muted'
              }`}
            >
              <span className={`text-xl transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                {item.icon}
              </span>
              <span className={`text-[10px] font-medium ${isActive ? 'text-accent' : ''}`}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute top-0 w-8 h-0.5 bg-accent rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
