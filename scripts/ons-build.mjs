// Build data/ons.json: the typical UK shop price of each item in the ONS consumer
// prices basket (Office for National Statistics price quotes, Open Government Licence).
//
//   node scripts/ons-build.mjs <out.json> [price-quotes.csv]
//
// Without a CSV the latest monthly price quotes are downloaded: the dataset page's
// JSON (/data) lists the monthly editions, each edition lists its files.
// Output: { v, month, items: [[description, median price £, number of quotes]] }

import { writeFileSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const SITE = 'https://www.ons.gov.uk';
const DATASET = '/economy/inflationandpriceindices/datasets/consumerpriceindicescpiandretailpricesindexrpiitemindicesandpricequotes';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Minimal CSV parser (quoted fields, doubled quotes, CRLF). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Median valid price per item. ONS marks usable quotes with validity 3 or 4. */
export function aggregateQuotes(csvText, { minQuotes = 5 } = {}) {
  const rows = parseCsv(csvText);
  const head = rows.shift().map((h) => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name);
  const [iDesc, iPrice, iValid] = [col('item_desc'), col('price'), col('validity')];
  if (iDesc < 0 || iPrice < 0) throw new Error(`unexpected columns: ${head.join(',')}`);
  const by = new Map();
  for (const r of rows) {
    const desc = (r[iDesc] || '').trim();
    const price = Number(r[iPrice]);
    const valid = iValid < 0 || ['3', '4'].includes((r[iValid] || '').trim());
    if (!desc || !valid || !(price > 0)) continue;
    if (!by.has(desc)) by.set(desc, []);
    by.get(desc).push(price);
  }
  return [...by.entries()]
    .filter(([, ps]) => ps.length >= minQuotes)
    .map(([desc, ps]) => [desc, Math.round(median(ps) * 100) / 100, ps.length])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/** "pricequotesjune2026" / "pricequote202606" → "2026-06" (or '' if no date). */
export function editionMonth(uri) {
  const s = String(uri).toLowerCase();
  const m = s.match(new RegExp(`(${MONTHS.join('|')})(\\d{4})`));
  if (m) return `${m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}`;
  const n = s.match(/(20\d{2})(0[1-9]|1[0-2])(?!\d)/);
  return n ? `${n[1]}-${n[2]}` : '';
}

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function latestQuotes() {
  const page = await getJson(`${SITE}${DATASET}/data`);
  const editions = (page.datasets || [])
    .map((d) => d.uri)
    .filter((u) => /pricequote/i.test(u || '') && editionMonth(u))
    .sort((a, b) => editionMonth(b).localeCompare(editionMonth(a)));
  for (const uri of editions.slice(0, 3)) {
    const ed = await getJson(`${SITE}${uri}/data`);
    const file = (ed.downloads || []).map((d) => d.file).find((f) => /quote/i.test(f || '') && /\.(csv|zip)$/i.test(f));
    if (!file) continue;
    const res = await fetch(`${SITE}/file?uri=${uri}/${file}`);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    let text;
    if (/\.zip$/i.test(file)) {
      const dir = mkdtempSync(join(tmpdir(), 'ons-'));
      writeFileSync(join(dir, 'q.zip'), buf);
      text = execFileSync('unzip', ['-p', join(dir, 'q.zip'), '*.csv'], { encoding: 'utf8', maxBuffer: 1 << 30 });
    } else {
      text = buf.toString('utf8');
    }
    return { text, month: editionMonth(uri), source: `${SITE}${uri}` };
  }
  throw new Error('no price quotes edition found');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [out, csv] = process.argv.slice(2);
  const got = csv ? { text: readFileSync(csv, 'utf8'), month: editionMonth(csv) } : await latestQuotes();
  const items = aggregateQuotes(got.text);
  if (items.length < 50) throw new Error(`only ${items.length} items`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ v: 1, month: got.month, items }));
  console.log(`${items.length} items (${got.month}) → ${out}${got.source ? ` from ${got.source}` : ''}`);
}
