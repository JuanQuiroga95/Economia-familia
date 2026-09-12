import assert from 'node:assert/strict';
import test from 'node:test';
import { ajustePorAdelantos, mesesInvolucrados, periodoSiguiente } from './budgetAdvance';

test('la plata de un adelanto sale siempre del período que sigue', () => {
  assert.deepEqual(periodoSiguiente({ month: 3, year: 2026, half: 1 }), { month: 3, year: 2026, half: 2 });
  assert.deepEqual(periodoSiguiente({ month: 3, year: 2026, half: 2 }), { month: 4, year: 2026, half: 1 });
  assert.deepEqual(periodoSiguiente({ month: 12, year: 2026, half: 2 }), { month: 1, year: 2027, half: 1 });
  assert.deepEqual(periodoSiguiente({ month: 12, year: 2026, half: 0 }), { month: 1, year: 2027, half: 0 });
});

test('la quincena que adelanta suma y la que presta resta', () => {
  const adelantos = [{ month: 3, year: 2026, half: 1, amount: 20000 }];
  assert.deepEqual(ajustePorAdelantos(adelantos, [{ month: 3, year: 2026, half: 1 }]), {
    recibido: 20000, prestado: 0, neto: 20000,
  });
  assert.deepEqual(ajustePorAdelantos(adelantos, [{ month: 3, year: 2026, half: 2 }]), {
    recibido: 0, prestado: 20000, neto: -20000,
  });
});

test('mirando el mes completo, un adelanto entre sus quincenas no cambia el total', () => {
  const dentroDelMes = [{ month: 3, year: 2026, half: 1, amount: 20000 }];
  const mesEntero = [
    { month: 3, year: 2026, half: 1 as const },
    { month: 3, year: 2026, half: 2 as const },
  ];
  assert.equal(ajustePorAdelantos(dentroDelMes, mesEntero).neto, 0);

  // El que se pidió en la 2da quincena sí sale del mes siguiente.
  const delMesQueViene = [{ month: 3, year: 2026, half: 2, amount: 15000 }];
  assert.equal(ajustePorAdelantos(delMesQueViene, mesEntero).neto, 15000);
  assert.equal(
    ajustePorAdelantos(delMesQueViene, [{ month: 4, year: 2026, half: 1 }]).neto,
    -15000
  );
});

test('adelantos encadenados se suman en cada punta', () => {
  const adelantos = [
    { month: 3, year: 2026, half: 1, amount: 10000 },
    { month: 3, year: 2026, half: 1, amount: 5000 },
    { month: 3, year: 2026, half: 2, amount: 8000 },
  ];
  // La 2da quincena presta 15000 y a su vez se adelanta 8000 de abril.
  assert.deepEqual(ajustePorAdelantos(adelantos, [{ month: 3, year: 2026, half: 2 }]), {
    recibido: 8000, prestado: 15000, neto: -7000,
  });
});

test('alcanza con traer el mes mirado y el anterior', () => {
  assert.deepEqual(mesesInvolucrados([{ month: 1, year: 2026, half: 1 }]), [
    { month: 12, year: 2025 },
    { month: 1, year: 2026 },
  ]);
});
