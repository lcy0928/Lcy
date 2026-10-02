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

const P = ['coffee', 'home', 'electronics', 'other'];
const gsite = (domain) => `https://www.google.com/search?q=site%3A${domain}+{q}`;

export const DEFAULT_SITES = [
  // Flights — region = which market's site (prices can differ by market)
  { id: 'sky-hk', name: 'Skyscanner 香港', region: 'HK', kind: 'compare', cats: ['flight'], url: 'https://www.skyscanner.com.hk/transport/flights/{from_l}/{to_l}/{depart_yymmdd}/[{return_yymmdd}/]?adultsv2={adults}' },
  { id: 'trip-f', name: 'Trip.com', region: 'HK', kind: 'compare', cats: ['flight'], url: 'https://hk.trip.com/flights/showfarefirst?dcity={from_l}&acity={to_l}&ddate={depart}[&rdate={return}]&triptype={triptype}&class=y&quantity={adults}' },
  { id: 'kayak-hk-f', name: 'KAYAK 香港', region: 'HK', kind: 'compare', cats: ['flight'], url: 'https://www.kayak.com.hk/flights/{from}-{to}/{depart}[/{return}]/{adults}adults?sort=price_a' },
  { id: 'sky-uk', name: 'Skyscanner UK', region: 'UK', kind: 'compare', cats: ['flight'], url: 'https://www.skyscanner.net/transport/flights/{from_l}/{to_l}/{depart_yymmdd}/[{return_yymmdd}/]?adultsv2={adults}' },
  { id: 'kayak-uk-f', name: 'KAYAK UK', region: 'UK', kind: 'compare', cats: ['flight'], url: 'https://www.kayak.co.uk/flights/{from}-{to}/{depart}[/{return}]/{adults}adults?sort=price_a' },
  { id: 'sky-de', name: 'Skyscanner DE', region: 'EU', kind: 'compare', cats: ['flight'], url: 'https://www.skyscanner.de/transport/flights/{from_l}/{to_l}/{depart_yymmdd}/[{return_yymmdd}/]?adultsv2={adults}' },
  { id: 'momondo', name: 'momondo', region: 'EU', kind: 'compare', cats: ['flight'], url: 'https://www.momondo.com/flight-search/{from}-{to}/{depart}[/{return}]/{adults}adults?sort=price_a' },
  { id: 'gflights', name: 'Google Flights', region: 'GLOBAL', kind: 'compare', cats: ['flight'], url: 'https://www.google.com/travel/flights?q=Flights%20from%20{from}%20to%20{to}%20on%20{depart}[%20through%20{return}]' },

  // Hotels
  { id: 'booking', name: 'Booking.com', region: 'GLOBAL', kind: 'compare', cats: ['hotel'], url: 'https://www.booking.com/searchresults.html?ss={city}&checkin={checkin}&checkout={checkout}&group_adults={adults}&no_rooms=1' },
  { id: 'agoda', name: 'Agoda', region: 'GLOBAL', kind: 'compare', cats: ['hotel'], url: 'https://www.agoda.com/search?textToSearch={city}&checkIn={checkin}&checkOut={checkout}&adults={adults}&rooms=1' },
  { id: 'hotels-hk', name: 'Hotels.com 香港', region: 'HK', kind: 'compare', cats: ['hotel'], url: 'https://hk.hotels.com/Hotel-Search?destination={city}&startDate={checkin}&endDate={checkout}&adults={adults}' },
  { id: 'kayak-hk-h', name: 'KAYAK 香港', region: 'HK', kind: 'compare', cats: ['hotel'], url: 'https://www.kayak.com.hk/hotels/{city}/{checkin}/{checkout}/{adults}adults?sort=price_a' },
  { id: 'hotels-uk', name: 'Hotels.com UK', region: 'UK', kind: 'compare', cats: ['hotel'], url: 'https://uk.hotels.com/Hotel-Search?destination={city}&startDate={checkin}&endDate={checkout}&adults={adults}' },
  { id: 'airbnb', name: 'Airbnb', region: 'GLOBAL', kind: 'shop', cats: ['hotel'], url: 'https://www.airbnb.com/s/{city}/homes?checkin={checkin}&checkout={checkout}&adults={adults}' },
  { id: 'ghotels', name: 'Google Hotels', region: 'GLOBAL', kind: 'compare', cats: ['hotel'], url: 'https://www.google.com/travel/search?q=hotels%20in%20{city}' },

  // Hong Kong — products
  { id: 'pricehk', name: 'Price.com.hk', region: 'HK', kind: 'compare', cats: P, url: 'https://www.price.com.hk/search.php?g=A&q={q}' },
  { id: 'gshop-hk', name: 'Google 購物（香港）', region: 'HK', kind: 'compare', cats: [...P, 'grocery'], url: 'https://www.google.com/search?tbm=shop&gl=hk&hl=zh-HK&q={q}' },
  { id: 'hktvmall', name: 'HKTVmall', region: 'HK', kind: 'shop', cats: [...P, 'grocery'], url: 'https://www.hktvmall.com/hktv/zh/search_a?keyword={q}' },
  { id: 'fortress', name: '豐澤 Fortress', region: 'HK', kind: 'shop', cats: ['electronics', 'coffee', 'home'], url: 'https://www.fortress.com.hk/zh-hk/search?q={q}' },
  { id: 'ikea-hk', name: 'IKEA 香港', region: 'HK', kind: 'shop', cats: ['home'], url: 'https://www.ikea.com.hk/zh/search?q={q}' },
  { id: 'watsons-hk', name: '屈臣氏 Watsons', region: 'HK', kind: 'shop', cats: ['home', 'grocery'], url: 'https://www.watsons.com.hk/search?text={q}' },
  { id: 'opw', name: '消委會 網上價格一覽通', region: 'HK', kind: 'compare', cats: ['grocery'], url: 'https://online-price-watch.consumer.org.hk/opw/search/{q}' },
  { id: 'parknshop', name: '百佳 PARKnSHOP', region: 'HK', kind: 'shop', cats: ['grocery', 'home'], url: 'https://www.parknshop.com/zh-hk/search?text={q}' },
  { id: 'wellcome', name: '惠康 Wellcome', region: 'HK', kind: 'shop', cats: ['grocery', 'home'], url: 'https://www.wellcome.com.hk/zh-hant/search?keyword={q}' },
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
  { id: 'coffeehit', name: 'Coffee Hit', region: 'UK', kind: 'shop', cats: ['coffee'], url: gsite('coffeehit.co.uk') },
  { id: 'bellabarista', name: 'Bella Barista', region: 'UK', kind: 'shop', cats: ['coffee'], url: gsite('bellabarista.co.uk') },
  { id: 'happydonkey', name: 'Happy Donkey', region: 'UK', kind: 'shop', cats: ['coffee'], url: gsite('happydonkey.co.uk') },
  { id: 'ikea-uk', name: 'IKEA UK', region: 'UK', kind: 'shop', cats: ['home'], url: 'https://www.ikea.com/gb/en/search/?q={q}' },
  { id: 'boots', name: 'Boots', region: 'UK', kind: 'shop', cats: ['home', 'grocery'], url: 'https://www.boots.com/sitesearch?searchTerm={q}' },
  { id: 'trolley', name: 'Trolley.co.uk', region: 'UK', kind: 'compare', cats: ['grocery'], url: 'https://www.trolley.co.uk/search/?q={q}' },
  { id: 'tesco', name: 'Tesco', region: 'UK', kind: 'shop', cats: ['grocery'], url: 'https://www.tesco.com/groceries/en-GB/search?query={q}' },
  { id: 'sainsburys', name: "Sainsbury's", region: 'UK', kind: 'shop', cats: ['grocery'], url: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/{q}' },
  { id: 'asda', name: 'Asda', region: 'UK', kind: 'shop', cats: ['grocery'], url: 'https://groceries.asda.com/search/{q}' },
  { id: 'ocado', name: 'Ocado', region: 'UK', kind: 'shop', cats: ['grocery'], url: 'https://www.ocado.com/search?entry={q}' },
  { id: 'ebay-uk-used', name: 'eBay UK 二手', region: 'UK', kind: 'used', cats: P, url: 'https://www.ebay.co.uk/sch/i.html?_nkw={q}&LH_ItemCondition=3000' },
  { id: 'ebay-uk-sold', name: 'eBay UK 已售出', region: 'UK', kind: 'sold', cats: P, url: 'https://www.ebay.co.uk/sch/i.html?_nkw={q}&LH_Sold=1&LH_Complete=1' },
  { id: 'vinted-uk', name: 'Vinted UK', region: 'UK', kind: 'used', cats: ['home', 'other'], url: 'https://www.vinted.co.uk/catalog?search_text={q}' },
  { id: 'gumtree', name: 'Gumtree', region: 'UK', kind: 'used', cats: P, url: 'https://www.gumtree.com/search?search_query={q}' },
  { id: 'cex-uk', name: 'CeX UK', region: 'UK', kind: 'used', cats: ['electronics'], url: 'https://uk.webuy.com/search?stext={q}' },

  // Europe — products
  { id: 'idealo-de', name: 'idealo.de', region: 'EU', kind: 'compare', cats: P, url: 'https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q={q}' },
  { id: 'geizhals', name: 'Geizhals', region: 'EU', kind: 'compare', cats: ['electronics', 'coffee', 'home'], url: 'https://geizhals.de/?fs={q}' },
  { id: 'idealo-fr', name: 'idealo.fr', region: 'EU', kind: 'compare', cats: P, url: 'https://www.idealo.fr/prechcat.html?q={q}' },
  { id: 'gshop-de', name: 'Google Shopping DE', region: 'EU', kind: 'compare', cats: [...P, 'grocery'], url: 'https://www.google.com/search?tbm=shop&gl=de&hl=de&q={q}' },
  { id: 'amazon-de', name: 'Amazon.de', region: 'EU', kind: 'shop', cats: P, url: 'https://www.amazon.de/s?k={q}' },
  { id: 'amazon-fr', name: 'Amazon.fr', region: 'EU', kind: 'shop', cats: P, url: 'https://www.amazon.fr/s?k={q}' },
  { id: 'amazon-it', name: 'Amazon.it', region: 'EU', kind: 'shop', cats: P, url: 'https://www.amazon.it/s?k={q}' },
  { id: 'roastmarket', name: 'roastmarket', region: 'EU', kind: 'shop', cats: ['coffee'], url: gsite('roastmarket.de') },
  { id: 'dm', name: 'dm', region: 'EU', kind: 'shop', cats: ['home', 'grocery'], url: 'https://www.dm.de/search?query={q}' },
  { id: 'carrefour-fr', name: 'Carrefour FR', region: 'EU', kind: 'shop', cats: ['grocery'], url: 'https://www.carrefour.fr/s?q={q}' },
  { id: 'rewe', name: 'REWE', region: 'EU', kind: 'shop', cats: ['grocery'], url: 'https://shop.rewe.de/productList?search={q}' },
  { id: 'ah', name: 'Albert Heijn', region: 'EU', kind: 'shop', cats: ['grocery'], url: 'https://www.ah.nl/zoeken?query={q}' },
  { id: 'ebay-de-used', name: 'eBay.de 二手', region: 'EU', kind: 'used', cats: P, url: 'https://www.ebay.de/sch/i.html?_nkw={q}&LH_ItemCondition=3000' },
  { id: 'ebay-de-sold', name: 'eBay.de 已售出', region: 'EU', kind: 'sold', cats: P, url: 'https://www.ebay.de/sch/i.html?_nkw={q}&LH_Sold=1&LH_Complete=1' },
  { id: 'kleinanzeigen', name: 'Kleinanzeigen', region: 'EU', kind: 'used', cats: P, url: 'https://www.kleinanzeigen.de/s-{q_dash}/k0' },
  { id: 'vinted-de', name: 'Vinted DE', region: 'EU', kind: 'used', cats: ['home', 'other'], url: 'https://www.vinted.de/catalog?search_text={q}' },
  { id: 'leboncoin', name: 'leboncoin', region: 'EU', kind: 'used', cats: P, url: 'https://www.leboncoin.fr/recherche?text={q}' },
  { id: 'marktplaats', name: 'Marktplaats', region: 'EU', kind: 'used', cats: P, url: 'https://www.marktplaats.nl/q/{q_dash}/' },

  // Global
  { id: 'amazon-us', name: 'Amazon.com', region: 'GLOBAL', kind: 'shop', cats: P, url: 'https://www.amazon.com/s?k={q}' },
  { id: 'aliexpress', name: 'AliExpress', region: 'GLOBAL', kind: 'shop', cats: P, url: 'https://www.aliexpress.com/w/wholesale-{q_dash}.html' },
  { id: 'taobao', name: '淘寶 Taobao', region: 'GLOBAL', kind: 'shop', cats: [...P, 'grocery'], cur: 'CNY', url: 'https://s.taobao.com/search?q={q}' },
  { id: 'iherb', name: 'iHerb', region: 'GLOBAL', kind: 'shop', cats: ['grocery', 'home'], cur: 'HKD', url: 'https://hk.iherb.com/search?kw={q}' },
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
