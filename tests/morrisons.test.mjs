import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordsOf, basketMatch } from '../js/prices.js';
import { BASKET, searchWords, robotsAllows, perUnit, pageProducts, pickCheapest, planRun, mergeRows } from '../scripts/morrisons-build.mjs';
import { G } from '../js/glossary.js';

test('words: plurals fold to the singular', () => {
  assert.deepEqual(wordsOf("Morrisons British Pork Sausages x8"), ['morrison', 'british', 'pork', 'sausage', 'x8']);
  assert.deepEqual(wordsOf('Tomatoes, potatoes & strawberries'), ['tomato', 'potato', 'strawberry']);
  assert.deepEqual(wordsOf('eggs glass peaches'), ['egg', 'glass', 'peach']);
});

test('basket: 50 items, each one the glossary can produce', () => {
  assert.equal(BASKET.length, 50);
  assert.equal(new Set(BASKET).size, 50);
  const en = new Set(G.flatMap((r) => r[1].split('|')));
  // tea and rice come from machine translation (茶, 米 are too short for the glossary).
  const missing = BASKET.map((b) => b.split('|')[0]).filter((b) => !en.has(b) && !['tea', 'rice'].includes(b));
  assert.deepEqual(missing, []);
  assert.equal(searchWords('tea|tea bags'), 'tea bags');
  assert.equal(searchWords('milk'), 'milk');
});

test('robots.txt: longest rule for every crawler wins', () => {
  const txt = [
    'User-agent: Googlebot', 'Disallow: /', '',
    'User-agent: *', 'Disallow: /webapp/', 'Disallow: /*?*sort=', 'Allow: /webapp/wcs/stores/servlet/gb/groceries', '',
  ].join('\n');
  assert.equal(robotsAllows(txt, '/search?q=milk'), true);
  // Morrisons' own rules: search pages allowed, the API not.
  const morrisons = 'User-agent: *\nDisallow: /sso-login\nDisallow: /previewer/*\nDisallow: /api/\nDisallow: /events/';
  assert.equal(robotsAllows(morrisons, '/search?q=orange%20juice'), true);
  assert.equal(robotsAllows(morrisons, '/api/webproductpagews/v5/products'), false);
  assert.equal(robotsAllows(txt, '/webapp/x'), false);
  assert.equal(robotsAllows(txt, '/webapp/wcs/stores/servlet/gb/groceries/milk'), true);
  assert.equal(robotsAllows(txt, '/shop?a=1&sort=price'), false);
  // Consecutive User-agent lines form one group.
  assert.equal(robotsAllows('User-agent: *\nUser-agent: bingbot\nDisallow: /x', '/x/y'), false);
  assert.equal(robotsAllows('', '/anything'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /a$', '/a/b'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /a$', '/a'), false);
});

test('unit prices per litre, kilo or item', () => {
  assert.deepEqual(perUnit('fop.price.per.litre', '3.26'), { value: 3.26, per: 'l' });
  assert.deepEqual(perUnit('fop.price.per.100ml', '0.2'), { value: 2, per: 'l' });
  assert.deepEqual(perUnit('fop.price.per.kg', '8'), { value: 8, per: 'kg' });
  assert.deepEqual(perUnit('fop.price.per.100g', '1.5'), { value: 15, per: 'kg' });
  assert.deepEqual(perUnit('fop.price.per.each', '0.25'), { value: 0.25, per: 'pc' });
  assert.equal(perUnit('fop.price.per.pint', '1'), null);
  assert.equal(perUnit(undefined, undefined), null);
});

const entity = (id, name, price, label, unit, extra = {}) => ({
  productId: `uuid-${id}`, retailerProductId: String(id), name, available: true,
  price: { current: { amount: String(price), currency: 'GBP' }, ...(label ? { unit: { label, current: { amount: String(unit), currency: 'GBP' } } } : {}) },
  ...extra,
});

test('products from a Morrisons search page', () => {
  const state = { data: { products: { productEntities: {
    a: entity(103080841, 'Innocent Smooth Orange Juice', 4.4, 'fop.price.per.litre', 3.26),
    b: entity(106166560, 'Morrisons Pure Orange Juice 1L', 1.2, 'fop.price.per.litre', 1.2, { available: false }),
    c: entity(115666005, 'Odd Unit Juice', 2, 'fop.price.per.pint', 1),
  } } } };
  const html = `<a href="/products/innocent-smooth-orange-juice/103080841">x</a><script>window.__INITIAL_STATE__=${JSON.stringify(state)}</script>`;
  const unknown = new Set();
  const list = pageProducts(html, unknown);
  assert.equal(list.length, 3);
  assert.deepEqual(list[0], {
    name: 'Innocent Smooth Orange Juice', price: 4.4, pu: { value: 3.26, per: 'l' }, available: true,
    url: 'https://groceries.morrisons.com/products/innocent-smooth-orange-juice/103080841',
  });
  assert.equal(list[1].available, false);
  assert.match(list[1].url, /\/search\?q=Morrisons%20Pure/);
  assert.deepEqual([...unknown], ['fop.price.per.pint']);
  assert.deepEqual(pageProducts('<html>no state</html>'), []);
});

const prod = (name, price, unit, per, extra = {}) => ({
  name, price, pu: unit ? { value: unit, per } : null, available: true, url: `https://groceries.morrisons.com/products/x/${name.length}`, ...extra,
});

test('cheapest product: all words, unit price, longer items excluded', () => {
  const butter = [
    prod('Morrisons Smooth Peanut Butter 340g', 1.2, 3.5, 'kg'),
    prod('Lurpak Slightly Salted Spreadable Butter 500g', 5.5, 11, 'kg'),
    prod('Morrisons British Salted Butter 250g', 1.99, 8, 'kg'),
    prod('Butter Croissants x4', 1.5, 0.38, 'pc'),
  ];
  const row = pickCheapest(butter, 'butter');
  assert.equal(row[1], 'Morrisons British Salted Butter 250g');
  assert.deepEqual(row.slice(2, 5), [1.99, 8, 'kg']);
  assert.match(row[5], /^https:\/\/groceries\.morrisons\.com\/products\//);
  assert.equal(pickCheapest(butter, 'peanut butter')[1], 'Morrisons Smooth Peanut Butter 340g');

  const juice = [
    prod('Tropicana Orange Juice 850ml', 2.5, 2.94, 'l'),
    prod('Morrisons Orange Juice Smooth 1L', 1.1, 1.1, 'l', { available: false }),
    prod('Morrisons Pure Orange Juice 1.75L', 2.2, 1.26, 'l'),
    prod('Morrisons Oranges x5', 1.8, 0.36, 'pc'),
  ];
  assert.equal(pickCheapest(juice, 'orange juice')[1], 'Morrisons Pure Orange Juice 1.75L');
  assert.equal(pickCheapest(juice, 'oranges')[1], 'Morrisons Oranges x5');
  // The search wording after "|" is what has to be in the name.
  assert.equal(pickCheapest([prod('Andrex Toilet Tissue 9 Rolls', 6, 0.67, 'pc')], 'toilet paper|toilet tissue')[0], 'toilet paper|toilet tissue');
  assert.equal(pickCheapest([], 'milk'), null);
  // Without unit prices the shelf price decides.
  assert.equal(pickCheapest([prod('Eggs 12', 3, 0, ''), prod('Eggs 6', 1.8, 0, '')], 'eggs')[2], 1.8);
  // A unit that's rarer among the matches doesn't decide.
  const milk = [prod('Milk 4 Pints', 1.65, 0.73, 'l'), prod('Milk 2 Pints', 1.1, 0.97, 'l'), prod('Milk Chocolate Bar', 0.5, 5, 'kg')];
  assert.deepEqual(pickCheapest(milk, 'milk').slice(1, 5), ['Milk 4 Pints', 1.65, 0.73, 'l']);
});

test('app: the basket item for a search term', () => {
  const db = { date: '2026-10-02', items: [
    ['oranges', 'Oranges x5', 1.8, 0.36, 'pc', 'u1'],
    ['orange juice', 'Pure Orange Juice 1.75L', 2.2, 1.26, 'l', 'u2'],
    ['milk', 'Semi Skimmed Milk 4 pints', 1.65, 0.73, 'l', 'u3'],
    ['chocolate', 'Milk Chocolate 200g', 1.5, 7.5, 'kg', 'u4'],
    ['toilet paper|toilet tissue', 'Toilet Tissue 9 Rolls', 3, 0.33, 'pc', 'u5'],
  ] };
  assert.equal(basketMatch(db, 'orange juice').name, 'Pure Orange Juice 1.75L');
  assert.equal(basketMatch(db, 'Tropicana orange juice').price, 2.2);
  assert.equal(basketMatch(db, 'oranges').name, 'Oranges x5');
  assert.equal(basketMatch(db, 'orange').name, 'Oranges x5');
  assert.equal(basketMatch(db, 'milk chocolate').name, 'Milk Chocolate 200g');
  assert.equal(basketMatch(db, 'fresh milk').per, 'l');
  assert.equal(basketMatch(db, 'toilet tissue').name, 'Toilet Tissue 9 Rolls');
  assert.equal(basketMatch(db, 'apple'), null);
  assert.equal(basketMatch(db, '橙汁'), null);
  assert.equal(basketMatch(null, 'milk'), null);
});

test('runs: an even share of what is left before the deadline', () => {
  const basket = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const today = '2026-10-02';
  const now = Date.parse('2026-10-02T10:07:00Z');
  const until = Date.parse('2026-10-02T16:00:00Z');
  // 10 items, 12 runs left (every 30 min) → 1 per run.
  assert.deepEqual(planRun(null, { today, now, until, everyMin: 30, basket }), ['a']);
  // Late in the day the share grows; checked items are skipped.
  const prev = { items: [['a', 'A', 1, 0, '', 'u', today], ['b', 'B', 1, 0, '', 'u', '2026-10-01']], missing: [['c', today]] };
  const late = Date.parse('2026-10-02T15:07:00Z');
  assert.deepEqual(planRun(prev, { today, now: late, until, everyMin: 30, basket }), ['b', 'd', 'e', 'f']);
  // After the deadline nothing is checked; without one, everything left.
  assert.deepEqual(planRun(prev, { today, now: until, until, everyMin: 30, basket }), []);
  assert.deepEqual(planRun(prev, { today, basket }).length, 8);
});

test('runs: new results over the previous file', () => {
  const basket = ['milk', 'eggs', 'bread'];
  const prev = { items: [['bread', 'Old Bread', 1, 0, '', 'u', '2026-10-01'], ['milk', 'Old Milk', 2, 0, '', 'u', '2026-10-01']], missing: [['eggs', '2026-10-01']] };
  const out = mergeRows(prev, [['milk', 'New Milk', 1.5, 0.66, 'l', 'u', '2026-10-02'], ['eggs', 'Eggs 6', 1.8, 0, '', 'u', '2026-10-02']], [['bread', '2026-10-02']], basket);
  assert.deepEqual(out.items.map((r) => r[1]), ['New Milk', 'Eggs 6', 'Old Bread']);
  assert.equal(out.date, '2026-10-02');
  assert.deepEqual(out.missing, [['bread', '2026-10-02']]);
  // The bread price from yesterday stays, but counts as checked today.
  assert.deepEqual(planRun(out, { today: '2026-10-02', basket }), []);
  assert.equal(mergeRows(null, [], [], basket).items.length, 0);
});

test('app: the date each basket item was checked', () => {
  const db = { date: '2026-10-02', items: [['milk', 'Milk', 1, 0, '', 'u', '2026-10-01']] };
  assert.equal(basketMatch(db, 'milk').date, '2026-10-01');
});
