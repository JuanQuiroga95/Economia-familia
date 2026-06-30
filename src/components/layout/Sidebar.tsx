'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Inicio', icon: '🏠' },
  { href: '/ingresos', label: 'Ingresos', icon: '💰' },
  { href: '/gastos', label: 'Gastos', icon: '💸' },
  { href: '/ahorros', label: 'Ahorros', icon: '🏦' },
  { href: '/inversiones', label: 'Más', icon: '📊' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen fixed left-0 top-0 bg-bg-secondary border-r border-border z-40">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <h1 className="text-2xl font-bold gradient-text">EconoApp</h1>
        <p className="text-xs text-text-muted mt-1">Gestión Financiera</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-accent/20 to-transparent text-accent border border-accent/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* Extra items for desktop sidebar */}
        <Link
          href="/inversiones"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
            pathname === '/inversiones'
              ? 'bg-gradient-to-r from-accent/20 to-transparent text-accent border border-accent/20'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
          }`}
        >
          <span className="text-lg">📈</span>
          <span>Inversiones</span>
        </Link>

        <Link
          href="/configuracion"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
            pathname === '/configuracion'
              ? 'bg-gradient-to-r from-accent/20 to-transparent text-accent border border-accent/20'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
          }`}
        >
          <span className="text-lg">⚙️</span>
          <span>Configuración</span>
        </Link>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <p className="text-xs text-text-muted text-center">
          Juan & Tania © {new Date().getFullYear()}
        </p>
      </div>
    </aside>
  );
}
