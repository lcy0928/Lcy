// Current prices shown beside each site in the search results.
//
// Sources, all free and without setup:
//   - Consumer Council Online Price Watch (Hong Kong supermarkets and pharmacies)
//   - Dutch and Austrian supermarket open data (js/market.js)
//   - Open Prices by Open Food Facts: crowd-sourced shelf prices, read live (UK sites)
//   - ONS average prices: UK-wide typical price of common items, monthly (data/ons.json)
//   - prices you logged yourself
// Each function here is pure, so the matching can be tested without the app.

import { searchMarket } from './market.js';

// Site id → Consumer Council store code.
export const SITE_OPW = {
  parknshop: 'PARKNSHOP', wellcome: 'WELLCOME', 'watsons-hk': 'WATSONS', mannings: 'MANNINGS', ztore: 'ZTORE',
};

// Site id → [market, store code] in the European supermarket files.
export const SITE_MARKET = {
  'spar-nl': ['nl', 'spar'], ah: ['nl', 'ah'], jumbo: ['nl', 'jumbo'],
  billa: ['at', 'billa'], 'spar-at': ['at', 'sparAt'], rewe: ['at', 'reweDe'],
};

// Site id → how the shop is named on Open Prices locations (OpenStreetMap brand or name).
export const SITE_BRAND = {
  tesco: /tesco/i, sainsburys: /sainsbury/i, asda: /\basda\b/i, waitrose: /waitrose/i, morrisons: /morrisons/i,
  'aldi-uk': /\baldi\b/i, 'lidl-uk': /\blidl\b/i, iceland: /\biceland\b/i, mands: /marks (and|&) spencer|\bm&s\b/i,
  ocado: /ocado/i, boots: /\bboots\b/i, superdrug: /superdrug/i,
};

const DAY = 86400000;
const daysSince = (date, today) => Math.round((Date.parse(today) - Date.parse(date)) / DAY);

/** Cheapest Consumer Council product at one store among the search hits. */
export function opwBest(hits, store) {
  let best = null;
  for (const p of hits || []) {
    const x = p.prices.find((y) => y.store === store);
    if (x && (!best || x.price < best.price)) best = { price: x.price, product: p };
  }
  return best;
}

/** Cheapest product of one store in a market file (per litre/kilo when sizes compare). */
export function marketBest(db, query, store) {
  if (!db) return null;
  const r = searchMarket(db, query, { limit: 1, staleLimit: 1, store });
  return r.fresh[0] || r.stale[0] || null;
}

const OP = 'https://prices.openfoodfacts.org/api/v1';

/** Products whose name contains the words, most-priced first. */
export const openProductsUrl = (term) =>
  `${OP}/products?product_name__like=${encodeURIComponent(term)}&price_count__gte=1&order_by=-price_count&size=50`;

/** Latest prices of those products in one currency. */
export const openPricesUrl = (codes, currency) =>
  `${OP}/prices?product_code__in=${codes.map(encodeURIComponent).join(',')}&currency=${currency}&order_by=-date&size=100`;

/** Flatten an Open Prices /prices page to what the app shows. */
export function parseOpenPrices(page) {
  const out = [];
  for (const p of page?.items || []) {
    const price = Number(p.price);
    if (!(price > 0) || !p.date) continue;
    const loc = p.location || {};
    const prod = p.product || {};
    const title = prod.product_name || p.product_name || p.product_code || '';
    const brand = String(prod.brands || '').split(',')[0].trim();
    const size = prod.product_quantity ? `${prod.product_quantity} ${prod.product_quantity_unit || 'g'}` : '';
    out.push({
      price,
      currency: p.currency,
      date: String(p.date).slice(0, 10),
      discounted: !!p.price_is_discounted,
      // "Tropicana Orange juice 1000 ml"; the brand only when the name doesn't already say it.
      name: [brand && !title.toLowerCase().includes(brand.toLowerCase()) ? brand : '', title, size].filter(Boolean).join(' '),
      shop: [loc.osm_brand, loc.osm_name, loc.website_url].filter(Boolean).join(' '),
      country: loc.osm_address_country_code || '',
    });
  }
  return out;
}

/** Cheapest recent price at a shop matching `brand`, within `maxDays`. */
export function openBest(list, brand, today, maxDays = 365) {
  let best = null;
  for (const x of list || []) {
    if (!brand.test(x.shop) || daysSince(x.date, today) > maxDays) continue;
    if (!best || x.price < best.price || (x.price === best.price && x.date > best.date)) best = x;
  }
  return best;
}

/**
 * ONS items whose description contains every word of the (English) search term.
 * db = { month, items: [[description, typical price, number of quotes]] }
 */
export function onsMatch(db, term, n = 2) {
  const words = String(term || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  if (!db?.items || !words.length) return [];
  return db.items
    .filter(([desc]) => {
      const d = ` ${String(desc).toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
      return words.every((w) => d.includes(` ${w}`));
    })
    .sort((a, b) => b[2] - a[2])
    .slice(0, n)
    .map(([desc, price, count]) => ({ desc, price, count }));
}

/** Your latest logged price for this site, from the watchlist items that match the search. */
export function loggedBest(items, siteName) {
  const name = String(siteName).trim().toLowerCase();
  let best = null;
  for (const item of items || []) {
    for (const q of item.quotes || []) {
      if (q.deleted || q.price === '' || String(q.site || '').trim().toLowerCase() !== name) continue;
      const seen = q.seenAt && q.seenAt > q.date ? q.seenAt : q.date;
      if (!best || seen > best.seen) best = { ...q, seen, item };
    }
  }
  return best;
}
