// "Landed price": what an offer really costs once VAT, refunds, shipping,
// forwarding and card FX fees are counted, converted to the compare currency.
import { convert } from './currency.js';
import { num } from './util.js';

export const MODES = ['local', 'online', 'taxfree'];

// vat = standard VAT rate %, refund = typical net tourist refund % of the
// shelf price after operator fees (rough; user can edit per quote).
// Great Britain ended tourist VAT refunds on 1 Jan 2021, hence refund 0.
export const COUNTRIES = {
  HK: { vat: 0, refund: 0, cur: 'HKD' },
  GB: { vat: 20, refund: 0, cur: 'GBP' },
  DE: { vat: 19, refund: 11, cur: 'EUR' },
  FR: { vat: 20, refund: 12, cur: 'EUR' },
  IT: { vat: 22, refund: 13, cur: 'EUR' },
  ES: { vat: 21, refund: 13, cur: 'EUR' },
  NL: { vat: 21, refund: 12, cur: 'EUR' },
  BE: { vat: 21, refund: 12, cur: 'EUR' },
  AT: { vat: 20, refund: 11, cur: 'EUR' },
  IE: { vat: 23, refund: 12, cur: 'EUR' },
  PT: { vat: 23, refund: 13, cur: 'EUR' },
  CH: { vat: 8.1, refund: 5, cur: 'CHF' },
  US: { vat: 0, refund: 0, cur: 'USD' },
  JP: { vat: 10, refund: 10, cur: 'JPY' },
  CN: { vat: 13, refund: 9, cur: 'CNY' },
  OTHER: { vat: 0, refund: 0, cur: 'USD' },
};

export const REGION_COUNTRY = { HK: 'HK', UK: 'GB', EU: 'DE', GLOBAL: 'OTHER' };

const isBlank = (v) => v === '' || v === null || v === undefined;

export function cardFeeFor(q, ctx) {
  if (!isBlank(q.cardFeePct)) return num(q.cardFeePct);
  return q.currency !== ctx.cardCurrency ? num(ctx.cardFeePct) : 0;
}

/**
 * @param q   quote: { price, currency, shipping, fees, fwd, fwdCur, mode,
 *                     removeVat, vatRate, refundPct, dutyPct, cardFeePct }
 * @param ctx { base, cardCurrency, cardFeePct, rates }  rates = hkdPer map
 * @returns { lines: [{k, v, cur, pct?}], total, cur }  total in ctx.base
 */
export function landed(q, ctx) {
  const cur = q.currency || ctx.base;
  const price = num(q.price);
  const ship = num(q.shipping);
  const fees = num(q.fees);
  const lines = [{ k: 'price', v: price, cur }];

  let goods = price;
  if (q.mode === 'online' && q.removeVat && num(q.vatRate) > 0) {
    goods = price / (1 + num(q.vatRate) / 100);
    lines.push({ k: 'vatRemoved', v: goods - price, cur });
  }
  if (ship) lines.push({ k: 'shipping', v: ship, cur });
  if (fees) lines.push({ k: 'fees', v: fees, cur });

  // What the card is actually charged; FX fee applies to this.
  const charged = goods + ship + fees;

  let refund = 0;
  if (q.mode === 'taxfree' && num(q.refundPct) > 0) {
    refund = (price * num(q.refundPct)) / 100;
    lines.push({ k: 'taxRefund', v: -refund, cur });
  }

  let duty = 0;
  if (q.mode === 'online' && num(q.dutyPct) > 0) {
    duty = ((goods + ship) * num(q.dutyPct)) / 100;
    lines.push({ k: 'duty', v: duty, cur });
  }

  const pct = cardFeeFor(q, ctx);
  const cardFee = (charged * pct) / 100;
  if (cardFee) lines.push({ k: 'cardFee', v: cardFee, cur, pct });

  let total = convert(charged - refund + duty + cardFee, cur, ctx.base, ctx.rates);

  const fwd = num(q.fwd);
  if (fwd) {
    const fwdCur = q.fwdCur || ctx.cardCurrency || 'HKD';
    lines.push({ k: 'forwarding', v: fwd, cur: fwdCur });
    total += convert(fwd, fwdCur, ctx.base, ctx.rates);
  }

  return { lines, total, cur: ctx.base };
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
