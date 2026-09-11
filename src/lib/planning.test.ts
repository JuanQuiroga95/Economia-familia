import assert from 'node:assert/strict';
import test from 'node:test';
import { periodMonths, validatePlan, variance } from './planning';
import { getFinancialMonthRange } from './dateUtils';

test('monthly, half-year and annual views share the same monthly plan', () => {
  assert.deepEqual(periodMonths(6, 'month'), [6]);
  assert.deepEqual(periodMonths(6, 'half'), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(periodMonths(7, 'half'), [7, 8, 9, 10, 11, 12]);
  assert.deepEqual(periodMonths(12, 'year'), [...periodMonths(1, 'half'), ...periodMonths(7, 'half')]);
});

test('zero budget has no percentage base; overruns have negative available', () => {
  assert.deepEqual(variance(0, 120), { available: -120, execution: null });
  assert.deepEqual(variance(100, 125), { available: -25, execution: 125 });
  assert.deepEqual(variance(100, 0), { available: 100, execution: 0 });
});

test('accepts explicit zero and removal but rejects malformed money and duplicate cells', () => {
  const cell = { categoryId: 'household', month: 1, amount: 0 };
  assert.equal(validatePlan(2026, [cell, { ...cell, month: 2, amount: null }]), true);
  for (const amount of [-1, NaN, Infinity, 1e13, 0.001]) assert.equal(validatePlan(2026, [{ ...cell, amount }]), false);
  assert.equal(validatePlan(2026, [cell, cell]), false);
  assert.equal(validatePlan(2026, [{ ...cell, month: 13 }]), false);
  assert.equal(validatePlan(1999, [cell]), false);
  assert.equal(validatePlan(2026, [{ ...cell, amount: 123.45 }]), true);
});

test('annual financial months preserve account payday and year boundary', () => {
  const january = getFinancialMonthRange(1, 2026, 0);
  assert.equal(january.startDate.getFullYear(), 2025);
  assert.equal(january.startDate.getMonth(), 11);
  assert.equal(january.startDate.getDate(), 31);
  const february = getFinancialMonthRange(2, 2026, 10);
  assert.equal(february.startDate.getDate(), 10);
  assert.equal(february.startDate.getMonth(), 1);
  assert.equal(february.endDate.getMonth(), 2);
  assert.equal(february.endDate.getDate(), 9);
});
