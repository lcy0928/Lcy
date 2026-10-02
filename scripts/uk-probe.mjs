// Temporary: where Morrisons search pages keep products (window.__INITIAL_STATE__).
// Prints findings only; writes nothing.
const UA = 'PriceBook/1.0 (personal price comparison; +https://github.com/lcy0928/Lcy)';

const res = await fetch('https://groceries.morrisons.com/search?q=orange%20juice', { headers: { 'User-Agent': UA, Accept: 'text/html' } });
const html = await res.text();
console.log(`HTTP ${res.status} ${html.length} bytes`);
const m = html.match(/window\.__INITIAL_STATE__=([\s\S]*?)<\/script>/);
const state = JSON.parse(m[1].replace(/;\s*$/, ''));

// Objects that look like products: a name and something price-like.
const found = [];
(function walk(o, path) {
  if (!o || typeof o !== 'object' || found.length > 400) return;
  const keys = Object.keys(o);
  if (keys.includes('name') && keys.some((k) => /price/i.test(k)) && typeof o.name === 'string') found.push([path, o]);
  for (const k of keys) walk(o[k], `${path}.${k}`);
})(state, 'state');
console.log(`product-like objects: ${found.length}`);
const paths = {};
for (const [p] of found) { const g = p.replace(/\.[0-9a-f-]{8,}|\.\d+/gi, '.*'); paths[g] = (paths[g] || 0) + 1; }
console.log(JSON.stringify(paths, null, 1));
for (const [p, o] of found.slice(0, 3)) console.log(`\n${p}\n${JSON.stringify(o).slice(0, 2500)}`);
// Search result order (ids), if listed separately.
(function walk(o, path, depth) {
  if (!o || typeof o !== 'object' || depth > 8) return;
  for (const [k, v] of Object.entries(o)) {
    if (/productid|productlist|results|items/i.test(k) && Array.isArray(v) && v.length) console.log(`list ${path}.${k} (${v.length}): ${JSON.stringify(v.slice(0, 3)).slice(0, 400)}`);
    walk(v, `${path}.${k}`, depth + 1);
  }
})(state, 'state', 0);
