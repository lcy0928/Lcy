// Exchange rates are stored as "how many HKD one unit is worth" (hkdPer).
// convert() works between any two currencies through HKD.

export const CURRENCIES = ['HKD', 'GBP', 'EUR', 'USD', 'CHF', 'SEK', 'DKK', 'NOK', 'PLN', 'CZK', 'JPY', 'CNY'];

// Rough values so the app still works offline before the first fetch.
export const FALLBACK_HKD_PER = {
  HKD: 1, GBP: 10.45, EUR: 9.1, USD: 7.78, CHF: 9.75, SEK: 0.83, DKK: 1.22,
  NOK: 0.77, PLN: 2.13, CZK: 0.37, JPY: 0.052, CNY: 1.09,
};

export function convert(amount, from, to, hkdPer) {
  if (!Number.isFinite(amount)) return NaN;
  if (from === to) return amount;
  const f = hkdPer[from], t = hkdPer[to];
  if (!f || !t) return NaN;
  return (amount * f) / t;
}

export function effectiveRates(rates, manual) {
  const out = { ...FALLBACK_HKD_PER, ...(rates?.hkdPer || {}) };
  for (const [c, v] of Object.entries(manual || {})) if (v > 0) out[c] = v;
  out.HKD = 1;
  return out;
}

function invert(perHkd) {
  const out = { HKD: 1 };
  for (const [c, v] of Object.entries(perHkd)) if (v > 0 && CURRENCIES.includes(c)) out[c] = 1 / v;
  return out;
}

const SOURCES = [
  {
    url: 'https://api.frankfurter.dev/v1/latest?base=HKD',
    name: 'ECB (Frankfurter)',
    parse: (j) => ({ hkdPer: invert(j.rates), date: j.date }),
  },
  {
    url: 'https://api.frankfurter.app/latest?from=HKD',
    name: 'ECB (Frankfurter)',
    parse: (j) => ({ hkdPer: invert(j.rates), date: j.date }),
  },
  {
    url: 'https://open.er-api.com/v6/latest/HKD',
    name: 'ExchangeRate-API',
    parse: (j) => {
      if (j.result !== 'success') throw new Error('bad response');
      return { hkdPer: invert(j.rates), date: new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10) };
    },
  },
];

export async function fetchRates(fetchImpl = fetch) {
  let lastErr;
  for (const s of SOURCES) {
    try {
      const res = await fetchImpl(s.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = s.parse(await res.json());
      if (!parsed.hkdPer.GBP || !parsed.hkdPer.EUR) throw new Error('missing GBP/EUR');
      return { ...parsed, source: s.name, fetchedAt: Date.now() };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('no rate source');
}

const LOCALE = { zh: 'zh-HK', en: 'en-GB' };

export function fractionDigits(amount, cur) {
  if (cur === 'JPY' || cur === 'CZK') return 0;
  return Math.abs(amount) >= 1000 ? 0 : 2;
}

export function fmt(amount, cur, lang = 'zh', digits) {
  if (!Number.isFinite(amount)) return '—';
  const d = digits ?? fractionDigits(amount, cur);
  try {
    return new Intl.NumberFormat(LOCALE[lang] || 'en-GB', {
      style: 'currency', currency: cur, minimumFractionDigits: d, maximumFractionDigits: d,
    }).format(amount);
  } catch {
    return `${cur} ${amount.toFixed(d)}`;
  }
}

// Split into { symbol, value } for the big price tag.
export function fmtParts(amount, cur, lang = 'zh') {
  if (!Number.isFinite(amount)) return { symbol: '', value: '—' };
  const d = fractionDigits(amount, cur);
  try {
    const parts = new Intl.NumberFormat(LOCALE[lang] || 'en-GB', {
      style: 'currency', currency: cur, minimumFractionDigits: d, maximumFractionDigits: d,
    }).formatToParts(amount);
    const symbol = parts.filter((p) => p.type === 'currency').map((p) => p.value).join('');
    const value = parts.filter((p) => p.type !== 'currency' && p.type !== 'literal').map((p) => p.value).join('');
    return { symbol, value };
  } catch {
    return { symbol: cur, value: amount.toFixed(d) };
  }
}
