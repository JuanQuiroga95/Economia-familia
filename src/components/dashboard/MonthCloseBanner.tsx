'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { carryOverBalance, sendBalanceToSavings, ignoreBalance } from '@/actions/monthClose';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { SavingsGoal } from '@prisma/client';

type MonthCloseBannerProps = {
  prevStatus: { month: number; year: number; balance: number };
  savingsGoals: SavingsGoal[];
};

export default function MonthCloseBanner({ prevStatus, savingsGoals }: MonthCloseBannerProps) {
  const confirmar = useConfirm();
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState('');

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const handleCarryOver = async () => {
    setLoading(true);
    const res = await carryOverBalance(prevStatus.month, prevStatus.year, prevStatus.balance);
    setLoading(false);
    if (res?.success) {
      toast.success('Saldo pasado a este mes');
    } else {
      toast.error(res?.error || 'Error al pasar saldo');
    }
  };

  const handleIgnore = async () => {
    const ok = await confirmar({
      titulo: '¿Ignorar este saldo?',
      detalle: 'No se suma al mes actual ni va a ahorros, y el aviso no vuelve a aparecer.',
      confirmar: 'Ignorar saldo',
    });
    if (!ok) return;
    setLoading(true);
    const res = await ignoreBalance(prevStatus.month, prevStatus.year);
    setLoading(false);
    if (res?.success) {
      toast.success('Saldo ignorado');
    } else {
      toast.error(res?.error || 'Error al ignorar saldo');
    }
  };

  const handleSavings = async () => {
    if (!selectedGoal) {
      toast.error('Selecciona una meta de ahorro');
      return;
    }
    setLoading(true);
    const res = await sendBalanceToSavings(prevStatus.month, prevStatus.year, prevStatus.balance, selectedGoal);
    setLoading(false);
    if (res?.success) {
      toast.success('Saldo enviado a ahorros');
      setShowModal(false);
    } else {
      toast.error(res?.error || 'Error al enviar a ahorros');
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-indigo-600/20 border border-indigo-500/50 rounded-2xl p-4 mb-6 backdrop-blur-md relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 z-0"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-white mb-1">
              🎉 ¡Te sobró saldo en {monthNames[prevStatus.month - 1]}!
            </h3>
            <p className="text-indigo-200">
              Tenés un balance positivo de <strong className="text-white">${prevStatus.balance.toLocaleString()}</strong>. ¿Qué querés hacer con este dinero?
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
            <button
              onClick={handleCarryOver}
              disabled={loading}
              className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              Pasar a este mes
            </button>
            <button
              onClick={() => setShowModal(true)}
              disabled={loading}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 border border-white/20"
            >
              Mandar a Ahorros
            </button>
            <button
              onClick={handleIgnore}
              disabled={loading}
              className="text-white/60 hover:text-white px-2 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
            >
              Ignorar
            </button>
          </div>
        </div>
      </motion.div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-[#1a1b2e] rounded-2xl p-6 w-full max-w-md shadow-2xl border border-white/10"
            >
              <h3 className="text-xl font-bold text-white mb-4">Enviar a Ahorros</h3>
              <p className="text-slate-300 mb-4">
                Selecciona a dónde quieres enviar los ${prevStatus.balance.toLocaleString()}
              </p>
              
              <div className="space-y-4 mb-6">
                <select
                  value={selectedGoal}
                  onChange={(e) => setSelectedGoal(e.target.value)}
                  className="w-full bg-[#0f111a] border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                >
                  <option value="">-- Seleccionar meta --</option>
                  {savingsGoals.map(g => (
                    <option key={g.id} value={g.id}>{g.name} ({g.currency})</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSavings}
                  disabled={loading || !selectedGoal}
                  className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-6 py-2 rounded-xl font-medium transition-colors"
                >
                  Confirmar Transferencia
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
