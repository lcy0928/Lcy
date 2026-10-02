// Translate a search keyword into each site's language.
//
// Order of preference:
//   1. Words you corrected before (remembered on this device and synced)
//   2. Built-in shopping glossary with Hong Kong terms (instant, offline)
//   3. Google Translate, reading Chinese as Cantonese — only for Chinese words
//      the glossary doesn't cover (free web endpoint, no key)
//   4. MyMemory free translation API when Google is unavailable (~5,000 characters a day)
// Brand and model names (Latin words, numbers) are never sent for translation,
// and English input is only translated through the glossary, so names like
// "Comandante C40" or "Fellow Ode" stay exactly as typed.

import { G } from './glossary.js';

export const LANGS = ['zh', 'en', 'de', 'fr', 'nl', 'it'];
export const LANG_LABEL = { zh: '中', en: 'EN', de: 'DE', fr: 'FR', nl: 'NL', it: 'IT' };
const MT_CODE = { zh: 'zh-TW', en: 'en', de: 'de', fr: 'fr', nl: 'nl', it: 'it' };
// Google reads Chinese input as Cantonese first ("yue"), then as Traditional Chinese.
const GT_SRC = { zh: ['yue', 'zh-TW'] };


const ENTRIES = G.map((row) => Object.fromEntries(LANGS.map((l, i) => [l, row[i].split('|')])));

const hasCjk = (s) => /[㐀-鿿豈-﫿]/.test(s);
export const detectLang = (s) => (hasCjk(s) ? 'zh' : 'en');

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// ---- glossary ----

// Every (form, entry) pair for a source language, longest first so "手搖磨豆機" beats "磨豆機".
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// English needs whole-word matches; no lookbehind so older iPhones (iOS < 16.4) still work.
const formRe = (form, src) => (src === 'zh'
  ? new RegExp(`()(${escapeRe(form)})`, 'g')
  : new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(form)})(?=$|[^\\p{L}\\p{N}])`, 'giu'));

const formsFor = (src) =>
  ENTRIES.flatMap((e) => e[src].map((form) => ({ form, e })))
    // Chinese text is matched one Chinese run at a time, so Latin forms like "iPhone" never apply there.
    .filter(({ form }) => src !== 'zh' || hasCjk(form))
    .sort((a, b) => b.form.length - a.form.length)
    .map((x) => ({ ...x, re: formRe(x.form, src) }));
const FORMS = Object.fromEntries(['zh', 'en'].map((l) => [l, formsFor(l)]));

// Glossary matches inside one piece of text (longest forms first).
function matchGlossary(text, src) {
  let pieces = [{ text }];
  for (const { e, re } of FORMS[src]) {
    pieces = pieces.flatMap((p) => {
      if (p.entry) return [p];
      const out = [];
      let last = 0;
      for (const m of p.text.matchAll(re)) {
        const start = m.index + m[1].length;
        if (start > last) out.push({ text: p.text.slice(last, start) });
        out.push({ text: m[2], entry: e });
        last = start + m[2].length;
      }
      if (last < p.text.length) out.push({ text: p.text.slice(last) });
      return out;
    });
  }
  return pieces;
}

/**
 * Split text into pieces: glossary hits, kept words (brands, models, sizes) and
 * Chinese phrases that still need machine translation.
 * @returns [{ text, entry?, keep? }]
 */
function segment(text, src) {
  if (src !== 'zh') {
    // English input is never machine-translated: glossary words or kept as typed.
    return matchGlossary(text, src).map((p) => (p.entry ? p : { text: p.text, keep: true }));
  }
  // Chinese input: Latin words are kept; each Chinese phrase is either fully covered
  // by the glossary or sent whole to machine translation (so 有機牛奶 → "organic milk").
  return prep(text, src).split(/([\u3400-\u9fff\uf900-\ufaff]+)/).filter((s) => s).flatMap((run) => {
    if (!hasCjk(run)) return [{ text: run, keep: true }];
    const pieces = matchGlossary(run, 'zh');
    return pieces.every((p) => p.entry) ? pieces : [{ text: run }];
  });
}

// "T恤" is one word: the glossary knows it as 恤 (t-shirt).
const prep = (text, src) => (src === 'zh' ? text.replace(/(^|[^A-Za-z])[Tt]\s*恤/g, '$1恤') : text);

const join = (parts) => clean(parts.join(' ').replace(/\s+([,.;:!?])/g, '$1'));

/** Glossary-only translation; null if some Chinese words need machine translation. */
export function glossaryTranslate(text, src, dst) {
  if (src === dst) return clean(text);
  const pieces = segment(text, src);
  if (pieces.some((p) => !p.entry && !p.keep)) return null;
  return join(pieces.map((p) => (p.entry ? p.entry[dst][0] : p.text)));
}

// ---- machine translation (Google, then MyMemory) ----

const CACHE_KEY = 'pricebook:tr2';
const MAX_CACHE = 400;
let cache = null;

function loadCache() {
  if (cache) return cache;
  try { cache = JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY) || '{}'); } catch { cache = {}; }
  return cache;
}
function saveCache() {
  try {
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHE) for (const k of keys.slice(0, keys.length - MAX_CACHE)) delete cache[k];
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage full: keep in memory */ }
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

const mtKey = (text, src, dst) => `${src}|${dst}|${text}`;
const tidy = (s) => clean(decodeEntities(s)).replace(/^["'“”]+|["'“”.。]+$/g, '');
// A translation that still contains Chinese (or is empty) didn't work.
const usable = (out, dst) => !!out && (dst === 'zh' || !hasCjk(out));

// Google Translate's free web endpoint (no key); understands Cantonese as "yue".
async function googleTranslate(text, src, dst, fetchImpl) {
  for (const sl of GT_SRC[src] || [MT_CODE[src]]) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${MT_CODE[dst]}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetchImpl(url);
    if (res.status === 429) break; // busy: let MyMemory answer
    if (!res.ok) continue; // e.g. Cantonese not accepted: try Traditional Chinese
    const j = await res.json();
    const out = tidy(Array.isArray(j?.[0]) ? j[0].map((seg) => (Array.isArray(seg) ? seg[0] || '' : '')).join('') : '');
    if (usable(out, dst)) return out;
  }
  throw new Error('Google translation unavailable');
}

async function myMemoryTranslate(text, src, dst, fetchImpl) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${MT_CODE[src]}|${MT_CODE[dst]}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const out = tidy(j?.responseData?.translatedText || '');
  if (Number(j?.responseStatus) !== 200 || !usable(out, dst) || /MYMEMORY WARNING|QUERY LENGTH|INVALID/i.test(out)) {
    throw new Error(j?.responseDetails || 'translation unavailable');
  }
  return out;
}

async function machineTranslate(text, src, dst, fetchImpl) {
  const key = mtKey(text, src, dst);
  const c = loadCache();
  if (c[key]) return c[key];
  let out;
  try {
    out = await googleTranslate(text, src, dst, fetchImpl);
  } catch {
    out = await myMemoryTranslate(text, src, dst, fetchImpl);
  }
  c[key] = out;
  saveCache();
  return out;
}

// Your own corrections: a phrase you fixed before is used for that phrase
// on its own and inside longer searches ("雞翼" in "Tyson 雞翼").
const remembered = (memo, text, dst) => (memo ? memo(clean(text), dst) : undefined);

// Chinese text split into Chinese runs and the rest, so each run can use a remembered fix.
const runsOf = (t, src) => (src === 'zh' ? prep(t, src).split(/([㐀-鿿豈-﫿]+)/).filter((x) => x.trim()) : [t]);

/** Translation from your corrections, the glossary or the cache only (no network); null when not known yet. */
export function translateSync(text, src, dst, memo) {
  const t = clean(text);
  if (!t || src === dst) return t;
  const whole = remembered(memo, t, dst);
  if (whole) return whole;
  const c = loadCache();
  const parts = [];
  for (const run of runsOf(t, src)) {
    const fixed = remembered(memo, run, dst);
    if (fixed) { parts.push(fixed); continue; }
    for (const p of segment(run, src)) {
      if (p.entry) parts.push(p.entry[dst][0]);
      else if (p.keep) parts.push(p.text);
      else if (c[mtKey(p.text, src, dst)]) parts.push(c[mtKey(p.text, src, dst)]);
      else return null;
    }
  }
  return join(parts);
}

/**
 * Full translation: your corrections, then the glossary, then machine translation
 * for leftover Chinese words. On failure those words stay as typed (ok=false).
 * @param memo optional (phrase, lang) => your corrected translation
 * @returns {Promise<{text:string, ok:boolean}>}
 */
export async function translate(text, src, dst, fetchImpl = globalThis.fetch, memo) {
  const t = clean(text);
  if (!t || src === dst) return { text: t, ok: true };
  const whole = remembered(memo, t, dst);
  if (whole) return { text: whole, ok: true };
  let ok = true;
  const parts = [];
  for (const run of runsOf(t, src)) {
    const fixed = remembered(memo, run, dst);
    if (fixed) { parts.push(fixed); continue; }
    for (const p of segment(run, src)) {
      if (p.entry) parts.push(p.entry[dst][0]);
      else if (p.keep) parts.push(p.text);
      else {
        try {
          parts.push(await machineTranslate(p.text, src, dst, fetchImpl));
        } catch {
          ok = false;
          parts.push(p.text);
        }
      }
    }
  }
  return { text: join(parts), ok };
}

/** A glossary term in a language, for sample searches (e.g. the link tester). */
export function sampleTerm(zh, lang) {
  const e = ENTRIES.find((x) => x.zh.includes(zh));
  return e ? e[lang][0] : zh;
}
