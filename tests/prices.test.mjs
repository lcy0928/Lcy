import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opwBest, marketBest, parseOpenPrices, openBest, onsMatch, loggedBest, openProductsUrl, openPricesUrl, SITE_BRAND, SITE_OPW, SITE_MARKET } from '../js/prices.js';
import { expandMarket } from '../js/market.js';
import { DEFAULT_SITES } from '../js/sites.js';
import { parseCsv, aggregateQuotes, editionMonth } from '../scripts/ons-build.mjs';

test('every mapped site exists', () => {
  const ids = new Set(DEFAULT_SITES.map((s) => s.id));
  for (const id of [...Object.keys(SITE_OPW), ...Object.keys(SITE_MARKET), ...Object.keys(SITE_BRAND)]) assert.ok(ids.has(id), id);
});

test('Consumer Council: cheapest product at one store', () => {
  const hits = [
    { code: 'A', prices: [{ store: 'WELLCOME', price: 12 }, { store: 'PARKNSHOP', price: 13 }] },
    { code: 'B', prices: [{ store: 'PARKNSHOP', price: 9.9 }] },
  ];
  assert.equal(opwBest(hits, 'PARKNSHOP').product.code, 'B');
  assert.equal(opwBest(hits, 'WELLCOME').price, 12);
  assert.equal(opwBest(hits, 'ZTORE'), null);
});

test('market: cheapest per litre at one store, stale stores too', () => {
  const db = expandMarket({ date: '2026-10-02', stores: [{ code: 'spar', fresh: true, link: '' }, { code: 'jumbo', fresh: false, link: '' }], items: [
    [0, 'Spar sinaasappelsap', 1.89, 1000, 'ml', ''],
    [0, 'Surango sinaasappelsap', 1.49, 1500, 'ml', ''],
    [1, 'Jumbo Sinaasappelsap 1 L', 1.35, 1000, 'ml', ''],
  ] });
  assert.equal(marketBest(db, 'sinaasappelsap', 'spar').name, 'Surango sinaasappelsap');
  assert.equal(marketBest(db, 'sinaasappelsap', 'jumbo').price, 1.35);
  assert.equal(marketBest(db, 'melk', 'spar'), null);
});

const page = { items: [
  { price: 1.35, currency: 'GBP', date: '2026-09-20', price_is_discounted: false, product_code: '1',
    product: { product_name: 'Orange Juice', brands: 'Tesco', product_quantity: 1000, product_quantity_unit: 'ml' },
    location: { osm_brand: 'Tesco', osm_name: 'Tesco Express', osm_address_country_code: 'GB' } },
  { price: 1.2, currency: 'GBP', date: '2025-01-02', product_code: '1',
    product: { product_name: 'Orange Juice', brands: 'Tesco' }, location: { osm_name: 'Tesco Extra' } },
  { price: 2.1, currency: 'GBP', date: '2026-09-28', price_is_discounted: true, product_code: '2',
    product: { product_name: 'Tropicana orange juice', brands: 'Tropicana,PepsiCo' }, location: { osm_brand: "Sainsbury's" } },
  { price: 0, currency: 'GBP', date: '2026-09-28', product: {}, location: {} },
] };

test('Open Prices: parse and pick the cheapest recent price per shop', () => {
  const list = parseOpenPrices(page);
  assert.equal(list.length, 3);
  assert.equal(list[0].name, 'Tesco Orange Juice 1000 ml');
  assert.equal(list[2].name, 'Tropicana orange juice', 'brand not repeated');
  // The £1.20 from 2025 is too old; the recent £1.35 wins.
  assert.equal(openBest(list, SITE_BRAND.tesco, '2026-10-02').price, 1.35);
  assert.equal(openBest(list, SITE_BRAND.tesco, '2026-10-02', 1000).price, 1.2);
  assert.equal(openBest(list, SITE_BRAND.sainsburys, '2026-10-02').discounted, true);
  assert.equal(openBest(list, SITE_BRAND.asda, '2026-10-02'), null);
  assert.match(openProductsUrl('orange juice'), /product_name__like=orange%20juice&price_count__gte=1/);
  assert.match(openPricesUrl(['1', '2'], 'GBP'), /product_code__in=1,2&currency=GBP&order_by=-date/);
});

test('ONS: match items by every English word', () => {
  const db = { month: '2026-08', items: [
    ['ORANGE JUICE 1 LITRE', 1.62, 300], ['ORANGES PER KG', 2.1, 200], ['APPLE JUICE 1 LITRE', 1.5, 250],
  ] };
  assert.deepEqual(onsMatch(db, 'orange juice').map((x) => x.price), [1.62]);
  assert.deepEqual(onsMatch(db, 'juice').map((x) => x.desc), ['ORANGE JUICE 1 LITRE', 'APPLE JUICE 1 LITRE']);
  assert.deepEqual(onsMatch(db, 'tea'), []);
  assert.deepEqual(onsMatch(null, 'juice'), []);
});

test('your logged price for a site: newest seen wins', () => {
  const items = [{ name: '橙汁', quotes: [
    { site: 'Tesco', price: 1.5, currency: 'GBP', date: '2026-09-01' },
    { site: 'tesco ', price: 1.4, currency: 'GBP', date: '2026-08-01', seenAt: '2026-09-20' },
    { site: 'Tesco', price: 1.1, currency: 'GBP', date: '2026-09-30', deleted: true },
    { site: 'Asda', price: 1.0, currency: 'GBP', date: '2026-09-30' },
  ] }];
  const b = loggedBest(items, 'Tesco');
  assert.equal(b.price, 1.4);
  assert.equal(b.seen, '2026-09-20');
  assert.equal(loggedBest(items, 'Waitrose'), null);
});

test('ONS build: CSV parsing and median of valid quotes', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","q""z"\n'), [['a', 'b'], ['x, y', 'q"z']]);
  const rows = ['quote_date,item_id,item_desc,validity,shop_code,price'];
  for (const p of [1.5, 1.6, 1.7, 1.8, 9.9]) rows.push(`202608,1,ORANGE JUICE 1 LITRE,4,1,${p}`);
  rows.push('202608,1,ORANGE JUICE 1 LITRE,1,1,0.10'); // invalid quote
  for (const p of [1, 2]) rows.push(`202608,2,RARE ITEM,4,1,${p}`); // too few quotes
  assert.deepEqual(aggregateQuotes(rows.join('\n')), [['ORANGE JUICE 1 LITRE', 1.7, 5]]);
  assert.throws(() => aggregateQuotes('a,b\n1,2'), /unexpected columns/);
  // Since the 2025 update the description column is cs_desc.
  const now = ['quote_date,cs_id,cs_desc,validity,shop_code,price'];
  for (const p of [1, 2, 3, 4, 5]) now.push(`202608,9,Orange juice 1 litre,4,1,${p}`);
  assert.deepEqual(aggregateQuotes(now.join('\n')), [['Orange juice 1 litre', 3, 5]]);
  assert.equal(editionMonth('/economy/x/pricequotesjune2026'), '2026-06');
  assert.equal(editionMonth('upload-pricequotes202608.csv'), '2026-08');
  assert.equal(editionMonth('/economy/x/itemindices'), '');
});
