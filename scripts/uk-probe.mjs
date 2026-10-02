// Temporary: what "Website" means in Morrisons' terms of use, and whether Lidl GB's
// search lists groceries with prices. Prints findings only; writes nothing.
const UA = 'PriceBook/1.0 (personal price comparison; +https://github.com/lcy0928/Lcy)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' } });
  const body = await res.text();
  console.log(`\n== ${url}\n   HTTP ${res.status} ${body.length} bytes`);
  await sleep(1500);
  return body;
}

// Morrisons terms of use: the start (definitions, 1.x, 2.x).
const t = text(await get('https://www.morrisons.com/terms/terms-and-conditions-of-use'));
const start = Math.max(0, t.search(/terms and conditions of use/i));
for (let i = start; i < Math.min(t.length, start + 4000); i += 500) console.log(`   ${t.slice(i, i + 500)}`);

// Lidl GB: products (name + price) in the search page data for everyday groceries.
for (const q of ['milk', 'orange juice', 'bread']) {
  const html = (await get(`https://www.lidl.co.uk/q/search?q=${encodeURIComponent(q)}`)).replace(/&quot;/g, '"');
  const rows = [];
  for (const m of html.matchAll(/"fullTitle":"([^"]{1,120})"[\s\S]{0,3000}?"price":(\d+(?:\.\d+)?)/g)) rows.push(`${m[1]} £${m[2]}`);
  const cats = {};
  for (const m of html.matchAll(/"wonCategoryPrimary":"([^"]+)"/g)) cats[m[1].split('/')[1] || m[1]] = (cats[m[1].split('/')[1] || m[1]] || 0) + 1;
  console.log(`   categories: ${JSON.stringify(cats)}`);
  console.log(`   first products: ${rows.slice(0, 8).join(' | ') || '(none parsed)'}`);
}
