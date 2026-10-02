// Build compact European supermarket price files for the app.
//
//   node scripts/market-build.mjs nl <out.json> <checkjebon-git-dir>
//   node scripts/market-build.mjs at <out.json> <latest-canonical.json>
// writes <out.json> (up-to-date stores) and <out>-old.json (stores whose prices stopped changing).
//
// nl: checkjebon.nl (github.com/supermarkt/checkjebon, MIT). The data file is
//     committed daily; a store whose product list hasn't changed for 14 days is
//     flagged as not fresh, using the git history to see when it last changed.
// at: Heisse Preise (heisse-preise.io, MIT) daily dump from
//     github.com/falknerdominik/heisse-preise-data. A store is fresh when some
//     price changed within 14 days. Drugstores and Slovenia are left out.
//
// Output: { v, date, market, stores:[{code, fresh, lastChange, link}], items:[[s, name, price, qty, unit, linkPart]] }
// Product links are kept for up-to-date stores only; old pages of stale stores are mostly gone,
// and the app falls back to a search on the store's site.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseSize, normaliseQty, AT_STORE_ALIAS } from '../js/market.js';

export const FRESH_DAYS = 14;
const DAY = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const round2 = (n) => Math.round(n * 100) / 100;
const cleanName = (s) => String(s || '').replace(/\bnull\b/g, ' ').replace(/^00\s/, '').replace(/\s+/g, ' ').trim();

// ---------- Netherlands ----------

const storeHash = (store) => createHash('sha1').update(JSON.stringify(store.d || [])).digest('hex');

/**
 * current: today's checkjebon array [{ n, u, d:[{n,l,p,s}] }]
 * history: [{ date, hashes:{code: hash} }] newest first (older snapshots of the same file)
 */
export function buildNl(current, history, today) {
  const withData = current.filter((s) => Array.isArray(s.d) && s.d.length);
  const stores = withData.map((s) => {
    const hash = storeHash(s);
    // The oldest snapshot still identical to today (walking back until something differs).
    let since = today;
    for (const h of history) {
      if (h.hashes[s.n] !== hash) break;
      since = h.date;
    }
    const fresh = daysBetween(since, today) < FRESH_DAYS;
    return { code: s.n, fresh, lastChange: since, link: fresh && s.u ? `${s.u}{x}` : '', src: s };
  }).sort((a, b) => b.fresh - a.fresh);
  const items = [];
  stores.forEach((st, idx) => {
    for (const p of st.src.d) {
      if (!(p.p > 0) || !p.n) continue;
      const size = parseSize(p.s) || parseSize(p.n);
      items.push([idx, cleanName(p.n), round2(p.p), size ? round2(size.qty) : 0, size ? size.unit : '', (st.link && p.l) || '']);
    }
    delete st.src;
  });
  return { v: 1, date: today, market: 'nl', stores, items };
}

/** Read snapshots from the checkjebon git history: about 1, 2, 4 … 512 days back. */
function nlHistory(dir, today) {
  const log = execFileSync('git', ['-C', dir, 'log', '--format=%H %cs', '--', 'data/supermarkets.json'], { encoding: 'utf8' })
    .trim().split('\n').map((l) => l.split(' ')).map(([sha, date]) => ({ sha, date }));
  const out = [];
  const used = new Set();
  for (let back = 1; back <= 512; back *= 2) {
    const cutoff = new Date(Date.parse(today) - back * DAY).toISOString().slice(0, 10);
    const c = log.find((e) => e.date <= cutoff);
    if (!c || used.has(c.sha)) continue;
    used.add(c.sha);
    try {
      const raw = execFileSync('git', ['-C', dir, 'show', `${c.sha}:data/supermarkets.json`], { encoding: 'utf8', maxBuffer: 1 << 30 });
      const hashes = {};
      for (const s of JSON.parse(raw)) hashes[s.n] = storeHash(s);
      out.push({ date: c.date, hashes });
    } catch (e) {
      console.warn(`skip ${c.sha}: ${e.message}`);
    }
  }
  return out;
}

// ---------- Austria ----------

// Supermarkets only; drugstores (dm, bipa, müller) and Slovenia are left out.
const AT_STORES = ['billa', 'spar', 'hofer', 'mpreis', 'unimarkt', 'penny', 'reweDe'];
const AT_LINKS = {
  billa: ['https://shop.billa.at/produkte/{x}', (p) => p.url],
  sparAt: ['https://www.interspar.at/shop/lebensmittel/p/{x}', (p) => p.id],
  hofer: ['https://www.roksh.at/hofer/produkte/{x}', (p) => p.url],
  mpreis: ['https://www.mpreis.at/shop/p/{x}', (p) => p.id],
  unimarkt: ['https://shop.unimarkt.at/{x}', (p) => p.url],
  penny: ['https://www.penny.at/produkte/{x}', (p) => p.url],
  reweDe: ['https://shop.rewe.de/p/{x}', (p) => `${String(p.name).toLowerCase().replace(/\s+/g, '-')}/${p.id}`],
};

/** Heisse Preise canonical items → compact file. */
export function buildAt(all, today) {
  const by = {};
  for (const p of all) {
    if (!AT_STORES.includes(p.store)) continue;
    const code = AT_STORE_ALIAS[p.store] || p.store;
    (by[code] ||= []).push(p);
  }
  const lastChange = (list, avail) => list.reduce((m, p) => {
    const d = p.priceHistory?.[0]?.date || '';
    return (!avail || !p.unavailable) && d > m ? d : m;
  }, '');
  const stores = Object.entries(by).map(([code, list]) => {
    const last = lastChange(list, true) || lastChange(list, false);
    const fresh = !!last && daysBetween(last, today) < FRESH_DAYS;
    return { code, fresh, lastChange: last, link: (fresh && AT_LINKS[code]?.[0]) || '' };
  }).sort((a, b) => b.fresh - a.fresh);
  const items = [];
  stores.forEach((s, idx) => {
    const part = (s.link && AT_LINKS[s.code]?.[1]) || (() => '');
    for (const p of by[s.code]) {
      // An up-to-date store marks discontinued products unavailable; a stale store marks everything.
      if (s.fresh && p.unavailable) continue;
      if (!(p.price > 0) || !p.name) continue;
      const size = normaliseQty(p.quantity, p.unit) || parseSize(p.name);
      items.push([idx, cleanName(p.name), round2(p.price), size ? round2(size.qty) : 0, size ? size.unit : '', String(part(p) ?? '')]);
    }
  });
  return { v: 1, date: today, market: 'at', stores, items };
}

/** The up-to-date (keep = true) or out-of-date stores of a built file, re-indexed. */
export function splitStores(data, keep) {
  const map = new Map();
  const stores = [];
  data.stores.forEach((st, i) => {
    if (st.fresh === keep) { map.set(i, stores.length); stores.push(st); }
  });
  const items = data.items.filter((it) => map.has(it[0])).map((it) => [map.get(it[0]), ...it.slice(1)]);
  return { ...data, stores, items };
}

// ---------- CLI ----------

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [market, out, src] = process.argv.slice(2);
  const today = new Date().toISOString().slice(0, 10);
  let data;
  if (market === 'nl') {
    const current = JSON.parse(execFileSync('git', ['-C', src, 'show', 'HEAD:data/supermarkets.json'], { encoding: 'utf8', maxBuffer: 1 << 30 }));
    data = buildNl(current, nlHistory(src, today), today);
  } else if (market === 'at') {
    data = buildAt(JSON.parse(readFileSync(src, 'utf8')), today);
  } else {
    console.error('usage: market-build.mjs nl|at <out.json> <source>');
    process.exit(2);
  }
  if (!data.items.filter((it) => data.stores[it[0]].fresh).length) throw new Error('no up-to-date items');
  // Up-to-date stores go in <out>, the rest in <out>-old.json so the main list loads first.
  for (const [file, keep] of [[out, true], [out.replace(/\.json$/, '-old.json'), false]]) {
    const part = splitStores(data, keep);
    writeFileSync(file, JSON.stringify(part));
    console.log(`${part.items.length} items → ${file}`);
  }
  for (const s of data.stores) console.log(`${s.code}: ${s.fresh ? 'fresh' : 'stale'}, unchanged since ${s.lastChange}`);
}
