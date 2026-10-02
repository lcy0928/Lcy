// Default search sites. Each url is a template:
//   products: {q} {q_plus} {q_dash}
//   flights:  {from} {to} {from_l} {to_l} {depart} {return} {depart_yymmdd} {return_yymmdd} {triptype} {adults}
//   hotels:   {city} {checkin} {checkout} {adults}
// A [bracketed] part is dropped when any placeholder inside it is empty
// (e.g. the return leg of a one-way flight).
//
// kind: compare = price-comparison site, shop = retailer,
//       used = second-hand listings, sold = completed-sale prices (used reference)

export const CATS = ['flight', 'hotel', 'coffee', 'home', 'grocery', 'electronics', 'other'];
export const PRODUCT_CATS = ['coffee', 'home', 'grocery', 'electronics', 'other'];
export const REGIONS = ['HK', 'UK', 'EU', 'GLOBAL'];
export const KINDS = ['compare', 'shop', 'used', 'sold'];
export const REGION_CURRENCY = { HK: 'HKD', UK: 'GBP', EU: 'EUR', GLOBAL: 'USD' };
const REGION_LANG = { HK: 'zh', UK: 'en', EU: 'en', GLOBAL: 'en' };

/** Language a site searches best in (sites can set `lang`; otherwise by region). */
export const siteLang = (site) => site.lang || REGION_LANG[site.region] || 'en';

const P = ['coffee', 'home', 'electronics', 'other'];
// Google search limited to one store. Used where a store's own search link
// could not be confirmed: it always works and still lands on that store's pages.
const gsite = (domain, term = '{q}') => ({ domain, url: `https://www.google.com/search?q=site%3A${domain}+${term}`, via: 'google' });

// Search-link formats were checked against live examples where search engines
// index them (Waitrose, Morrisons, Ocado, Iceland, Aldi, Boots, Superdrug,
// PARKnSHOP, Wellcome, Ztore, Consumer Council, REWE, MediaMarkt, Coolblue,
// Kaufland, Fnac, Jumbo, Rossmann, Trip.com); the others use each site's
// long-standing public format. Settings › Sites › Test links lets you confirm.
export const DEFAULT_SITES = [
  // Flights — region = which market's site (prices can differ by market)
  { id: 'sky-hk', name: 'Skyscanner 香港', region: 'HK', kind: 'compare', cats: ['flight'], url: 'https://www.skyscanner.com.hk/transport/flights/{from_l}/{to_l}/{depart_yymmdd}/[{return_yymmdd}/]?adultsv2={adults}' },
  { id: 'trip-f', name: 'Trip.com', region: 'HK', kind: 'compare', cats: ['flight'], url: 'https://hk.trip.com/flights/ShowFareFirst?dCity={from_l}&aCity={to_l}&flightWay=S&dDate={depart}' },
  { id: 'kayak-hk-f', name: 'KAYAK 香港', region: 'HK', kind: 'compare', cats: ['flight'], url: 'https://www.kayak.com.hk/flights/{from}-{to}/{depart}[/{return}]/{adults}adults?sort=price_a' },
  { id: 'sky-uk', name: 'Skyscanner UK', region: 'UK', kind: 'compare', cats: ['flight'], url: 'https://www.skyscanner.net/transport/flights/{from_l}/{to_l}/{depart_yymmdd}/[{return_yymmdd}/]?adultsv2={adults}' },
  { id: 'kayak-uk-f', name: 'KAYAK UK', region: 'UK', kind: 'compare', cats: ['flight'], url: 'https://www.kayak.co.uk/flights/{from}-{to}/{depart}[/{return}]/{adults}adults?sort=price_a' },
  { id: 'sky-de', lang: 'de', name: 'Skyscanner DE', region: 'EU', kind: 'compare', cats: ['flight'], url: 'https://www.skyscanner.de/transport/flights/{from_l}/{to_l}/{depart_yymmdd}/[{return_yymmdd}/]?adultsv2={adults}' },
  { id: 'momondo', lang: 'en', name: 'momondo', region: 'EU', kind: 'compare', cats: ['flight'], url: 'https://www.momondo.com/flight-search/{from}-{to}/{depart}[/{return}]/{adults}adults?sort=price_a' },
  { id: 'gflights', name: 'Google Flights', region: 'GLOBAL', kind: 'compare', cats: ['flight'], url: 'https://www.google.com/travel/flights?q=Flights%20from%20{from}%20to%20{to}%20on%20{depart}[%20through%20{return}]' },

  // Hotels
  { id: 'booking', name: 'Booking.com', region: 'GLOBAL', kind: 'compare', cats: ['hotel'], url: 'https://www.booking.com/searchresults.html?ss={city}&checkin={checkin}&checkout={checkout}&group_adults={adults}&no_rooms=1' },
  { id: 'agoda', name: 'Agoda', region: 'GLOBAL', kind: 'compare', cats: ['hotel'], ...gsite('agoda.com', '{city}+hotel') },
  { id: 'hotels-hk', name: 'Hotels.com 香港', region: 'HK', kind: 'compare', cats: ['hotel'], url: 'https://hk.hotels.com/Hotel-Search?destination={city}&startDate={checkin}&endDate={checkout}&adults={adults}' },
  { id: 'hotels-uk', name: 'Hotels.com UK', region: 'UK', kind: 'compare', cats: ['hotel'], url: 'https://uk.hotels.com/Hotel-Search?destination={city}&startDate={checkin}&endDate={checkout}&adults={adults}' },
  { id: 'airbnb', name: 'Airbnb', region: 'GLOBAL', kind: 'shop', cats: ['hotel'], url: 'https://www.airbnb.com/s/{city}/homes?checkin={checkin}&checkout={checkout}&adults={adults}' },
  { id: 'ghotels', name: 'Google Hotels', region: 'GLOBAL', kind: 'compare', cats: ['hotel'], url: 'https://www.google.com/travel/search?q=hotels%20in%20{city}' },

  // Hong Kong — products
  { id: 'pricehk', name: 'Price.com.hk', region: 'HK', kind: 'compare', cats: P, url: 'https://www.price.com.hk/search.php?g=A&q={q}' },
  { id: 'gshop-hk', name: 'Google 購物（香港）', region: 'HK', kind: 'compare', cats: [...P, 'grocery'], url: 'https://www.google.com/search?tbm=shop&gl=hk&hl=zh-HK&q={q}' },
  { id: 'hktvmall', name: 'HKTVmall', region: 'HK', kind: 'shop', cats: [...P, 'grocery'], url: 'https://www.hktvmall.com/hktv/zh/search_a?keyword={q}' },
  { id: 'fortress', name: '豐澤 Fortress', region: 'HK', kind: 'shop', cats: ['electronics', 'coffee', 'home'], ...gsite('fortress.com.hk') },
  { id: 'broadway', name: '百老匯 Broadway', region: 'HK', kind: 'shop', cats: ['electronics', 'coffee', 'home'], ...gsite('broadway.com.hk') },
  { id: 'ikea-hk', name: 'IKEA 香港', region: 'HK', kind: 'shop', cats: ['home'], ...gsite('ikea.com.hk') },
  { id: 'pricerite', name: '實惠 Pricerite', region: 'HK', kind: 'shop', cats: ['home'], ...gsite('pricerite.com.hk') },
  { id: 'watsons-hk', name: '屈臣氏 Watsons', region: 'HK', kind: 'shop', cats: ['home', 'grocery'], ...gsite('watsons.com.hk') },
  { id: 'mannings', name: '萬寧 Mannings', region: 'HK', kind: 'shop', cats: ['home', 'grocery'], ...gsite('mannings.com.hk') },
  { id: 'opw', name: '消委會 網上價格一覽通', region: 'HK', kind: 'compare', cats: ['grocery', 'home'], top: ['grocery'], url: 'https://online-price-watch.consumer.org.hk/opw/search/highlight:{q}' },
  { id: 'parknshop', name: '百佳 PARKnSHOP', region: 'HK', kind: 'shop', cats: ['grocery', 'home'], url: 'https://www.parknshop.com/en/search?text={q}' },
  { id: 'wellcome', name: '惠康 Wellcome', region: 'HK', kind: 'shop', cats: ['grocery', 'home'], url: 'https://www.wellcome.com.hk/zh-hant/search?keyword={q}' },
  { id: 'ztore', name: '士多 Ztore', region: 'HK', kind: 'shop', cats: ['grocery', 'home'], url: 'https://www.ztore.com/tc/search/{q}' },
  { id: 'carousell', name: 'Carousell', region: 'HK', kind: 'used', cats: P, url: 'https://www.carousell.com.hk/search/{q}' },
  { id: 'fb-hk', name: 'Facebook Marketplace 香港', region: 'HK', kind: 'used', cats: P, url: 'https://www.facebook.com/marketplace/hongkong/search?query={q}' },

  // UK — products
  { id: 'pricespy', name: 'PriceSpy UK', region: 'UK', kind: 'compare', cats: P, url: 'https://pricespy.co.uk/search?search={q}' },
  { id: 'pricerunner', name: 'PriceRunner UK', region: 'UK', kind: 'compare', cats: P, url: 'https://www.pricerunner.com/results?q={q}' },
  { id: 'gshop-uk', name: 'Google Shopping UK', region: 'UK', kind: 'compare', cats: [...P, 'grocery'], url: 'https://www.google.com/search?tbm=shop&gl=uk&hl=en-GB&q={q}' },
  { id: 'amazon-uk', name: 'Amazon UK', region: 'UK', kind: 'shop', cats: P, url: 'https://www.amazon.co.uk/s?k={q}' },
  { id: 'argos', name: 'Argos', region: 'UK', kind: 'shop', cats: ['home', 'electronics', 'coffee'], url: 'https://www.argos.co.uk/search/{q}/' },
  { id: 'johnlewis', name: 'John Lewis', region: 'UK', kind: 'shop', cats: ['home', 'electronics', 'coffee'], url: 'https://www.johnlewis.com/search?search-term={q}' },
  { id: 'currys', name: 'Currys', region: 'UK', kind: 'shop', cats: ['electronics', 'coffee'], url: 'https://www.currys.co.uk/search?q={q}' },
  { id: 'ao', name: 'AO.com', region: 'UK', kind: 'shop', cats: ['electronics', 'coffee', 'home'], ...gsite('ao.com') },
  { id: 'coffeehit', name: 'Coffee Hit', region: 'UK', kind: 'shop', cats: ['coffee'], ...gsite('coffeehit.co.uk') },
  { id: 'bellabarista', name: 'Bella Barista', region: 'UK', kind: 'shop', cats: ['coffee'], ...gsite('bellabarista.co.uk') },
  { id: 'happydonkey', name: 'Happy Donkey', region: 'UK', kind: 'shop', cats: ['coffee'], ...gsite('happydonkey.co.uk') },
  { id: 'ikea-uk', name: 'IKEA UK', region: 'UK', kind: 'shop', cats: ['home'], url: 'https://www.ikea.com/gb/en/search/?q={q}' },
  { id: 'dunelm', name: 'Dunelm', region: 'UK', kind: 'shop', cats: ['home'], ...gsite('dunelm.com') },
  { id: 'bandq', name: 'B&Q', region: 'UK', kind: 'shop', cats: ['home'], ...gsite('diy.com') },
  { id: 'boots', name: 'Boots', region: 'UK', kind: 'shop', cats: ['home', 'grocery'], url: 'https://www.boots.com/sitesearch?searchTerm={q}' },
  { id: 'superdrug', name: 'Superdrug', region: 'UK', kind: 'shop', cats: ['home', 'grocery'], url: 'https://www.superdrug.com/search?text={q}' },
  { id: 'trolley', name: 'Trolley.co.uk', region: 'UK', kind: 'compare', cats: ['grocery'], top: ['grocery'], url: 'https://www.trolley.co.uk/search/?q={q}' },
  { id: 'tesco', name: 'Tesco', region: 'UK', kind: 'shop', cats: ['grocery'], url: 'https://www.tesco.com/groceries/en-GB/search?query={q}' },
  { id: 'sainsburys', name: "Sainsbury's", region: 'UK', kind: 'shop', cats: ['grocery'], url: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/{q}' },
  { id: 'asda', name: 'Asda', region: 'UK', kind: 'shop', cats: ['grocery'], ...gsite('asda.com') },
  { id: 'waitrose', name: 'Waitrose', region: 'UK', kind: 'shop', cats: ['grocery'], url: 'https://www.waitrose.com/ecom/shop/search?searchTerm={q}' },
  { id: 'morrisons', name: 'Morrisons', region: 'UK', kind: 'shop', cats: ['grocery'], url: 'https://groceries.morrisons.com/search?entry={q}' },
  { id: 'ocado', name: 'Ocado', region: 'UK', kind: 'shop', cats: ['grocery'], url: 'https://www.ocado.com/search?entry={q}' },
  { id: 'aldi-uk', name: 'Aldi UK', region: 'UK', kind: 'shop', cats: ['grocery', 'home'], url: 'https://www.aldi.co.uk/results?q={q}' },
  { id: 'lidl-uk', name: 'Lidl GB', region: 'UK', kind: 'shop', cats: ['grocery', 'home'], ...gsite('lidl.co.uk') },
  { id: 'iceland', name: 'Iceland', region: 'UK', kind: 'shop', cats: ['grocery'], url: 'https://www.iceland.co.uk/search?q={q}' },
  { id: 'mands', name: 'M&S Food', region: 'UK', kind: 'shop', cats: ['grocery'], ...gsite('marksandspencer.com') },
  { id: 'ebay-uk-used', name: 'eBay UK 二手', region: 'UK', kind: 'used', cats: P, url: 'https://www.ebay.co.uk/sch/i.html?_nkw={q}&LH_ItemCondition=3000' },
  { id: 'ebay-uk-sold', name: 'eBay UK 已售出', region: 'UK', kind: 'sold', cats: P, url: 'https://www.ebay.co.uk/sch/i.html?_nkw={q}&LH_Sold=1&LH_Complete=1' },
  { id: 'vinted-uk', name: 'Vinted UK', region: 'UK', kind: 'used', cats: ['home', 'other'], url: 'https://www.vinted.co.uk/catalog?search_text={q}' },
  { id: 'gumtree', name: 'Gumtree', region: 'UK', kind: 'used', cats: P, url: 'https://www.gumtree.com/search?search_query={q}' },
  { id: 'cex-uk', name: 'CeX UK', region: 'UK', kind: 'used', cats: ['electronics'], url: 'https://uk.webuy.com/search?stext={q}' },

  // Europe — products
  { id: 'idealo-de', lang: 'de', name: 'idealo.de', region: 'EU', kind: 'compare', cats: P, url: 'https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q={q}' },
  { id: 'geizhals', lang: 'de', name: 'Geizhals', region: 'EU', kind: 'compare', cats: ['electronics', 'coffee', 'home'], url: 'https://geizhals.de/?fs={q}' },
  { id: 'idealo-fr', lang: 'fr', name: 'idealo.fr', region: 'EU', kind: 'compare', cats: P, url: 'https://www.idealo.fr/prechcat.html?q={q}' },
  { id: 'gshop-de', lang: 'de', name: 'Google Shopping DE', region: 'EU', kind: 'compare', cats: [...P, 'grocery'], url: 'https://www.google.com/search?tbm=shop&gl=de&hl=de&q={q}' },
  { id: 'amazon-de', lang: 'de', name: 'Amazon.de', region: 'EU', kind: 'shop', cats: P, url: 'https://www.amazon.de/s?k={q}' },
  { id: 'amazon-fr', lang: 'fr', name: 'Amazon.fr', region: 'EU', kind: 'shop', cats: P, url: 'https://www.amazon.fr/s?k={q}' },
  { id: 'amazon-it', lang: 'it', name: 'Amazon.it', region: 'EU', kind: 'shop', cats: P, url: 'https://www.amazon.it/s?k={q}' },
  { id: 'mediamarkt', lang: 'de', name: 'MediaMarkt DE', region: 'EU', kind: 'shop', cats: ['electronics', 'coffee', 'home'], url: 'https://www.mediamarkt.de/de/search.html?query={q}' },
  { id: 'coolblue', lang: 'nl', name: 'Coolblue NL', region: 'EU', kind: 'shop', cats: ['electronics', 'coffee', 'home'], url: 'https://www.coolblue.nl/zoeken?query={q}' },
  { id: 'fnac', lang: 'fr', name: 'Fnac FR', region: 'EU', kind: 'shop', cats: ['electronics', 'coffee', 'other'], url: 'https://www.fnac.com/SearchResult/ResultList.aspx?Search={q}' },
  { id: 'kaufland', lang: 'de', name: 'Kaufland DE', region: 'EU', kind: 'shop', cats: P, url: 'https://www.kaufland.de/s/?search_value={q}' },
  { id: 'otto', lang: 'de', name: 'OTTO DE', region: 'EU', kind: 'shop', cats: P, ...gsite('otto.de') },
  { id: 'bol', lang: 'nl', name: 'bol.com NL', region: 'EU', kind: 'shop', cats: P, ...gsite('bol.com') },
  { id: 'ikea-de', lang: 'de', name: 'IKEA DE', region: 'EU', kind: 'shop', cats: ['home'], url: 'https://www.ikea.com/de/de/search/?q={q}' },
  { id: 'roastmarket', lang: 'de', name: 'roastmarket', region: 'EU', kind: 'shop', cats: ['coffee'], ...gsite('roastmarket.de') },
  { id: 'dm', lang: 'de', name: 'dm', region: 'EU', kind: 'shop', cats: ['home', 'grocery'], url: 'https://www.dm.de/search?query={q}' },
  { id: 'rossmann', lang: 'de', name: 'Rossmann', region: 'EU', kind: 'shop', cats: ['home', 'grocery'], url: 'https://www.rossmann.de/de/search/?text={q}' },
  { id: 'rewe', lang: 'de', name: 'REWE', region: 'EU', kind: 'shop', cats: ['grocery'], url: 'https://www.rewe.de/suche/?search={q}' },
  { id: 'lidl-de', lang: 'de', name: 'Lidl DE', region: 'EU', kind: 'shop', cats: ['grocery', 'home'], ...gsite('lidl.de') },
  { id: 'carrefour-fr', lang: 'fr', name: 'Carrefour FR', region: 'EU', kind: 'shop', cats: ['grocery'], url: 'https://www.carrefour.fr/s?q={q}' },
  { id: 'ah', lang: 'nl', name: 'Albert Heijn', region: 'EU', kind: 'shop', cats: ['grocery'], url: 'https://www.ah.nl/zoeken?query={q}' },
  { id: 'jumbo', lang: 'nl', name: 'Jumbo NL', region: 'EU', kind: 'shop', cats: ['grocery'], url: 'https://www.jumbo.com/zoeken?searchTerms={q}' },
  { id: 'spar-nl', lang: 'nl', name: 'Spar NL', region: 'EU', kind: 'shop', cats: ['grocery'], ...gsite('spar.nl') },
  { id: 'billa', lang: 'de', name: 'BILLA (AT)', region: 'EU', kind: 'shop', cats: ['grocery'], ...gsite('shop.billa.at') },
  { id: 'spar-at', lang: 'de', name: 'INTERSPAR (AT)', region: 'EU', kind: 'shop', cats: ['grocery'], ...gsite('interspar.at') },
  { id: 'ebay-de-used', lang: 'de', name: 'eBay.de 二手', region: 'EU', kind: 'used', cats: P, url: 'https://www.ebay.de/sch/i.html?_nkw={q}&LH_ItemCondition=3000' },
  { id: 'ebay-de-sold', lang: 'de', name: 'eBay.de 已售出', region: 'EU', kind: 'sold', cats: P, url: 'https://www.ebay.de/sch/i.html?_nkw={q}&LH_Sold=1&LH_Complete=1' },
  { id: 'kleinanzeigen', lang: 'de', name: 'Kleinanzeigen', region: 'EU', kind: 'used', cats: P, url: 'https://www.kleinanzeigen.de/s-{q_dash}/k0' },
  { id: 'vinted-de', lang: 'de', name: 'Vinted DE', region: 'EU', kind: 'used', cats: ['home', 'other'], url: 'https://www.vinted.de/catalog?search_text={q}' },
  { id: 'leboncoin', lang: 'fr', name: 'leboncoin', region: 'EU', kind: 'used', cats: P, url: 'https://www.leboncoin.fr/recherche?text={q}' },
  { id: 'marktplaats', lang: 'nl', name: 'Marktplaats', region: 'EU', kind: 'used', cats: P, url: 'https://www.marktplaats.nl/q/{q_dash}/' },

  // Global
  { id: 'amazon-us', name: 'Amazon.com', region: 'GLOBAL', kind: 'shop', cats: P, url: 'https://www.amazon.com/s?k={q}' },
  { id: 'aliexpress', name: 'AliExpress', region: 'GLOBAL', kind: 'shop', cats: P, url: 'https://www.aliexpress.com/w/wholesale-{q_dash}.html' },
  { id: 'taobao', lang: 'zh', name: '淘寶 Taobao', region: 'GLOBAL', kind: 'shop', cats: [...P, 'grocery'], cur: 'CNY', url: 'https://s.taobao.com/search?q={q}' },
  { id: 'iherb', lang: 'en', name: 'iHerb', region: 'GLOBAL', kind: 'shop', cats: ['grocery', 'home'], cur: 'HKD', url: 'https://hk.iherb.com/search?kw={q}' },
];

const yymmdd = (d) => (d ? d.slice(2).replace(/-/g, '') : '');
const enc = encodeURIComponent;

export function templateValues(p = {}) {
  const q = String(p.q || '').trim();
  const from = String(p.from || '').trim().toUpperCase();
  const to = String(p.to || '').trim().toUpperCase();
  const ret = p.oneway ? '' : p.ret || '';
  return {
    q: q && enc(q),
    q_plus: q && enc(q).replace(/%20/g, '+'),
    q_dash: q && enc(q.toLowerCase().replace(/\s+/g, '-')),
    from: from && enc(from),
    to: to && enc(to),
    from_l: from && enc(from.toLowerCase()),
    to_l: to && enc(to.toLowerCase()),
    depart: p.depart || '',
    return: ret,
    depart_yymmdd: yymmdd(p.depart),
    return_yymmdd: yymmdd(ret),
    triptype: ret ? 'rt' : 'ow',
    city: p.city ? enc(String(p.city).trim()) : '',
    checkin: p.checkin || '',
    checkout: p.checkout || '',
    adults: String(p.adults || 1),
  };
}

/** The site's own home page (for when the search details are not filled in yet). */
export function siteHome(site) {
  if (site.domain) return `https://www.${site.domain.replace(/^www\./, '')}/`;
  try {
    const u = new URL(site.url.replace(/\[[^\]]*\]/g, '').replace(/\{[^}]+\}/g, 'x'));
    return `${u.origin}/`;
  } catch {
    return '';
  }
}

const keysIn = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

/** @returns {{url: string, missing: string[]}} missing = required placeholders with no value */
export function buildUrl(tpl, params) {
  const vals = templateValues(params);
  const withoutOptional = tpl.replace(/\[[^\]]*\]/g, '');
  const missing = [...new Set(keysIn(withoutOptional).filter((k) => !vals[k]))];
  const url = tpl
    .replace(/\[([^\]]*)\]/g, (_, seg) => (keysIn(seg).every((k) => vals[k]) ? seg : ''))
    .replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? '');
  return { url, missing };
}
