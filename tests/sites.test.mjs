import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl, DEFAULT_SITES, CATS, REGIONS, KINDS } from '../js/sites.js';

test('keyword is URL-encoded', () => {
  const { url, missing } = buildUrl('https://x.test/s?k={q}', { q: '1Zpresso J-Ultra 手搖' });
  assert.equal(missing.length, 0);
  assert.equal(url, 'https://x.test/s?k=1Zpresso%20J-Ultra%20%E6%89%8B%E6%90%96');
});

test('missing keyword is reported', () => {
  assert.deepEqual(buildUrl('https://x.test/s?k={q}', { q: '  ' }).missing, ['q']);
});

test('optional return leg is dropped for one-way flights', () => {
  const tpl = 'https://f.test/{from_l}/{to_l}/{depart_yymmdd}/[{return_yymmdd}/]';
  const p = { from: 'hkg', to: 'LHR', depart: '2026-11-15', ret: '2026-11-30' };
  assert.equal(buildUrl(tpl, p).url, 'https://f.test/hkg/lhr/261115/261130/');
  assert.equal(buildUrl(tpl, { ...p, oneway: true }).url, 'https://f.test/hkg/lhr/261115/');
  assert.equal(buildUrl(tpl, { ...p, ret: '' }).url, 'https://f.test/hkg/lhr/261115/');
});

test('required flight fields are reported, optional ones are not', () => {
  const tpl = 'https://f.test/{from}-{to}/{depart}[/{return}]';
  assert.deepEqual(buildUrl(tpl, { from: 'HKG' }).missing.sort(), ['depart', 'to']);
});

test('q_dash builds hyphenated slugs', () => {
  assert.equal(buildUrl('https://k.test/s-{q_dash}/k0', { q: 'Comandante C40' }).url, 'https://k.test/s-comandante-c40/k0');
});

test('every default site is well-formed and builds an https URL', () => {
  const ids = new Set();
  const sample = { q: 'test', from: 'HKG', to: 'LHR', depart: '2026-11-15', ret: '2026-11-30', city: 'London', checkin: '2026-11-15', checkout: '2026-11-20', adults: 2 };
  for (const s of DEFAULT_SITES) {
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
    assert.ok(REGIONS.includes(s.region), s.id);
    assert.ok(KINDS.includes(s.kind), s.id);
    assert.ok(s.cats.length && s.cats.every((c) => CATS.includes(c)), s.id);
    const { url, missing } = buildUrl(s.url, sample);
    assert.deepEqual(missing, [], `${s.id} missing ${missing}`);
    assert.match(url, /^https:\/\/[^{}\[\]]+$/, s.id);
  }
});

test('every category has sites in Hong Kong, the UK and Europe', () => {
  for (const cat of CATS) {
    for (const region of ['HK', 'UK', 'EU']) {
      const hit = DEFAULT_SITES.some((s) => s.cats.includes(cat) && (s.region === region || s.region === 'GLOBAL'));
      assert.ok(hit, `${cat} has no site for ${region}`);
    }
  }
});

import { ALERTS } from '../js/alerts.js';

test('alert shortcuts point at existing sites', () => {
  const ids = new Set(DEFAULT_SITES.map((s) => s.id));
  for (const list of Object.values(ALERTS)) for (const a of list) assert.ok(a.url || ids.has(a.site), `missing ${a.site}`);
});

test('Google site-search entries keep the store domain', () => {
  for (const s of DEFAULT_SITES.filter((x) => x.via === 'google')) {
    assert.ok(s.domain && s.url.includes(`site%3A${s.domain}`), s.id);
  }
});

test('Consumer Council search uses the highlight path', () => {
  const opw = DEFAULT_SITES.find((s) => s.id === 'opw');
  assert.equal(buildUrl(opw.url, { q: '牛奶' }).url, 'https://online-price-watch.consumer.org.hk/opw/search/highlight:%E7%89%9B%E5%A5%B6');
});

import { siteHome } from '../js/sites.js';

test('every site has a home page to fall back on', () => {
  for (const s of DEFAULT_SITES) assert.match(siteHome(s), /^https:\/\/[^/{}]+\/$/, s.id);
  assert.equal(siteHome(DEFAULT_SITES.find((s) => s.id === 'fortress')), 'https://www.fortress.com.hk/');
  assert.equal(siteHome(DEFAULT_SITES.find((s) => s.id === 'amazon-uk')), 'https://www.amazon.co.uk/');
  assert.equal(siteHome(DEFAULT_SITES.find((s) => s.id === 'sky-hk')), 'https://www.skyscanner.com.hk/');
});

import { siteLang } from '../js/sites.js';
import { LANGS } from '../js/translate.js';

test('every site has a supported search language', () => {
  for (const s of DEFAULT_SITES) assert.ok(LANGS.includes(siteLang(s)), s.id);
  assert.equal(siteLang(DEFAULT_SITES.find((s) => s.id === 'hktvmall')), 'zh');
  assert.equal(siteLang(DEFAULT_SITES.find((s) => s.id === 'amazon-uk')), 'en');
  assert.equal(siteLang(DEFAULT_SITES.find((s) => s.id === 'idealo-de')), 'de');
  assert.equal(siteLang(DEFAULT_SITES.find((s) => s.id === 'leboncoin')), 'fr');
  assert.equal(siteLang(DEFAULT_SITES.find((s) => s.id === 'ah')), 'nl');
});

test('the all-supermarket comparison sites are marked to come first', () => {
  const top = DEFAULT_SITES.filter((s) => s.top?.includes('grocery')).map((s) => s.id).sort();
  assert.deepEqual(top, ['opw', 'trolley']);
  for (const s of DEFAULT_SITES) if (s.top) assert.ok(s.top.every((c) => s.cats.includes(c)), s.id);
});
