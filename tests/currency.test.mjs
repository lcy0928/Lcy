import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert, effectiveRates, fetchRates, fmt, fmtParts } from '../js/currency.js';

test('convert goes through HKD', () => {
  const r = { HKD: 1, GBP: 10, EUR: 8 };
  assert.equal(convert(10, 'GBP', 'HKD', r), 100);
  assert.equal(convert(100, 'HKD', 'GBP', r), 10);
  assert.equal(convert(8, 'GBP', 'EUR', r), 10);
  assert.ok(Number.isNaN(convert(1, 'XXX', 'HKD', r)));
});

test('manual rates override live ones', () => {
  const eff = effectiveRates({ hkdPer: { GBP: 10.5 } }, { GBP: 10.2, EUR: 0 });
  assert.equal(eff.GBP, 10.2);
  assert.ok(eff.EUR > 0, 'zero override ignored');
});

test('fetchRates parses Frankfurter and falls back on failure', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ date: '2026-10-01', rates: { GBP: 0.1, EUR: 0.125 } }) });
  const r = await fetchRates(ok);
  assert.equal(r.hkdPer.GBP, 10);
  assert.equal(r.hkdPer.EUR, 8);
  assert.equal(r.date, '2026-10-01');

  let calls = 0;
  const flaky = async (url) => {
    calls++;
    if (url.includes('frankfurter')) throw new Error('down');
    return { ok: true, json: async () => ({ result: 'success', time_last_update_unix: 1790000000, rates: { GBP: 0.1, EUR: 0.1 } }) };
  };
  const r2 = await fetchRates(flaky);
  assert.equal(calls, 3);
  assert.equal(r2.source, 'ExchangeRate-API');
});

test('fmt and fmtParts', () => {
  assert.equal(fmt(1234.5, 'HKD', 'en'), 'HK$1,235');
  assert.equal(fmt(12.5, 'GBP', 'en'), '£12.50');
  assert.deepEqual(fmtParts(1500, 'EUR', 'en'), { symbol: '€', value: '1,500' });
  assert.equal(fmt(NaN, 'HKD'), '—');
});

import { fetchRatesOn, fxSnapshot, ratesAt } from '../js/currency.js';

test('fetchRatesOn asks Frankfurter for that date', async () => {
  let asked;
  const r = await fetchRatesOn('2026-09-01', async (url) => {
    asked = url;
    return { ok: true, json: async () => ({ date: '2026-08-29', rates: { GBP: 0.1 } }) };
  });
  assert.match(asked, /2026-09-01/);
  assert.equal(r.date, '2026-08-29');
  assert.equal(r.hkdPer.GBP, 10);
});

test('fxSnapshot keeps only the currencies a quote uses', () => {
  const rates = { HKD: 1, GBP: 10.4, EUR: 9.1, USD: 7.8 };
  assert.deepEqual(fxSnapshot({ currency: 'GBP', fwdCur: 'HKD' }, rates, '2026-10-02'), { date: '2026-10-02', hkdPer: { GBP: 10.4 } });
  assert.equal(fxSnapshot({ currency: 'HKD' }, rates, 'x'), null);
  assert.equal(ratesAt(rates, { hkdPer: { GBP: 9.9 } }).GBP, 9.9);
  assert.equal(ratesAt(rates, null).GBP, 10.4);
});
