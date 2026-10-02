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

const cards = [
  { id: 'default', name: 'Normal', fcc: 1.95, cbf: 1, cashback: 0, markup: 0 },
  { id: 'nofee', name: 'No-fee', fcc: 0, cbf: 0, cashback: 0.4, markup: 0 },
  { id: 'cash', name: 'Cashback', fcc: 1.95, cbf: 1, cashback: 4, markup: 0 },
];
const cctx = { base: 'HKD', cardCurrency: 'HKD', cards, rates };

test('overseas merchant charging HKD attracts the cross-border fee', () => {
  const q = { price: 1000, currency: 'HKD', region: 'GLOBAL', mode: 'local', cardId: 'default' };
  close(landed(q, cctx).total, 1010);
  close(landed({ ...q, region: 'HK' }, cctx).total, 1000);
  close(landed({ ...q, overseas: false }, cctx).total, 1000);
});

test('auto card choice picks the cheapest card after fees and cashback', () => {
  const foreign = landed({ price: 100, currency: 'GBP', region: 'UK', mode: 'local' }, cctx);
  // Cashback: +1.95% -4% = -2.05% beats no-fee -0.4%
  assert.equal(foreign.card.id, 'cash');
  close(foreign.total, 100 * (1 + 0.0195 - 0.04) * 10);
  assert.ok(foreign.lines.some((l) => l.k === 'cashback'));
});

test('a chosen card is respected even when not the cheapest', () => {
  const r = landed({ price: 100, currency: 'GBP', region: 'UK', mode: 'local', cardId: 'nofee' }, cctx);
  assert.equal(r.card.id, 'nofee');
  close(r.total, 100 * (1 - 0.004) * 10);
});

test('card FX markup adds to the foreign fee', () => {
  const r = landed({ price: 100, currency: 'EUR', region: 'EU', mode: 'local', cardId: 'm' },
    { ...cctx, cards: [{ id: 'm', name: 'M', fcc: 1, cbf: 1, cashback: 0, markup: 0.5 }] });
  close(r.total, 100 * 1.015 * 8.5);
});

import { unitPrice, ageDays } from '../js/landed.js';
const rates2 = { HKD: 1, GBP: 10, EUR: 8.5, USD: 7.8, CHF: 9 };
const c0 = { base: 'HKD', cardCurrency: 'HKD', cards: [{ id: 'x', fcc: 0, cbf: 0, cashback: 0, markup: 0 }], rates: rates2 };

test('tax refund needs the country minimum spend', () => {
  const q = { price: 90, currency: 'EUR', mode: 'taxfree', country: 'FR', refundPct: 12 };
  const below = landed(q, c0);
  close(below.total, 90 * 8.5);
  assert.ok(below.lines.some((l) => l.k === 'belowMin' && l.min === 100.01));
  close(landed({ ...q, price: 150 }, c0).total, 150 * 0.88 * 8.5);
  close(landed({ ...q, country: 'ES', price: 20 }, c0).total, 20 * 0.88 * 8.5);
});

test('minimum is checked in the country currency', () => {
  // CHF 300 minimum; 2000 HKD ≈ 222 CHF → below
  const r = landed({ price: 2000, currency: 'HKD', mode: 'taxfree', country: 'CH', refundPct: 5 }, c0);
  close(r.total, 2000);
});

test('shipping to a forwarder keeps VAT and charges by weight', () => {
  const base = { price: 120, currency: 'GBP', mode: 'online', removeVat: true, vatRate: 20, region: 'UK' };
  close(landed(base, c0).total, 1000);
  const fwd = landed({ ...base, shipTo: 'fwd', weight: 2, fwdRate: 55, fwdCur: 'HKD' }, c0);
  close(fwd.total, 1200 + 110);
});

test('unit price per 100g / 100ml / piece', () => {
  assert.deepEqual(unitPrice(30, 500, 'g'), { per: '100g', value: 6 });
  assert.deepEqual(unitPrice(30, 1.5, 'kg'), { per: '100g', value: 2 });
  assert.deepEqual(unitPrice(20, 2, 'l'), { per: '100ml', value: 1 });
  assert.deepEqual(unitPrice(24, 12, 'pcs'), { per: 'pc', value: 2 });
  assert.equal(unitPrice(10, '', 'g'), null);
});

test('ageDays counts whole days', () => {
  assert.equal(ageDays('2026-10-01', new Date(2026, 9, 8, 15)), 7);
  assert.equal(ageDays('', new Date()), Infinity);
});
