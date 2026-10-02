import { t, setLang, getLang } from './i18n.js';
import * as S from './store.js';
import { state } from './store.js';
import { CATS, PRODUCT_CATS, REGIONS, KINDS, REGION_CURRENCY, buildUrl } from './sites.js';
import { CURRENCIES, convert, effectiveRates, fetchRates, fmt, fmtParts } from './currency.js';
import { landed, latestPerSite, rankQuotes, COUNTRIES, REGION_COUNTRY, MODES, DEFAULT_CARD, isOverseas } from './landed.js';
import { syncGist, mergeData } from './sync.js';
import { buildChart, bindChart } from './chart.js';
import { esc, num, uid, localDate, addDays, safeUrl } from './util.js';
import { detectFromUrl, extractUrl, nameFromUrl } from './detect.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const main = $('#main');
const dlg = $('#dlg');

// View-only UI state (not persisted)
const ui = { listCat: 'all', showAll: false, siteCat: 'all', conv: { amt: '100', cur: 'GBP' }, chart: null, dialog: null };
let installPrompt = null;

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
    .map(([r, k]) => `<a href="#/${r}" class="tab${active === r || (active === 'item' && r === 'list') ? ' active' : ''}"${active === r ? ' aria-current="page"' : ''}>${icon(k)}<span>${t('tab.' + r)}</span></a>`)
    .join('');
  document.title = `${t('app')} · ${t('tab.' + (active === 'item' ? 'list' : active))}`;
}

function render() {
  const r = route();
  setLang(state.settings.lang);
  document.documentElement.lang = locale();
  ui.chart = null;
  const views = { search: viewSearch, list: viewList, item: () => viewItem(r.arg), calc: viewCalc, settings: viewSettings };
  const view = views[r.name] || viewSearch;
  main.innerHTML = view();
  main.dataset.view = r.name;
  renderChrome(views[r.name] ? r.name : 'search');
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
    <div class="grid-3">
      ${field(t('search.checkin'), inp('checkin', 'date'))}
      ${field(t('search.checkout'), inp('checkout', 'date'))}
      ${field(t('search.adults'), inp('adults', 'number', 'min="1" max="16" inputmode="numeric"'))}
    </div>`;
  }
  return field(t('search.keyword'), inp('q', 'search', `placeholder="${esc(t('search.keywordPh'))}" enterkeyhint="search" autocomplete="off"`), 'field-big');
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

const MISSING_LABEL = {
  q: 'search.kw', q_plus: 'search.kw', q_dash: 'search.kw',
  from: 'search.from', from_l: 'search.from', to: 'search.to', to_l: 'search.to',
  depart: 'search.depart', depart_yymmdd: 'search.depart', city: 'search.city',
  checkin: 'search.checkin', checkout: 'search.checkout',
};

function searchResults() {
  const s = state.search;
  const params = searchParams();
  const sites = S.getSites().filter((x) => x.cats.includes(s.cat) && s.regions.includes(x.region) && condOk(x.kind));
  if (!sites.length) return `<p class="empty">${t('search.empty')}</p>`;
  const groups = REGIONS.filter((r) => s.regions.includes(r))
    .map((r) => [r, sites.filter((x) => x.region === r)])
    .filter(([, l]) => l.length);
  return `<p class="hint">${t('search.hint')}</p>${groups.map(([r, list]) => `
    <section class="region">
      <h2 class="region-h"><span>${t('region.' + r)}</span><small>${t('search.count', { n: list.length })}</small></h2>
      <ul class="sites">${list.map((site) => siteRow(site, params)).join('')}</ul>
    </section>`).join('')}`;
}

function siteRow(site, params) {
  const { url, missing } = buildUrl(site.url, params);
  const href = safeUrl(url);
  const need = [...new Set(missing.map((k) => t(MISSING_LABEL[k] || k)))].join('、');
  const open = missing.length || !href
    ? `<span class="btn small disabled" aria-disabled="true">${t('search.open')}</span>`
    : `<a class="btn small" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${t('search.open')}<span aria-hidden="true"> ↗</span></a>`;
  return `<li class="site">
    <div class="site-main">
      <span class="site-name">${esc(site.name)}</span>
      <span class="badge kind-${esc(site.kind)}">${t('kind.' + site.kind)}</span>
      ${missing.length ? `<span class="site-need">${t('search.need', { fields: need })}</span>` : ''}
    </div>
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
  return `<table class="breakdown">${r.lines.map((l) => `<tr><th>${esc(t('line.' + l.k, { pct: l.pct, card: l.card || t('card.default') }))}</th><td>${esc(fmt(l.v, l.cur, getLang()))}</td></tr>`).join('')}
    ${withTotal ? `<tr class="total"><th>${t('line.total')}</th><td>${esc(money(r.total))}</td></tr>` : ''}</table>`;
}

function quoteRow({ q, r }, i, { scratch = false, itemId = '', cheapest = NaN } = {}) {
  const href = safeUrl(q.url);
  const mode = q.mode && q.mode !== 'local' ? ` · ${t('modeShort.' + q.mode)}` : '';
  const diff = scratch && i > 0 && Number.isFinite(cheapest) ? `<span class="q-diff">${t('calc.more', { amt: esc(money(r.total - cheapest)) })}</span>` : '';
  const ids = `data-id="${esc(q.id)}" data-item="${esc(itemId)}"${scratch ? ' data-scratch="1"' : ''}`;
  return `<li class="quote${i === 0 ? ' is-best' : ''}">
    <span class="q-rank" aria-hidden="true">${i + 1}</span>
    <div class="q-body">
      <div class="q-top"><span class="q-site">${esc(q.site || '—')}</span>
        ${q.region ? `<span class="badge">${t('region.' + q.region)}</span>` : ''}
        ${q.cond === 'used' ? `<span class="badge kind-used">${t('cond.used')}</span>` : ''}</div>
      <div class="q-sub">${esc(fmtDate(q.date))} · ${esc(fmt(num(q.price), q.currency, getLang()))}${mode}${q.note ? ` · ${esc(q.note)}` : ''}</div>
      <details class="q-details"><summary>${t('item.breakdown')}</summary>${breakdown(r)}</details>
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
  const shown = rankQuotes(ui.showAll ? quotes : latestPerSite(quotes), c);
  const target = targetBase(item, c);

  ui.chart = { points: quotes.map((q) => ({ date: q.date, value: landed(q, c).total, site: q.site })), target, base: c.base };
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
    ${distinctDays >= 2 ? '<div class="chart-wrap"><div class="c-tip" hidden></div></div>' : `<p class="muted">${t('item.trendNeed')}</p>`}
  </section>
  <section>
    <div class="section-bar">
      <h2 class="section-h">${t('item.quotes')} <small>${quotes.length}</small></h2>
      ${quotes.length ? `<div class="chips small" role="radiogroup">${chip('showAll', '0', t('item.latest'), !ui.showAll)}${chip('showAll', '1', t('item.all'), ui.showAll)}</div>` : ''}
    </div>
    ${shown.length ? `<ol class="quotes">${shown.map((x, i) => quoteRow(x, i, { itemId: item.id })).join('')}</ol>` : `<p class="empty">${t('item.noQuotes')}</p>`}
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
  <section class="card about">
    <h2 class="section-h">${t('set.about')}</h2>
    <p class="muted small">${t('set.aboutText')}</p>
  </section>`;
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
    vatRate: cp.vat, refundPct: cp.refund, shipping: '', fees: '', fwd: '', fwdCur: state.settings.cardCurrency,
    dutyPct: '', cardId: '', url: '', date: localDate(), note: '',
    ...preset,
  };
}

function quoteFormHtml(q, { needName, itemName, editing, refresh }) {
  const names = S.liveItems().map((i) => `<option value="${esc(i.name)}">`).join('');
  const siteNames = [...new Set(S.getSites({ includeDisabled: true }).map((s) => s.name))].map((n) => `<option value="${esc(n)}">`).join('');
  const countries = Object.keys(COUNTRIES).map((k) => opt(k, k === 'OTHER' ? '—' : k, k === q.country)).join('');
  const numIn = (name, val, extra = '') => `<input type="number" name="${name}" step="any" inputmode="decimal" value="${esc(val)}" ${extra}>`;
  return `<form method="dialog" class="dlg-form quote-form" data-form="quote" data-mode="${esc(q.mode)}" novalidate>
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
      ${field(t('quote.mode'), `<select name="mode">${MODES.map((m) => opt(m, t('mode.' + m), m === q.mode)).join('')}</select>`)}
      <div class="only-abroad grid-2">
        ${field(t('quote.country'), `<select name="country">${countries}</select>`)}
        <div class="only-online">${field(t('quote.vat'), numIn('vatRate', q.vatRate, 'min="0"'))}</div>
        <div class="only-taxfree">${field(t('quote.refund'), numIn('refundPct', q.refundPct, 'min="0"'))}</div>
      </div>
      <label class="check only-online"><input type="checkbox" name="removeVat"${q.removeVat ? ' checked' : ''}> ${t('quote.removeVat')}</label>
      <p class="muted small only-taxfree">${t('quote.refundHint')}</p>
      <div class="grid-2">
        ${field(t('quote.shipping'), numIn('shipping', q.shipping, 'min="0"'))}
        ${field(t('quote.fees'), numIn('fees', q.fees, `min="0" placeholder="${esc(t('quote.feesHint'))}"`))}
      </div>
      <details class="more"${editing && (q.fwd || q.dutyPct || q.cardId || q.note) ? ' open' : ''}>
        <summary>${t('quote.more')}</summary>
        <div class="grid-2">
          ${field(t('quote.fwd'), numIn('fwd', q.fwd, 'min="0"'))}
          ${field(t('quote.currency'), `<select name="fwdCur">${curOptions(q.fwdCur || state.settings.cardCurrency)}</select>`)}
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
  const out = $('#q-preview', form);
  if (q.price === '') { out.innerHTML = ''; return; }
  const r = landed(q, ctx());
  const p = fmtParts(r.total, r.cur, getLang());
  out.innerHTML = `<div class="preview-tag"><span class="tag-label">${t('quote.total')}</span>
    <span class="tag-price"><span class="tag-sym">${esc(p.symbol)}</span><span class="tag-num">${esc(p.value)}</span></span></div>
    ${breakdown(r, false)}`;
}

function openQuote({ itemId = '', quote = null, preset = {}, scratch = false, itemName = '', refresh = false }) {
  const q = quote ? { ...defaultQuote(), ...quote } : defaultQuote(preset);
  openDialog(quoteFormHtml(q, { needName: !itemId && !scratch, itemName, editing: !!quote, refresh }),
    { kind: 'quote', itemId, scratch, quoteId: quote?.id || '', cat: preset.cat || '' });
  const form = $('form', dlg);
  updateQuotePreview(form);
  if (refresh) { form.elements.price.focus(); form.elements.price.select(); }
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
  S.upsertQuote(itemId, d.quoteId ? { ...q, id: d.quoteId } : q);
  toast(t('quote.saved'));
  return true;
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
    S.updateSite(ui.dialog.siteId, { name, url, enabled });
  } else {
    const cats = $$('input[name=cats]:checked', form).map((x) => x.value);
    const data = { name, url, enabled, region: f.region.value, kind: f.kind.value, cur: f.cur.value, cats: cats.length ? cats : ['other'] };
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
    if (group === 'region' || group === 'cond') {
      $$(`.chip[data-group="${group}"]`).forEach((c) => {
        const on = group === 'region' ? s.regions.includes(c.dataset.v) : c.dataset.v === v;
        c.setAttribute(c.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-pressed', String(on));
      });
      $('#results').innerHTML = searchResults();
      return;
    }
    render();
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
    const { url, missing } = buildUrl(site.url, searchParams());
    if (!missing.length) preset.url = url;
    openQuote({ preset, itemName: searchItemName() });
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
    S.setSetting(key, el.value);
    render();
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
        form.elements.country.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    if (el.name === 'region') form.elements.overseas.checked = el.value !== 'HK';
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
    $('#results').innerHTML = searchResults();
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

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
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
doSync({ quiet: true });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
