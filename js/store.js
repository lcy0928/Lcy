// App state, persisted to localStorage. The GitHub token is stored on its own
// key and never included in exports or the synced payload.
import { DEFAULT_SITES } from './sites.js';
import { DEFAULT_CARD } from './landed.js';
import { localDate, uid } from './util.js';

const KEY = 'pricebook:v1';
const TOKEN_KEY = 'pricebook:gist-token';

function defaults() {
  const zh = typeof navigator === 'undefined' || /^zh/i.test(navigator.language || 'zh');
  return {
    v: 1,
    settings: {
      lang: zh ? 'zh' : 'en',
      base: 'HKD',
      cardCurrency: 'HKD',
      cards: [{ ...DEFAULT_CARD }],
      staleDays: 7,
      // Forwarder price per kg in HKD, by warehouse region (Buy&Ship UK ≈ HK$25/lb in 2026).
      fwdRates: { UK: 55, EU: '', GLOBAL: '' },
      manualRates: {},
      updatedAt: 0,
    },
    rates: null, // { hkdPer, date, source, fetchedAt }
    siteState: {}, // default-site overrides: { [id]: { enabled, name, url, updatedAt } }
    customSites: [],
    items: [],
    scratch: [], // calculator offers, not synced
    search: {
      cat: 'coffee',
      regions: ['HK', 'UK', 'EU', 'GLOBAL'],
      cond: 'all',
      q: '',
      from: 'HKG', to: '', depart: '', ret: '', oneway: false,
      city: '', checkin: '', checkout: '', adults: 1,
    },
    sync: { gistId: null, lastSync: 0, auto: true, dirty: false },
  };
}

function load() {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    // v1 kept a single FX fee; turn it into the default card.
    if (s.settings && !Array.isArray(s.settings.cards)) {
      s.settings.cards = [{ ...DEFAULT_CARD, fcc: s.settings.cardFeePct ?? DEFAULT_CARD.fcc }];
      delete s.settings.cardFeePct;
    }
    return {
      ...d,
      ...s,
      settings: { ...d.settings, ...s.settings },
      search: { ...d.search, ...s.search },
      sync: { ...d.sync, ...s.sync },
    };
  } catch {
    return d;
  }
}

export const state = load();
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);

/** Persist. Pass {synced: true} when the change should be pushed to the cloud. */
export function save({ synced = false } = {}) {
  if (synced) state.sync.dirty = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: keep running in memory */
  }
  listeners.forEach((fn) => fn({ synced }));
}

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

// ---- settings ----
export function setSetting(key, value) {
  state.settings[key] = value;
  state.settings.updatedAt = Date.now();
  save({ synced: true });
}

// ---- sites ----
export function getSites({ includeDisabled = false } = {}) {
  const out = DEFAULT_SITES.map((s) => {
    const o = state.siteState[s.id] || {};
    return { ...s, ...(o.name ? { name: o.name } : {}), ...(o.url ? { url: o.url } : {}), enabled: o.enabled !== false, builtin: true };
  });
  for (const c of state.customSites) if (!c.deleted) out.push({ ...c, enabled: c.enabled !== false, builtin: false });
  return includeDisabled ? out : out.filter((s) => s.enabled);
}

export function updateSite(id, patch) {
  const custom = state.customSites.find((c) => c.id === id);
  if (custom) Object.assign(custom, patch, { updatedAt: Date.now() });
  else state.siteState[id] = { ...(state.siteState[id] || {}), ...patch, updatedAt: Date.now() };
  save({ synced: true });
}

export function addSite(site) {
  state.customSites.push({ ...site, id: 'c-' + uid(), enabled: true, updatedAt: Date.now() });
  save({ synced: true });
}

export function deleteSite(id) {
  const custom = state.customSites.find((c) => c.id === id);
  if (custom) Object.assign(custom, { deleted: true, updatedAt: Date.now() });
  save({ synced: true });
}

export function resetSites() {
  const now = Date.now();
  for (const id of Object.keys(state.siteState)) state.siteState[id] = { updatedAt: now };
  save({ synced: true });
}

// ---- items & quotes ----
export const liveItems = () => state.items.filter((i) => !i.deleted);
export const getItem = (id) => state.items.find((i) => i.id === id && !i.deleted);
export const liveQuotes = (item) => (item?.quotes || []).filter((q) => !q.deleted);

export function addItem({ name, cat, target = '', targetCur = '', note = '' }) {
  const now = Date.now();
  const item = { id: uid(), name: name.trim(), cat, target, targetCur: targetCur || state.settings.base, note, createdAt: now, updatedAt: now, quotes: [] };
  state.items.push(item);
  save({ synced: true });
  return item;
}

export function findItem(name, cat) {
  const n = name.trim().toLowerCase();
  return liveItems().find((i) => i.name.trim().toLowerCase() === n && (!cat || i.cat === cat));
}

export function updateItem(id, patch) {
  const item = getItem(id);
  if (!item) return;
  Object.assign(item, patch, { updatedAt: Date.now() });
  save({ synced: true });
}

export function deleteItem(id) {
  const item = getItem(id);
  if (!item) return;
  item.deleted = true;
  item.updatedAt = Date.now();
  save({ synced: true });
}

export function upsertQuote(itemId, quote) {
  const item = getItem(itemId);
  if (!item) return null;
  const now = Date.now();
  const existing = quote.id && item.quotes.find((q) => q.id === quote.id);
  if (existing) Object.assign(existing, quote, { updatedAt: now });
  else item.quotes.push({ date: localDate(), ...quote, id: uid(), createdAt: now, updatedAt: now });
  item.updatedAt = now;
  save({ synced: true });
  return item;
}

export function deleteQuote(itemId, quoteId) {
  const item = getItem(itemId);
  const q = item?.quotes.find((x) => x.id === quoteId);
  if (!q) return;
  q.deleted = true;
  q.updatedAt = item.updatedAt = Date.now();
  save({ synced: true });
}

// ---- sync payload ----
export const syncPayload = () => ({
  v: 1,
  settings: state.settings,
  siteState: state.siteState,
  customSites: state.customSites,
  items: state.items,
});

export function applyPayload(p) {
  if (p.settings) state.settings = { ...state.settings, ...p.settings };
  state.siteState = p.siteState || {};
  state.customSites = p.customSites || [];
  state.items = p.items || [];
}

export function clearAll() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  setToken('');
}
