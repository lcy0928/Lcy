// European supermarket prices from community open-data projects, refreshed daily
// by the deploy workflow (scripts/market-build.mjs) into data/nl.json and data/at.json.
//   nl: checkjebon.nl (MIT) — Dutch supermarkets
//   at: Heisse Preise (MIT) — Austrian supermarkets (+ REWE Germany)
// Each store carries a freshness flag: stores whose prices stopped changing are
// listed separately as possibly out of date, never as the cheapest.

export const MARKETS = {
  nl: { lang: 'nl', country: 'NL', source: 'checkjebon.nl', sourceUrl: 'https://www.checkjebon.nl/' },
  at: { lang: 'de', country: 'AT', source: 'Heisse Preise', sourceUrl: 'https://heisse-preise.io/' },
};

export const STORES = {
  // Netherlands (checkjebon codes)
  ah: ['Albert Heijn', 'ah.nl'], jumbo: ['Jumbo', 'jumbo.com'], lidl: ['Lidl NL', 'lidl.nl'], plus: ['Plus', 'plus.nl'],
  dirk: ['Dirk', 'dirk.nl'], hoogvliet: ['Hoogvliet', 'hoogvliet.com'], dekamarkt: ['DekaMarkt', 'dekamarkt.nl'],
  spar: ['Spar NL', 'spar.nl'], vomar: ['Vomar', 'vomar.nl'], poiesz: ['Poiesz', 'poiesz-supermarkten.nl'],
  aldi: ['Aldi NL', 'aldi.nl'], ekoplaza: ['Ekoplaza', 'ekoplaza.nl'], coop: ['Coop NL', 'coop.nl'],
  // Austria / Germany (Heisse Preise codes)
  billa: ['BILLA', 'billa.at'], sparAt: ['SPAR AT', 'spar.at'], hofer: ['HOFER', 'hofer.at'], mpreis: ['MPREIS', 'mpreis.at'],
  unimarkt: ['Unimarkt', 'unimarkt.at'], penny: ['PENNY', 'penny.at'], reweDe: ['REWE (DE)', 'rewe.de'],
};

// Heisse Preise uses "spar" for SPAR Austria; keep it apart from Spar NL.
export const AT_STORE_ALIAS = { spar: 'sparAt' };
// Countries for the Austrian file's stores (REWE is German).
export const STORE_COUNTRY = { reweDe: 'DE' };

export const storeName = (code) => STORES[code]?.[0] || code;
export const storeDomain = (code) => STORES[code]?.[1] || '';

/**
 * Parse a pack size into { qty, unit } with unit 'g', 'ml' or 'pc'.
 * Handles "1 l", "0,75 l", "Per 350 g", "2 x 250 ml", "1.5 liter", "330ML", "ca. 500 g", "6 stuks", "per stuk".
 */
export function parseSize(text) {
  const s = String(text || '').toLowerCase().replace(/,/g, '.').trim();
  if (!s) return null;
  if (/^per\s*(stuk|st)\b/.test(s) || /^per\s*pakket/.test(s)) return { qty: 1, unit: 'pc' };
  const m = s.match(/(?:(\d+(?:\.\d+)?)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kilogram|kilo|kg|gram|gr|g|milliliter|ml|centiliter|cl|liter|l|stuks|stuk|st|stück|stk)\b/);
  if (!m) return null;
  const n = (m[1] ? parseFloat(m[1]) : 1) * parseFloat(m[2]);
  if (!(n > 0)) return null;
  const u = m[3];
  if (/^(kilogram|kilo|kg)$/.test(u)) return { qty: n * 1000, unit: 'g' };
  if (/^(gram|gr|g)$/.test(u)) return { qty: n, unit: 'g' };
  if (/^(milliliter|ml)$/.test(u)) return { qty: n, unit: 'ml' };
  if (/^(centiliter|cl)$/.test(u)) return { qty: n * 10, unit: 'ml' };
  if (/^(liter|l)$/.test(u)) return { qty: n * 1000, unit: 'ml' };
  return { qty: n, unit: 'pc' };
}

/** Normalise Heisse Preise quantity + unit ("g", "ml", "l", "kg", "stk", "stück"). */
export function normaliseQty(quantity, unit) {
  const q = Number(quantity);
  if (!(q > 0)) return null;
  const u = String(unit || '').toLowerCase();
  if (u === 'kg') return { qty: q * 1000, unit: 'g' };
  if (u === 'g') return { qty: q, unit: 'g' };
  if (u === 'l') return { qty: q * 1000, unit: 'ml' };
  if (u === 'ml') return { qty: q, unit: 'ml' };
  if (u === 'stk' || u === 'stück') return { qty: q, unit: 'pc' };
  return null;
}

/** Price per kg, per litre or per piece. */
export function perUnit(price, qty, unit) {
  if (!(price > 0) || !(qty > 0)) return null;
  if (unit === 'g') return { value: (price / qty) * 1000, per: 'kg' };
  if (unit === 'ml') return { value: (price / qty) * 1000, per: 'l' };
  if (unit === 'pc') return { value: price / qty, per: 'pc' };
  return null;
}

/** Expand the compact file: { v, date, market, stores:[{code, fresh, lastChange, link}], items:[[s, name, price, qty, unit, linkPart]] } */
export function expandMarket(data) {
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.stores)) return null;
  const items = [];
  for (const [si, name, price, qty, unit, part] of data.items) {
    const st = data.stores[si];
    if (!st) continue;
    items.push({
      i: items.length,
      store: st.code,
      fresh: !!st.fresh,
      name,
      price,
      qty: qty || 0,
      unit: unit || '',
      url: st.link && part ? st.link.replace('{x}', part) : '',
      pu: perUnit(price, qty, unit),
    });
  }
  return { date: data.date, market: data.market, stores: data.stores, items };
}

const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Products whose name contains every word of the query (accents and punctuation ignored).
 * Up-to-date stores come back cheapest first — by price per kg/litre when sizes
 * are comparable, otherwise by price — and out-of-date stores separately.
 * `store` limits the search to one store.
 */
export function searchMarket(db, query, { limit = 8, staleLimit = 5, store = '' } = {}) {
  const words = fold(query).replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((w) => w.length > 1);
  if (!db || !words.length) return { fresh: [], stale: [], rankedBy: '' };
  // Long words match inside compounds (Milch → Vollmilch); short ones only at a word start (Eis ≠ Reis).
  const tests = words.map((w) => (w.length >= 5 ? (t) => t.includes(w) : (t) => t.startsWith(w) || t.includes(` ${w}`)));
  const hits = db.items.filter((p) => {
    if (store && p.store !== store) return false;
    const t = p.folded || (p.folded = ` ${fold(p.name).replace(/[^\p{L}\p{N}]+/gu, ' ')}`);
    return tests.every((f) => f(t));
  });
  // Rank by unit price within the most common unit, so 330 ml cans don't beat 1 l cartons on sticker price.
  const unitCount = {};
  for (const p of hits) if (p.pu) unitCount[p.pu.per] = (unitCount[p.pu.per] || 0) + 1;
  const mainUnit = Object.entries(unitCount).sort((a, b) => b[1] - a[1])[0]?.[0];
  const key = (p) => (mainUnit && p.pu?.per === mainUnit ? p.pu.value : Infinity);
  const sorted = hits.sort((a, b) => key(a) - key(b) || a.price - b.price);
  return {
    fresh: sorted.filter((p) => p.fresh).slice(0, limit),
    stale: sorted.filter((p) => !p.fresh).slice(0, staleLimit),
    rankedBy: mainUnit || '',
  };
}

/** The product page, or a Google search limited to the store's site when there's no link. */
export const productLink = (p) =>
  p.url || `https://www.google.com/search?q=${encodeURIComponent(`site:${storeDomain(p.store)} ${p.name}`)}`;

/** Today's price for a logged quote that came from a market file, or null if gone. */
export function currentFor(db, feed) {
  if (!db || !feed) return null;
  return db.items.find((p) => p.store === feed.store && p.name === feed.name) || null;
}

const hashStr = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

/**
 * Bring a tracked item's supermarket quotes up to date with today's file:
 * a new quote when a product's price changed, otherwise mark the last one as seen.
 * Only up-to-date stores count; prices from stale stores are left alone.
 * @returns {{ add: object[], seen: string[] }}
 */
export function marketUpdates(item, db, m) {
  const add = [];
  const seen = [];
  if (!db) return { add, seen };
  const latest = new Map();
  for (const q of item.quotes || []) {
    if (q.deleted || q.feed?.m !== m) continue;
    const k = `${q.feed.store}\n${q.feed.name}`;
    const cur = latest.get(k);
    if (!cur || q.date > cur.date) latest.set(k, q);
  }
  for (const last of latest.values()) {
    const p = currentFor(db, last.feed);
    if (!p || !p.fresh || last.date > db.date) continue;
    if (Math.abs(p.price - last.price) > 0.001) {
      const { createdAt, updatedAt, seenAt, fx, ...rest } = last;
      add.push({ ...rest, id: `mkt-${m}-${hashStr(`${p.store}\n${p.name}`)}-${db.date}`, price: p.price, date: db.date, url: p.url || rest.url });
    } else if ((last.seenAt || last.date) < db.date) {
      seen.push(last.id);
    }
  }
  return { add, seen };
}
