'use client';
export default function Error({ reset }: { reset: () => void }) {
  return <div role="alert" className="p-8 lg:ml-64"><h1 className="text-2xl font-bold">No pudimos cargar la planificación</h1><p className="mt-3 text-text-secondary">Revisá la conexión e intentá nuevamente.</p><button className="gradient-btn px-5 py-3 mt-5" onClick={reset}>Reintentar</button></div>;
}
