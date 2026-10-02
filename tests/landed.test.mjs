import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landed, latestPerSite, rankQuotes } from '../js/landed.js';

const rates = { HKD: 1, GBP: 10, EUR: 8.5, USD: 7.8 };
const ctx = { base: 'HKD', cardCurrency: 'HKD', cardFeePct: 2, rates };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test('local HKD price has no card fee', () => {
  const r = landed({ price: 500, currency: 'HKD', mode: 'local' }, ctx);
  close(r.total, 500);
  assert.deepEqual(r.lines.map((l) => l.k), ['price']);
});

test('foreign price converts and adds automatic card fee', () => {
  const r = landed({ price: 100, currency: 'GBP', mode: 'local' }, ctx);
  close(r.total, 100 * 1.02 * 10);
});

test('online export removes VAT before shipping and card fee', () => {
  const r = landed({ price: 120, currency: 'GBP', mode: 'online', removeVat: true, vatRate: 20, shipping: 10, cardFeePct: '' }, ctx);
  // 120/1.2 = 100 goods + 10 shipping = 110, +2% = 112.2 GBP
  close(r.total, 1122);
  assert.ok(r.lines.some((l) => l.k === 'vatRemoved' && Math.abs(l.v + 20) < 1e-9));
});

test('tax-free refund reduces total but card fee is on the full charge', () => {
  const r = landed({ price: 200, currency: 'EUR', mode: 'taxfree', refundPct: 12, cardFeePct: 0 }, ctx);
  close(r.total, (200 - 24) * 8.5);
  const r2 = landed({ price: 200, currency: 'EUR', mode: 'taxfree', refundPct: 12 }, ctx);
  close(r2.total, (200 * 1.02 - 24) * 8.5);
});

test('VAT and refund fields are ignored in the wrong mode', () => {
  const r = landed({ price: 100, currency: 'HKD', mode: 'local', removeVat: true, vatRate: 20, refundPct: 10, dutyPct: 5 }, ctx);
  close(r.total, 100);
});

test('forwarding fee in its own currency is added after conversion', () => {
  const r = landed({ price: 50, currency: 'GBP', mode: 'online', cardFeePct: 0, fwd: 80, fwdCur: 'HKD' }, ctx);
  close(r.total, 500 + 80);
});

test('explicit card fee overrides the automatic one', () => {
  const r = landed({ price: 100, currency: 'USD', mode: 'local', cardFeePct: 0 }, ctx);
  close(r.total, 780);
});

test('base currency other than HKD', () => {
  const r = landed({ price: 1000, currency: 'HKD', mode: 'local' }, { ...ctx, base: 'GBP' });
  close(r.total, 100);
});

test('latestPerSite keeps the newest quote per site and condition', () => {
  const qs = [
    { id: 'a', site: 'Amazon UK', cond: 'new', date: '2026-09-01', price: 10 },
    { id: 'b', site: 'amazon uk ', cond: 'new', date: '2026-09-20', price: 12 },
    { id: 'c', site: 'Amazon UK', cond: 'used', date: '2026-09-02', price: 6 },
    { id: 'd', site: 'Price.com.hk', date: '2026-09-05', price: 90 },
  ];
  assert.deepEqual(latestPerSite(qs).map((q) => q.id).sort(), ['b', 'c', 'd']);
});

test('rankQuotes sorts by landed total', () => {
  const qs = [
    { id: 'uk', price: 100, currency: 'GBP', mode: 'local', cardFeePct: 0 },
    { id: 'hk', price: 900, currency: 'HKD', mode: 'local' },
    { id: 'eu', price: 110, currency: 'EUR', mode: 'local', cardFeePct: 0 },
  ];
  assert.deepEqual(rankQuotes(qs, ctx).map((x) => x.q.id), ['hk', 'eu', 'uk']);
});
