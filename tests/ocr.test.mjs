import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, priceCandidates } from '../js/ocr.js';

test('parseAmount handles UK, EU and HK number styles', () => {
  assert.equal(parseAmount('12.99'), 12.99);
  assert.equal(parseAmount('12,99'), 12.99);
  assert.equal(parseAmount('1,299'), 1299);
  assert.equal(parseAmount('1.299'), 1299);
  assert.equal(parseAmount('1.299,00'), 1299);
  assert.equal(parseAmount('1,299.50'), 1299.5);
  assert.equal(parseAmount('1 299'), 1299);
});

test('priceCandidates prefers big text and currency symbols', () => {
  const words = [
    { text: '500g', height: 12 },
    { text: 'Was £3.50', height: 14 },
    { text: '£2.75', height: 60 },
    { text: '55p/100g', height: 10 },
  ];
  const c = priceCandidates(words);
  assert.deepEqual(c[0], { value: 2.75, currency: 'GBP' });
  assert.ok(c.some((x) => x.value === 3.5));
  assert.ok(!c.some((x) => x.value === 500 && !x.currency) || c[0].value === 2.75);
});

test('euro written after the number and HK$ prefix', () => {
  assert.deepEqual(priceCandidates([{ text: '19,99 €', height: 40 }])[0], { value: 19.99, currency: 'EUR' });
  assert.deepEqual(priceCandidates([{ text: 'HK$1,280', height: 40 }])[0], { value: 1280, currency: 'HKD' });
});

test('bare small integers are ignored', () => {
  assert.deepEqual(priceCandidates([{ text: '6 pack 2', height: 30 }]), []);
});

test('a currency symbol read as its own word still counts', () => {
  assert.deepEqual(priceCandidates([{ text: '39,99', height: 90 }, { text: '€', height: 80 }])[0], { value: 39.99, currency: 'EUR' });
  assert.deepEqual(priceCandidates([{ text: '£', height: 90 }, { text: '4.75', height: 90 }])[0], { value: 4.75, currency: 'GBP' });
});
