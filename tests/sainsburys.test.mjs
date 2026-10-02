import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordsOf, basketMatch } from '../js/prices.js';
import { BASKET, searchWords, robotsAllows, perUnit, pickCheapest } from '../scripts/sainsburys-build.mjs';
import { G } from '../js/glossary.js';

test('words: plurals fold to the singular', () => {
  assert.deepEqual(wordsOf("Sainsbury's British Pork Sausages x8"), ['sainsbury', 's', 'british', 'pork', 'sausage', 'x8']);
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
  assert.equal(robotsAllows(txt, '/groceries-api/gol-services/product/v1/product?filter[keyword]=milk'), true);
  assert.equal(robotsAllows(txt, '/webapp/x'), false);
  assert.equal(robotsAllows(txt, '/webapp/wcs/stores/servlet/gb/groceries/milk'), true);
  assert.equal(robotsAllows(txt, '/shop?a=1&sort=price'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /groceries-api/', '/groceries-api/gol-services/product'), false);
  // Consecutive User-agent lines form one group.
  assert.equal(robotsAllows('User-agent: *\nUser-agent: bingbot\nDisallow: /x', '/x/y'), false);
  assert.equal(robotsAllows('', '/anything'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /a$', '/a/b'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /a$', '/a'), false);
});

test('unit prices per litre, kilo or item', () => {
  assert.deepEqual(perUnit({ price: 0.75, measure: 'ltr', measure_amount: 1 }), { value: 0.75, per: 'l' });
  assert.deepEqual(perUnit({ price: 0.2, measure: '100ml' }), { value: 2, per: 'l' });
  assert.deepEqual(perUnit({ price: 1.5, measure: '100g' }), { value: 15, per: 'kg' });
  assert.deepEqual(perUnit({ price: 0.25, measure: 'ea' }), { value: 0.25, per: 'pc' });
  assert.equal(perUnit({ price: 1, measure: 'pint' }), null);
  assert.equal(perUnit(null), null);
});

const prod = (name, price, unit, measure, extra = {}) => ({
  name, retail_price: { price }, unit_price: { price: unit, measure, measure_amount: 1 }, full_url: `/gol-ui/product/${name.length}`, ...extra,
});

test('cheapest product: all words, unit price, longer items excluded', () => {
  const butter = [
    prod('Sainsbury\'s Smooth Peanut Butter 340g', 1.2, 0.35, '100g'),
    prod('Lurpak Slightly Salted Spreadable Butter 500g', 5.5, 1.1, '100g'),
    prod('Sainsbury\'s British Salted Butter 250g', 1.99, 0.8, '100g'),
    prod('Butter Croissants x4', 1.5, 0.38, 'ea'),
  ];
  const row = pickCheapest(butter, 'butter');
  assert.equal(row[1], "Sainsbury's British Salted Butter 250g");
  assert.deepEqual(row.slice(2, 5), [1.99, 8, 'kg']);
  assert.match(row[5], /^https:\/\/www\.sainsburys\.co\.uk\/gol-ui\/product\//);
  assert.equal(pickCheapest(butter, 'peanut butter')[1], "Sainsbury's Smooth Peanut Butter 340g");

  const juice = [
    prod('Tropicana Orange Juice 850ml', 2.5, 2.94, 'ltr'),
    prod('Sainsbury\'s Orange Juice Smooth 1L', 1.1, 1.1, 'ltr', { is_available: false }),
    prod('Sainsbury\'s Pure Orange Juice 1.75L', 2.2, 1.26, 'ltr'),
    prod('Sainsbury\'s Oranges x5', 1.8, 0.36, 'ea'),
  ];
  assert.equal(pickCheapest(juice, 'orange juice')[1], "Sainsbury's Pure Orange Juice 1.75L");
  assert.equal(pickCheapest(juice, 'oranges')[1], "Sainsbury's Oranges x5");
  // The search wording after "|" is what has to be in the name.
  assert.equal(pickCheapest([prod('Andrex Toilet Tissue 9 Rolls', 6, 0.67, 'ea')], 'toilet paper|toilet tissue')[0], 'toilet paper|toilet tissue');
  assert.equal(pickCheapest([], 'milk'), null);
  // Without unit prices the shelf price decides.
  assert.equal(pickCheapest([prod('Eggs 12', 3, 0, ''), prod('Eggs 6', 1.8, 0, '')], 'eggs')[2], 1.8);
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
