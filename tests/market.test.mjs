import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseSize, normaliseQty, perUnit, expandMarket, searchMarket, productLink, marketUpdates, currentFor, storeName } from '../js/market.js';
import { buildNl, buildAt, splitStores } from '../scripts/market-build.mjs';

test('parseSize reads Dutch pack sizes', () => {
  assert.deepEqual(parseSize('1 l'), { qty: 1000, unit: 'ml' });
  assert.deepEqual(parseSize('0,75 l'), { qty: 750, unit: 'ml' });
  assert.deepEqual(parseSize('Per 350 g'), { qty: 350, unit: 'g' });
  assert.deepEqual(parseSize('2 x 250 ml'), { qty: 500, unit: 'ml' });
  assert.deepEqual(parseSize('1.5 liter'), { qty: 1500, unit: 'ml' });
  assert.deepEqual(parseSize('33 CL'), { qty: 330, unit: 'ml' });
  assert.deepEqual(parseSize('330ML'), { qty: 330, unit: 'ml' });
  assert.deepEqual(parseSize('1 kg'), { qty: 1000, unit: 'g' });
  assert.deepEqual(parseSize('6 stuks'), { qty: 6, unit: 'pc' });
  assert.deepEqual(parseSize('per stuk'), { qty: 1, unit: 'pc' });
  assert.equal(parseSize(''), null);
  assert.equal(parseSize('groot'), null);
});

test('normaliseQty reads Heisse Preise units', () => {
  assert.deepEqual(normaliseQty(1, 'l'), { qty: 1000, unit: 'ml' });
  assert.deepEqual(normaliseQty(500, 'g'), { qty: 500, unit: 'g' });
  assert.deepEqual(normaliseQty(2, 'kg'), { qty: 2000, unit: 'g' });
  assert.deepEqual(normaliseQty(10, 'stk'), { qty: 10, unit: 'pc' });
  assert.equal(normaliseQty(30, 'cm'), null);
  assert.equal(normaliseQty(0, 'g'), null);
});

test('perUnit gives price per litre / kilo / item', () => {
  assert.deepEqual(perUnit(1.5, 1500, 'ml'), { value: 1, per: 'l' });
  assert.deepEqual(perUnit(2, 500, 'g'), { value: 4, per: 'kg' });
  assert.deepEqual(perUnit(3, 6, 'pc'), { value: 0.5, per: 'pc' });
  assert.equal(perUnit(1, 0, 'g'), null);
});

const TODAY = '2026-10-02';
const cjb = [
  { n: 'spar', u: 'https://www.spar.nl/', d: [
    { n: 'Spar sinaasappelsap', l: 'spar-sap-1/', p: 1.89, s: '1 l' },
    { n: 'Surango sinaasappelsap', l: 'surango-2/', p: 1.49, s: '1.5 liter' },
  ] },
  { n: 'jumbo', u: 'https://www.jumbo.com/producten/', d: [
    { n: 'Jumbo Sinaasappelsap 1 L', l: 'jumbo-sap', p: 1.35, s: '1 L' },
  ] },
  { n: 'aldi', u: 'https://www.aldi.nl/producten/', d: [] },
];

const hashOfStore = (s) => createHash('sha1').update(JSON.stringify(s.d || [])).digest('hex');

test('buildNl flags stores whose data stopped changing', () => {
  const fresh = buildNl(cjb, [], TODAY);
  assert.equal(fresh.stores.length, 2, 'empty stores are left out');
  assert.ok(fresh.stores.every((s) => s.fresh), 'without history every store counts as fresh');

  // Snapshots newest first: Jumbo identical in all of them (32 days), Spar changed yesterday.
  const jumbo = hashOfStore(cjb[1]);
  const history = ['2026-10-01', '2026-09-16', '2026-08-31'].map((date) => ({ date, hashes: { jumbo, spar: 'older' } }));
  const data = buildNl(cjb, history, TODAY);
  const st = Object.fromEntries(data.stores.map((s) => [s.code, s]));
  assert.equal(st.jumbo.fresh, false);
  assert.equal(st.jumbo.lastChange, '2026-08-31');
  assert.equal(st.jumbo.link, '', 'no product links for stale stores');
  assert.equal(st.spar.fresh, true);
  assert.equal(st.spar.lastChange, TODAY);
  assert.equal(data.stores[0].code, 'spar', 'fresh stores first');
  assert.deepEqual(data.items.find((it) => it[1] === 'Surango sinaasappelsap').slice(2), [1.49, 1500, 'ml', 'surango-2/']);
  assert.equal(data.items.find((it) => it[1].startsWith('Jumbo'))[5], '');
});

const hp = [
  { store: 'billa', id: '00-1', name: 'BILLA Orangensaft', price: 1.59, quantity: 1, unit: 'l', url: 'billa-orangensaft-001', priceHistory: [{ date: '2026-09-30', price: 1.59 }] },
  { store: 'billa', id: '00-2', name: 'Alter Saft', price: 0.5, quantity: 1, unit: 'l', url: 'alt', unavailable: true, priceHistory: [{ date: '2026-09-29', price: 0.5 }] },
  { store: 'spar', id: '7354236', name: 'SPAR Orangensaft 4x1l', price: 5.56, quantity: 4, unit: 'l', priceHistory: [{ date: '2026-09-27', price: 5.56 }] },
  { store: 'hofer', id: 'h1', name: 'RIO D´ORO Orangensaft 1l', price: 1.39, quantity: 1, unit: 'l', url: 'x/y', unavailable: true, priceHistory: [{ date: '2025-11-07', price: 1.39 }] },
  { store: 'dm', id: 'd1', name: 'Drogerie', price: 1, quantity: 1, unit: 'stk', priceHistory: [{ date: '2026-09-30', price: 1 }] },
  { store: 'reweDe', id: '536847', name: '00 null null Power WC Aktiv Pulver 1kg', price: 3.39, quantity: 1000, unit: 'g', priceHistory: [{ date: '2024-02-15', price: 3.39 }] },
];

test('buildAt keeps supermarkets, flags stale ones and maps SPAR', () => {
  const data = buildAt(hp, TODAY);
  const codes = data.stores.map((s) => s.code);
  assert.deepEqual(codes.slice(0, 2).sort(), ['billa', 'sparAt']);
  assert.ok(!codes.includes('dm'), 'drugstores left out');
  const st = Object.fromEntries(data.stores.map((s) => [s.code, s]));
  assert.equal(st.billa.fresh, true);
  assert.equal(st.sparAt.fresh, true);
  assert.equal(st.hofer.fresh, false);
  assert.equal(st.hofer.lastChange, '2025-11-07');
  assert.equal(st.sparAt.link, 'https://www.interspar.at/shop/lebensmittel/p/{x}');
  const names = data.items.map((it) => it[1]);
  assert.ok(!names.includes('Alter Saft'), 'discontinued products of live stores are dropped');
  assert.ok(names.includes('RIO D´ORO Orangensaft 1l'), 'stale stores keep their last prices');
  assert.ok(names.includes('Power WC Aktiv Pulver 1kg'), 'junk "null" brand cleaned');
  const spar = data.items.find((it) => it[1].startsWith('SPAR'));
  assert.deepEqual(spar.slice(2), [5.56, 4000, 'ml', '7354236']);
});

test('splitStores separates up-to-date and stale stores', () => {
  const data = buildAt(hp, TODAY);
  const fresh = splitStores(data, true);
  const old = splitStores(data, false);
  assert.ok(fresh.stores.every((s) => s.fresh));
  assert.ok(old.stores.every((s) => !s.fresh));
  assert.equal(fresh.items.length + old.items.length, data.items.length);
  for (const part of [fresh, old]) for (const it of part.items) assert.ok(part.stores[it[0]]);
});

test('search ranks up-to-date stores by unit price and builds links', () => {
  const db = expandMarket(splitStores(buildAt(hp, TODAY), true));
  const r = searchMarket(db, 'orangensaft');
  assert.equal(r.rankedBy, 'l');
  assert.deepEqual(r.fresh.map((p) => p.store), ['sparAt', 'billa']); // €1.39/L beats €1.59/L
  assert.equal(r.fresh[0].url, 'https://www.interspar.at/shop/lebensmittel/p/7354236');
  assert.equal(productLink(r.fresh[1]), 'https://shop.billa.at/produkte/billa-orangensaft-001');
  assert.equal(storeName('sparAt'), 'SPAR AT');
  const old = expandMarket(splitStores(buildAt(hp, TODAY), false));
  const s = searchMarket(old, 'Orangensaft');
  assert.equal(s.fresh.length, 0);
  assert.equal(s.stale[0].store, 'hofer');
  assert.match(productLink(s.stale[0]), /google\.com\/search\?q=site%3Ahofer\.at/);
});

test('search: accents ignored, short words only at a word start', () => {
  const db = expandMarket({ date: TODAY, stores: [{ code: 'billa', fresh: true, link: '' }], items: [
    [0, 'Basmati Reis', 2, 1000, 'g', ''],
    [0, 'Eis Vanille', 3, 1000, 'ml', ''],
    [0, 'Crème fraîche', 1, 200, 'g', ''],
    [0, 'Vollmilch 3,5%', 1.2, 1000, 'ml', ''],
  ] });
  assert.deepEqual(searchMarket(db, 'eis').fresh.map((p) => p.name), ['Eis Vanille']);
  assert.deepEqual(searchMarket(db, 'creme fraiche').fresh.map((p) => p.name), ['Crème fraîche']);
  assert.deepEqual(searchMarket(db, 'Milch').fresh.map((p) => p.name), ['Vollmilch 3,5%']);
  assert.deepEqual(searchMarket(db, '').fresh, []);
});

test('marketUpdates follows a logged product day by day', () => {
  const day1 = expandMarket({ date: '2026-10-01', stores: [{ code: 'spar', fresh: true, link: 'https://www.spar.nl/{x}' }], items: [[0, 'Spar sap', 1.89, 1000, 'ml', 'a/']] });
  const item = { quotes: [{ id: 'q1', site: 'Spar NL', price: 1.89, date: '2026-10-01', currency: 'EUR', feed: { m: 'nl', store: 'spar', name: 'Spar sap' }, fx: { date: 'x' }, createdAt: 1 }] };
  assert.deepEqual(marketUpdates(item, day1, 'nl'), { add: [], seen: [] });

  const same = { ...day1, date: '2026-10-02' };
  assert.deepEqual(marketUpdates(item, same, 'nl'), { add: [], seen: ['q1'] });

  const cheaper = expandMarket({ date: '2026-10-03', stores: [{ code: 'spar', fresh: true, link: 'https://www.spar.nl/{x}' }], items: [[0, 'Spar sap', 1.69, 1000, 'ml', 'a/']] });
  const { add, seen } = marketUpdates(item, cheaper, 'nl');
  assert.equal(seen.length, 0);
  assert.equal(add.length, 1);
  assert.equal(add[0].price, 1.69);
  assert.equal(add[0].date, '2026-10-03');
  assert.equal(add[0].site, 'Spar NL');
  assert.equal(add[0].fx, undefined, 'exchange rate is taken again for the new day');
  assert.notEqual(add[0].id, 'q1');
  // Same id on every device, so syncing doesn't duplicate it.
  assert.equal(marketUpdates(item, cheaper, 'nl').add[0].id, add[0].id);

  // Other markets and stale stores are ignored.
  assert.deepEqual(marketUpdates(item, cheaper, 'at'), { add: [], seen: [] });
  const stale = expandMarket({ date: '2026-10-03', stores: [{ code: 'spar', fresh: false, link: '' }], items: [[0, 'Spar sap', 1.5, 1000, 'ml', '']] });
  assert.deepEqual(marketUpdates(item, stale, 'nl'), { add: [], seen: [] });
  assert.equal(currentFor(cheaper, { store: 'spar', name: 'nope' }), null);
});
