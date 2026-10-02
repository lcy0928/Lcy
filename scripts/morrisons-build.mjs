// Build data/morrisons.json: today's cheapest Morrisons product for a basket of 50
// everyday items, read from the Morrisons online shop's search pages.
//
//   node scripts/morrisons-build.mjs <out.json> [--check]
//
// Polite by design: honours robots.txt (search pages are allowed, /api/ is not),
// identifies itself, one page every 3 s, once a day. --check reads the first three
// items only (used in PR CI).
// Output: { v, date, items: [[item, name, price, unit price, per ('l'|'kg'|'pc'|''), url]] }

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { wordsOf } from '../js/prices.js';

const SITE = 'https://groceries.morrisons.com';
const UA = 'PriceBook/1.0 (personal price comparison; +https://github.com/lcy0928/Lcy)';

// English names as the app's glossary translates them (橙汁 → orange juice); after "|"
// the wording the shop uses, which is searched for instead.
export const BASKET = [
  'milk', 'vegetable oil', 'oat milk', 'soy milk', 'eggs', 'bread', 'butter', 'cheese', 'yogurt', 'cream|double cream',
  'orange juice', 'apple juice', 'mineral water', 'tea|tea bags', 'ground coffee', 'coffee beans', 'instant noodles', 'rice', 'pasta', 'flour',
  'sugar|granulated sugar', 'salt', 'honey|clear honey', 'jam', 'peanut butter', 'cornflakes|corn flakes', 'porridge oats', 'biscuits', 'chocolate', 'crisps',
  'ice cream', 'chicken breast', 'beef mince', 'bacon', 'sausages', 'salmon', 'bananas', 'apples', 'oranges', 'strawberries',
  'tomatoes', 'potatoes', 'onions', 'carrots', 'broccoli', 'olive oil', 'soy sauce', 'toilet paper|toilet tissue', 'washing up liquid', 'laundry detergent|laundry liquid',
];

/** What to search for: the shop's wording when there is one. */
export const searchWords = (item) => item.split('|').pop();

/** Is `path` allowed for every crawler ("User-agent: *") in robots.txt? (RFC 9309) */
export function robotsAllows(txt, path) {
  let applies = false;
  let lastAgent = false; // consecutive User-agent lines share one group
  const rules = [];
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      applies = (lastAgent && applies) || value === '*';
      lastAgent = true;
      continue;
    }
    lastAgent = false;
    if (applies && value) rules.push([key, value]);
  }
  // The longest matching rule wins; on a tie, allow.
  let best = null;
  for (const [key, rule] of rules) {
    const re = new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
    if (!re.test(path)) continue;
    if (!best || rule.length > best[1].length || (rule.length === best[1].length && key === 'allow')) best = [key, rule];
  }
  return !best || best[0] === 'allow';
}

/** Morrisons unit price label ("fop.price.per.litre") and amount → value per litre / kilo / item. */
export function perUnit(label, amount) {
  const v = Number(amount);
  const m = String(label || '').toLowerCase().replace(/^.*\.per\./, '');
  if (!(v > 0)) return null;
  if (/^(litre|liter|ltr|l)$/.test(m)) return { value: v, per: 'l' };
  if (/^(100ml|100\.ml)$/.test(m)) return { value: v * 10, per: 'l' };
  if (/^(kg|kilo|kilogram)$/.test(m)) return { value: v, per: 'kg' };
  if (/^(100g|100\.g)$/.test(m)) return { value: v * 10, per: 'kg' };
  if (/^(each|item|unit|ea|sheet|roll|pack)$/.test(m)) return { value: v, per: 'pc' };
  return null;
}

/** The products in a Morrisons search page (window.__INITIAL_STATE__), with their links. */
export function pageProducts(html, unknown = new Set()) {
  const m = String(html).match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/);
  if (!m) return [];
  const state = JSON.parse(m[1].trim().replace(/;$/, ''));
  const entities = state?.data?.products?.productEntities || {};
  return Object.values(entities).map((p) => {
    const unit = p.price?.unit;
    const pu = perUnit(unit?.label, unit?.current?.amount);
    if (unit?.label && !pu) unknown.add(unit.label);
    const id = String(p.retailerProductId || '');
    const href = id && String(html).match(new RegExp(`href="(/products/[^"?#]+/${id})"`));
    return {
      name: String(p.name || '').trim(),
      price: Number(p.price?.current?.amount),
      pu,
      available: p.available !== false,
      url: href ? `${SITE}${href[1]}` : `${SITE}/search?q=${encodeURIComponent(p.name || '')}`,
    };
  });
}

/**
 * The cheapest product whose name has every word of the item: by unit price in the
 * most common unit among the matches, otherwise by shelf price. Products that are a
 * longer basket item ("peanut butter" when looking for butter) don't count.
 * products: [{ name, price, pu: { value, per } | null, available, url }]
 */
export function pickCheapest(products, item, basket = BASKET) {
  const words = wordsOf(searchWords(item));
  const longer = basket.map((b) => wordsOf(searchWords(b)))
    .filter((w) => w.length > words.length && words.every((x) => w.includes(x)));
  const hits = (products || []).filter((p) => {
    if (!(p.price > 0) || p.available === false) return false;
    const name = wordsOf(p.name);
    return words.every((w) => name.includes(w)) && !longer.some((l) => l.every((w) => name.includes(w)));
  });
  if (!hits.length) return null;
  const count = {};
  for (const h of hits) if (h.pu) count[h.pu.per] = (count[h.pu.per] || 0) + 1;
  const main = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
  const key = (h) => (main && h.pu?.per === main ? h.pu.value : Infinity);
  const best = [...hits].sort((a, b) => key(a) - key(b) || a.price - b.price)[0];
  const usePu = best.pu && best.pu.per === main;
  return [item, best.name, best.price, usePu ? Math.round(best.pu.value * 100) / 100 : 0, usePu ? best.pu.per : '', best.url];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const searchPath = (item) => `/search?q=${encodeURIComponent(searchWords(item))}`;

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [out, flag] = process.argv.slice(2);
  const check = flag === '--check';
  const robots = await fetch(`${SITE}/robots.txt`, { headers: { 'User-Agent': UA } }).then((r) => (r.ok ? r.text() : ''));
  if (!robotsAllows(robots, searchPath('milk'))) throw new Error('robots.txt disallows the search pages');
  const items = [];
  const failed = [];
  const unknown = new Set();
  const basket = check ? BASKET.slice(0, 3) : BASKET;
  for (const item of basket) {
    const res = await fetch(`${SITE}${searchPath(item)}`, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
    if (res.status === 403 || res.status === 429) throw new Error(`blocked: HTTP ${res.status} on "${item}"`);
    if (!res.ok) failed.push(`${item}: HTTP ${res.status}`);
    else {
      const row = pickCheapest(pageProducts(await res.text(), unknown), item);
      if (row) items.push(row); else failed.push(`${item}: no match`);
    }
    await sleep(3000);
  }
  for (const it of items) console.log(`${it[0]} → £${it[2]} ${it[1]}${it[4] ? ` (£${it[3]}/${it[4]})` : ''} ${it[5]}`);
  if (failed.length) console.log(`not found: ${failed.join('; ')}`);
  if (unknown.size) console.log(`unknown unit labels: ${[...unknown].join(', ')}`);
  if (!items.length || (!check && items.length < basket.length / 2)) throw new Error(`only ${items.length} items`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ v: 1, date: new Date().toISOString().slice(0, 10), items }));
  console.log(`${items.length}/${basket.length} items → ${out}`);
}
