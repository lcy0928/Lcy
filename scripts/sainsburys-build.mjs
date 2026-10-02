// Build data/sainsburys.json: today's cheapest Sainsbury's product for a basket of
// 50 everyday items, from Sainsbury's own product search API.
//
//   node scripts/sainsburys-build.mjs <out.json> [--check]
//
// Polite by design: honours robots.txt, identifies itself, one request every
// 1.5 s, once a day. --check fetches the first three items only (used in PR CI).
// Output: { v, date, items: [[item, name, price, unit price, per ('l'|'kg'|'pc'|''), url]] }

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { wordsOf } from '../js/prices.js';

const SITE = 'https://www.sainsburys.co.uk';
const API = '/groceries-api/gol-services/product/v1/product';
const UA = 'PriceBook/1.0 (personal price comparison; +https://github.com/lcy0928/Lcy)';

// English names as the app's glossary translates them (橙汁 → orange juice); after "|"
// the wording Sainsbury's uses, which is searched for instead.
export const BASKET = [
  'milk', 'vegetable oil', 'oat milk', 'soy milk', 'eggs', 'bread', 'butter', 'cheese', 'yogurt', 'cream|double cream',
  'orange juice', 'apple juice', 'mineral water', 'tea|tea bags', 'ground coffee', 'coffee beans', 'instant noodles', 'rice', 'pasta', 'flour',
  'sugar|granulated sugar', 'salt', 'honey|clear honey', 'jam', 'peanut butter', 'cornflakes|corn flakes', 'porridge oats', 'biscuits', 'chocolate', 'crisps',
  'ice cream', 'chicken breast', 'beef mince', 'bacon', 'sausages', 'salmon', 'bananas', 'apples', 'oranges', 'strawberries',
  'tomatoes', 'potatoes', 'onions', 'carrots', 'broccoli', 'olive oil', 'soy sauce', 'toilet paper|toilet tissue', 'washing up liquid', 'laundry detergent|laundry liquid',
];

/** What to search for: the Sainsbury's wording when there is one. */
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

/** Sainsbury's unit price → value per litre / kilo / item. */
export function perUnit(up) {
  const v = Number(up?.price);
  const m = String(up?.measure || '').toLowerCase().replace(/\s+/g, '');
  const amount = Number(up?.measure_amount) || 1;
  if (!(v > 0)) return null;
  if (/^(ltr|l|litre)$/.test(m)) return { value: v / amount, per: 'l' };
  if (m === '100ml') return { value: v * 10, per: 'l' };
  if (m === 'kg') return { value: v / amount, per: 'kg' };
  if (m === '100g') return { value: v * 10, per: 'kg' };
  if (/^(ea|each|unit|sht|sheet)$/.test(m)) return { value: v / amount, per: 'pc' };
  return null;
}

/**
 * The cheapest product whose name has every word of the item: by unit price in the
 * most common unit among the matches, otherwise by shelf price. Products that are a
 * longer basket item ("peanut butter" when looking for butter) don't count.
 */
export function pickCheapest(products, item, basket = BASKET) {
  const words = wordsOf(searchWords(item));
  const longer = basket.map((b) => wordsOf(searchWords(b)))
    .filter((w) => w.length > words.length && words.every((x) => w.includes(x)));
  const hits = (products || []).filter((p) => {
    const price = Number(p?.retail_price?.price);
    if (!(price > 0) || p.is_available === false) return false;
    const name = wordsOf(p.name);
    return words.every((w) => name.includes(w)) && !longer.some((l) => l.every((w) => name.includes(w)));
  }).map((p) => ({ p, price: Number(p.retail_price.price), pu: perUnit(p.unit_price) }));
  if (!hits.length) return null;
  const count = {};
  for (const h of hits) if (h.pu) count[h.pu.per] = (count[h.pu.per] || 0) + 1;
  const main = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
  const key = (h) => (main && h.pu?.per === main ? h.pu.value : Infinity);
  hits.sort((a, b) => key(a) - key(b) || a.price - b.price);
  const { p, price, pu } = hits[0];
  const url = p.full_url ? (String(p.full_url).startsWith('http') ? p.full_url : `${SITE}${p.full_url}`) : '';
  const usePu = pu && pu.per === main;
  return [item, String(p.name).trim(), price, usePu ? Math.round(pu.value * 100) / 100 : 0, usePu ? pu.per : '', url];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const searchPath = (item) => `${API}?filter[keyword]=${encodeURIComponent(searchWords(item))}&page_size=60`;

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [out, flag] = process.argv.slice(2);
  const check = flag === '--check';
  const robots = await fetch(`${SITE}/robots.txt`, { headers: { 'User-Agent': UA } }).then((r) => (r.ok ? r.text() : ''));
  if (!robotsAllows(robots, searchPath('milk'))) throw new Error(`robots.txt disallows ${API}`);
  const items = [];
  const failed = [];
  const basket = check ? BASKET.slice(0, 3) : BASKET;
  for (const item of basket) {
    const res = await fetch(`${SITE}${searchPath(item)}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.status === 403 || res.status === 429) throw new Error(`blocked: HTTP ${res.status} on "${item}"`);
    if (!res.ok) failed.push(`${item}: HTTP ${res.status}`);
    else {
      const row = pickCheapest((await res.json()).products, item);
      if (row) items.push(row); else failed.push(`${item}: no match`);
    }
    await sleep(1500);
  }
  for (const it of items) console.log(`${it[0]} → £${it[2]} ${it[1]}${it[4] ? ` (£${it[3]}/${it[4]})` : ''}`);
  if (failed.length) console.log(`not found: ${failed.join('; ')}`);
  if (!items.length || (!check && items.length < basket.length / 2)) throw new Error(`only ${items.length} items`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ v: 1, date: new Date().toISOString().slice(0, 10), items }));
  console.log(`${items.length}/${basket.length} items → ${out}`);
}
