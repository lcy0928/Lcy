import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFromUrl, extractUrl, nameFromUrl, siteDomain } from '../js/detect.js';
import { DEFAULT_SITES } from '../js/sites.js';

test('known store links resolve to the right site, region and currency', () => {
  const a = detectFromUrl('https://www.amazon.co.uk/Comandante-C40-MK4/dp/B0ABC', DEFAULT_SITES);
  assert.equal(a.site.id, 'amazon-uk');
  assert.equal(a.region, 'UK');
  assert.equal(a.currency, 'GBP');
  const h = detectFromUrl('https://www.hktvmall.com/hktv/zh/main/xxx/p/H123', DEFAULT_SITES);
  assert.equal(h.site.id, 'hktvmall');
  assert.equal(h.currency, 'HKD');
  const t = detectFromUrl('https://item.taobao.com/item.htm?id=1', DEFAULT_SITES);
  assert.equal(t.currency, 'CNY');
});

test('second-hand marketplaces set the condition to used', () => {
  const e = detectFromUrl('https://www.ebay.co.uk/itm/123456', DEFAULT_SITES);
  assert.equal(e.site.id, 'ebay-uk-used');
  assert.equal(e.cond, 'used');
});

test('sites searched through Google are matched by their own domain', () => {
  const c = detectFromUrl('https://coffeehit.co.uk/products/comandante', DEFAULT_SITES);
  assert.equal(c.site.id, 'coffeehit');
  assert.equal(siteDomain(DEFAULT_SITES.find((s) => s.id === 'coffeehit')), 'coffeehit.co.uk');
});

test('unknown stores fall back to region by top-level domain', () => {
  assert.equal(detectFromUrl('https://shop.example.de/x', DEFAULT_SITES).currency, 'EUR');
  assert.equal(detectFromUrl('https://example.co.uk/x', DEFAULT_SITES).region, 'UK');
  assert.equal(detectFromUrl('https://example.com.hk/x', DEFAULT_SITES).currency, 'HKD');
  assert.equal(detectFromUrl('https://example.com/x', DEFAULT_SITES).region, 'GLOBAL');
  assert.equal(detectFromUrl('not a url', DEFAULT_SITES), null);
});

test('extractUrl pulls the first link out of shared text', () => {
  assert.equal(extractUrl('Look at this! https://amzn.eu/d/abc123.'), 'https://amzn.eu/d/abc123');
  assert.equal(extractUrl('no link here'), '');
});

test('nameFromUrl turns a slug into a readable name', () => {
  assert.equal(nameFromUrl('https://www.amazon.co.uk/Comandante-C40-MK4-Nitro-Blade/dp/B07'), 'Comandante C40 MK4 Nitro Blade');
  assert.equal(nameFromUrl('https://shop.test/products/fellow-ode-gen-2.html'), 'fellow ode gen 2');
  assert.equal(nameFromUrl('https://shop.test/p/123'), '');
});

test('regional subdomains pick the matching market', () => {
  assert.equal(detectFromUrl('https://uk.hotels.com/ho123', DEFAULT_SITES).site.id, 'hotels-uk');
  assert.equal(detectFromUrl('https://hk.hotels.com/ho123', DEFAULT_SITES).site.id, 'hotels-hk');
});
