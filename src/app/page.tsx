'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary overflow-x-hidden selection:bg-accent/30">
      {/* Background glow effects */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-accent/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#8b5cf6]/20 blur-[120px]" />
      </div>

      {/* Navigation */}
      <nav className="container mx-auto px-6 py-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💸</span>
          <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-accent to-[#8b5cf6]">
            EconoApp
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-text-secondary hover:text-white transition-colors">
            Iniciar Sesión
          </Link>
          <Link href="/register" className="gradient-btn px-5 py-2 text-sm">
            Registrarse
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="container mx-auto px-6 pt-20 pb-32 relative z-10">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-16">
          <motion.div 
            className="flex-1 text-center lg:text-left"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight mb-6">
              El control total de tu <br className="hidden lg:block" />
              <span className="gradient-text">economía familiar</span>
            </h1>
            <p className="text-lg md:text-xl text-text-muted mb-10 max-w-2xl mx-auto lg:mx-0">
              Gestiona ingresos, gastos, ahorros e inversiones. Lleva un presupuesto compartido en pareja sin perder tu independencia financiera.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <Link href="/register" className="gradient-btn px-8 py-4 text-lg w-full sm:w-auto shadow-lg shadow-accent/25 hover:shadow-accent/40 text-center">
                Comenzar ahora
              </Link>
              <Link href="#features" className="px-8 py-4 text-lg font-medium text-text-secondary bg-bg-card border border-border rounded-xl hover:bg-bg-card-hover hover:text-white transition-all w-full sm:w-auto text-center">
                Saber más
              </Link>
            </div>
          </motion.div>

          <motion.div 
            className="flex-1 relative w-full max-w-lg mx-auto lg:max-w-none"
            initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1, delay: 0.2, type: "spring" }}
          >
            <div className="relative rounded-3xl overflow-hidden border border-border shadow-2xl shadow-accent/20">
              <Image 
                src="/mockup-dashboard.png" 
                alt="Dashboard Mockup" 
                width={800} 
                height={600}
                className="w-full h-auto object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-bg-primary/80 to-transparent pointer-events-none" />
            </div>
            
            {/* Floating badges */}
            <motion.div 
              className="absolute -bottom-6 -left-6 glass-card p-4 flex items-center gap-3 animate-bounce"
              style={{ animationDuration: '3s' }}
            >
              <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center text-success">
                <span className="text-xl">📈</span>
              </div>
              <div>
                <p className="text-sm font-bold">+15% Ahorro</p>
                <p className="text-xs text-text-muted">Este mes</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </main>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-6 py-24 relative z-10">
        <motion.div 
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Todo lo que necesitas en un solo lugar</h2>
          <p className="text-text-muted max-w-xl mx-auto">Diseñado para ser intuitivo, rápido y adaptarse perfectamente a tus necesidades financieras del día a día.</p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: '📊', title: 'Control de Gastos', desc: 'Registra tus gastos diarios con un toque. Categoriza y visualiza en qué se va tu dinero.' },
            { icon: '👥', title: 'Presupuesto Compartido', desc: 'Sincroniza cuentas con tu pareja. Dividan gastos compartidos manteniendo la privacidad de sus fondos personales.' },
            { icon: '🎯', title: 'Metas de Ahorro', desc: 'Crea "chanchitos" virtuales para tus objetivos. Separa el dinero y mira cómo crecen tus ahorros.' },
            { icon: '🌍', title: 'Inversiones y Divisas', desc: 'Gestiona plazos fijos, dólares, euros o cripto. Todo convertido a tu moneda local automáticamente.' }
          ].map((feature, i) => (
            <motion.div 
              key={i}
              className="glass-card p-8 flex flex-col items-center text-center group"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="w-16 h-16 rounded-2xl bg-bg-primary border border-border flex items-center justify-center text-3xl mb-6 group-hover:scale-110 group-hover:border-accent transition-all duration-300">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
              <p className="text-text-muted text-sm">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-8 relative z-10">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 opacity-50">
            <span className="text-xl">💸</span>
            <span className="font-bold">EconoApp</span>
          </div>
          <p className="text-sm text-text-muted">© {new Date().getFullYear()} EconoApp. Toma el control.</p>
        </div>
      </footer>
    </div>
  );
}
