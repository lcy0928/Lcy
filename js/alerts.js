// Free price-drop alerts offered by other sites. PriceBook cannot notify you
// while it is closed, so each tracked item links to the services that can.
// `site` reuses a search template from sites.js; `url` is a fixed page.
// `paste` = the service wants an Amazon product link pasted in.

export const ALERTS = {
  flight: [
    { site: 'gflights', how: 'gflights' },
    { site: 'sky-hk', how: 'skyscanner' },
    { site: 'kayak-hk-f', how: 'kayak' },
  ],
  hotel: [
    { site: 'ghotels', how: 'ghotels' },
    { site: 'kayak-hk-h', how: 'kayak' },
  ],
  product: [
    { name: 'camelcamelcamel UK', url: 'https://uk.camelcamelcamel.com/', how: 'camel', paste: /amazon\.co\.uk/ },
    { name: 'Keepa', url: 'https://keepa.com/', how: 'keepa', paste: /amazon\.(co\.uk|de|fr|it|es|com)/ },
    { site: 'pricespy', how: 'pricespy' },
    { site: 'idealo-de', how: 'idealo' },
    { site: 'ebay-uk-used', how: 'ebay' },
  ],
};

export function alertsFor(cat) {
  if (cat === 'flight' || cat === 'hotel') return ALERTS[cat];
  if (cat === 'grocery') return [];
  return ALERTS.product;
}
