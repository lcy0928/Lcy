import { t, setLang, getLang } from './i18n.js';
import * as S from './store.js';
import { state } from './store.js';
import { CATS, PRODUCT_CATS, REGIONS, KINDS, REGION_CURRENCY, buildUrl, siteHome, siteLang } from './sites.js';
import { LANGS, LANG_LABEL, detectLang, translate, translateSync, sampleTerm } from './translate.js';
import { CURRENCIES, convert, effectiveRates, fetchRates, fetchRatesOn, fxSnapshot, ratesAt, fmt, fmtParts } from './currency.js';
import { landed, latestPerSite, rankQuotes, COUNTRIES, REGION_COUNTRY, MODES, DEFAULT_CARD, isOverseas, UNITS, unitPrice, ageDays } from './landed.js';
import { syncGist, mergeData } from './sync.js';
import { buildChart, bindChart } from './chart.js';
import { esc, num, uid, localDate, addDays, safeUrl } from './util.js';
import { detectFromUrl, extractUrl, nameFromUrl } from './detect.js';
import { alertsFor } from './alerts.js';
import { startScan, scanFile } from './scan.js';
import { readPrices } from './ocr.js';
import { expandOpw, searchOpw, opwQuotes, opwUpdates, productName, opwProductUrl, storeName } from './opw.js';
import { APP_VERSION } from './version.js';
import { SITE_OPW, SITE_MARKET, SITE_BRAND, opwBest, marketBest, openProductsUrl, openPricesUrl, parseOpenPrices, openBest, onsMatch, loggedBest } from './prices.js';
import { MARKETS, STORE_COUNTRY, expandMarket, searchMarket, marketUpdates, productLink, storeName as marketStore } from './market.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const main = $('#main');
const dlg = $('#dlg');

// View-only UI state (not persisted)
const ui = { testCat: 'all', listCat: 'all', showAll: false, sortUnit: false, siteCat: 'all', conv: { amt: '100', cur: 'GBP' }, chart: null, dialog: null };
let installPrompt = null;
let opw = null; // Consumer Council data, loaded from data/opw.json
// European supermarket data per market: fresh = stores still updating (data/nl.json),
// old = stores whose prices stopped changing (data/nl-old.json). Loaded on first use.
const mk = Object.fromEntries(Object.keys(MARKETS).map((m) => [m, { fresh: null, old: null, failed: {}, loads: {}, started: false }]));

const ctx = () => ({
  base: state.settings.base,
  cardCurrency: state.settings.cardCurrency,
  cards: state.settings.cards,
  rates: effectiveRates(state.rates, state.settings.manualRates),
});
const money = (v, cur = state.settings.base) => fmt(v, cur, getLang());
const cardName = (c) => c?.name || t('card.default');
const locale = () => (getLang() === 'zh' ? 'zh-HK' : 'en-GB');

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return new Intl.DateTimeFormat(locale(), opts).format(d);
}

let toastTimer;
function toast(msg, kind = '') {
  const el = $('#toast');
  // A modal dialog sits in the top layer, so the toast must live inside it to be seen.
  const host = dlg.open ? dlg : document.body;
  if (el.parentElement !== host) host.appendChild(el);
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
}

const opt = (value, label, selected) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
const curOptions = (sel) => CURRENCIES.map((c) => opt(c, c, c === sel)).join('');
const chip = (group, v, label, on, role = 'radio') =>
  `<button type="button" class="chip" role="${role}" aria-${role === 'radio' ? 'checked' : 'pressed'}="${on}" data-act="chip" data-group="${group}" data-v="${esc(v)}">${esc(label)}</button>`;

// ---------- routing ----------
function route() {
  const [name = 'search', arg] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'search', arg: arg ? decodeURIComponent(arg) : '' };
}

const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  list: '<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z"/><circle cx="8" cy="8" r="1.6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  barcode: '<path d="M4 6v12M7 6v12M10 6v12M14 6v12M16 6v12M20 6v12"/><path d="M2 4h3M19 4h3M2 20h3M19 20h3"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7.5h7M8.5 12h1M14.5 12h1M8.5 16h1M14.5 16h1"/>',
  settings: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;

function renderChrome(active) {
  $('#brand').innerHTML = `<span class="brand-zh">${t('app')}</span><span class="brand-sub">${esc(getLang() === 'zh' ? 'PriceBook' : '格價簿')}</span>`;
  $('#lang-toggle').textContent = getLang() === 'zh' ? 'EN' : '中';
  $('#lang-toggle').setAttribute('aria-label', getLang() === 'zh' ? 'Switch to English' : '切換到中文');
  const tabs = [['search', 'search'], ['list', 'list'], ['calc', 'calc'], ['settings', 'settings']];
  $('#nav').innerHTML = tabs
    .map(([r, k]) => {
      const due = r === 'list' ? dueItems().length : 0;
      return `<a href="#/${r}" class="tab${active === r || (active === 'item' && r === 'list') ? ' active' : ''}"${active === r ? ' aria-current="page"' : ''}>${icon(k)}<span>${t('tab.' + r)}</span>${due ? `<span class="tab-badge" aria-label="${esc(t('due.title'))}">${due}</span>` : ''}</a>`;
    })
    .join('');
  document.title = `${t('app')} · ${t('tab.' + (active === 'item' ? 'list' : active))}`;
}

function render() {
  const r = route();
  setLang(state.settings.lang);
  document.documentElement.lang = locale();
  ui.chart = null;
  const views = { search: viewSearch, list: viewList, item: () => viewItem(r.arg), calc: viewCalc, settings: viewSettings, linktest: viewLinkTest };
  const view = views[r.name] || viewSearch;
  main.innerHTML = view();
  main.dataset.view = r.name;
  renderChrome(r.name === 'linktest' ? 'settings' : views[r.name] ? r.name : 'search');
  afterRender();
}

// Re-render unless the person is typing or a dialog is open.
function softRender() {
  const a = document.activeElement;
  if (dlg.open || (a && main.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) return;
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

function afterRender() {
  const wrap = $('.chart-wrap', main);
  if (wrap && ui.chart) drawChart(wrap);
}

// ---------- search ----------
const isProduct = (cat) => PRODUCT_CATS.includes(cat);
const hasUsed = (cat) => isProduct(cat) && cat !== 'grocery';

function condOk(kind) {
  const c = state.search.cond;
  if (!hasUsed(state.search.cat) || c === 'all') return true;
  return c === 'used' ? kind === 'used' || kind === 'sold' : kind === 'compare' || kind === 'shop';
}

function field(label, input, cls = '') {
  return `<label class="field ${cls}"><span class="field-label">${label}</span>${input}</label>`;
}

function searchFields() {
  const s = state.search;
  const inp = (key, type = 'text', extra = '') => `<input type="${type}" data-bind="${key}" value="${esc(s[key] ?? '')}" ${extra}>`;
  if (s.cat === 'flight') {
    return `<div class="grid-2">
      ${field(t('search.from'), inp('from', 'text', `maxlength="3" autocapitalize="characters" autocomplete="off" placeholder="HKG" class="iata"`))}
      ${field(t('search.to'), inp('to', 'text', `maxlength="3" autocapitalize="characters" autocomplete="off" placeholder="${esc(t('search.airportPh'))}" class="iata"`))}
      ${field(t('search.depart'), inp('depart', 'date'))}
      ${field(t('search.return'), inp('ret', 'date', s.oneway ? 'disabled' : ''))}
      ${field(t('search.adults'), inp('adults', 'number', 'min="1" max="9" inputmode="numeric"'))}
      <label class="check"><input type="checkbox" data-bind="oneway"${s.oneway ? ' checked' : ''}> ${t('search.oneway')}</label>
    </div>`;
  }
  if (s.cat === 'hotel') {
    return `${field(t('search.city'), inp('city', 'text', `placeholder="${esc(t('search.cityPh'))}" autocomplete="off"`))}
    <div class="tr-row" id="tr-row">${trRow()}</div>
    <div class="grid-3">
      ${field(t('search.checkin'), inp('checkin', 'date'))}
      ${field(t('search.checkout'), inp('checkout', 'date'))}
      ${field(t('search.adults'), inp('adults', 'number', 'min="1" max="16" inputmode="numeric"'))}
    </div>`;
  }
  return field(t('search.keyword'), `<div class="kw-row">${inp('q', 'search', `placeholder="${esc(t('search.keywordPh'))}" enterkeyhint="search" autocomplete="off"`)}
    <button type="button" class="btn scan-btn" data-act="scan" aria-label="${esc(t('scan.button'))}" title="${esc(t('scan.button'))}">${icon('barcode')}</button></div>`, 'field-big')
    + `<div class="tr-row" id="tr-row">${trRow()}</div>`;
}

function viewSearch() {
  const s = state.search;
  return `
  <section class="hero">
    <p class="eyebrow">${t('appSub')}</p>
    <h1>${t('search.lead')}</h1>
  </section>
  <div class="chips cats" role="radiogroup" aria-label="${esc(t('itemDlg.cat'))}">${CATS.map((c) => chip('cat', c, t('cat.' + c), c === s.cat)).join('')}</div>
  <form class="card search-form" data-form="search" autocomplete="off">
    ${searchFields()}
    <div class="filter-row"><span class="field-label">${t('search.regions')}</span>
      <div class="chips small">${REGIONS.map((r) => chip('region', r, t('region.' + r), s.regions.includes(r), 'checkbox')).join('')}</div></div>
    ${hasUsed(s.cat) ? `<div class="filter-row"><span class="field-label">${t('search.cond')}</span>
      <div class="chips small" role="radiogroup">${['all', 'new', 'used'].map((c) => chip('cond', c, t('cond.' + c), s.cond === c)).join('')}</div></div>` : ''}
    <div class="form-foot">
      <button type="button" class="btn quiet" data-act="paste-log">${t('search.pasteLog')}</button>
      <button type="button" class="btn" data-act="track">${t('search.track')}</button>
    </div>
  </form>
  <div id="results" aria-live="polite">${searchResults()}</div>`;
}

function searchParams() {
  const s = state.search;
  return { q: s.q, from: s.from, to: s.to, depart: s.depart, ret: s.ret, oneway: s.oneway, city: s.city, checkin: s.checkin, checkout: s.checkout, adults: s.adults };
}

// ---- keyword translation ----
// tr = { text, src, out: {lang: {text, ok}}, pending: Set } for the keyword or city being searched.
const tr = { text: '', src: 'en', out: {}, pending: new Set() };
let trTimer;
const autoTr = () => state.settings.autoTranslate !== false;

// What is translated: the product keyword, or the city for hotels.
const trSource = () => (state.search.cat === 'hotel' ? state.search.city : state.search.cat === 'flight' ? '' : state.search.q).trim();

function sitesShown() {
  const s = state.search;
  return S.getSites().filter((x) => x.cats.includes(s.cat) && s.regions.includes(x.region) && condOk(x.kind));
}

// Languages the visible sites search in (hotel sites all take English city names).
function langsNeeded() {
  if (state.search.cat === 'hotel') return ['en'];
  return [...new Set([...sitesShown().map(siteLang), ...marketsWanted().map((m) => MARKETS[m].lang)])];
}

// Your remembered fixes, for the translator: (phrase, lang) => text.
const memo = (phrase, lang) => S.myWord(phrase, lang);

/** The keyword (or city) to use in `lang`: your own fix, else the translation, else as typed. */
function termFor(lang) {
  const text = trSource();
  if (!text || !autoTr()) return text;
  const src = detectLang(text);
  if (lang === src) return text;
  const mine = S.myWord(text, lang);
  if (mine) return mine;
  if (tr.text === text && tr.out[lang]) return tr.out[lang].text;
  return translateSync(text, src, lang, memo) ?? text;
}

/** Search parameters for one site, with the keyword in the site's language. */
function paramsFor(site) {
  const p = searchParams();
  if (state.search.cat === 'hotel') p.city = termFor('en');
  else p.q = termFor(siteLang(site));
  return p;
}

// Translate the current keyword into every language the visible sites need.
function scheduleTranslation(delay = 450) {
  clearTimeout(trTimer);
  trTimer = setTimeout(runTranslation, delay);
}

async function runTranslation() {
  const text = trSource();
  if (!text || !autoTr()) { refreshResults(); return; }
  const src = detectLang(text);
  if (tr.text !== text) Object.assign(tr, { text, src, out: {}, pending: new Set() });
  const todo = langsNeeded().filter((l) => l !== src && !tr.out[l]);
  for (const l of todo) {
    const quick = translateSync(text, src, l, memo);
    if (quick !== null) tr.out[l] = { text: quick, ok: true };
    else tr.pending.add(l);
  }
  refreshResults();
  // All languages at once; each result shows as soon as it arrives.
  await Promise.all([...tr.pending].map(async (l) => {
    const r = await translate(text, src, l, undefined, memo);
    if (tr.text !== text) return; // keyword changed meanwhile
    tr.out[l] = r;
    tr.pending.delete(l);
    refreshResults();
  }));
}

function refreshResults() {
  const res = $('#results');
  if (res) res.innerHTML = searchResults();
  const row = $('#tr-row');
  if (row) row.innerHTML = trRow();
}

// Show only what changed: "Comandante C40 Handkaffeemühle" → "Handkaffeemühle".
function shortLabel(original, translated) {
  const a = original.split(' ');
  const b = translated.split(' ');
  let i = 0;
  while (i < a.length - 0 && i < b.length - 1 && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i - 1 && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return b.slice(i, b.length - j).join(' ');
}

function trRow() {
  const text = trSource();
  const isHotel = state.search.cat === 'hotel';
  const toggle = `<label class="check tr-toggle"><input type="checkbox" data-set="autoTranslate"${autoTr() ? ' checked' : ''}> ${t(isHotel ? 'tr.autoCity' : 'tr.auto')}</label>`;
  if (!text || !autoTr()) return toggle;
  const src = detectLang(text);
  const langs = langsNeeded().filter((l) => l !== src);
  if (!langs.length) return toggle;
  const chips = langs.map((l) => {
    const pending = tr.text === text && tr.pending.has(l);
    const failed = tr.text === text && tr.out[l] && !tr.out[l].ok;
    const edited = !!S.myWord(text, l);
    const label = pending ? t('tr.pending') : shortLabel(text, termFor(l));
    return `<button type="button" class="tr-chip${failed ? ' failed' : ''}${edited ? ' edited' : ''}" data-act="tr-edit" data-lang="${l}" title="${esc(termFor(l))}" aria-label="${esc(`${t('lang.' + l)}: ${termFor(l)}. ${t('tr.editHint')}`)}">
      <span class="tr-lang">${LANG_LABEL[l]}</span><span class="tr-text" lang="${l === 'zh' ? 'zh-HK' : l}">${esc(label)}</span>${failed ? ' ⚠' : ''}</button>`;
  }).join('');
  const anyFailed = langs.some((l) => tr.text === text && tr.out[l] && !tr.out[l].ok);
  return `${toggle}<div class="tr-chips">${chips}</div><p class="muted small tr-hint">${t('tr.fixHint')}</p>${anyFailed ? `<p class="muted small">${t('tr.failed')}</p>` : ''}`;
}

const MISSING_LABEL = {
  q: 'search.kw', q_plus: 'search.kw', q_dash: 'search.kw',
  from: 'search.from', from_l: 'search.from', to: 'search.to', to_l: 'search.to',
  depart: 'search.depart', depart_yymmdd: 'search.depart', city: 'search.city',
  checkin: 'search.checkin', checkout: 'search.checkout',
};

function searchResults() {
  const s = state.search;
  const params = searchParams();
  const sites = sitesShown();
  if (!sites.length) return `<p class="empty">${t('search.empty')}</p>`;
  // The best price-comparison site for this category first, then other comparison sites, then shops.
  const order = (x) => (x.top?.includes(s.cat) ? 0 : x.kind === 'compare' ? 1 : 2);
  const groups = REGIONS.filter((r) => s.regions.includes(r))
    .map((r) => [r, sites.filter((x) => x.region === r).sort((a, b) => order(a) - order(b))])
    .filter(([, l]) => l.length);
  const missing = [...new Set(sites.flatMap((x) => buildUrl(x.url, params).missing))];
  const need = [...new Set(missing.map((k) => t(MISSING_LABEL[k] || k)))].join('、');
  const banner = missing.length
    ? `<div class="need-banner" role="status"><p>${t('search.needBanner', { fields: esc(need) })}</p>
        <button type="button" class="btn small primary" data-act="focus-search">${t('search.fillIn')}</button></div>`
    : `<p class="hint">${t('search.hint')}</p>`;
  ensureUkPrices();
  const pc = priceContext();
  return `${opwPanel()}${marketPanels()}${banner}${groups.map(([r, list]) => `
    <section class="region">
      <h2 class="region-h"><span>${t('region.' + r)}</span><small>${t('search.count', { n: list.length })}</small></h2>
      ${r === 'UK' ? onsNote() : ''}
      <ul class="sites">${list.map((site) => siteRow(site, paramsFor(site), pc)).join('')}</ul>
    </section>`).join('')}`;
}

function opwPanel() {
  const s = state.search;
  if (s.cat !== 'grocery' || !opw || !s.q.trim() || !s.regions.includes('HK')) return '';
  const lang = getLang();
  let hits = searchOpw(opw, s.q, 8);
  // Consumer Council names are in Chinese and English: try the other language too.
  if (!hits.length) hits = searchOpw(opw, termFor(detectLang(s.q) === 'zh' ? 'en' : 'zh'), 8);
  const rows = hits.map((p) => {
    const cheapest = p.prices[0];
    const table = p.prices.map((x) => {
      const offer = p.offers.filter((o) => o.store === x.store).map((o) => (lang === 'en' ? o.en : o.zh)).join('; ');
      return `<tr><th>${esc(storeName(x.store))}${offer ? `<span class="opw-offer">${esc(offer)}</span>` : ''}</th><td>${esc(fmt(x.price, 'HKD', lang))}</td></tr>`;
    }).join('');
    return `<li class="opw-item">
      <div class="opw-head">
        <div class="opw-name">${esc(productName(p, lang))}</div>
        <div class="opw-best"><span class="mini-tag">${esc(fmt(cheapest.price, 'HKD', lang))}</span><span class="meta">${esc(storeName(cheapest.store))}</span></div>
      </div>
      <details class="q-details"><summary>${t('opw.stores', { n: p.prices.length })}</summary><table class="breakdown">${table}</table></details>
      <div class="opw-actions">
        <button type="button" class="btn small" data-act="opw-track" data-code="${esc(p.code)}">${t('search.track')}</button>
        <a class="btn small quiet" href="${esc(opwProductUrl(p.code))}" target="_blank" rel="noopener noreferrer">${t('opw.page')} ↗</a>
      </div>
    </li>`;
  }).join('');
  return `<section class="card opw">
    <h2 class="section-h">${t('opw.title')} <small>${esc(t('opw.updated', { date: fmtDate(opw.date) }))}</small></h2>
    ${hits.length ? `<ul class="opw-list">${rows}</ul>` : `<p class="muted small">${esc(t('opw.none', { q: s.q.trim() }))}</p>`}
    <p class="muted small">${t('opw.note')}</p>
  </section>`;
}

// Keep tracked Consumer Council items in step with today's data.
function applyOpwUpdates() {
  if (!opw) return;
  for (const item of S.liveItems()) {
    if (!item.opw || item.opwDate === opw.date) continue;
    const p = opw.byCode.get(item.opw);
    if (!p) continue;
    const { add, seen } = opwUpdates(item, p, opw.date, getLang());
    S.applyQuoteUpdates(item.id, add, seen, opw.date, { opwDate: opw.date });
  }
}

async function loadOpw() {
  try {
    const res = await fetch('data/opw.json', { cache: 'no-cache' });
    if (!res.ok) return;
    opw = expandOpw(await res.json());
    applyOpwUpdates();
    const r = route().name;
    if (r === 'search' && state.search.cat === 'grocery' && $('#results')) $('#results').innerHTML = searchResults();
    else if (r === 'item' || r === 'list') softRender();
  } catch {
    /* offline or not deployed yet: the panel just stays hidden */
  }
}

// ---- European supermarkets ----
function marketsWanted() {
  const s = state.search;
  return s.cat === 'grocery' && s.regions.includes('EU') && s.q.trim() ? Object.keys(MARKETS) : [];
}

function loadMarket(m, part) {
  const x = mk[m];
  x.loads[part] ||= fetch(`data/${m}${part === 'old' ? '-old' : ''}.json`, { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((data) => {
      x[part] = expandMarket(data);
      if (!x[part]) throw new Error('bad file');
    })
    .catch(() => { x.failed[part] = true; });
  return x.loads[part];
}

// Show search results as each file arrives: up-to-date stores first, the rest after.
function ensureMarkets() {
  for (const m of marketsWanted()) {
    if (mk[m].started) continue;
    mk[m].started = true;
    loadMarket(m, 'fresh')
      .then(() => { applyMarketUpdates(m); refreshMarkets(); return loadMarket(m, 'old'); })
      .then(refreshMarkets);
  }
}

function refreshMarkets() {
  if (route().name === 'search' && marketsWanted().length) refreshResults();
  else if (['item', 'list'].includes(route().name)) softRender();
}

// Keep logged supermarket prices in step with today's file.
function applyMarketUpdates(m) {
  const db = mk[m].fresh;
  if (!db) return;
  const rates = ctx().rates;
  for (const item of S.liveItems()) {
    if (!item.quotes?.some((q) => !q.deleted && q.feed?.m === m)) continue;
    const { add, seen } = marketUpdates(item, db, m);
    if (!add.length && !seen.length) continue;
    for (const q of add) q.fx = fxSnapshot(q, rates, state.rates?.date || db.date);
    S.applyQuoteUpdates(item.id, add, seen, db.date);
  }
}

// At start-up, refresh tracked supermarket prices (only the markets that have any).
function loadTrackedMarkets() {
  const used = new Set();
  for (const item of S.liveItems()) for (const q of item.quotes || []) if (!q.deleted && q.feed?.m in mk) used.add(q.feed.m);
  for (const m of used) loadMarket(m, 'fresh').then(() => { applyMarketUpdates(m); if (route().name !== 'search') softRender(); });
}

const sizeLabel = (p) => {
  if (!(p.qty > 0)) return '';
  const lang = getLang();
  const n = (v) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(v);
  if (p.unit === 'ml') return p.qty >= 1000 ? `${n(p.qty / 1000)} L` : `${n(p.qty)} ml`;
  if (p.unit === 'g') return p.qty >= 1000 ? `${n(p.qty / 1000)} kg` : `${n(p.qty)} g`;
  return lang === 'zh' ? `${n(p.qty)} 件` : `${n(p.qty)} pcs`;
};

function marketRow(m, part, p, store) {
  const base = state.settings.base;
  const approx = base !== 'EUR' ? convert(p.price, 'EUR', base, ctx().rates) : NaN;
  const size = sizeLabel(p);
  const pu = p.pu && (p.pu.per !== 'pc' || p.qty > 1) ? `${fmt(p.pu.value, 'EUR', getLang())}/${t('mkt.per.' + p.pu.per)}` : '';
  const meta = [marketStore(p.store), size, pu].filter(Boolean).map(esc).join(' · ');
  const old = part === 'old' ? `<span class="stale-tag">${esc(t('mkt.staleSince', { date: fmtDate(store?.lastChange) }))}</span>` : '';
  return `<li class="opw-item mkt-item${part === 'old' ? ' stale' : ''}">
    <div class="opw-head">
      <div><div class="opw-name">${esc(p.name)}</div><div class="meta">${meta}</div>${old}</div>
      <div class="opw-best"><span class="mini-tag">${esc(fmt(p.price, 'EUR', getLang()))}</span>${Number.isFinite(approx) ? `<span class="meta">≈ ${esc(money(approx))}</span>` : ''}</div>
    </div>
    <div class="opw-actions">
      <button type="button" class="btn small" data-act="mkt-log" data-m="${m}" data-part="${part}" data-i="${p.i}">${t('search.log')}</button>
      <a class="btn small quiet" href="${esc(safeUrl(productLink(p)))}" target="_blank" rel="noopener noreferrer">${t(p.url ? 'mkt.page' : 'mkt.find')} ↗</a>
    </div>
  </li>`;
}

function marketPanels() {
  const ms = marketsWanted();
  if (!ms.length) return '';
  ensureMarkets();
  return ms.map(marketPanel).join('');
}

function marketPanel(m) {
  const x = mk[m];
  const info = MARKETS[m];
  const head = (extra = '') => `<h2 class="section-h">${t('mkt.title.' + m)}${extra}</h2>`;
  if (!x.fresh) {
    if (x.failed.fresh) return '';
    return `<section class="card opw mkt">${head()}<p class="muted small">${t('mkt.loading')}</p></section>`;
  }
  const q = termFor(info.lang);
  const r = searchMarket(x.fresh, q, { limit: 5, staleLimit: 0 });
  const unitNote = r.rankedBy ? t('mkt.rank.' + r.rankedBy) : t('mkt.rank.price');
  const zh = getLang() === 'zh';
  const stores = x.fresh.stores.map((s) => marketStore(s.code)).join(zh ? '、' : ', ');
  const byCode = (db) => Object.fromEntries(db.stores.map((s) => [s.code, s]));
  const fresh = r.fresh.map((p) => marketRow(m, 'fresh', p)).join('');

  let stale = '';
  if (x.old) {
    const o = searchMarket(x.old, q, { limit: 0, staleLimit: 3 });
    const sc = byCode(x.old);
    const list = x.old.stores.map((s) => (zh ? `${marketStore(s.code)}（${fmtDate(s.lastChange)}）` : `${marketStore(s.code)} (${fmtDate(s.lastChange)})`)).join(zh ? '、' : ', ');
    stale = `<div class="mkt-stale">
      <h3 class="mkt-stale-h">⚠ ${t('mkt.staleTitle')}</h3>
      <p class="muted small">${esc(t('mkt.staleNote', { stores: list }))}</p>
      ${o.stale.length ? `<ul class="opw-list">${o.stale.map((p) => marketRow(m, 'old', p, sc[p.store])).join('')}</ul>` : ''}
    </div>`;
  } else if (!x.failed.old) {
    stale = `<p class="muted small">${t('mkt.loadingOld')}</p>`;
  }

  return `<section class="card opw mkt">
    ${head(` <small>${esc(t('opw.updated', { date: fmtDate(x.fresh.date) }))}</small>`)}
    <p class="muted small">${esc(t('mkt.lead', { q, stores }))} ${esc(unitNote)}</p>
    ${fresh ? `<ol class="opw-list">${fresh}</ol>` : `<p class="muted small">${esc(t('mkt.none', { q }))}</p>`}
    ${stale}
    <p class="muted small">${t('mkt.note', { src: `<a href="${esc(info.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(info.source)}</a>` })}</p>
  </section>`;
}

// ---- current price beside each site ----
// Open Prices (crowd-sourced shelf prices) for UK supermarkets, fetched live for the English search words.
const opLive = { term: '', state: '', list: [] };
let ons = null; // UK typical prices from ONS, data/ons.json
let onsState = '';

const ukGroceryWanted = () => {
  const s = state.search;
  return s.cat === 'grocery' && s.regions.includes('UK') && !!s.q.trim();
};
const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
const refreshSearch = () => { if (route().name === 'search') refreshResults(); };

function ensureUkPrices() {
  if (!ukGroceryWanted()) return;
  if (!onsState) {
    onsState = 'loading';
    getJson('data/ons.json')
      .then((d) => { ons = d; onsState = 'ok'; })
      .catch(() => { onsState = 'fail'; })
      .finally(refreshSearch);
  }
  // Wait for the English words before asking Open Prices.
  const text = trSource();
  if (autoTr() && detectLang(text) !== 'en' && tr.text === text && tr.pending.has('en')) return;
  const term = termFor('en');
  if (!term || opLive.term === term) return;
  Object.assign(opLive, { term, state: 'loading', list: [] });
  loadOpenPrices(term);
}

async function loadOpenPrices(term) {
  try {
    const products = await getJson(openProductsUrl(term));
    const codes = (products.items || []).map((p) => p.code).filter(Boolean);
    const list = codes.length ? parseOpenPrices(await getJson(openPricesUrl(codes, 'GBP'))) : [];
    if (opLive.term === term) Object.assign(opLive, { state: 'ok', list });
  } catch {
    if (opLive.term === term) opLive.state = 'fail';
  }
  refreshSearch();
}

// What every row needs, worked out once per render.
function priceContext() {
  const s = state.search;
  const key = S.wordKey(searchItemName());
  let hits;
  return {
    today: localDate(),
    items: key ? S.liveItems().filter((i) => S.wordKey(i.name) === key) : [],
    opwHits() {
      if (hits) return hits;
      hits = opw && s.q.trim() ? searchOpw(opw, s.q, 40) : [];
      if (opw && !hits.length && s.q.trim()) hits = searchOpw(opw, termFor(detectLang(s.q) === 'zh' ? 'en' : 'zh'), 40);
      return hits;
    },
  };
}

/** The price a data source has for this site today: an object, 'loading', or null. */
function dataPrice(site, pc) {
  const s = state.search;
  if (s.cat !== 'grocery' || !s.q.trim()) return null;
  const lang = getLang();
  if (site.id === 'opw') {
    // The Consumer Council row: the cheapest price at any of its stores.
    let best = null;
    for (const p of opw ? pc.opwHits() : []) {
      const x = p.prices.reduce((a, b) => (b.price < a.price ? b : a), p.prices[0]);
      if (x && (!best || x.price < best.x.price)) best = { p, x };
    }
    return best && { price: best.x.price, cur: 'HKD', name: `${productName(best.p, lang)} · ${storeName(best.x.store)}`, url: opwProductUrl(best.p.code), src: t('price.src.opw'), date: opw.date };
  }
  if (SITE_OPW[site.id]) {
    if (!opw) return null;
    const best = opwBest(pc.opwHits(), SITE_OPW[site.id]);
    return best && { price: best.price, cur: 'HKD', name: productName(best.product, lang), url: opwProductUrl(best.product.code), src: t('price.src.opw'), date: opw.date };
  }
  if (SITE_MARKET[site.id]) {
    const [m, store] = SITE_MARKET[site.id];
    const x = mk[m];
    if (!marketsWanted().includes(m)) return null;
    const inFresh = x.fresh?.stores.some((st) => st.code === store);
    const db = inFresh ? x.fresh : x.old;
    if (!db) return (x.failed.fresh && (inFresh || x.failed.old)) ? null : 'loading';
    const p = marketBest(db, termFor(MARKETS[m].lang), store);
    const st = db.stores.find((y) => y.code === store);
    return p && {
      price: p.price, cur: 'EUR', name: p.name, url: p.url, src: MARKETS[m].source, date: inFresh ? db.date : st?.lastChange,
      stale: !inFresh, storeStale: !inFresh, unit: p.pu && p.pu.per !== 'pc' ? `${fmt(p.pu.value, 'EUR', lang)}/${t('mkt.per.' + p.pu.per)}` : '',
    };
  }
  if (SITE_BRAND[site.id] && ukGroceryWanted()) {
    if (opLive.state === 'loading' || !opLive.state) return 'loading';
    const best = openBest(opLive.list, SITE_BRAND[site.id], pc.today);
    return best && {
      price: best.price, cur: best.currency, name: best.name, src: 'Open Prices', date: best.date,
      stale: ageDays(best.date) > 30, note: best.discounted ? t('price.offer') : '',
    };
  }
  return null;
}

function sitePrice(site, pc) {
  const lang = getLang();
  const base = state.settings.base;
  const approx = (v, cur) => {
    const a = cur !== base ? convert(v, cur, base, ctx().rates) : NaN;
    return Number.isFinite(a) ? `<span class="sp-meta">≈ ${esc(money(a))}</span>` : '';
  };
  const found = dataPrice(site, pc);
  const mine = loggedBest(pc.items, site.name);
  let html = '';
  if (found === 'loading') {
    html = `<div class="site-price none">${t('price.loading')}</div>`;
  } else if (found) {
    const name = found.url
      ? `<a class="sp-name" href="${esc(safeUrl(found.url))}" target="_blank" rel="noopener noreferrer">${esc(found.name)}</a>`
      : `<span class="sp-name">${esc(found.name)}</span>`;
    // A store that stopped updating says since when; an old crowd-sourced price just shows its date.
    const when = found.storeStale ? t('mkt.staleSince', { date: fmtDate(found.date) }) : fmtDate(found.date);
    html = `<div class="site-price${found.stale ? ' stale' : ''}">
      <span class="mini-tag">${esc(fmt(found.price, found.cur, lang))}</span>${approx(found.price, found.cur)}
      ${name}
      <span class="sp-meta">${esc([found.unit, found.note, found.src, when].filter(Boolean).join(' · '))}</span>
      ${found.stale ? `<span class="stale-tag">${t('mkt.staleTitle')}</span>` : ''}
    </div>`;
  }
  if (mine) {
    const old = ageDays(mine.seen) > (state.settings.staleDays || 7);
    html += `<div class="site-price mine${old ? ' stale' : ''}">
      <span class="sp-meta">${t('price.mine')}</span>
      <span class="mini-tag">${esc(fmt(Number(mine.price), mine.currency, lang))}</span>${approx(Number(mine.price), mine.currency)}
      <span class="sp-meta">${esc(ageDays(mine.seen) <= 0 ? t('price.today') : t('price.ago', { n: ageDays(mine.seen) }))}</span>
      ${old ? `<span class="stale-tag">${t('mkt.staleTitle')}</span>` : ''}
    </div>`;
  }
  return html || `<div class="site-price none">${t('price.none')}</div>`;
}

// UK-wide typical price of the item (ONS), shown above the UK sites.
function onsNote() {
  if (!ukGroceryWanted() || !ons) return '';
  const hits = onsMatch(ons, termFor('en'));
  if (!hits.length) return '';
  const nice = (d) => d.charAt(0) + d.slice(1).toLowerCase();
  const list = hits.map((h) => `${esc(nice(h.desc))} <span class="mini-tag">${esc(fmt(h.price, 'GBP', getLang()))}</span>`).join(' · ');
  return `<p class="region-note">${t('price.ons', { month: esc(ons.month || '') })} ${list}</p>`;
}

function siteRow(site, params, pc) {
  const { url, missing } = buildUrl(site.url, params);
  const href = safeUrl(url);
  // Without the search details, open the site's home page instead of a dead button.
  const home = missing.length || !href ? safeUrl(siteHome(site)) : '';
  const open = home
    ? `<a class="btn small quiet" href="${esc(home)}" target="_blank" rel="noopener noreferrer">${t('search.home')}<span aria-hidden="true"> ↗</span></a>`
    : href
      ? `<a class="btn small" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${t('search.open')}<span aria-hidden="true"> ↗</span></a>`
      : '';
  return `<li class="site">
    <div class="site-main">
      <span class="site-name">${esc(site.name)}</span>
      <span class="badge kind-${esc(site.kind)}">${t('kind.' + site.kind)}</span>
      ${site.top?.includes(state.search.cat) ? `<span class="badge top-badge">${t('site.top')}</span>` : ''}
      ${site.via === 'google' ? `<span class="badge">${t('site.viaGoogle')}</span>` : ''}
      ${site.check === 'bad' ? `<span class="badge warn-badge">${t('test.badBadge')}</span>` : ''}
    </div>
    ${pc && !missing.length ? sitePrice(site, pc) : ''}
    <div class="site-actions">${open}<button type="button" class="btn small quiet" data-act="log-from-search" data-site="${esc(site.id)}">${t('search.log')}</button></div>
  </li>`;
}

function searchItemName() {
  const s = state.search;
  if (s.cat === 'flight') {
    if (!s.from || !s.to) return '';
    return `${s.from.toUpperCase()} → ${s.to.toUpperCase()}${s.depart ? ` ${s.depart}` : ''}${!s.oneway && s.ret ? ` – ${s.ret}` : ''}`;
  }
  if (s.cat === 'hotel') {
    if (!s.city) return '';
    return `${s.city.trim()}${s.checkin ? ` ${s.checkin}` : ''}${s.checkout ? ` – ${s.checkout}` : ''}`;
  }
  return s.q.trim();
}

const searchSnapshot = () => ({ ...state.search });

// ---------- watchlist ----------
function bestOf(item, c) {
  const ranked = rankQuotes(latestPerSite(S.liveQuotes(item)), c).filter((x) => Number.isFinite(x.r.total));
  return { best: ranked[0], second: ranked[1] };
}
const targetBase = (item, c) => (num(item.target) > 0 ? convert(num(item.target), item.targetCur || c.base, c.base, c.rates) : NaN);

// Items whose newest price is older than the "old price" setting (or that have none).
function dueItems() {
  const limit = num(state.settings.staleDays, 7);
  return S.liveItems()
    .map((item) => {
      const qs = S.liveQuotes(item);
      const age = qs.length ? Math.min(...qs.map((q) => ageDays(seenDate(q)))) : Infinity;
      return { item, age };
    })
    .filter(({ age }) => age > limit)
    .sort((a, b) => b.age - a.age);
}

function dueSection() {
  const due = dueItems();
  if (!due.length) return '';
  return `<section class="card due">
    <h2 class="section-h">${t('due.title')} <small>${due.length}</small></h2>
    <p class="muted small">${t('due.hint', { n: state.settings.staleDays ?? 7 })}</p>
    <ul class="due-list">${due.slice(0, 6).map(({ item, age }) => `<li>
      <a href="#/item/${encodeURIComponent(item.id)}" class="due-name">${esc(item.name)}</a>
      <span class="meta">${Number.isFinite(age) ? esc(t('age.days', { n: age })) : t('list.noQuote')}</span>
      <button type="button" class="btn small" data-act="item-research" data-item="${esc(item.id)}">${t('due.go')}</button>
    </li>`).join('')}</ul>
  </section>`;
}

function viewList() {
  const c = ctx();
  const all = S.liveItems();
  const cats = CATS.filter((k) => all.some((i) => i.cat === k));
  if (ui.listCat !== 'all' && !cats.includes(ui.listCat)) ui.listCat = 'all';
  const items = all.filter((i) => ui.listCat === 'all' || i.cat === ui.listCat).sort((a, b) => b.updatedAt - a.updatedAt);
  const cards = items.map((item) => {
    const { best } = bestOf(item, c);
    const target = targetBase(item, c);
    const hit = best && Number.isFinite(target) && best.r.total <= target + 0.005;
    const n = S.liveQuotes(item).length;
    return `<li><a class="item-card${hit ? ' hit' : ''}" href="#/item/${encodeURIComponent(item.id)}">
      <div class="item-info">
        <span class="eyebrow">${t('cat.' + item.cat)}</span>
        <h3>${esc(item.name)}</h3>
        <p class="meta">${n ? t('list.quotes', { n }) : t('list.noQuote')}${Number.isFinite(target) ? ` · ${t('list.target', { price: money(target) })}` : ''}</p>
      </div>
      <div class="item-price">
        ${best ? `<span class="mini-tag">${esc(money(best.r.total))}</span><span class="meta">${esc(best.q.site)}</span>` : ''}
        ${hit ? `<span class="badge good">${t('list.hit')}</span>` : ''}
      </div>
    </a></li>`;
  });
  return `
  <header class="page-head">
    <h1>${t('list.title')}</h1>
    <button type="button" class="btn primary" data-act="item-add">+ ${t('list.add')}</button>
  </header>
  ${dueSection()}
  ${cats.length > 1 ? `<div class="chips small">${chip('listCat', 'all', t('list.allCats'), ui.listCat === 'all')}${cats.map((k) => chip('listCat', k, t('cat.' + k), ui.listCat === k)).join('')}</div>` : ''}
  ${items.length ? `<ul class="items">${cards.join('')}</ul>` : `<p class="empty">${t('list.empty')}</p>`}`;
}

// ---------- item ----------
function priceTag(best, item, c, second) {
  const p = fmtParts(best.r.total, c.base, getLang());
  const target = targetBase(item, c);
  const notes = [];
  if (Number.isFinite(target)) {
    notes.push(best.r.total <= target + 0.005
      ? `<span class="badge good">✓ ${t('list.hit')}</span>`
      : `<span>${t('item.aboveTarget', { amt: esc(money(best.r.total - target)) })}</span>`);
  }
  if (second) notes.push(`<span>${t('item.cheaperBy', { amt: esc(money(second.r.total - best.r.total)) })}</span>`);
  if (isStale(best.q)) notes.push(`<span class="warn-text">${t('item.staleBest', { n: ageDays(seenDate(best.q)) })}</span>`);
  return `<div class="tag-wrap">
    <div class="price-tag">
      <span class="tag-label">${t('list.best')}</span>
      <span class="tag-price"><span class="tag-sym">${esc(p.symbol)}</span><span class="tag-num">${esc(p.value)}</span></span>
      <span class="tag-via">${t('item.via', { site: esc(best.q.site || '—'), date: esc(fmtDate(best.q.date)) })}${best.q.cond === 'used' ? ` · ${t('cond.used')}` : ''}</span>
    </div>
    ${notes.length ? `<p class="tag-notes">${notes.join('')}</p>` : ''}
  </div>`;
}

function breakdown(r, withTotal = true) {
  return `<table class="breakdown">${r.lines.map((l) => `<tr${l.k === 'belowMin' ? ' class="warn"' : ''}><th>${esc(t('line.' + l.k, { pct: l.pct, card: l.card || t('card.default'), min: l.min ? fmt(l.min, l.cur, getLang()) : '' }))}</th><td>${l.k === 'belowMin' ? '' : esc(fmt(l.v, l.cur, getLang()))}</td></tr>`).join('')}
    ${withTotal ? `<tr class="total"><th>${t('line.total')}</th><td>${esc(money(r.total))}</td></tr>` : ''}</table>`;
}

const seenDate = (q) => (q.seenAt && q.seenAt > (q.date || '') ? q.seenAt : q.date);

function ageLabel(date) {
  const n = ageDays(date);
  if (!Number.isFinite(n) || n < 0) return '';
  return n === 0 ? t('age.today') : t('age.days', { n });
}
const isStale = (q) => ageDays(seenDate(q)) > num(state.settings.staleDays, 7);

function unitLabel(q, total) {
  const u = unitPrice(total, q.qty, q.unit);
  return u ? `${t('unit.per.' + u.per)} ${money(u.value)}` : '';
}

function fxNote(q) {
  if (!q.fx?.hkdPer) return '';
  const sig = (v) => new Intl.NumberFormat(locale(), { maximumSignificantDigits: 5 }).format(v);
  const parts = Object.entries(q.fx.hkdPer).map(([c, v]) => `1 ${c} = ${sig(v)} HKD`);
  return `<p class="fx-note">${esc(t('fx.logged', { rates: parts.join(' · '), date: fmtDate(q.fx.date) }))}</p>`;
}

function quoteRow({ q, r }, i, { scratch = false, itemId = '', cheapest = NaN } = {}) {
  const href = safeUrl(q.url);
  const mode = q.mode && q.mode !== 'local' ? ` · ${t('modeShort.' + q.mode)}` : '';
  const diff = scratch && i > 0 && Number.isFinite(cheapest) ? `<span class="q-diff">${t('calc.more', { amt: esc(money(r.total - cheapest)) })}</span>` : '';
  const ids = `data-id="${esc(q.id)}" data-item="${esc(itemId)}"${scratch ? ' data-scratch="1"' : ''}`;
  const stale = !scratch && isStale(q);
  const unit = unitLabel(q, r.total);
  return `<li class="quote${i === 0 ? ' is-best' : ''}${stale ? ' stale' : ''}">
    <span class="q-rank" aria-hidden="true">${i + 1}</span>
    <div class="q-body">
      <div class="q-top"><span class="q-site">${esc(q.site || '—')}</span>
        ${q.region ? `<span class="badge">${t('region.' + q.region)}</span>` : ''}
        ${q.cond === 'used' ? `<span class="badge kind-used">${t('cond.used')}</span>` : ''}
        ${stale ? `<span class="badge stale-badge">${t('age.stale')}</span>` : ''}</div>
      <div class="q-sub">${esc(fmtDate(q.date))}${scratch ? '' : ` (${esc(ageLabel(seenDate(q)))})`} · ${esc(fmt(num(q.price), q.currency, getLang()))}${mode}${q.note ? ` · ${esc(q.note)}` : ''}</div>
      ${unit ? `<div class="q-unit">${esc(unit)}</div>` : ''}
      <details class="q-details"><summary>${t('item.breakdown')}</summary>${breakdown(r)}${fxNote(q)}</details>
    </div>
    <div class="q-total">${esc(money(r.total))}${i === 0 && scratch ? `<span class="q-best">${t('calc.cheapest')}</span>` : ''}${diff}</div>
    <div class="q-actions">
      ${href ? `<a class="btn small quiet" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${t('item.visit')} ↗</a>` : ''}
      ${scratch ? '' : `<button type="button" class="btn small" data-act="quote-refresh" ${ids}>${t('quote.refresh')}</button>`}
      <button type="button" class="btn small quiet" data-act="quote-edit" ${ids}>${t('edit')}</button>
      <button type="button" class="btn small quiet danger" data-act="quote-delete" ${ids}>${t('delete')}</button>
    </div>
  </li>`;
}

function viewItem(id) {
  const item = S.getItem(id);
  if (!item) return `<a class="back" href="#/list">← ${t('item.back')}</a><p class="empty">${t('item.notFound')}</p>`;
  const c = ctx();
  const quotes = S.liveQuotes(item);
  const { best, second } = bestOf(item, c);
  let shown = rankQuotes(ui.showAll ? quotes : latestPerSite(quotes), c);
  const withUnit = shown.filter((x) => unitPrice(x.r.total, x.q.qty, x.q.unit));
  const unitPers = new Set(withUnit.map((x) => unitPrice(x.r.total, x.q.qty, x.q.unit).per));
  const canUnit = withUnit.length >= 2 && unitPers.size === 1;
  if (canUnit && ui.sortUnit) {
    const uv = (x) => unitPrice(x.r.total, x.q.qty, x.q.unit)?.value ?? Infinity;
    shown = [...shown].sort((a, b) => uv(a) - uv(b));
  }
  const target = targetBase(item, c);

  // The trend uses each price's own exchange rate; the ranking uses today's.
  ui.chart = { points: quotes.map((q) => ({ date: q.date, value: landed(q, { ...c, rates: ratesAt(c.rates, q.fx) }).total, site: q.site })), target, base: c.base };
  const distinctDays = new Set(quotes.map((q) => q.date)).size;

  return `
  <a class="back" href="#/list">← ${t('item.back')}</a>
  <header class="item-head">
    <span class="eyebrow">${t('cat.' + item.cat)}</span>
    <h1>${esc(item.name)}</h1>
    ${item.note ? `<p class="muted">${esc(item.note)}</p>` : ''}
  </header>
  ${best ? priceTag(best, item, c, second) : ''}
  <div class="actions">
    <button type="button" class="btn primary" data-act="quote-add" data-item="${esc(item.id)}">+ ${t('item.log')}</button>
    <button type="button" class="btn" data-act="item-research" data-item="${esc(item.id)}">${t('item.search')}</button>
    <button type="button" class="btn quiet" data-act="item-edit" data-item="${esc(item.id)}">${t('item.edit')}</button>
    <button type="button" class="btn quiet danger" data-act="item-delete" data-item="${esc(item.id)}">${t('item.delete')}</button>
  </div>
  <section class="card">
    <h2 class="section-h">${t('item.trend')} <small>${t('item.trendSub', { cur: c.base })}</small></h2>
    ${distinctDays >= 2 ? `<p class="muted small">${t('item.trendFx')}</p>` : ''}
    ${distinctDays >= 2 ? '<div class="chart-wrap"><div class="c-tip" hidden></div></div>' : `<p class="muted">${t('item.trendNeed')}</p>`}
  </section>
  ${alertSection(item, quotes)}
  <section>
    <div class="section-bar">
      <h2 class="section-h">${t('item.quotes')} <small>${quotes.length}</small></h2>
      ${quotes.length ? `<div class="chips small" role="radiogroup">${chip('showAll', '0', t('item.latest'), !ui.showAll)}${chip('showAll', '1', t('item.all'), ui.showAll)}</div>` : ''}
      ${canUnit ? `<div class="chips small" role="radiogroup">${chip('sortUnit', '0', t('item.sortTotal'), !ui.sortUnit)}${chip('sortUnit', '1', t('item.sortUnit'), ui.sortUnit)}</div>` : ''}
    </div>
    ${shown.length ? `<ol class="quotes">${shown.map((x, i) => quoteRow(x, i, { itemId: item.id })).join('')}</ol>` : `<p class="empty">${t('item.noQuotes')}</p>`}
  </section>`;
}

function alertSection(item, quotes) {
  if (item.opw) return `<section class="card"><h2 class="section-h">${t('alert.title')}</h2><p class="muted small">${t('alert.opw')}</p></section>`;
  const list = alertsFor(item.cat);
  if (!list.length) return '';
  const params = item.search && item.search.cat === item.cat ? item.search : { q: item.name };
  const sites = S.getSites({ includeDisabled: true });
  const rows = list.map((a, i) => {
    const site = a.site && sites.find((s) => s.id === a.site);
    const q = params.q && site ? translateSync(params.q, detectLang(params.q), siteLang(site)) ?? params.q : params.q;
    const built = site ? buildUrl(site.url, { ...params, q }) : { url: a.url, missing: [] };
    const href = built.missing.length ? '' : safeUrl(built.url);
    if (!href) return '';
    const name = site ? site.name : a.name;
    const pasteUrl = a.paste && quotes.map((q) => q.url).find((u) => u && a.paste.test(u));
    const link = pasteUrl
      ? `<button type="button" class="btn small" data-act="alert-paste" data-href="${esc(href)}" data-copy="${esc(pasteUrl)}">${t('alert.copyOpen')}</button>`
      : `<a class="btn small" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${t('search.open')} ↗</a>`;
    return `<li class="alert-row"><div><span class="site-name">${esc(name)}</span><span class="alert-how">${esc(t('how.' + a.how))}</span></div>${link}</li>`;
  }).join('');
  return `<section class="card">
    <h2 class="section-h">${t('alert.title')}</h2>
    <p class="muted small">${t('alert.intro')}</p>
    <ul class="alert-list">${rows}</ul>
  </section>`;
}

function drawChart(wrap) {
  const { points, target, base } = ui.chart;
  const small = (v) => new Intl.NumberFormat(locale(), { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 }).format(v);
  const ch = buildChart(points, {
    width: wrap.clientWidth,
    target,
    fmtValue: small,
    fmtDate,
    targetLabel: Number.isFinite(target) ? t('list.target', { price: money(target, base) }) : '',
  });
  if (!ch) return;
  $$('svg', wrap).forEach((n) => n.remove());
  wrap.insertAdjacentHTML('afterbegin', ch.svg);
  bindChart(wrap, ch, (p) => `<span>${esc(fmtDate(p.date))}</span><b>${esc(money(p.value, base))}</b><span>${esc(p.site || '')}</span>`);
}

// ---------- calculator ----------
function convOut() {
  const c = ctx();
  const amt = num(ui.conv.amt, NaN);
  const from = ui.conv.cur;
  const targets = [...new Set([c.base, 'HKD', 'GBP', 'EUR', 'USD'])].filter((x) => x !== from);
  const paid = Number.isFinite(amt) && from !== c.cardCurrency
    ? landed({ price: amt, currency: from, region: 'GLOBAL', mode: 'local' }, { ...c, base: c.cardCurrency })
    : null;
  return `<ul class="conv-list">${targets.map((x) => `<li><span class="conv-cur">${x}</span><span class="conv-val">${esc(fmt(convert(amt, from, x, c.rates), x, getLang()))}</span></li>`).join('')}</ul>
    ${paid ? `<p class="muted">${esc(t('calc.withFee', { card: cardName(paid.card) }))}: <b>${esc(fmt(paid.total, c.cardCurrency, getLang()))}</b></p>` : ''}`;
}

function viewCalc() {
  const c = ctx();
  const ranked = rankQuotes(state.scratch, c);
  const cheapest = ranked[0]?.r.total;
  return `
  <header class="page-head"><h1>${t('tab.calc')}</h1></header>
  <section class="card">
    <h2 class="section-h">${t('calc.conv')}</h2>
    <div class="conv-in">
      ${field(t('calc.amount'), `<input type="number" inputmode="decimal" step="any" data-conv="amt" value="${esc(ui.conv.amt)}">`)}
      ${field(t('quote.currency'), `<select data-conv="cur">${curOptions(ui.conv.cur)}</select>`)}
    </div>
    <div id="conv-out">${convOut()}</div>
  </section>
  <section class="card">
    <div class="section-bar">
      <h2 class="section-h">${t('calc.compare')}</h2>
      <button type="button" class="btn primary small" data-act="scratch-add">+ ${t('calc.add')}</button>
    </div>
    <p class="muted">${t('calc.compareHint')}</p>
    ${ranked.length ? `<ol class="quotes">${ranked.map((x, i) => quoteRow(x, i, { scratch: true, cheapest })).join('')}</ol>
      <div class="actions"><button type="button" class="btn" data-act="scratch-save">${t('calc.saveAll')}</button>
      <button type="button" class="btn quiet danger" data-act="scratch-clear">${t('calc.clear')}</button></div>`
    : `<p class="empty">${t('calc.empty')}</p>`}
  </section>`;
}

// ---------- settings ----------
function rateRows() {
  const live = effectiveRates(state.rates, {});
  const manual = state.settings.manualRates || {};
  const sig = (v) => new Intl.NumberFormat(locale(), { maximumSignificantDigits: 5 }).format(v);
  return CURRENCIES.filter((c) => c !== 'HKD').map((c) => `<tr>
    <th>1 ${c}</th>
    <td>${sig(live[c])} HKD</td>
    <td><input type="number" step="any" inputmode="decimal" data-rate="${c}" value="${manual[c] ? esc(manual[c]) : ''}" placeholder="${esc(sig(live[c]))}" aria-label="${c} ${esc(t('set.ratesCustom'))}"></td>
  </tr>`).join('');
}

function cardRows() {
  const cards = state.settings.cards;
  const numIn = (c, k) => `<input type="number" step="0.01" min="0" inputmode="decimal" data-card="${esc(c.id)}" data-k="${k}" value="${esc(c[k] ?? 0)}">`;
  return cards.map((c) => `<fieldset class="card-set">
    <div class="card-set-head">
      <input data-card="${esc(c.id)}" data-k="name" value="${esc(c.name)}" placeholder="${esc(t('card.default'))}" aria-label="${esc(t('card.name'))}">
      ${cards.length > 1 ? `<button type="button" class="btn small quiet danger" data-act="card-delete" data-card="${esc(c.id)}">${t('delete')}</button>` : ''}
    </div>
    <div class="grid-4">
      ${field(t('card.fcc'), numIn(c, 'fcc'))}
      ${field(t('card.cbf'), numIn(c, 'cbf'))}
      ${field(t('card.cashback'), numIn(c, 'cashback'))}
      ${field(t('card.markup'), numIn(c, 'markup'))}
    </div>
  </fieldset>`).join('');
}

function siteRows() {
  const sites = S.getSites({ includeDisabled: true }).filter((s) => ui.siteCat === 'all' || s.cats.includes(ui.siteCat));
  return sites.map((s) => `<li class="site-set">
    <input type="checkbox" data-act="site-toggle" data-site="${esc(s.id)}"${s.enabled ? ' checked' : ''} aria-label="${esc(s.name)}">
    <button type="button" class="linkish" data-act="site-edit" data-site="${esc(s.id)}">${esc(s.name)}</button>
    <span class="badge">${t('region.' + s.region)}</span>
    <span class="badge kind-${esc(s.kind)}">${t('kind.' + s.kind)}</span>
    ${s.builtin ? '' : `<span class="badge">${t('set.sitesCustom')}</span>`}
  </li>`).join('');
}

function syncBlock() {
  const token = S.getToken();
  if (!token) {
    return `<p class="muted">${t('set.syncIntro')}</p>
      <div class="row">
        <input type="password" id="token-in" placeholder="ghp_… / github_pat_…" autocomplete="off" aria-label="${esc(t('set.syncToken'))}">
        <button type="button" class="btn primary" data-act="sync-connect">${t('set.syncConnect')}</button>
      </div>
      <p class="muted small"><a href="https://github.com/settings/tokens/new?scopes=gist&description=PriceBook" target="_blank" rel="noopener noreferrer">${t('set.syncTokenHelp')} ↗</a> · ${t('set.syncTokenNote')}</p>`;
  }
  const last = state.sync.lastSync
    ? t('set.syncLast', { time: new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(state.sync.lastSync) })
    : t('set.syncNever');
  return `<p id="sync-status" class="muted">${esc(last)}${state.sync.lastError ? ` · <span class="bad">${esc(state.sync.lastError)}</span>` : ''}</p>
    <label class="check"><input type="checkbox" data-set="sync.auto"${state.sync.auto ? ' checked' : ''}> ${t('set.syncAuto')}</label>
    <div class="actions">
      <button type="button" class="btn primary" data-act="sync-now">${t('set.syncNow')}</button>
      <button type="button" class="btn quiet danger" data-act="sync-disconnect">${t('set.syncDisconnect')}</button>
    </div>`;
}

function viewSettings() {
  const st = state.settings;
  const r = state.rates;
  return `
  <header class="page-head"><h1>${t('tab.settings')}</h1></header>
  <section class="card">
    <h2 class="section-h">${t('set.general')}</h2>
    <div class="grid-2">
      ${field(t('set.lang'), `<select data-set="lang">${opt('zh', '中文（香港）', st.lang === 'zh')}${opt('en', 'English', st.lang === 'en')}</select>`)}
      ${field(t('set.base'), `<select data-set="base">${curOptions(st.base)}</select>`)}
      ${field(t('set.cardCur'), `<select data-set="cardCurrency">${curOptions(st.cardCurrency)}</select>`)}
      ${field(t('set.staleDays'), `<input type="number" min="1" step="1" inputmode="numeric" data-set="staleDays" value="${esc(st.staleDays ?? 7)}">`)}
    </div>
    ${installPrompt ? `<button type="button" class="btn" data-act="install">${t('set.install')}</button>` : ''}
  </section>
  <section class="card">
    <div class="section-bar">
      <h2 class="section-h">${t('card.section')}</h2>
      <button type="button" class="btn small" data-act="card-add">+ ${t('card.add')}</button>
    </div>
    <p class="muted small">${t('card.hint')}</p>
    ${cardRows()}
  </section>
  <section class="card">
    <h2 class="section-h">${t('set.fwd')} <small>HKD / kg</small></h2>
    <div class="grid-3 tight">
      ${['UK', 'EU', 'GLOBAL'].map((r) => field(t('region.' + r), `<input type="number" min="0" step="any" inputmode="decimal" data-fwd="${r}" value="${esc(st.fwdRates?.[r] ?? '')}">`)).join('')}
    </div>
    <p class="muted small">${t('set.fwdHint')}</p>
  </section>
  <section class="card">
    <div class="section-bar">
      <h2 class="section-h">${t('set.rates')}</h2>
      <button type="button" class="btn small" data-act="rates-refresh">${t('set.ratesRefresh')}</button>
    </div>
    <p class="muted small">${r ? esc(t('set.ratesSource', { src: r.source, date: r.date })) : t('set.ratesFallback')}</p>
    <table class="rates"><thead><tr><th></th><th>${t('set.ratesLive')}</th><th>${t('set.ratesCustom')}</th></tr></thead><tbody>${rateRows()}</tbody></table>
    <p class="muted small">${t('set.ratesHint')}</p>
  </section>
  <section class="card">
    <div class="section-bar">
      <h2 class="section-h">${t('set.sites')}</h2>
      <select data-ui="siteCat" aria-label="${esc(t('itemDlg.cat'))}">${opt('all', t('list.allCats'), ui.siteCat === 'all')}${CATS.map((c) => opt(c, t('cat.' + c), ui.siteCat === c)).join('')}</select>
    </div>
    <p class="muted small">${t('set.sitesNote')}</p>
    <ul class="site-list">${siteRows()}</ul>
    <div class="actions">
      <button type="button" class="btn" data-act="site-add">+ ${t('set.sitesAdd')}</button>
      <a class="btn" href="#/linktest">${t('test.open')}</a>
      <button type="button" class="btn quiet" data-act="sites-reset">${t('set.sitesReset')}</button>
    </div>
  </section>
  <section class="card">
    <h2 class="section-h">${t('set.sync')} <small>GitHub Gist</small></h2>
    ${syncBlock()}
  </section>
  <section class="card">
    <h2 class="section-h">${t('set.data')}</h2>
    <div class="actions">
      <button type="button" class="btn" data-act="export">${t('set.export')}</button>
      <label class="btn">${t('set.import')}<input type="file" accept="application/json,.json" data-act="import" hidden></label>
      <button type="button" class="btn quiet danger" data-act="clear-all">${t('set.clear')}</button>
    </div>
  </section>
  ${wordsSection()}
  <section class="card about">
    <h2 class="section-h">${t('set.about')}</h2>
    <p class="muted small">${t('set.aboutText')}</p>
    <div class="actions version-row">
      <span class="muted small">${esc(t('set.version', { v: APP_VERSION.replace('pricebook-', '') }))}</span>
      <button type="button" class="btn small" data-act="force-update">${t('set.forceUpdate')}</button>
    </div>
  </section>`;
}

// Your translation fixes, with a way to forget each one.
function wordsSection() {
  const words = S.liveWords();
  const rows = words.map(([key, w]) => `<li class="word-row">
      <div><div class="word-src">${esc(w.text || key)}</div>
        <div class="muted small">${Object.entries(w.map).map(([l, v]) => `${LANG_LABEL[l] || l}: ${esc(v)}`).join(' · ')}</div></div>
      <button type="button" class="btn small quiet danger" data-act="word-del" data-key="${esc(key)}">${t('words.forget')}</button>
    </li>`).join('');
  return `<section class="card">
    <h2 class="section-h">${t('words.title')} <small>${words.length}</small></h2>
    <p class="muted small">${t('words.lead')}</p>
    ${words.length ? `<ul class="word-list">${rows}</ul>` : ''}
  </section>`;
}

// ---------- link test ----------
const TEST_Q = { coffee: '磨豆機', home: '毛巾', grocery: '牛奶', electronics: '耳機', other: '行李箱' };

function testParams(cat, lang = 'en') {
  const depart = addDays(localDate(), 30);
  return { q: sampleTerm(TEST_Q[cat] || '咖啡', lang), from: 'HKG', to: 'LHR', depart, ret: addDays(depart, 14), city: 'London', checkin: depart, checkout: addDays(depart, 2), adults: 2 };
}

function testSites() {
  return S.getSites({ includeDisabled: true }).filter((s) => ui.testCat === 'all' || s.cats.includes(ui.testCat));
}

function viewLinkTest() {
  const sites = testSites();
  const done = sites.filter((s) => s.check).length;
  const bad = sites.filter((s) => s.check === 'bad').length;
  const rows = sites.map((s) => {
    const cat = ui.testCat === 'all' ? s.cats[0] : ui.testCat;
    const href = safeUrl(buildUrl(s.url, testParams(cat, siteLang(s))).url);
    return `<li class="test-row${s.check ? ' is-' + s.check : ''}">
      <div class="test-info">
        <span class="site-name">${esc(s.name)}</span>
        <span class="meta">${t('region.' + s.region)} · ${t('cat.' + cat)}${s.via === 'google' ? ` · ${t('site.viaGoogle')}` : ''}</span>
      </div>
      <div class="test-actions">
        ${href ? `<a class="btn small" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${t('search.open')} ↗</a>` : ''}
        <button type="button" class="btn small${s.check === 'ok' ? ' on-ok' : ''}" data-act="test-mark" data-site="${esc(s.id)}" data-v="ok" aria-pressed="${s.check === 'ok'}" aria-label="${esc(t('test.ok'))}">✓</button>
        <button type="button" class="btn small${s.check === 'bad' ? ' on-bad' : ''}" data-act="test-mark" data-site="${esc(s.id)}" data-v="bad" aria-pressed="${s.check === 'bad'}" aria-label="${esc(t('test.bad'))}">✗</button>
      </div>
    </li>`;
  }).join('');
  return `
  <a class="back" href="#/settings">← ${t('tab.settings')}</a>
  <header class="page-head"><h1>${t('test.title')}</h1></header>
  <p class="muted">${t('test.intro')}</p>
  <div class="section-bar">
    <select data-ui="testCat" aria-label="${esc(t('itemDlg.cat'))}">${opt('all', t('list.allCats'), ui.testCat === 'all')}${CATS.map((c) => opt(c, t('cat.' + c), ui.testCat === c)).join('')}</select>
    <span class="meta">${esc(t('test.progress', { done, total: sites.length, bad }))}</span>
  </div>
  <ul class="test-list">${rows}</ul>
  <div class="actions">
    <button type="button" class="btn primary" data-act="test-copy"${bad ? '' : ' disabled'}>${t('test.copy')}</button>
    <button type="button" class="btn quiet" data-act="test-clear">${t('test.clear')}</button>
  </div>`;
}

// ---------- dialogs ----------
function openDialog(html, state) {
  ui.dialog = state;
  dlg.innerHTML = html;
  dlg.showModal();
  const first = $('input:not([type=hidden]):not([type=checkbox]), select', dlg);
  if (first && !matchMedia('(pointer: coarse)').matches) first.focus();
}

function closeDialog() {
  if (dlg.open) dlg.close();
}

dlg.addEventListener('close', () => {
  ui.dialog?.cleanup?.();
  document.body.appendChild($('#toast'));
  ui.dialog = null;
  dlg.innerHTML = '';
  render();
});

function defaultQuote(preset = {}) {
  const region = preset.region || 'HK';
  const country = preset.country || REGION_COUNTRY[region];
  const cp = COUNTRIES[country] || COUNTRIES.OTHER;
  const travel = preset.cat === 'flight' || preset.cat === 'hotel';
  const mode = preset.mode || (travel || region === 'HK' ? 'local' : 'online');
  return {
    site: '', region, cond: 'new', price: '', currency: REGION_CURRENCY[region], mode, country,
    removeVat: mode === 'online' && (region === 'UK' || region === 'EU'),
    vatRate: cp.vat, refundPct: cp.refund, shipping: '', fees: '', fwd: '',
    dutyPct: '', cardId: '', url: '', date: localDate(), note: '',
    shipTo: 'hk', weight: '', fwdRate: state.settings.fwdRates?.[region] ?? '', fwdCur: 'HKD', qty: '', unit: 'g',
    ...preset,
  };
}

function quoteFormHtml(q, { needName, itemName, editing, refresh }) {
  const names = S.liveItems().map((i) => `<option value="${esc(i.name)}">`).join('');
  const siteNames = [...new Set(S.getSites({ includeDisabled: true }).map((s) => s.name))].map((n) => `<option value="${esc(n)}">`).join('');
  const countries = Object.keys(COUNTRIES).map((k) => opt(k, k === 'OTHER' ? '—' : k, k === q.country)).join('');
  const numIn = (name, val, extra = '') => `<input type="number" name="${name}" step="any" inputmode="decimal" value="${esc(val)}" ${extra}>`;
  return `<form method="dialog" class="dlg-form quote-form" data-form="quote" data-mode="${esc(q.mode)}" data-ship="${q.shipTo === 'fwd' ? 'fwd' : 'hk'}" novalidate>
    <header class="dlg-head"><h2>${editing ? t('quote.editTitle') : refresh ? t('quote.refreshTitle') : t('quote.title')}</h2>
      <button type="button" class="icon-btn" data-act="dlg-close" aria-label="${esc(t('close'))}">✕</button></header>
    <div class="dlg-body">
      <div class="paste-row">
        <input type="url" name="url" value="${esc(q.url)}" placeholder="${esc(t('quote.urlPh'))}" autocomplete="off" aria-label="${esc(t('quote.url'))}">
        <button type="button" class="btn small" data-act="paste-link">${t('quote.paste')}</button>
      </div>
      ${needName ? field(t('quote.item'), `<input name="itemName" list="dl-items" value="${esc(itemName)}" required autocomplete="off"><datalist id="dl-items">${names}</datalist>`) : ''}
      <div class="grid-2">
        ${field(t('quote.site'), `<input name="site" list="dl-sites" value="${esc(q.site)}" autocomplete="off"><datalist id="dl-sites">${siteNames}</datalist>`)}
        ${field(t('quote.region'), `<select name="region">${REGIONS.map((r) => opt(r, t('region.' + r), r === q.region)).join('')}</select>`)}
      </div>
      <div class="grid-price">
        ${field(t('quote.price'), numIn('price', q.price, 'required min="0" class="big-num"'))}
        ${field(t('quote.currency'), `<select name="currency">${curOptions(q.currency)}</select>`)}
        ${field(t('quote.cond'), `<select name="cond">${opt('new', t('cond.new'), q.cond !== 'used')}${opt('used', t('cond.used'), q.cond === 'used')}</select>`)}
      </div>
      <div class="ocr-row">
        <label class="btn small">${icon('camera')} ${t('ocr.button')}<input type="file" accept="image/*" capture="environment" data-act="ocr" hidden></label>
        <span class="muted small" id="ocr-status" aria-live="polite"></span>
      </div>
      <div class="chips small" id="ocr-chips"></div>
      <div class="qty-row">
        ${field(t('quote.qty'), numIn('qty', q.qty, 'min="0"'))}
        ${field(t('quote.unit'), `<select name="unit">${UNITS.map((u) => opt(u, t('unit.' + u), u === (q.unit || 'g'))).join('')}</select>`)}
      </div>
      ${field(t('quote.mode'), `<select name="mode">${MODES.map((m) => opt(m, t('mode.' + m), m === q.mode)).join('')}</select>`)}
      <div class="only-abroad grid-2">
        ${field(t('quote.country'), `<select name="country">${countries}</select>`)}
        <div class="only-online">${field(t('quote.vat'), numIn('vatRate', q.vatRate, 'min="0"'))}</div>
        <div class="only-taxfree">${field(t('quote.refund'), numIn('refundPct', q.refundPct, 'min="0"'))}</div>
      </div>
      <div class="only-online">${field(t('quote.shipTo'), `<select name="shipTo">${opt('hk', t('ship.hk'), q.shipTo !== 'fwd')}${opt('fwd', t('ship.fwd'), q.shipTo === 'fwd')}</select>`)}</div>
      <label class="check only-online only-direct"><input type="checkbox" name="removeVat"${q.removeVat ? ' checked' : ''}> ${t('quote.removeVat')}</label>
      <div class="only-online only-fwd">
        <div class="grid-3">
          ${field(t('quote.weight'), numIn('weight', q.weight, 'min="0" placeholder="1.0"'))}
          ${field(t('quote.fwdRate'), numIn('fwdRate', q.fwdRate, 'min="0"'))}
          ${field(t('quote.currency'), `<select name="fwdCur">${curOptions(q.fwdCur || 'HKD')}</select>`)}
        </div>
        <p class="muted small">${t('quote.fwdHint')}</p>
      </div>
      <p class="muted small only-taxfree">${t('quote.refundHint')}</p>
      <div class="grid-2">
        ${field(t('quote.shipping'), numIn('shipping', q.shipping, 'min="0"'))}
        ${field(t('quote.fees'), numIn('fees', q.fees, `min="0" placeholder="${esc(t('quote.feesHint'))}"`))}
      </div>
      <details class="more"${editing && (q.fwd || q.dutyPct || q.cardId || q.note) ? ' open' : ''}>
        <summary>${t('quote.more')}</summary>
        <div class="grid-2">
          ${field(t('quote.fwd'), numIn('fwd', q.fwd, 'min="0"'))}
          <div class="only-online">${field(`${t('quote.duty')} <span class="muted">· ${t('quote.dutyHint')}</span>`, numIn('dutyPct', q.dutyPct, 'min="0" placeholder="0"'))}</div>
          ${field(t('quote.card'), `<select name="cardId">${opt('', t('card.auto'), !q.cardId)}${state.settings.cards.map((c) => opt(c.id, cardName(c), c.id === q.cardId)).join('')}</select>`)}
          ${field(t('quote.date'), `<input type="date" name="date" value="${esc(q.date)}">`)}
        </div>
        <label class="check"><input type="checkbox" name="overseas"${isOverseas(q) ? ' checked' : ''}> ${t('quote.overseas')}</label>
        ${field(t('quote.note'), `<input name="note" value="${esc(q.note)}" autocomplete="off">`)}
      </details>
      <div class="preview" id="q-preview"></div>
    </div>
    <footer class="dlg-foot">
      <button type="button" class="btn quiet" data-act="dlg-close">${t('cancel')}</button>
      <button type="submit" class="btn primary">${t('save')}</button>
    </footer>
  </form>`;
}

function readQuoteForm(form) {
  const f = form.elements;
  const numOrBlank = (n) => (f[n].value === '' ? '' : num(f[n].value));
  return {
    site: f.site.value.trim(),
    region: f.region.value,
    cond: f.cond.value,
    price: numOrBlank('price'),
    currency: f.currency.value,
    mode: f.mode.value,
    country: f.country.value,
    removeVat: f.removeVat.checked,
    vatRate: numOrBlank('vatRate'),
    refundPct: numOrBlank('refundPct'),
    shipping: numOrBlank('shipping'),
    fees: numOrBlank('fees'),
    fwd: numOrBlank('fwd'),
    fwdCur: f.fwdCur.value,
    dutyPct: numOrBlank('dutyPct'),
    shipTo: f.shipTo.value,
    weight: numOrBlank('weight'),
    fwdRate: numOrBlank('fwdRate'),
    qty: numOrBlank('qty'),
    unit: f.unit.value,
    cardId: f.cardId.value,
    overseas: f.overseas.checked,
    cardFeePct: '',
    url: f.url.value.trim(),
    date: f.date.value || localDate(),
    note: f.note.value.trim(),
  };
}

function updateQuotePreview(form) {
  const q = readQuoteForm(form);
  form.dataset.mode = q.mode;
  form.dataset.ship = q.shipTo;
  const out = $('#q-preview', form);
  if (q.price === '') { out.innerHTML = ''; return; }
  const r = landed(q, ctx());
  const p = fmtParts(r.total, r.cur, getLang());
  out.innerHTML = `<div class="preview-tag"><span class="tag-label">${t('quote.total')}</span>
    <span class="tag-price"><span class="tag-sym">${esc(p.symbol)}</span><span class="tag-num">${esc(p.value)}</span></span></div>
    ${breakdown(r, false)}`;
}

function openQuote({ itemId = '', quote = null, preset = {}, scratch = false, itemName = '', refresh = false, feed = null }) {
  const q = quote ? { ...defaultQuote(), ...quote } : defaultQuote(preset);
  openDialog(quoteFormHtml(q, { needName: !itemId && !scratch, itemName, editing: !!quote, refresh }),
    { kind: 'quote', itemId, scratch, quoteId: quote?.id || '', cat: preset.cat || '', feed });
  const form = $('form', dlg);
  updateQuotePreview(form);
  if (refresh) { form.elements.price.focus(); form.elements.price.select(); }
}

// A store outside Hong Kong usually means ordering online for delivery here
// (not for flights or hotels, whose price is the price).
function applyRegionDefaults(form, region) {
  const f = form.elements;
  const cat = ui.dialog?.cat || state.search.cat;
  if (cat === 'flight' || cat === 'hotel') return;
  if (region !== 'HK' && f.mode.value === 'local') {
    f.mode.value = 'online';
    f.removeVat.checked = region === 'UK' || region === 'EU';
  } else if (region === 'HK' && f.mode.value === 'online') {
    f.mode.value = 'local';
  }
}

// Fill the quote form from a recognised link. Only empty fields are filled
// unless `force` is set (an explicit paste).
function applyDetection(form, det, force = false) {
  const f = form.elements;
  if (!det) return;
  f.url.value = det.url;
  if (force || !f.site.value.trim()) {
    f.site.value = det.name;
    f.region.value = det.region;
    f.currency.value = det.currency;
    f.cond.value = det.cond;
    f.country.value = REGION_COUNTRY[det.region];
    f.overseas.checked = det.region !== 'HK';
    applyRegionDefaults(form, det.region);
    f.country.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (f.itemName && !f.itemName.value.trim()) f.itemName.value = nameFromUrl(det.url);
  toast(t('paste.detected', { site: det.name }));
  updateQuotePreview(form);
}

async function readClipboardUrl() {
  try {
    return extractUrl(await navigator.clipboard.readText());
  } catch {
    return '';
  }
}

// Open the quote dialog for a link (from the clipboard, a share, or a paste).
function openQuoteFromUrl(url) {
  const det = detectFromUrl(url, S.getSites({ includeDisabled: true }));
  if (!det) return openQuote({ preset: { cat: state.search.cat } });
  openQuote({
    preset: { site: det.name, region: det.region, currency: det.currency, cond: det.cond, url, cat: state.search.cat },
    itemName: nameFromUrl(url),
  });
  toast(t('paste.detected', { site: det.name }));
}

function saveQuote(form) {
  const d = ui.dialog;
  const q = readQuoteForm(form);
  if (q.price === '' || q.price < 0) { toast(t('quote.needPrice'), 'bad'); form.elements.price.focus(); return false; }
  if (d.scratch) {
    if (d.quoteId) Object.assign(state.scratch.find((x) => x.id === d.quoteId) || {}, q);
    else state.scratch.push({ ...q, id: uid(), createdAt: Date.now() });
    S.save();
    return true;
  }
  let itemId = d.itemId;
  if (!itemId) {
    const name = form.elements.itemName.value.trim();
    if (!name) { toast(t('quote.needItem'), 'bad'); form.elements.itemName.focus(); return false; }
    const cat = d.cat || state.search.cat;
    const item = S.findItem(name) || S.addItem({ name, cat });
    if (!item.search && cat === state.search.cat) S.updateItem(item.id, { search: searchSnapshot() });
    itemId = item.id;
  }
  const prev = d.quoteId && S.getItem(itemId)?.quotes.find((x) => x.id === d.quoteId);
  const sameFx = prev?.fx && prev.date === q.date && prev.currency === q.currency && prev.fwdCur === q.fwdCur;
  const ratesDate = state.rates?.date || localDate();
  q.fx = sameFx ? prev.fx : fxSnapshot(q, ctx().rates, ratesDate);
  q.id = d.quoteId || uid();
  // Logged from the supermarket panel: keep following that product's price every day.
  if (d.feed && !d.quoteId) q.feed = d.feed;
  S.upsertQuote(itemId, q);
  // Back-dated price: swap in that day's exchange rate when we can get it.
  if (!sameFx && q.fx && q.date < ratesDate && !Object.keys(state.settings.manualRates || {}).some((c) => q.fx.hkdPer[c])) {
    fetchRatesOn(q.date)
      .then((r) => {
        const fx = fxSnapshot(q, r.hkdPer, r.date);
        if (fx) { S.upsertQuote(itemId, { id: q.id, fx }); softRender(); }
      })
      .catch(() => {});
  }
  toast(t('quote.saved'));
  return true;
}

function openScanner() {
  openDialog(`<form method="dialog" class="dlg-form" data-form="scan">
    <header class="dlg-head"><h2>${t('scan.title')}</h2>
      <button type="button" class="icon-btn" data-act="dlg-close" aria-label="${esc(t('close'))}">✕</button></header>
    <div class="dlg-body">
      <div class="scan-view"><video playsinline muted></video><div class="scan-frame" aria-hidden="true"></div></div>
      <p class="muted small" id="scan-status" aria-live="polite">${t('scan.loading')}</p>
      <label class="btn">${t('scan.photo')}<input type="file" accept="image/*" capture="environment" data-act="scan-photo" hidden></label>
    </div></form>`, { kind: 'scan' });
  const video = $('video', dlg);
  video.addEventListener('playing', () => { const s = $('#scan-status'); if (s) s.textContent = t('scan.hint'); }, { once: true });
  ui.dialog.cleanup = startScan(video, onScanned, (e) => {
    const s = $('#scan-status');
    if (s) s.textContent = t('scan.fail', { err: e.message || e.name });
  });
}

function onScanned(code) {
  closeDialog();
  if (!code) { toast(t('scan.none'), 'bad'); return; }
  if (/^https?:\/\//.test(code)) { openQuoteFromUrl(code); return; }
  if (!isProduct(state.search.cat)) state.search.cat = 'other';
  state.search.q = code;
  S.save();
  if (route().name !== 'search') location.hash = '#/search';
  else render();
  toast(t('scan.found', { code }));
}

function openItemDialog(item) {
  const base = state.settings.base;
  openDialog(`<form method="dialog" class="dlg-form" data-form="item" novalidate>
    <header class="dlg-head"><h2>${item ? t('itemDlg.edit') : t('itemDlg.add')}</h2>
      <button type="button" class="icon-btn" data-act="dlg-close" aria-label="${esc(t('close'))}">✕</button></header>
    <div class="dlg-body">
      ${field(t('itemDlg.name'), `<input name="name" value="${esc(item?.name || '')}" required autocomplete="off">`)}
      ${field(t('itemDlg.cat'), `<select name="cat">${CATS.map((c) => opt(c, t('cat.' + c), c === (item?.cat || state.search.cat))).join('')}</select>`)}
      <div class="grid-price">
        ${field(t('itemDlg.target'), `<input type="number" name="target" step="any" min="0" inputmode="decimal" value="${esc(item?.target ?? '')}">`)}
        ${field(t('quote.currency'), `<select name="targetCur">${curOptions(item?.targetCur || base)}</select>`)}
      </div>
      <p class="muted small">${t('itemDlg.targetHint')}</p>
      ${field(t('itemDlg.note'), `<input name="note" value="${esc(item?.note || '')}" autocomplete="off">`)}
    </div>
    <footer class="dlg-foot">
      <button type="button" class="btn quiet" data-act="dlg-close">${t('cancel')}</button>
      <button type="submit" class="btn primary">${t('save')}</button>
    </footer></form>`, { kind: 'item', itemId: item?.id || '' });
}

function saveItem(form) {
  const f = form.elements;
  const name = f.name.value.trim();
  if (!name) { toast(t('quote.needItem'), 'bad'); f.name.focus(); return false; }
  const data = { name, cat: f.cat.value, target: f.target.value === '' ? '' : num(f.target.value), targetCur: f.targetCur.value, note: f.note.value.trim() };
  if (ui.dialog.itemId) S.updateItem(ui.dialog.itemId, data);
  else {
    const item = S.addItem(data);
    ui.dialog.navigate = `#/item/${encodeURIComponent(item.id)}`;
  }
  toast(t('saved'));
  return true;
}

function openSiteDialog(site) {
  const custom = !site || !site.builtin;
  const s = site || { name: '', region: 'HK', kind: 'shop', cats: [state.search.cat], url: 'https://', cur: '', enabled: true };
  const dis = custom ? '' : ' disabled';
  openDialog(`<form method="dialog" class="dlg-form" data-form="site" novalidate>
    <header class="dlg-head"><h2>${site ? t('siteDlg.edit') : t('siteDlg.add')}</h2>
      <button type="button" class="icon-btn" data-act="dlg-close" aria-label="${esc(t('close'))}">✕</button></header>
    <div class="dlg-body">
      ${field(t('siteDlg.name'), `<input name="name" value="${esc(s.name)}" required autocomplete="off">`)}
      <div class="grid-3">
        ${field(t('siteDlg.region'), `<select name="region"${dis}>${REGIONS.map((r) => opt(r, t('region.' + r), r === s.region)).join('')}</select>`)}
        ${field(t('siteDlg.kind'), `<select name="kind"${dis}>${KINDS.map((k) => opt(k, t('kind.' + k), k === s.kind)).join('')}</select>`)}
        ${field(t('siteDlg.cur'), `<select name="cur"${dis}>${opt('', '—', !s.cur)}${curOptions(s.cur)}</select>`)}
        ${field(t('siteDlg.lang'), `<select name="lang">${LANGS.map((l) => opt(l, t('lang.' + l), l === siteLang(s))).join('')}</select>`)}
      </div>
      <fieldset class="cats-set"${dis}><legend class="field-label">${t('siteDlg.cats')}</legend>
        ${CATS.map((c) => `<label class="check"><input type="checkbox" name="cats" value="${c}"${s.cats.includes(c) ? ' checked' : ''}> ${t('cat.' + c)}</label>`).join('')}
      </fieldset>
      ${field(t('siteDlg.url'), `<textarea name="url" rows="3" spellcheck="false" autocapitalize="off">${esc(s.url)}</textarea>`)}
      <p class="muted small">${esc(t('siteDlg.urlHint'))}</p>
      <label class="check"><input type="checkbox" name="enabled"${s.enabled ? ' checked' : ''}> ${t('siteDlg.enabled')}</label>
    </div>
    <footer class="dlg-foot">
      ${site && custom ? `<button type="button" class="btn quiet danger" data-act="site-delete" data-site="${esc(site.id)}">${t('delete')}</button>` : ''}
      ${site && !custom ? `<button type="button" class="btn quiet" data-act="site-restore" data-site="${esc(site.id)}">${t('siteDlg.restore')}</button>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn quiet" data-act="dlg-close">${t('cancel')}</button>
      <button type="submit" class="btn primary">${t('save')}</button>
    </footer></form>`, { kind: 'site', siteId: site?.id || '', builtin: site?.builtin });
}

function saveSite(form) {
  const f = form.elements;
  const url = f.url.value.trim();
  const name = f.name.value.trim();
  if (!/^https:\/\//i.test(url)) { toast(t('siteDlg.badUrl'), 'bad'); f.url.focus(); return false; }
  if (!name) { f.name.focus(); return false; }
  const enabled = f.enabled.checked;
  if (ui.dialog.builtin) {
    S.updateSite(ui.dialog.siteId, { name, url, enabled, lang: f.lang.value });
  } else {
    const cats = $$('input[name=cats]:checked', form).map((x) => x.value);
    const data = { name, url, enabled, lang: f.lang.value, region: f.region.value, kind: f.kind.value, cur: f.cur.value, cats: cats.length ? cats : ['other'] };
    if (ui.dialog.siteId) S.updateSite(ui.dialog.siteId, data);
    else S.addSite(data);
  }
  toast(t('saved'));
  return true;
}

// ---------- rates & sync ----------
async function refreshRates({ quiet = false } = {}) {
  try {
    state.rates = await fetchRates();
    S.save();
    if (!quiet) toast(t('set.ratesOk'));
    softRender();
  } catch (e) {
    if (!quiet) toast(t('set.ratesFail', { err: e.message }), 'bad');
  }
}

let syncing = false;
let syncTimer;
let lastAutoSync = 0;

async function doSync({ quiet = false } = {}) {
  const token = S.getToken();
  if (!token || syncing) return;
  if (!navigator.onLine) { if (!quiet) toast(t('set.syncOffline'), 'bad'); return; }
  syncing = true;
  const status = $('#sync-status');
  if (status) status.textContent = t('set.syncing');
  try {
    const before = JSON.stringify(S.syncPayload());
    const { gistId, merged } = await syncGist(token, state.sync.gistId, S.syncPayload());
    // Merge again with current local state so edits made during the request survive.
    S.applyPayload(mergeData(S.syncPayload(), merged));
    Object.assign(state.sync, { gistId, lastSync: Date.now(), dirty: false, lastError: '' });
    S.save();
    if (!quiet) toast(t('set.syncOk'));
    if (JSON.stringify(S.syncPayload()) !== before || route().name === 'settings') softRender();
  } catch (e) {
    const msg = e.status === 401 || e.status === 403 ? t('set.syncBadToken') : e.status === 0 ? t('set.syncOffline') : e.message;
    state.sync.lastError = msg;
    S.save();
    if (!quiet) toast(t('set.syncFail', { err: msg }), 'bad');
    softRender();
  } finally {
    syncing = false;
  }
}

S.onChange(({ synced }) => {
  if (!synced || !state.sync.auto || !S.getToken()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => doSync({ quiet: true }), 4000);
});

// ---------- events ----------
const actions = {
  chip(el) {
    const { group, v } = el.dataset;
    const s = state.search;
    if (group === 'cat') { s.cat = v; S.save(); render(); return; }
    if (group === 'region') {
      s.regions = s.regions.includes(v) ? s.regions.filter((r) => r !== v) : [...s.regions, v];
      S.save();
    } else if (group === 'cond') { s.cond = v; S.save(); }
    else if (group === 'listCat') ui.listCat = v;
    else if (group === 'showAll') ui.showAll = v === '1';
    else if (group === 'sortUnit') ui.sortUnit = v === '1';
    if (group === 'region' || group === 'cond') {
      $$(`.chip[data-group="${group}"]`).forEach((c) => {
        const on = group === 'region' ? s.regions.includes(c.dataset.v) : c.dataset.v === v;
        c.setAttribute(c.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-pressed', String(on));
      });
      refreshResults();
      scheduleTranslation(0);
      return;
    }
    render();
    if (group === 'cat') scheduleTranslation(0);
  },
  track() {
    const name = searchItemName();
    if (!name) { toast(t('search.needQuery'), 'bad'); return; }
    const existing = S.findItem(name, state.search.cat);
    const item = existing || S.addItem({ name, cat: state.search.cat });
    S.updateItem(item.id, { search: searchSnapshot() });
    toast(t('search.tracked'));
  },
  'log-from-search'(el) {
    const site = S.getSites({ includeDisabled: true }).find((s) => s.id === el.dataset.site);
    if (!site) return;
    const preset = {
      site: site.name, region: site.region, cat: state.search.cat,
      cond: site.kind === 'used' || site.kind === 'sold' ? 'used' : 'new',
      currency: site.cur || REGION_CURRENCY[site.region],
    };
    const { url, missing } = buildUrl(site.url, paramsFor(site));
    if (!missing.length) preset.url = url;
    openQuote({ preset, itemName: searchItemName() });
  },
  // Clear every cached file and load the newest version from the server.
  async 'force-update'() {
    toast(t('set.updating'));
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
    } catch { /* reload anyway */ }
    location.reload();
  },
  'mkt-log'(el) {
    const m = el.dataset.m;
    const db = mk[m]?.[el.dataset.part];
    const p = db?.items[Number(el.dataset.i)];
    if (!p) return;
    const store = db.stores.find((s) => s.code === p.store);
    const preset = {
      site: marketStore(p.store), region: 'EU', country: STORE_COUNTRY[p.store] || MARKETS[m].country,
      currency: 'EUR', price: p.price, mode: 'local', removeVat: false, cat: 'grocery',
      url: productLink(p), date: p.fresh ? db.date : store?.lastChange || db.date,
      qty: p.qty || '', unit: p.unit === 'pc' ? 'pcs' : p.unit || 'g',
      note: p.fresh ? '' : t('mkt.staleSince', { date: store?.lastChange || '' }),
    };
    openQuote({ preset, itemName: searchItemName(), feed: { m, store: p.store, name: p.name } });
  },
  'opw-track'(el) {
    const p = opw?.byCode.get(el.dataset.code);
    if (!p) return;
    const name = productName(p, getLang());
    const existing = S.liveItems().find((i) => i.opw === p.code);
    const item = existing || S.addItem({ name, cat: 'grocery' });
    S.applyQuoteUpdates(item.id, opwQuotes(p, opw.date, getLang()), [], opw.date, { opw: p.code, opwDate: opw.date });
    toast(t('search.tracked'));
    location.hash = `#/item/${encodeURIComponent(item.id)}`;
  },
  async 'alert-paste'(el) {
    try { await navigator.clipboard.writeText(el.dataset.copy); toast(t('alert.copied')); } catch { /* still open the site */ }
    window.open(el.dataset.href, '_blank', 'noopener');
  },
  scan() { openScanner(); },
  'tr-edit'(el) {
    const lang = el.dataset.lang;
    const text = trSource();
    const now = termFor(lang);
    const v = prompt(t('tr.editPrompt', { lang: LANG_LABEL[lang] }), now);
    if (v === null) return;
    // Remembered for next time (and inside longer searches); an empty answer forgets it.
    if (!v.trim()) S.rememberWord(text, lang, '');
    else if (v.trim() !== now) S.rememberWord(text, lang, v.trim());
    else return;
    toast(t(v.trim() ? 'tr.remembered' : 'tr.forgotten'));
    tr.text = ''; // translate again with the fix
    scheduleTranslation(0);
  },
  'word-del'(el) {
    S.forgetWord(el.dataset.key);
    tr.text = '';
    softRender();
    toast(t('tr.forgotten'));
  },
  'focus-search'() {
    const el = $$('.search-form [data-bind]').find((x) => !x.value && !x.disabled && x.type !== 'checkbox') || $('.search-form [data-bind]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
  },
  'ocr-pick'(el) {
    const form = $('form', dlg);
    form.elements.price.value = el.dataset.v;
    if (el.dataset.cur) form.elements.currency.value = el.dataset.cur;
    $$('#ocr-chips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === el)));
    updateQuotePreview(form);
  },
  'test-mark'(el) {
    const site = S.getSites({ includeDisabled: true }).find((s) => s.id === el.dataset.site);
    const v = site?.check === el.dataset.v ? '' : el.dataset.v;
    S.updateSite(el.dataset.site, { check: v, checkedAt: Date.now() });
    softRender();
  },
  async 'test-copy'() {
    const bad = S.getSites({ includeDisabled: true }).filter((s) => s.check === 'bad');
    const text = `${t('test.copyHead')}\n${bad.map((s) => `- ${s.name} (${s.id}): ${s.url}`).join('\n')}`;
    try { await navigator.clipboard.writeText(text); toast(t('test.copied')); } catch { prompt(t('test.copy'), text); }
  },
  'test-clear'() {
    for (const s of S.getSites({ includeDisabled: true })) if (s.check) S.updateSite(s.id, { check: '' });
    render();
  },
  'item-add'() { openItemDialog(null); },
  'item-edit'(el) { openItemDialog(S.getItem(el.dataset.item)); },
  'item-delete'(el) {
    const item = S.getItem(el.dataset.item);
    if (item && confirm(t('item.confirmDelete', { name: item.name }))) {
      S.deleteItem(item.id);
      toast(t('deleted'));
      location.hash = '#/list';
    }
  },
  'item-research'(el) {
    const item = S.getItem(el.dataset.item);
    if (!item) return;
    Object.assign(state.search, item.search || { cat: item.cat, q: item.name });
    S.save();
    location.hash = '#/search';
  },
  'quote-add'(el) {
    const item = S.getItem(el.dataset.item);
    openQuote({ itemId: item.id, preset: { cat: item.cat } });
  },
  'quote-refresh'(el) {
    const { id, item } = el.dataset;
    const q = S.getItem(item)?.quotes.find((x) => x.id === id);
    if (!q) return;
    const { id: _id, createdAt, updatedAt, date, fx, deleted, ...copy } = q;
    openQuote({ itemId: item, preset: { ...copy, date: localDate() }, refresh: true });
  },
  async 'paste-link'() {
    const form = $('form', dlg);
    const url = await readClipboardUrl();
    if (!url) { toast(t('paste.none'), 'bad'); form.elements.url.focus(); return; }
    applyDetection(form, detectFromUrl(url, S.getSites({ includeDisabled: true })), true);
  },
  async 'paste-log'() {
    const url = await readClipboardUrl();
    if (url) openQuoteFromUrl(url);
    else {
      openQuote({ preset: { cat: state.search.cat }, itemName: searchItemName() });
      toast(t('paste.none'));
      $('form', dlg).elements.url.focus();
    }
  },
  'quote-edit'(el) {
    const { id, item, scratch } = el.dataset;
    const q = scratch ? state.scratch.find((x) => x.id === id) : S.getItem(item)?.quotes.find((x) => x.id === id);
    if (q) openQuote({ itemId: item, quote: q, scratch: !!scratch });
  },
  'quote-delete'(el) {
    const { id, item, scratch } = el.dataset;
    if (!confirm(t('item.confirmDeleteQuote'))) return;
    if (scratch) { state.scratch = state.scratch.filter((x) => x.id !== id); S.save(); }
    else S.deleteQuote(item, id);
    render();
  },
  'scratch-add'() { openQuote({ scratch: true }); },
  'scratch-clear'() {
    if (confirm(t('calc.confirmClear'))) { state.scratch = []; S.save(); render(); }
  },
  'scratch-save'() {
    const name = (prompt(t('calc.namePrompt')) || '').trim();
    if (!name) return;
    const item = S.findItem(name) || S.addItem({ name, cat: state.search.cat });
    for (const q of state.scratch) {
      const { id, createdAt, ...rest } = q;
      S.upsertQuote(item.id, rest);
    }
    state.scratch = [];
    S.save();
    toast(t('calc.savedAll', { name }));
    location.hash = `#/item/${encodeURIComponent(item.id)}`;
  },
  'dlg-close'() { closeDialog(); },
  'lang-toggle'() { S.setSetting('lang', getLang() === 'zh' ? 'en' : 'zh'); render(); },
  'rates-refresh'() { refreshRates(); },
  'card-add'() {
    S.setSetting('cards', [...state.settings.cards, { ...DEFAULT_CARD, id: uid(), name: '' }]);
    render();
  },
  'card-delete'(el) {
    S.setSetting('cards', state.settings.cards.filter((c) => c.id !== el.dataset.card));
    render();
  },
  'site-toggle'(el) { S.updateSite(el.dataset.site, { enabled: el.checked }); $('#results') && ($('#results').innerHTML = searchResults()); },
  'site-edit'(el) { openSiteDialog(S.getSites({ includeDisabled: true }).find((s) => s.id === el.dataset.site)); },
  'site-add'() { openSiteDialog(null); },
  'site-delete'(el) { S.deleteSite(el.dataset.site); closeDialog(); toast(t('deleted')); },
  'site-restore'(el) {
    state.siteState[el.dataset.site] = { updatedAt: Date.now() };
    S.save({ synced: true });
    closeDialog();
  },
  'sites-reset'() { if (confirm(t('set.sitesResetConfirm'))) { S.resetSites(); render(); } },
  'sync-connect'() {
    const token = $('#token-in').value.trim();
    if (!token) return;
    S.setToken(token);
    state.sync.lastError = '';
    render();
    doSync();
  },
  'sync-now'() { doSync(); },
  'sync-disconnect'() {
    S.setToken('');
    Object.assign(state.sync, { gistId: null, lastSync: 0, lastError: '' });
    S.save();
    render();
  },
  export() {
    const blob = new Blob([JSON.stringify(S.syncPayload(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pricebook-${localDate()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'clear-all'() {
    if (!confirm(t('set.clearConfirm'))) return;
    S.clearAll();
    location.hash = '#/search';
    location.reload();
  },
  async install() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    render();
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.act === 'site-toggle') return actions['site-toggle'](el);
  if (el.dataset.act === 'ocr' && el.files?.[0]) {
    const status = $('#ocr-status');
    const chips = $('#ocr-chips');
    status.textContent = t('ocr.loading');
    chips.innerHTML = '';
    try {
      const found = await readPrices(el.files[0], (p) => { status.textContent = t('ocr.reading', { pct: Math.round(p * 100) }); });
      status.textContent = found.length ? t('ocr.pick') : t('ocr.none');
      chips.innerHTML = found.map((c) => `<button type="button" class="chip" data-act="ocr-pick" data-v="${c.value}" data-cur="${esc(c.currency)}">${esc(c.currency ? fmt(c.value, c.currency, getLang()) : String(c.value))}</button>`).join('');
    } catch (e) {
      status.textContent = t('ocr.fail', { err: e.message || e.name });
    }
    el.value = '';
    return;
  }
  if (el.dataset.act === 'scan-photo' && el.files?.[0]) {
    const status = $('#scan-status');
    if (status) status.textContent = t('scan.loading');
    try { onScanned(await scanFile(el.files[0])); } catch (e) { if (status) status.textContent = t('scan.fail', { err: e.message || e.name }); }
    return;
  }
  if (el.dataset.act === 'import' && el.files?.[0]) {
    try {
      const data = JSON.parse(await el.files[0].text());
      if (!data || !Array.isArray(data.items)) throw new Error('bad');
      S.applyPayload(mergeData(S.syncPayload(), data));
      S.save({ synced: true });
      toast(t('set.importOk'));
      render();
    } catch {
      toast(t('set.importFail'), 'bad');
    }
    el.value = '';
    return;
  }
  if (el.dataset.set) {
    const key = el.dataset.set;
    if (key === 'sync.auto') { state.sync.auto = el.checked; S.save(); return; }
    if (key === 'autoTranslate') { S.setSetting('autoTranslate', el.checked); refreshResults(); scheduleTranslation(0); return; }
    S.setSetting(key, key === 'staleDays' ? Math.max(1, Math.round(num(el.value, 7))) : el.value);
    render();
    return;
  }
  if (el.dataset.fwd) {
    S.setSetting('fwdRates', { ...(state.settings.fwdRates || {}), [el.dataset.fwd]: el.value === '' ? '' : num(el.value) });
    return;
  }
  if (el.dataset.card && el.dataset.k) {
    const k = el.dataset.k;
    const cards = state.settings.cards.map((c) => (c.id === el.dataset.card ? { ...c, [k]: k === 'name' ? el.value.trim() : num(el.value) } : c));
    S.setSetting('cards', cards);
    return;
  }
  if (el.dataset.rate) {
    const v = num(el.value, 0);
    const manual = { ...(state.settings.manualRates || {}) };
    if (v > 0) manual[el.dataset.rate] = v; else delete manual[el.dataset.rate];
    S.setSetting('manualRates', manual);
    return;
  }
  if (el.dataset.ui === 'testCat') {
    ui.testCat = el.value;
    render();
    return;
  }
  if (el.dataset.ui === 'siteCat') {
    ui.siteCat = el.value;
    $('.site-list').innerHTML = siteRows();
    return;
  }
  // Quote dialog: picking a country fills its VAT / refund presets;
  // picking a known site fills its region and currency.
  const form = el.form;
  if (form?.dataset.form === 'quote') {
    if (el.name === 'country') {
      const cp = COUNTRIES[el.value] || COUNTRIES.OTHER;
      form.elements.vatRate.value = cp.vat;
      form.elements.refundPct.value = cp.refund;
    }
    if (el.name === 'site') {
      const site = S.getSites({ includeDisabled: true }).find((s) => s.name.toLowerCase() === el.value.trim().toLowerCase());
      if (site) {
        form.elements.region.value = site.region;
        form.elements.currency.value = site.cur || REGION_CURRENCY[site.region];
        form.elements.country.value = REGION_COUNTRY[site.region];
        form.elements.overseas.checked = site.region !== 'HK';
        applyRegionDefaults(form, site.region);
        form.elements.country.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    if (el.name === 'region') {
      form.elements.overseas.checked = el.value !== 'HK';
      const rate = state.settings.fwdRates?.[el.value];
      if (rate !== undefined && rate !== '') form.elements.fwdRate.value = rate;
    }
    if (el.name === 'url') {
      const url = extractUrl(el.value);
      if (url) applyDetection(form, detectFromUrl(url, S.getSites({ includeDisabled: true })));
    }
    if (el.name === 'mode' && el.value === 'online') {
      const r = form.elements.region.value;
      form.elements.removeVat.checked = r === 'UK' || r === 'EU';
    }
    updateQuotePreview(form);
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.bind) {
    const s = state.search;
    const key = el.dataset.bind;
    if (el.type === 'checkbox') s[key] = el.checked;
    else if (key === 'from' || key === 'to') { el.value = el.value.toUpperCase().replace(/[^A-Z]/g, ''); s[key] = el.value; }
    else if (key === 'adults') s[key] = Math.max(1, Math.round(num(el.value, 1)));
    else s[key] = el.value;
    if (key === 'checkin' && s.checkin && (!s.checkout || s.checkout <= s.checkin)) {
      s.checkout = addDays(s.checkin, 1);
      const co = $('[data-bind=checkout]');
      if (co) co.value = s.checkout;
    }
    if (key === 'oneway') { const r = $('[data-bind=ret]'); if (r) r.disabled = s.oneway; }
    S.save();
    refreshResults();
    if (key === 'q' || key === 'city') scheduleTranslation();
    return;
  }
  if (el.dataset.conv) {
    ui.conv[el.dataset.conv] = el.value;
    $('#conv-out').innerHTML = convOut();
    return;
  }
  if (el.form?.dataset.form === 'quote') updateQuotePreview(el.form);
});

dlg.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const savers = { quote: saveQuote, item: saveItem, site: saveSite };
  const ok = savers[form.dataset.form]?.(form);
  if (!ok) return;
  const go = ui.dialog?.navigate;
  closeDialog();
  if (go) location.hash = go;
});

// Prevent the search form from submitting on Enter.
document.addEventListener('submit', (e) => {
  if (e.target.dataset.form === 'search') e.preventDefault();
});

$('#lang-toggle').addEventListener('click', () => actions['lang-toggle']());

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); if (route().name === 'search') scheduleTranslation(0); });
window.addEventListener('online', () => { if (state.sync.dirty) doSync({ quiet: true }); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastAutoSync > 60_000) {
    lastAutoSync = Date.now();
    doSync({ quiet: true });
  }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { const w = $('.chart-wrap', main); if (w && ui.chart) drawChart(w); }, 150);
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (route().name === 'settings') softRender();
});

// ---------- boot ----------
setLang(state.settings.lang);
render();
if (route().name === 'search') scheduleTranslation(0);

// Android "Share to PriceBook" (Web Share Target) arrives as ?url=&text=&title=
(() => {
  const p = new URLSearchParams(location.search);
  if (!p.has('url') && !p.has('text') && !p.has('title')) return;
  const url = extractUrl(p.get('url')) || extractUrl(p.get('text')) || extractUrl(p.get('title'));
  history.replaceState(null, '', location.pathname + location.hash);
  if (url) openQuoteFromUrl(url);
})();
if (!state.rates || Date.now() - (state.rates.fetchedAt || 0) > 6 * 3600_000) refreshRates({ quiet: true });
lastAutoSync = Date.now();
doSync({ quiet: true }).then(() => { loadOpw(); loadTrackedMarkets(); });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // When a new version takes over, reload once so the app never runs stale code.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading || dlg.open) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      // Home-screen apps can stay open for days; look for updates whenever they come back.
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    })
    .catch(() => {});
}
