'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import HeroMockup from '@/components/landing/HeroMockup';

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
          <Link href="/register" className="gradient-btn px-5 py-2 text-sm hidden sm:block">
            Registrarse
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="container mx-auto px-6 pt-16 pb-24 relative z-10">
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
                Ver características
              </Link>
            </div>
          </motion.div>

          <motion.div 
            className="flex-1 relative w-full max-w-lg mx-auto lg:max-w-none pt-10 lg:pt-0"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2, type: "spring" }}
          >
            <HeroMockup />
          </motion.div>
        </div>
      </main>

      {/* Detailed Features Section */}
      <section id="features" className="container mx-auto px-6 py-24 relative z-10">
        <motion.div 
          className="text-center mb-20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Un ecosistema financiero completo</h2>
          <p className="text-text-muted max-w-2xl mx-auto text-lg">Diseñado para ser intuitivo, rápido y adaptarse perfectamente a todas las necesidades financieras de tu día a día, solo o en pareja.</p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          
          {/* Feature 1 */}
          <motion.div 
            className="glass-card p-8 lg:p-10 group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-bg-primary border border-accent/30 flex items-center justify-center text-3xl group-hover:scale-110 group-hover:border-accent transition-all duration-300">
                📊
              </div>
              <h3 className="text-2xl font-bold">Gestión de Gastos e Ingresos</h3>
            </div>
            <p className="text-text-muted leading-relaxed mb-4">
              Registra tus movimientos diarios en segundos. Mantén un historial limpio y organizado con <strong>categorías personalizables</strong>.
            </p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex items-start gap-2"><span>✓</span> <span>Diferencia entre pagos en <strong>Efectivo</strong> y <strong>Transferencia</strong>.</span></li>
              <li className="flex items-start gap-2"><span>✓</span> <span>Sube fotos de tus comprobantes o tickets.</span></li>
              <li className="flex items-start gap-2"><span>✓</span> <span>Organiza el dinero en distintas Billeteras o Bancos.</span></li>
            </ul>
          </motion.div>

          {/* Feature 2 */}
          <motion.div 
            className="glass-card p-8 lg:p-10 group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-bg-primary border border-accent/30 flex items-center justify-center text-3xl group-hover:scale-110 group-hover:border-accent transition-all duration-300">
                👥
              </div>
              <h3 className="text-2xl font-bold">Presupuesto en Pareja</h3>
            </div>
            <p className="text-text-muted leading-relaxed mb-4">
              Sincroniza tu cuenta con tu pareja para gestionar un <strong>fondo común</strong> sin perder la privacidad de tus gastos personales.
            </p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex items-start gap-2"><span>✓</span> <span>Divide gastos equitativamente (50/50) o por porcentajes (Ej: 70/30).</span></li>
              <li className="flex items-start gap-2"><span>✓</span> <span>Botón <strong>"Pagué Yo"</strong>: el sistema calcula automáticamente quién debe a quién.</span></li>
              <li className="flex items-start gap-2"><span>✓</span> <span>Recibe <strong>Notificaciones Push</strong> cuando el otro registre un movimiento.</span></li>
            </ul>
          </motion.div>

          {/* Feature 3 */}
          <motion.div 
            className="glass-card p-8 lg:p-10 group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-bg-primary border border-accent/30 flex items-center justify-center text-3xl group-hover:scale-110 group-hover:border-accent transition-all duration-300">
                🎯
              </div>
              <h3 className="text-2xl font-bold">Metas de Ahorro</h3>
            </div>
            <p className="text-text-muted leading-relaxed mb-4">
              Crea objetivos financieros ("chanchitos" virtuales) para ese viaje, computadora nueva o fondo de emergencias.
            </p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex items-start gap-2"><span>✓</span> <span>Separa dinero mes a mes para acercarte a tu objetivo.</span></li>
              <li className="flex items-start gap-2"><span>✓</span> <span>Mira tu progreso con barras de porcentaje claras.</span></li>
              <li className="flex items-start gap-2"><span>✓</span> <span>Maneja ahorros en tu moneda local o en divisas fuertes.</span></li>
            </ul>
          </motion.div>

          {/* Feature 4 */}
          <motion.div 
            className="glass-card p-8 lg:p-10 group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-bg-primary border border-accent/30 flex items-center justify-center text-3xl group-hover:scale-110 group-hover:border-accent transition-all duration-300">
                🌍
              </div>
              <h3 className="text-2xl font-bold">Inversiones y Multimoneda</h3>
            </div>
            <p className="text-text-muted leading-relaxed mb-4">
              Soporte nativo para <strong>Pesos (ARS), Dólares (USD) y Euros (EUR)</strong>. El sistema convierte todo automáticamente para darte un balance real.
            </p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex items-start gap-2"><span>✓</span> <span>Registra Plazos Fijos, Fondos Comunes de Inversión, Bonos o Cripto.</span></li>
              <li className="flex items-start gap-2"><span>✓</span> <span>Calcula tasas de retorno (TNA) y fechas de vencimiento.</span></li>
              <li className="flex items-start gap-2"><span>✓</span> <span>El Dashboard unifica todo tu patrimonio.</span></li>
            </ul>
          </motion.div>

          {/* Feature 5 */}
          <motion.div 
            className="glass-card p-8 lg:p-10 group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-bg-primary border border-accent/30 flex items-center justify-center text-3xl group-hover:scale-110 group-hover:border-accent transition-all duration-300">
                🤖
              </div>
              <h3 className="text-2xl font-bold">Bot de Telegram Integrado</h3>
            </div>
            <p className="text-text-muted leading-relaxed mb-4">
              Controlá tus gastos sin siquiera abrir la aplicación utilizando nuestro asistente virtual integrado en Telegram.
            </p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex items-start gap-2"><span>✓</span> <span>Cargá gastos al instante enviando un simple <strong>mensaje de texto o audio</strong>.</span></li>
              <li className="flex items-start gap-2"><span>✓</span> <span>Consultá tu balance actual con un comando rápido.</span></li>
              <li className="flex items-start gap-2"><span>✓</span> <span>Ideal para registros rápidos en la calle o supermercado.</span></li>
            </ul>
          </motion.div>

          {/* Feature 6 */}
          <motion.div 
            className="glass-card p-8 lg:p-10 group"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-bg-primary border border-accent/30 flex items-center justify-center text-3xl group-hover:scale-110 group-hover:border-accent transition-all duration-300">
                🔔
              </div>
              <h3 className="text-2xl font-bold">Notificaciones y Alertas</h3>
            </div>
            <p className="text-text-muted leading-relaxed mb-4">
              Mantené el control absoluto en tiempo real. Nunca más te vas a olvidar de anotar un gasto o de que se te venza un plazo fijo.
            </p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex items-start gap-2"><span>✓</span> <span>Recibí notificaciones Push en tu celular cuando tu pareja carga un gasto.</span></li>
              <li className="flex items-start gap-2"><span>✓</span> <span>Avisos de vencimientos y cierres de mes.</span></li>
              <li className="flex items-start gap-2"><span>✓</span> <span>Seguridad y privacidad garantizada sin instalaciones complejas.</span></li>
            </ul>
          </motion.div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="container mx-auto px-6 py-20 relative z-10 text-center">
        <motion.div 
          className="glass-card p-12 md:p-16 max-w-4xl mx-auto rounded-[3rem] border border-accent/30 bg-gradient-to-b from-bg-card to-bg-primary relative overflow-hidden"
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-accent to-transparent" />
          <h2 className="text-3xl md:text-5xl font-bold mb-6">¿Listo para ordenar tus números?</h2>
          <p className="text-text-muted text-lg mb-10 max-w-xl mx-auto">Únete a la nueva forma de entender y administrar tus finanzas personales y en pareja.</p>
          <Link href="/register" className="gradient-btn px-10 py-5 text-xl shadow-xl shadow-accent/20 hover:shadow-accent/40 hover:scale-105 transition-all inline-block">
            Crear mi cuenta gratis
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-10 relative z-10">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="flex items-center gap-2 opacity-50">
            <span className="text-xl">💸</span>
            <span className="font-bold">EconoApp</span>
          </div>
          <p className="text-sm text-text-muted">© {new Date().getFullYear()} EconoApp. Finanzas Inteligentes.</p>
        </div>
      </footer>
    </div>
  );
}
