'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import toast from 'react-hot-toast';
import { savePlanning } from '@/actions/planning';
import { MONTHS, periodMonths, variance, type PlanningData } from '@/lib/planning';

const money = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
const keyOf = (id: string, month: number) => `${id}:${month}`;
const chartStyle = { background: '#111133', border: '1px solid #454575', borderRadius: 12, color: '#e0e7ff' };

export default function PlanningClient({ data, analytics, initialPeriod }: { data: PlanningData; analytics: boolean; initialPeriod: string }) {
  const router = useRouter();
  const [period, setPeriod] = useState(initialPeriod);
  const [month, setMonth] = useState(data.month);
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(data.budgets.map(b => [keyOf(b.categoryId, b.month), String(b.amount)])));
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [adjustment, setAdjustment] = useState('0');
  const months = periodMonths(month, period);
  const href = (path: string) => `${path}?year=${data.year}&month=${month}&period=${period}`;
  useEffect(() => {
    if (!dirty.size) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const guardLink = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (!anchor || anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
      if (!window.confirm('Hay cambios sin guardar. ¿Querés salir y descartarlos?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guardLink, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guardLink, true);
    };
  }, [dirty]);
  const actualMap = new Map(data.actuals.map(a => [keyOf(a.categoryId, a.month), a.amount]));
  const rows = data.categories.map(category => {
    const planned = months.reduce((sum, m) => sum + (Number(draft[keyOf(category.id, m)]) || 0), 0);
    const actual = months.reduce((sum, m) => sum + (actualMap.get(keyOf(category.id, m)) ?? 0), 0);
    const configured = months.filter(m => draft[keyOf(category.id, m)] !== undefined && draft[keyOf(category.id, m)] !== '').length;
    const unplanned = months.reduce((sum, m) => sum + ((draft[keyOf(category.id, m)] === undefined || draft[keyOf(category.id, m)] === '') ? actualMap.get(keyOf(category.id, m)) ?? 0 : 0), 0);
    return { ...category, planned, actual, configured, unplanned, ...variance(planned, actual) };
  });
  const planned = rows.reduce((sum, row) => sum + row.planned, 0);
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const unplanned = rows.reduce((sum, row) => sum + row.unplanned, 0);
  const income = months.reduce((sum, m) => sum + data.incomes[m - 1], 0);
  const execution = variance(planned, actual).execution;
  const chartData = months.map(m => ({
    name: MONTHS[m - 1],
    Presupuesto: data.categories.reduce((sum, c) => sum + (Number(draft[keyOf(c.id, m)]) || 0), 0),
    Real: data.categories.reduce((sum, c) => sum + (actualMap.get(keyOf(c.id, m)) ?? 0), 0),
    Ingresos: data.incomes[m - 1],
  }));
  const ranked = [...rows].filter(row => row.planned || row.actual).sort((a, b) => a.available - b.available);
  const configured = rows.reduce((sum, row) => sum + row.configured, 0);
  const elapsed = months.filter(m => data.year < data.currentYear || (data.year === data.currentYear && m < data.currentMonth));
  const isOpen = data.year === data.currentYear && months.includes(data.currentMonth);
  const future = data.year > data.currentYear || (data.year === data.currentYear && months[0] > data.currentMonth);

  function edit(id: string, m: number, value: string) {
    const key = keyOf(id, m);
    setDraft(prev => ({ ...prev, [key]: value }));
    setDirty(prev => new Set(prev).add(key));
  }
  function fill(source: 'actual' | 'agenda' | 'repeat') {
    const updates: Record<string, string> = {};
    const factor = 1 + Number(adjustment) / 100;
    if (!Number.isFinite(factor) || factor < 0 || factor > 11) { toast.error('El ajuste debe estar entre -100% y 1000%.'); return; }
    for (const category of data.categories) for (const m of months) {
      const key = keyOf(category.id, m);
      if (draft[key] !== undefined && draft[key] !== '') continue;
      let amount: number | undefined;
      if (source === 'actual') amount = actualMap.get(key);
      if (source === 'agenda') {
        const entries = data.agenda.filter(a => a.categoryId === category.id && a.month === m);
        if (entries.length) amount = entries.reduce((sum, a) => sum + a.amount, 0);
      }
      if (source === 'repeat') {
        const base = draft[keyOf(category.id, months[0])];
        if (base !== undefined && base !== '') amount = Number(base) * factor ** (m - months[0]);
      }
      if (amount !== undefined && Number.isFinite(amount)) updates[key] = String(Math.round(amount * 100) / 100);
    }
    setDraft(prev => ({ ...prev, ...updates }));
    setDirty(prev => new Set([...prev, ...Object.keys(updates)]));
    toast(Object.keys(updates).length ? `${Object.keys(updates).length} importes preparados. Revisalos y guardá.` : 'No hay celdas vacías con datos disponibles.');
  }
  function save() {
    const cells = [...dirty].map(key => {
      const separator = key.lastIndexOf(':');
      return { categoryId: key.slice(0, separator), month: Number(key.slice(separator + 1)), amount: draft[key] === '' ? null : Number(draft[key]) };
    });
    startTransition(async () => {
      try {
        const result = await savePlanning(data.year, cells);
        if (!result.success) { toast.error(result.error ?? 'No se pudo guardar.'); return; }
        setDirty(new Set());
        toast.success('Presupuesto guardado. Analítica actualizada.');
        router.refresh();
      } catch { toast.error('No se pudo conectar. Tus cambios siguen en pantalla.'); }
    });
  }
  function exportCsv() {
    const records = [['Categoría', 'Mes', 'Año', 'Moneda', 'Presupuesto', 'Real', 'Disponible']];
    for (const row of rows) for (const m of months) {
      const value = draft[keyOf(row.id, m)];
      const actualValue = actualMap.get(keyOf(row.id, m)) ?? 0;
      records.push([row.name, MONTHS[m - 1], String(data.year), 'ARS', value ?? '', String(actualValue), value === undefined || value === '' ? '' : String(Number(value) - actualValue)]);
    }
    const csv = records.map(row => row.map(value => `"${(/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `presupuesto-${data.year}-${period}-${month}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <div className="space-y-6 max-w-[1600px] mx-auto">
    <section className="glass-card p-6 lg:p-8 relative overflow-hidden">
      <div className="absolute -right-16 -top-24 w-72 h-72 bg-accent/10 blur-3xl rounded-full pointer-events-none" />
      <div className="flex flex-wrap justify-between items-start gap-4 relative">
        <div><p className="text-xs uppercase tracking-[0.22em] text-accent mb-3">Planificación familiar · ARS</p><h1 className="text-3xl font-bold">{analytics ? 'Cada peso, en perspectiva.' : 'Un plan para lo que viene.'}</h1><p className="text-text-secondary mt-3 max-w-2xl">{analytics ? 'Compará tus objetivos con los gastos registrados y detectá dónde ajustar.' : 'Asigná un propósito a tus gastos. Construí el año mes a mes, con espacio para lo cotidiano y lo extraordinario.'}</p></div>
        <button onClick={exportCsv} disabled={!!dirty.size || pending} className="border border-border rounded-xl px-4 py-2 text-sm disabled:opacity-40" title={dirty.size ? 'Guardá los cambios antes de exportar' : 'Descargar detalle mensual'}>↓ Exportar CSV</button>
      </div>
      <nav aria-label="Planificación" className="flex gap-2 mt-6"><Link href={href('/presupuesto')} className={`px-4 py-2 rounded-xl text-sm ${!analytics ? 'bg-accent text-white' : 'bg-bg-input text-text-secondary'}`}>▦ Presupuesto</Link><Link href={href('/analitica')} className={`px-4 py-2 rounded-xl text-sm ${analytics ? 'bg-accent text-white' : 'bg-bg-input text-text-secondary'}`}>↗ Analítica</Link></nav>
    </section>

    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs text-text-secondary">Horizonte<select className="input-field mt-1" value={period} onChange={e => setPeriod(e.target.value)}><option value="month">Mensual</option><option value="half">Semestral</option><option value="year">Anual</option></select></label>
      <label className="text-xs text-text-secondary">Año<select className="input-field mt-1" disabled={pending} value={data.year} onChange={e => { if (!dirty.size || window.confirm('Hay cambios sin guardar. ¿Querés cambiar de año y descartarlos?')) router.push(`${analytics ? '/analitica' : '/presupuesto'}?year=${e.target.value}&month=${month}&period=${period}`); }}>{Array.from(new Set([data.year, ...Array.from({ length: 11 }, (_, i) => data.currentYear - 5 + i)])).filter(y => y >= 2000 && y <= 2100).sort().map(y => <option key={y}>{y}</option>)}</select></label>
      {period !== 'year' && <label className="text-xs text-text-secondary">{period === 'half' ? 'Semestre' : 'Mes'}<select className="input-field mt-1" value={period === 'half' ? (month <= 6 ? 1 : 7) : month} onChange={e => setMonth(Number(e.target.value))}>{period === 'half' ? <><option value={1}>Enero – junio</option><option value={7}>Julio – diciembre</option></> : MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select></label>}
      <span className="text-xs px-3 py-2 rounded-full border border-border mb-1 text-text-secondary">{future ? 'Período futuro' : isOpen ? 'Período en curso · datos parciales' : 'Período transcurrido'} · {months.length} {months.length === 1 ? 'mes' : 'meses'}</span>
    </div>

    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {[['Gastos presupuestados', money(planned), `${configured} asignaciones mensuales`, 'text-accent'], ['Gastos reales', money(actual), 'Pagos registrados en el período', 'text-text-primary'], ['Disponible del plan', money(planned - actual), planned < actual ? 'El gasto supera lo planificado' : 'Presupuesto menos gasto real', planned < actual ? 'text-danger' : 'text-success'], ['Ejecución', execution === null ? 'Sin base' : `${execution.toFixed(1)}%`, 'Gasto real / presupuesto total', execution !== null && execution > 100 ? 'text-danger' : 'text-info']].map(([title, value, detail, color]) => <div className="glass-card p-4 lg:p-5" key={title}><p className="text-xs text-text-secondary">{title}</p><p className={`text-xl lg:text-2xl font-bold mt-3 break-words ${color}`}>{value}</p><p className="text-xs text-text-muted mt-2">{detail}</p></div>)}
    </div>

    {!analytics && <section className="glass-card p-5 space-y-4">
      <div><h2 className="font-semibold">Construí tu presupuesto</h2><p className="text-sm text-text-secondary mt-1">Cada celda es un monto mensual en ARS. Vacío significa sin plan; 0 significa que no esperás gastar. El semestre y el año suman estos mismos meses.</p></div>
      <div className="flex flex-wrap gap-2 items-center"><button disabled={pending} className="border border-border rounded-lg px-3 py-2 text-sm" onClick={() => fill('actual')}>Usar gastos del período</button><button disabled={pending} className="border border-border rounded-lg px-3 py-2 text-sm" onClick={() => fill('agenda')}>Traer estimados de agenda</button>{months.length > 1 && <><label className="flex items-center gap-2 text-xs text-text-secondary">Ajuste mensual %<input aria-label="Ajuste mensual porcentual" type="number" min="-100" max="1000" step="0.1" value={adjustment} disabled={pending} onChange={e => setAdjustment(e.target.value)} className="input-field max-w-24" /></label><button disabled={pending} className="border border-border rounded-lg px-3 py-2 text-sm" onClick={() => fill('repeat')}>Repetir {MONTHS[months[0] - 1]} con ajuste</button></>}</div>
      <p className="text-xs text-text-muted">Las ayudas completan solamente celdas vacías. El ajuste se acumula mes a mes y es una hipótesis propia. La agenda aporta ítems ya existentes, con categoría y monto en pesos.</p>
      {data.categories.length === 0 ? <p className="p-5 text-text-secondary">Primero agregá categorías de gastos en <Link className="text-accent underline" href="/configuracion">Configuración</Link>.</p> : <div className="overflow-x-auto"><table className="w-full text-sm border-collapse"><caption className="sr-only">Presupuesto por categoría y mes en pesos argentinos</caption><thead><tr className="text-text-secondary border-b border-border"><th scope="col" className="text-left p-3 min-w-44">Categoría</th>{months.map(m => <th scope="col" key={m} className="p-3 min-w-36">{MONTHS[m - 1]}</th>)}<th scope="col" className="p-3 text-right">Total</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-border/60 hover:bg-bg-card/40"><th scope="row" className="text-left p-3 font-normal"><span className="mr-2">{row.icon}</span>{row.name}</th>{months.map(m => <td key={m} className="p-2"><input aria-label={`${row.name}, ${MONTHS[m - 1]} ${data.year}, pesos`} type="number" inputMode="decimal" min="0" max="1000000000000" step="0.01" placeholder="Sin plan" disabled={pending} value={draft[keyOf(row.id, m)] ?? ''} onChange={e => edit(row.id, m, e.target.value)} className={`input-field text-right ${dirty.has(keyOf(row.id, m)) ? 'border-accent' : ''}`} /></td>)}<td className="text-right p-3 font-semibold whitespace-nowrap">{money(row.planned)}</td></tr>)}</tbody><tfoot><tr className="font-semibold"><th className="p-3 text-left">Total mensual</th>{chartData.map(item => <td className="p-3 text-right whitespace-nowrap" key={item.name}>{money(item.Presupuesto)}</td>)}<td className="p-3 text-right whitespace-nowrap text-accent">{money(planned)}</td></tr></tfoot></table></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p role="status" className="text-sm text-text-secondary">{dirty.size ? `${dirty.size} cambios sin guardar (incluye otros meses del año).` : 'Todo guardado. Este plan también se refleja en Inicio.'}</p><div className="flex gap-3">{!!dirty.size && <button disabled={pending} onClick={() => { setDraft(Object.fromEntries(data.budgets.map(b => [keyOf(b.categoryId, b.month), String(b.amount)]))); setDirty(new Set()); }} className="text-sm text-text-secondary">Descartar</button>}<button disabled={!dirty.size || pending} onClick={save} className="gradient-btn px-5 py-3 disabled:opacity-40">{pending ? 'Guardando…' : 'Guardar presupuesto'}</button></div></div>
    </section>}

    {analytics && <div className="grid lg:grid-cols-3 gap-4"><section className="glass-card p-5 lg:col-span-2"><h2 className="font-semibold">Lo que merece tu atención</h2><div className="mt-4 space-y-3 text-sm">{!configured && <p className="text-warning">Todavía no hay presupuesto para este período. <Link href={href('/presupuesto')} className="underline">Creá tu plan</Link> para medir los desvíos.</p>}{unplanned > 0 && <p className="text-warning">{money(unplanned)} de gastos pertenecen a meses y categorías sin presupuesto.</p>}{ranked.filter(r => r.available < 0 && r.configured).slice(0, 3).map(row => <p key={row.id}><span className="text-danger">↑ {row.name}</span> supera su presupuesto en <strong>{money(-row.available)}</strong>.</p>)}{configured > 0 && actual <= planned && <p className="text-success">El gasto acumulado está dentro del presupuesto total del período.</p>}<p className="text-text-secondary">{isOpen ? 'El período sigue abierto: lo disponible todavía debe cubrir los gastos pendientes.' : future ? 'Los gastos de fechas futuras son registros anticipados, no una proyección automática.' : 'Los desvíos corresponden al período completo según los movimientos registrados.'}</p></div></section><section className="glass-card p-5"><p className="text-xs uppercase tracking-wider text-text-secondary">Contexto de ingresos</p><p className="text-2xl font-bold mt-3">{money(income)}</p><p className="text-sm text-text-secondary mt-2">Ingresos registrados en el período.</p><p className="text-sm mt-4">Ingresos menos gastos: <strong className={income - actual >= 0 ? 'text-success' : 'text-danger'}>{money(income - actual)}</strong></p><p className="text-xs text-text-muted mt-3">Antes de movimientos de ahorro e inversión; no representa saldo bancario ni ingresos presupuestados.</p></section></div>}

    <div className="grid xl:grid-cols-2 gap-4">
      <section className="glass-card p-5 min-w-0"><h2 className="font-semibold">Presupuesto vs. realidad</h2><p className="text-xs text-text-secondary mt-1">Evolución mensual · pesos argentinos</p><div className="h-72 mt-5"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ left: 5, right: 10 }}><CartesianGrid stroke="#818cf820" vertical={false} /><XAxis dataKey="name" stroke="#a5b4fc" fontSize={12} /><YAxis stroke="#a5b4fc" fontSize={11} tickFormatter={v => new Intl.NumberFormat('es-AR', { notation: 'compact' }).format(v)} /><Tooltip contentStyle={chartStyle} formatter={value => money(Number(value))} /><Legend /><Bar dataKey="Presupuesto" fill="#818cf8" radius={[4, 4, 0, 0]} /><Bar dataKey="Real" fill="#34d399" radius={[4, 4, 0, 0]} />{analytics && <Line dataKey="Ingresos" stroke="#fbbf24" strokeWidth={2} />}</ComposedChart></ResponsiveContainer></div></section>
      <section className="glass-card p-5 min-w-0"><h2 className="font-semibold">Dónde se concentra el gasto</h2><p className="text-xs text-text-secondary mt-1">Las seis categorías con mayor gasto real</p>{ranked.length ? <div className="h-72 mt-5"><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={[...ranked].sort((a, b) => b.actual - a.actual).slice(0, 6)} margin={{ left: 5, right: 15 }}><CartesianGrid stroke="#818cf820" horizontal={false} /><XAxis type="number" stroke="#a5b4fc" fontSize={11} tickFormatter={v => new Intl.NumberFormat('es-AR', { notation: 'compact' }).format(v)} /><YAxis type="category" dataKey="name" width={110} stroke="#a5b4fc" fontSize={11} /><Tooltip contentStyle={chartStyle} formatter={value => money(Number(value))} /><Legend /><Bar dataKey="planned" name="Presupuesto" fill="#818cf8" radius={[0, 4, 4, 0]} /><Bar dataKey="actual" name="Real" fill="#38bdf8" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div> : <div className="h-72 flex items-center justify-center text-sm text-text-muted">El gráfico aparecerá cuando haya un plan o gastos.</div>}</section>
    </div>

    {analytics && <section className="glass-card p-5"><h2 className="font-semibold">Desvíos por categoría</h2><p className="text-sm text-text-secondary mt-1">Disponible positivo: queda presupuesto. Negativo: se gastó de más. Sin base indica que no se puede calcular un porcentaje.</p><div className="overflow-x-auto mt-4"><table className="w-full text-sm"><thead><tr className="text-text-secondary border-b border-border">{['Categoría', 'Presupuesto', 'Real', 'Disponible', 'Ejecución', 'Cobertura'].map(h => <th scope="col" key={h} className="p-3 text-left whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-border/60"><th scope="row" className="p-3 text-left font-normal">{row.icon} {row.name}</th><td className="p-3 whitespace-nowrap">{row.configured ? money(row.planned) : 'Sin plan'}</td><td className="p-3 whitespace-nowrap">{money(row.actual)}</td><td className={`p-3 whitespace-nowrap ${row.available < 0 ? 'text-danger' : 'text-success'}`}>{row.configured ? money(row.available) : '—'}</td><td className="p-3 min-w-32"><span>{row.execution === null ? 'Sin base' : `${row.execution.toFixed(1)}%`}</span><div className="h-1.5 rounded-full bg-bg-input mt-2 overflow-hidden"><div className={`h-full rounded-full ${row.execution !== null && row.execution > 100 ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${Math.min(100, row.execution ?? 0)}%` }} /></div></td><td className="p-3 text-text-secondary whitespace-nowrap">{row.configured}/{months.length} meses</td></tr>)}</tbody></table></div></section>}

    <details className="glass-card p-5 text-sm text-text-secondary"><summary className="cursor-pointer font-medium text-text-primary">Cómo leer estos números</summary><div className="mt-3 space-y-2"><p>Se incluyen los gastos de todos los perfiles de la cuenta en ARS y se excluyen las categorías de ahorro e inversión. USD y EUR no se convierten ni se suman.</p><p>Los meses siguen el día de cobro configurado ({data.payday === 0 ? 'último día del mes' : `día ${data.payday}`}), igual que Inicio. El semestre agrupa enero–junio o julio–diciembre del año financiero.</p><p>Tarjetas y préstamos impactan cuando se registra el pago como gasto. Las compras en cuotas y la agenda pendiente no se suman nuevamente al gasto real. Los pagos de tarjeta conservan la categoría del pago registrado.</p><p>El presupuesto es un plan editable, no un movimiento de dinero. Modificarlo actualiza la comparación y los límites de Inicio. Los gastos sin plan se incluyen en el gasto total y se señalan por separado.</p><p>{elapsed.length} meses completos transcurridos en la selección. No se extrapolan gastos a partir de días parciales, porque los vencimientos pueden concentrarse en distintos momentos del mes.</p></div></details>
  </div>;
}
