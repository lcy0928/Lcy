import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compactOpw, expandOpw, searchOpw, opwQuotes, opwUpdates, productName, opwProductUrl } from '../js/opw.js';

const raw = JSON.parse(readFileSync(new URL('./fixtures/opw-sample.json', import.meta.url)));
const db = expandOpw(compactOpw(raw, '2026-10-02'));

test('compact + expand keeps products with prices, sorted cheapest first', () => {
  assert.equal(db.products.length, 3);
  const garden = db.byCode.get('P000000229');
  assert.deepEqual(garden.prices.map((x) => x.store), ['AEON', 'WELLCOME', 'PARKNSHOP', 'JASONS']);
  assert.equal(garden.prices[0].price, 10.5);
  assert.equal(garden.cat.zh, '麵包');
  assert.equal(garden.offers[0].zh, '購3件$30.00');
  // blank price dropped
  assert.equal(db.byCode.get('P000001765').prices.length, 2);
});

test('search matches Chinese or English, every word', () => {
  assert.deepEqual(searchOpw(db, '三文治').map((p) => p.code), ['P000000229', 'P000003983']);
  assert.deepEqual(searchOpw(db, 'garden bread').map((p) => p.code), ['P000000229']);
  assert.deepEqual(searchOpw(db, '牛奶').map((p) => p.code), ['P000001765']);
  assert.deepEqual(searchOpw(db, ''), []);
});

test('names and quotes', () => {
  const p = db.byCode.get('P000000229');
  assert.equal(productName(p, 'zh'), '嘉頓 切皮三文治方包 6片');
  const qs = opwQuotes(p, '2026-10-02');
  assert.equal(qs.length, 4);
  assert.equal(qs[0].id, 'opw-P000000229-AEON-2026-10-02');
  assert.equal(qs[0].note, '購3件$30.00');
  assert.equal(qs[0].url, opwProductUrl('P000000229'));
  assert.equal(qs[0].overseas, false);
});

test('updates add a quote only when the price moved', () => {
  const p = db.byCode.get('P000000229');
  const item = { quotes: opwQuotes(p, '2026-10-01') };
  item.quotes[0].price = 11; // AEON was 11.00 yesterday
  const { add, seen } = opwUpdates(item, p, '2026-10-02');
  assert.deepEqual(add.map((q) => q.opwStore), ['AEON']);
  assert.equal(seen.length, 3);
  const again = opwUpdates({ quotes: [...item.quotes, ...add] }, p, '2026-10-02');
  assert.equal(again.add.length, 0);
});
