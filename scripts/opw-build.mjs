// Download the Consumer Council price file and write a compact copy for the app.
// Usage: node scripts/opw-build.mjs <output.json> [source.json-or-url]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { compactOpw, OPW_SOURCE } from '../js/opw.js';

const out = process.argv[2] || 'data/opw.json';
const src = process.argv[3] || OPW_SOURCE;

async function load(source) {
  if (!/^https?:/.test(source)) return readFile(source, 'utf8');
  const res = await fetch(source, { headers: { 'User-Agent': 'PriceBook (https://github.com/lcy0928/Lcy)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${source}`);
  return res.text();
}

const text = (await load(src)).replace(/^﻿/, '');
// The file has no date of its own; use today's date in Hong Kong.
const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const data = compactOpw(JSON.parse(text), today);
if (data.items.length < 50 && /^https?:/.test(src)) throw new Error(`Only ${data.items.length} products — refusing to publish`);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(data));
console.log(`Wrote ${out}: ${data.items.length} products, ${data.stores.length} stores, date ${data.date}`);
