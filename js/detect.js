// Work out which site a pasted product link belongs to, so a quote can be
// pre-filled with the store name, region, currency and a guessed item name.
import { REGION_CURRENCY } from './sites.js';

const KIND_PRIORITY = { shop: 0, compare: 1, used: 2, sold: 3 };

const bareHost = (h) => String(h || '').toLowerCase().replace(/^www\./, '').replace(/^m\./, '');

/** The domain a site lives on: explicit `domain`, else the template's host. */
export function siteDomain(site) {
  if (site.domain) return bareHost(site.domain);
  try {
    return bareHost(new URL(site.url.replace(/\{[^}]+\}/g, 'x').replace(/[[\]]/g, '')).hostname);
  } catch {
    return '';
  }
}

// eTLD+1, good enough for the stores we know (handles co.uk / com.hk style suffixes).
export function regDomain(host) {
  const parts = bareHost(host).split('.');
  const two = parts.slice(-2).join('.');
  const n = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/.test(two) ? 3 : 2;
  return parts.slice(-n).join('.');
}

function regionFromHost(host) {
  if (/\.(hk)$/.test(host)) return 'HK';
  if (/\.(uk)$/.test(host)) return 'UK';
  if (/\.(de|fr|it|es|nl|be|at|ie|pt|fi|gr|lu|dk|se|pl|cz)$/.test(host)) return 'EU';
  return 'GLOBAL';
}

/** First http(s) URL inside a block of shared text. */
export function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.;!?]+$/, '') : '';
}

/** Guess a readable product name from a URL path slug, e.g. /Comandante-C40-MK4-Grinder/dp/… */
export function nameFromUrl(url) {
  let u;
  try { u = new URL(url); } catch { return ''; }
  const segs = u.pathname.split('/').map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  const words = (s) => s.replace(/\.(html?|aspx?|php)$/i, '').replace(/[-_+]+/g, ' ').trim();
  const candidates = segs
    .map(words)
    .filter((s) => s.split(' ').length >= 2 && /[a-z一-鿿]/i.test(s) && !/^(dp|gp|product|products|item|itm|p|s|search)$/i.test(s));
  if (!candidates.length) return '';
  const best = candidates.sort((a, b) => b.length - a.length)[0];
  return best.replace(/\s+/g, ' ').slice(0, 80);
}

/**
 * @returns {{site: object|null, name: string, region: string, currency: string, cond: string, url: string}|null}
 */
export function detectFromUrl(url, sites) {
  let host;
  try { host = bareHost(new URL(url).hostname); } catch { return null; }
  const known = sites.map((s) => ({ s, d: siteDomain(s) })).filter(({ d }) => d && !d.endsWith('google.com'));
  const byKind = (a, b) => b.d.length - a.d.length || (KIND_PRIORITY[a.s.kind] ?? 9) - (KIND_PRIORITY[b.s.kind] ?? 9);
  // Prefer an exact host match (uk.hotels.com vs hk.hotels.com), then the same registrable domain.
  let matches = known.filter(({ d }) => host === d || host.endsWith('.' + d)).sort(byKind);
  if (!matches.length) matches = known.filter(({ d }) => regDomain(d) === regDomain(host)).sort(byKind);
  const site = matches[0]?.s || null;
  const region = site?.region || regionFromHost(host);
  return {
    site,
    name: site?.name || host,
    region,
    currency: site?.cur || REGION_CURRENCY[region],
    cond: site && (site.kind === 'used' || site.kind === 'sold') ? 'used' : 'new',
    url,
  };
}
