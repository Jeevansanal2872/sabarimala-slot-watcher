'use strict';
const assert = require('assert');
const { findSlots } = require('./detect');

const opts = { dates: ['2026-12-20', '2026-12-21', '2026-12-22'], minSlots: 6 };
const run = (data) => findSlots(data, opts);

let n = 0;
function t(name, fn) {
  fn();
  n += 1;
  console.log(`ok  ${name}`);
}

t('available >= min is a hit, total capacity ignored', () => {
  const h = run({ slots: [{ date: '2026-12-20', availableSlots: 8, totalSlots: 100 }] });
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].date, '2026-12-20');
  assert.strictEqual(h[0].count, 8);
});

t('available below min is not a hit', () => {
  assert.strictEqual(run({ slots: [{ date: '2026-12-20', availableSlots: 3, totalSlots: 100 }] }).length, 0);
});

t('date as object key', () => {
  const h = run({ '20-12-2026': { remaining: 12 } });
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].count, 12);
});

t('FULL status with zero count is not a hit', () => {
  assert.strictEqual(run({ date: '21/12/2026', status: 'FULL', count: 0 }).length, 0);
});

t('nested, written-out date, context inherited by children', () => {
  const h = run({ data: { date: 'Dec 22, 2026', times: [{ slot: '06:00', available: 7 }] } });
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].date, '2026-12-22');
});

t('status Available (count unknown) is a hit', () => {
  const h = run({ date: '2026-12-21', status: 'Available' });
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].count, null);
});

t('non-target date ignored', () => {
  assert.strictEqual(run({ date: '2026-12-19', available: 50 }).length, 0);
});

t('epoch milliseconds (IST midnight) matches the date', () => {
  const ms = new Date('2026-12-20T00:00:00+05:30').getTime();
  const h = run({ day: ms, available: 10 });
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].date, '2026-12-20');
});

t('numeric string counts', () => {
  assert.strictEqual(run({ date: '2026-12-22', available: '9' }).length, 1);
});

t('empty / junk input does not throw', () => {
  assert.strictEqual(run(null).length, 0);
  assert.strictEqual(run('x').length, 0);
  assert.strictEqual(run([]).length, 0);
});

console.log(`\n${n} tests passed`);
