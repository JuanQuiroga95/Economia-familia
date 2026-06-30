import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'EconoApp - Gestión Financiera',
  description: 'Aplicación de gestión financiera personal y de pareja. Controla tus ingresos, gastos, ahorros e inversiones.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0a0a1a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-bg-primary text-text-primary antialiased font-sans">
        <div className="bg-glow" />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
