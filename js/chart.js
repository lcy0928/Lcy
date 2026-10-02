// Price-trend chart: one line (lowest landed price per day), every logged
// quote as a faint dot behind it, and an optional target-price rule.
// Returns an SVG string; bindChart() adds the crosshair + tooltip.
import { esc } from './util.js';

const H = 220;
const M = { t: 16, r: 16, b: 28, l: 56 };

function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1) * mag;
}

const dayMs = (d) => new Date(d + 'T00:00:00Z').getTime();

/**
 * @param points [{date:'YYYY-MM-DD', value:number, site:string}]
 * @returns {{svg:string, series:Array}|null}  null when < 2 distinct days
 */
export function buildChart(points, { width = 640, target, fmtValue, fmtDate, targetLabel }) {
  const W = Math.max(280, Math.round(width));
  const valid = points.filter((p) => p.date && Number.isFinite(p.value));
  const byDay = new Map();
  for (const p of valid) {
    const cur = byDay.get(p.date);
    if (!cur || p.value < cur.value) byDay.set(p.date, p);
  }
  const series = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (series.length < 2) return null;

  const xs = series.map((p) => dayMs(p.date));
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const vals = valid.map((p) => p.value);
  if (Number.isFinite(target)) vals.push(target);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo *= 0.9; hi *= 1.1; }
  const step = niceStep(hi - lo, 3);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const sx = (t) => M.l + ((t - x0) / (x1 - x0)) * (W - M.l - M.r);
  const sy = (v) => H - M.b - ((v - lo) / (hi - lo)) * (H - M.t - M.b);

  const grid = [];
  for (let v = lo; v <= hi + step / 2; v += step) {
    const y = sy(v).toFixed(1);
    grid.push(`<line class="c-grid" x1="${M.l}" x2="${W - M.r}" y1="${y}" y2="${y}"/>`);
    grid.push(`<text class="c-tick" x="${M.l - 8}" y="${y}" dy="0.32em" text-anchor="end">${esc(fmtValue(v, true))}</text>`);
  }

  const xTicks = [series[0], series[series.length - 1]];
  if (series.length > 4) xTicks.splice(1, 0, series[Math.floor(series.length / 2)]);
  const xt = xTicks.map((p, i) => {
    const anchor = i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle';
    return `<text class="c-tick" x="${sx(dayMs(p.date)).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(fmtDate(p.date))}</text>`;
  });

  const dots = valid
    .map((p) => `<circle class="c-quote" cx="${sx(dayMs(p.date)).toFixed(1)}" cy="${sy(p.value).toFixed(1)}" r="3"/>`)
    .join('');

  const path = series.map((p, i) => `${i ? 'L' : 'M'}${sx(dayMs(p.date)).toFixed(1)},${sy(p.value).toFixed(1)}`).join('');
  const area = `${path}L${sx(x1).toFixed(1)},${H - M.b}L${sx(x0).toFixed(1)},${H - M.b}Z`;
  const last = series[series.length - 1];

  let targetRule = '';
  if (Number.isFinite(target)) {
    const y = sy(target).toFixed(1);
    targetRule = `<line class="c-target" x1="${M.l}" x2="${W - M.r}" y1="${y}" y2="${y}"/>
      <text class="c-target-label" x="${M.l + 6}" y="${y}" dy="-6" text-anchor="start">${esc(targetLabel)}</text>`;
  }

  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">
    ${grid.join('')}${xt.join('')}${targetRule}
    <path class="c-area" d="${area}"/>
    ${dots}
    <path class="c-line" d="${path}"/>
    <circle class="c-end" cx="${sx(dayMs(last.date)).toFixed(1)}" cy="${sy(last.value).toFixed(1)}" r="5"/>
    <line class="c-cross" x1="0" x2="0" y1="${M.t}" y2="${H - M.b}" visibility="hidden"/>
    <circle class="c-hover" r="6" visibility="hidden"/>
    <rect class="c-hit" x="${M.l}" y="0" width="${W - M.l - M.r}" height="${H}" fill="transparent"/>
  </svg>`;

  return { svg, width: W, series: series.map((p) => ({ ...p, x: sx(dayMs(p.date)), y: sy(p.value) })) };
}

export function bindChart(wrap, { series, width: W }, describe) {
  const svg = wrap.querySelector('svg');
  const tip = wrap.querySelector('.c-tip');
  const cross = svg.querySelector('.c-cross');
  const dot = svg.querySelector('.c-hover');
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  const show = (clientX) => {
    const box = svg.getBoundingClientRect();
    const vx = ((clientX - box.left) / box.width) * W;
    let best = series[0];
    for (const p of series) if (Math.abs(p.x - vx) < Math.abs(best.x - vx)) best = p;
    cross.setAttribute('x1', best.x); cross.setAttribute('x2', best.x);
    dot.setAttribute('cx', best.x); dot.setAttribute('cy', best.y);
    cross.setAttribute('visibility', 'visible');
    dot.setAttribute('visibility', 'visible');
    tip.innerHTML = describe(best);
    tip.hidden = false;
    const px = (best.x / W) * box.width;
    const left = Math.min(Math.max(px - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth);
    tip.style.left = `${left}px`;
    tip.style.top = `${(best.y / H) * box.height - tip.offsetHeight - 14}px`;
  };
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', hide);
}
