// Consumer Council "Online Price Watch" open data (data.gov.hk, updated daily).
// A scheduled GitHub Action downloads pricewatch.json and stores a compact copy
// at data/opw.json next to the app, so the browser never needs a key or CORS.
//
// Source shape (array): { code, brand:{en,zh-Hant}, name:{…}, cat1Name, cat2Name,
//   cat3Name, prices:[{supermarketCode, price:"10.90"}], offers:[{supermarketCode, en, zh-Hant}] }

export const OPW_SOURCE = 'https://online-price-watch.consumer.org.hk/opw/opendata/pricewatch.json';
export const opwProductUrl = (code) => `https://online-price-watch.consumer.org.hk/opw/product/${encodeURIComponent(code)}`;

// Stable store names (used as the quote's site, so they must not change with language).
export const OPW_STORES = {
  PARKNSHOP: '百佳 PARKnSHOP',
  WELLCOME: '惠康 Wellcome',
  JASONS: 'Market Place',
  AEON: 'AEON',
  DCHFOOD: '大昌食品 DCH',
  LUNGFUNG: '龍豐 Lung Fung',
  WATSONS: '屈臣氏 Watsons',
  MANNINGS: '萬寧 Mannings',
  ZTORE: '士多 Ztore',
  SASA: '莎莎 Sa Sa',
};
export const storeName = (code) => OPW_STORES[code] || code;

const zh = (o) => (o && (o['zh-Hant'] || o.zh || o.en)) || '';
const en = (o) => (o && (o.en || o['zh-Hant'])) || '';

/** Shrink the source file to arrays: ~2,700 products → a few hundred KB. */
export function compactOpw(raw, date) {
  const list = Array.isArray(raw) ? raw : raw?.items || [];
  const stores = [];
  const cats = [];
  const storeIdx = (c) => {
    let i = stores.indexOf(c);
    if (i < 0) i = stores.push(c) - 1;
    return i;
  };
  const catIdx = (p) => {
    const key = [zh(p.cat2Name) || zh(p.cat1Name), en(p.cat2Name) || en(p.cat1Name)];
    let i = cats.findIndex((c) => c[0] === key[0] && c[1] === key[1]);
    if (i < 0) i = cats.push(key) - 1;
    return i;
  };
  const items = [];
  for (const p of list) {
    if (!p || !p.code) continue;
    const prices = (p.prices || [])
      .map((r) => [String(r.supermarketCode || '').toUpperCase(), parseFloat(String(r.price).replace(/[^0-9.]/g, ''))])
      .filter(([c, v]) => c && Number.isFinite(v) && v > 0)
      .map(([c, v]) => [storeIdx(c), v]);
    if (!prices.length) continue;
    const offers = (p.offers || [])
      .filter((o) => o && o.supermarketCode)
      .map((o) => [storeIdx(String(o.supermarketCode).toUpperCase()), zh(o) || '', en(o) || '']);
    items.push([String(p.code), zh(p.brand), en(p.brand), zh(p.name), en(p.name), catIdx(p), prices, offers]);
  }
  return { v: 1, date, stores, cats, items };
}

/** Expand the compact file into objects the UI can use. */
export function expandOpw(data) {
  if (!data || !Array.isArray(data.items)) return null;
  const products = data.items.map(([code, bz, be, nz, ne, ci, prices, offers]) => {
    const p = {
      code,
      brand: { zh: bz, en: be },
      name: { zh: nz, en: ne },
      cat: { zh: data.cats[ci]?.[0] || '', en: data.cats[ci]?.[1] || '' },
      prices: prices.map(([si, price]) => ({ store: data.stores[si], price })).sort((a, b) => a.price - b.price),
      offers: offers.map(([si, oz, oe]) => ({ store: data.stores[si], zh: oz, en: oe })),
    };
    p.text = `${bz} ${be} ${nz} ${ne} ${p.cat.zh} ${p.cat.en}`.toLowerCase();
    return p;
  });
  return { date: data.date, products, byCode: new Map(products.map((p) => [p.code, p])) };
}

/** Every word of the query must appear (brand, name or category, Chinese or English). */
export function searchOpw(db, query, limit = 8) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!db || !words.length) return [];
  return db.products
    .filter((p) => words.every((w) => p.text.includes(w)))
    .sort((a, b) => b.prices.length - a.prices.length || a.prices[0].price - b.prices[0].price)
    .slice(0, limit);
}

export const productName = (p, lang) => {
  const brand = lang === 'en' ? p.brand.en : p.brand.zh;
  const name = lang === 'en' ? p.name.en : p.name.zh;
  return name.toLowerCase().includes(brand.toLowerCase()) ? name : `${brand} ${name}`.trim();
};

const offerFor = (p, store, lang) => p.offers.filter((o) => o.store === store).map((o) => (lang === 'en' ? o.en : o.zh)).join('; ');

/** Quotes for every store on `date`. Ids are deterministic so two devices never duplicate them. */
export function opwQuotes(p, date, lang = 'zh') {
  return p.prices.map(({ store, price }) => ({
    id: `opw-${p.code}-${store}-${date}`,
    source: 'opw',
    opwStore: store,
    site: storeName(store),
    region: 'HK',
    currency: 'HKD',
    mode: 'local',
    cond: 'new',
    overseas: false,
    price,
    date,
    url: opwProductUrl(p.code),
    note: offerFor(p, store, lang),
  }));
}

/**
 * Bring a tracked item up to date with today's file.
 * New quote only when a store's price changed; otherwise mark the last one as seen today.
 * @returns {{ add: object[], seen: string[] }}
 */
export function opwUpdates(item, p, date, lang = 'zh') {
  const add = [];
  const seen = [];
  const live = (item.quotes || []).filter((q) => !q.deleted && q.source === 'opw');
  for (const q of opwQuotes(p, date, lang)) {
    const last = live
      .filter((x) => x.opwStore === q.opwStore)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!last || Math.abs(last.price - q.price) > 0.001) add.push(q);
    else if ((last.seenAt || last.date) < date) seen.push(last.id);
  }
  return { add, seen };
}
