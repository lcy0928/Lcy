// "Landed price": what an offer really costs once VAT, refunds, shipping,
// forwarding and card FX fees are counted, converted to the compare currency.
import { convert } from './currency.js';
import { num } from './util.js';

export const MODES = ['local', 'online', 'taxfree'];

// vat = standard VAT rate %; refund = typical net tourist refund % of the shelf
// price after operator fees (rough, editable per quote); min = minimum spend in
// one shop for a tax-free form, in the country's currency (0 = no minimum).
// Great Britain ended tourist VAT refunds on 1 Jan 2021, hence refund 0.
export const COUNTRIES = {
  HK: { vat: 0, refund: 0, min: 0, cur: 'HKD' },
  GB: { vat: 20, refund: 0, min: 0, cur: 'GBP' },
  DE: { vat: 19, refund: 11, min: 50.01, cur: 'EUR' },
  FR: { vat: 20, refund: 12, min: 100.01, cur: 'EUR' },
  IT: { vat: 22, refund: 13, min: 70.01, cur: 'EUR' },
  ES: { vat: 21, refund: 13, min: 0, cur: 'EUR' },
  NL: { vat: 21, refund: 12, min: 50, cur: 'EUR' },
  BE: { vat: 21, refund: 12, min: 125, cur: 'EUR' },
  AT: { vat: 20, refund: 11, min: 75.01, cur: 'EUR' },
  IE: { vat: 23, refund: 12, min: 0, cur: 'EUR' },
  PT: { vat: 23, refund: 13, min: 61.5, cur: 'EUR' },
  GR: { vat: 24, refund: 13, min: 50, cur: 'EUR' },
  CH: { vat: 8.1, refund: 5, min: 300, cur: 'CHF' },
  OTHER: { vat: 0, refund: 0, min: 0, cur: 'USD' },
};

export const REGION_COUNTRY = { HK: 'HK', UK: 'GB', EU: 'DE', GLOBAL: 'OTHER' };

const isBlank = (v) => v === '' || v === null || v === undefined;

export const DEFAULT_CARD = { id: 'default', name: '', fcc: 1.95, cbf: 1, cashback: 0, markup: 0 };

// Cards from ctx; older callers pass a single cardFeePct instead.
const cardsOf = (ctx) => (ctx.cards?.length ? ctx.cards : [{ ...DEFAULT_CARD, fcc: num(ctx.cardFeePct, DEFAULT_CARD.fcc), cbf: 0 }]);

/** Is the merchant overseas? Paying such a merchant in HKD still attracts a cross-border fee (CBF). */
export const isOverseas = (q) => (q.overseas === undefined || q.overseas === '' ? !!q.region && q.region !== 'HK' : !!q.overseas);

/** Fee % a card charges on this quote: FX fee (+ rate markup) on foreign currency, CBF on overseas HKD. */
export function cardFeePct(q, card, ctx) {
  if (!isBlank(q.cardFeePct)) return num(q.cardFeePct); // legacy per-quote override
  if (q.currency !== ctx.cardCurrency) return num(card.fcc) + num(card.markup);
  return isOverseas(q) ? num(card.cbf) : 0;
}

// Kept for older callers: fee % with the first card.
export const cardFeeFor = (q, ctx) => cardFeePct(q, cardsOf(ctx)[0], ctx);

/**
 * @param q   quote: { price, currency, region, overseas, country, shipping, fees, mode,
 *                     removeVat, vatRate, refundPct, dutyPct, cardId,
 *                     shipTo ('hk'|'fwd'), weight, fwdRate, fwd, fwdCur }
 * @param ctx { base, cardCurrency, cards, rates }  rates = hkdPer map
 * @returns { lines: [{k, v, cur, pct?, card?}], total, cur, card }  total in ctx.base
 */
export function landed(q, ctx) {
  const cur = q.currency || ctx.base;
  const price = num(q.price);
  const ship = num(q.shipping);
  const fees = num(q.fees);
  const lines = [{ k: 'price', v: price, cur }];

  let goods = price;
  const toForwarder = q.mode === 'online' && q.shipTo === 'fwd';
  // Delivered to a forwarder's local warehouse it is a domestic sale, so VAT stays.
  if (q.mode === 'online' && !toForwarder && q.removeVat && num(q.vatRate) > 0) {
    goods = price / (1 + num(q.vatRate) / 100);
    lines.push({ k: 'vatRemoved', v: goods - price, cur });
  }
  if (ship) lines.push({ k: 'shipping', v: ship, cur });
  if (fees) lines.push({ k: 'fees', v: fees, cur });

  // What the card is actually charged; card fees and cashback apply to this.
  const charged = goods + ship + fees;

  let refund = 0;
  if (q.mode === 'taxfree' && num(q.refundPct) > 0) {
    const c = COUNTRIES[q.country];
    // The minimum is set in the country's own currency.
    const priceThere = c ? convert(price, cur, c.cur, ctx.rates) : price;
    if (c && c.min && priceThere < c.min) {
      lines.push({ k: 'belowMin', v: 0, cur: c.cur, min: c.min });
    } else {
      refund = (price * num(q.refundPct)) / 100;
      lines.push({ k: 'taxRefund', v: -refund, cur });
    }
  }

  let duty = 0;
  if (q.mode === 'online' && num(q.dutyPct) > 0) {
    duty = ((goods + ship) * num(q.dutyPct)) / 100;
    lines.push({ k: 'duty', v: duty, cur });
  }

  // Pick the chosen card, or the one that makes this purchase cheapest.
  const cards = cardsOf(ctx);
  const costWith = (card) => charged * (cardFeePct(q, card, ctx) - num(card.cashback)) / 100;
  const chosen = cards.find((c) => c.id === q.cardId);
  const card = chosen || cards.reduce((a, b) => (costWith(b) < costWith(a) ? b : a));
  const pct = cardFeePct(q, card, ctx);
  const cardFee = (charged * pct) / 100;
  const cashback = (charged * num(card.cashback)) / 100;
  if (cardFee) lines.push({ k: 'cardFee', v: cardFee, cur, pct, card: card.name });
  if (cashback) lines.push({ k: 'cashback', v: -cashback, cur, pct: num(card.cashback), card: card.name });

  let total = convert(charged - refund + duty + cardFee - cashback, cur, ctx.base, ctx.rates);

  // Forwarding: weight × rate per kg (when shipped to a forwarder) plus any fixed amount.
  const byWeight = toForwarder ? num(q.weight) * num(q.fwdRate) : 0;
  const fwd = byWeight + num(q.fwd);
  if (fwd) {
    const fwdCur = q.fwdCur || ctx.cardCurrency || 'HKD';
    lines.push({ k: 'forwarding', v: fwd, cur: fwdCur });
    total += convert(fwd, fwdCur, ctx.base, ctx.rates);
  }

  return { lines, total, cur: ctx.base, card };
}

// Keep only the most recent quote per site + condition (ties: last logged wins).
export function latestPerSite(quotes) {
  const best = new Map();
  for (const q of quotes) {
    const key = `${String(q.site || '').trim().toLowerCase()}|${q.cond || 'new'}`;
    const prev = best.get(key);
    if (!prev || (q.date || '') > (prev.date || '') || ((q.date || '') === (prev.date || '') && (q.createdAt || 0) >= (prev.createdAt || 0))) {
      best.set(key, q);
    }
  }
  return [...best.values()];
}

export function rankQuotes(quotes, ctx) {
  return quotes
    .map((q) => ({ q, r: landed(q, ctx) }))
    .sort((a, b) => (Number.isFinite(a.r.total) ? a.r.total : Infinity) - (Number.isFinite(b.r.total) ? b.r.total : Infinity));
}

// ---- unit price ----
export const UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];
const UNIT_BASE = { g: ['100g', 0.01], kg: ['100g', 10], ml: ['100ml', 0.01], l: ['100ml', 10], pcs: ['pc', 1] };

/** Price per 100 g / 100 ml / piece. Returns null without a usable quantity. */
export function unitPrice(total, qty, unit) {
  const u = UNIT_BASE[unit];
  const n = num(qty);
  if (!u || !(n > 0) || !Number.isFinite(total)) return null;
  return { per: u[0], value: total / (n * u[1]) };
}

// ---- freshness ----
export function ageDays(date, today = new Date()) {
  if (!date) return Infinity;
  const d = new Date(date + 'T00:00:00');
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((t - d) / 86400000);
}
