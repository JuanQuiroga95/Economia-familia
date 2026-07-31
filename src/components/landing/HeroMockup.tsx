'use client';
import { motion } from 'framer-motion';

export default function HeroMockup() {
  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* Phone Frame */}
      <div className="relative rounded-[2.5rem] bg-bg-primary border-4 border-border shadow-2xl shadow-accent/30 overflow-hidden w-full aspect-[9/19] flex flex-col font-sans">
        
        {/* Status Bar Mock */}
        <div className="h-6 w-full flex justify-between items-center px-6 pt-2 text-[10px] text-text-muted font-medium z-20">
          <span>9:41</span>
          <div className="flex gap-1.5 items-center">
            <span className="text-[8px]">📶</span>
            <span className="text-[8px]">🔋</span>
          </div>
        </div>

        {/* Dynamic Island / Notch Mock */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full z-20" />

        {/* App Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar pb-8 pt-4 px-4 relative z-10 space-y-4">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">💸</span>
              <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-accent to-[#8b5cf6]">
                EconoApp
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm border border-accent/30">
              👤
            </div>
          </div>

          {/* Main Balance Card */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl p-4 bg-gradient-to-br from-accent/20 to-transparent border border-accent/20 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-2xl -mr-10 -mt-10" />
            <p className="text-xs text-text-secondary mb-1">Balance General</p>
            <h2 className="text-3xl font-bold text-white mb-2">$1.245.500</h2>
            <div className="flex gap-2">
              <span className="text-[10px] px-2 py-1 bg-success/20 text-success rounded-full font-medium">+12% este mes</span>
            </div>
          </motion.div>

          {/* Categorías */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex justify-between items-center mb-2 px-1">
              <h3 className="text-xs font-semibold text-text-secondary">Categorías</h3>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { icon: '🛒', name: 'Super', color: '#3b82f6' },
                { icon: '⛽', name: 'Transp', color: '#f59e0b' },
                { icon: '🍕', name: 'Comida', color: '#ef4444' },
                { icon: '➕', name: 'Más', color: '#8b5cf6' },
              ].map((cat, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div 
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-lg"
                    style={{ backgroundColor: `${cat.color}20`, border: `1px solid ${cat.color}40` }}
                  >
                    {cat.icon}
                  </div>
                  <span className="text-[10px] text-text-muted">{cat.name}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Gastos Recientes */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-2"
          >
            <div className="flex justify-between items-center mb-1 px-1 mt-4">
              <h3 className="text-xs font-semibold text-text-secondary">Recientes</h3>
              <span className="text-[10px] text-accent">Ver todo</span>
            </div>
            
            {[
              { desc: 'Coto semanal', amount: -45000, date: 'Hoy', icon: '🛒', color: '#3b82f6', type: 'COMPARTIDO' },
              { desc: 'Nafta YPF', amount: -28000, date: 'Ayer', icon: '⛽', color: '#f59e0b', type: 'PROPIO' },
              { desc: 'Sueldo', amount: 850000, date: 'Mar 1', icon: '💰', color: '#10b981', type: 'PROPIO', isIncome: true },
            ].map((tx, i) => (
              <div key={i} className="rounded-xl p-3 bg-bg-card border border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base" style={{ backgroundColor: `${tx.color}20` }}>
                    {tx.icon}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-text-primary leading-tight">{tx.desc}</p>
                    <div className="flex gap-1 items-center mt-0.5">
                      <span className="text-[9px] text-text-muted">{tx.date}</span>
                      {tx.type === 'COMPARTIDO' && <span className="text-[8px] px-1 bg-accent/20 text-accent rounded-sm">👥</span>}
                    </div>
                  </div>
                </div>
                <span className={`text-xs font-semibold ${tx.isIncome ? 'text-success' : 'text-text-primary'}`}>
                  {tx.isIncome ? '+' : '-'}${Math.abs(tx.amount).toLocaleString('es-AR')}
                </span>
              </div>
            ))}
          </motion.div>

        </div>
        
        {/* Bottom Nav Mock */}
        <div className="absolute bottom-0 left-0 w-full h-16 bg-bg-card/90 backdrop-blur-md border-t border-border flex justify-around items-center px-4 pb-2 z-20">
          <div className="text-accent flex flex-col items-center">
            <span className="text-lg">📊</span>
            <span className="text-[8px] mt-0.5 font-medium">Inicio</span>
          </div>
          <div className="text-text-muted flex flex-col items-center">
            <span className="text-lg">👥</span>
            <span className="text-[8px] mt-0.5">Pareja</span>
          </div>
          <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center text-white -mt-5 shadow-lg shadow-accent/50 text-xl border-4 border-bg-primary">
            +
          </div>
          <div className="text-text-muted flex flex-col items-center">
            <span className="text-lg">🎯</span>
            <span className="text-[8px] mt-0.5">Metas</span>
          </div>
          <div className="text-text-muted flex flex-col items-center">
            <span className="text-lg">📈</span>
            <span className="text-[8px] mt-0.5">Invers.</span>
          </div>
        </div>
      </div>
      
      {/* Floating badges */}
      <motion.div 
        className="absolute -bottom-4 -left-6 rounded-xl bg-bg-card/95 backdrop-blur-xl border border-border p-3 flex items-center gap-3 shadow-xl z-30"
        initial={{ y: 0 }}
        animate={{ y: [-5, 5, -5] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center text-success text-sm">
          💵
        </div>
        <div>
          <p className="text-[10px] font-bold text-white">Efectivo vs Transf.</p>
          <p className="text-[8px] text-text-muted">Control total</p>
        </div>
      </motion.div>
      
      <motion.div 
        className="absolute top-1/4 -right-8 rounded-xl bg-bg-card/95 backdrop-blur-xl border border-border p-3 flex items-center gap-3 shadow-xl z-30"
        initial={{ y: 0 }}
        animate={{ y: [5, -5, 5] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      >
        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm">
          👥
        </div>
        <div>
          <p className="text-[10px] font-bold text-white">Juan pagó $28k</p>
          <p className="text-[8px] text-text-muted">Gasto compartido</p>
        </div>
      </motion.div>
    </div>
  );
}
