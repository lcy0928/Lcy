// Temporary: how Morrisons search pages carry prices, and what Lidl GB's legal pages
// say about automated access. Prints findings only; writes nothing.
const UA = 'PriceBook/1.0 (personal price comparison; +https://github.com/lcy0928/Lcy)';
const WORDS = /automat|robot|spider|scrap|crawl|data.?mining|harvest/gi;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const text = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<header[\s\S]*?<\/header>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ');

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' } });
  const body = await res.text();
  console.log(`\n== ${url}\n   HTTP ${res.status} ${body.length} bytes`);
  await sleep(1500);
  return body;
}

function around(s, re, width = 250, max = 6) {
  let n = 0;
  for (const m of s.matchAll(re)) {
    console.log(`   > …${s.slice(Math.max(0, m.index - width), m.index + width)}…`);
    if (++n >= max) break;
  }
  if (!n) console.log('   (no match)');
}

// Morrisons: where are product names and prices?
const m = await get('https://groceries.morrisons.com/search?q=orange%20juice');
for (const block of m.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) console.log(`   ld+json: ${block[1].slice(0, 700)}`);
for (const g of m.matchAll(/window\.(__[A-Z_]+__)\s*=/g)) console.log(`   global: ${g[1]} at ${g.index}`);
for (const s of m.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]{2000,}?)<\/script>/g)) console.log(`   big inline script ${s[1].length} chars: ${s[1].slice(0, 200)}`);
console.log('   -- "unitPrice" / "price" in data:');
around(m, /"unitPrice"/g, 300, 2);
around(m, /"price"\s*:\s*\{/g, 300, 2);
console.log('   -- visible text around Tropicana / Orange Juice:');
around(text(m), /orange juice/gi, 200, 4);
console.log('   -- markup around first product price:');
around(m, /£\d/g, 400, 3);

// Lidl GB legal pages: clauses on automated access.
for (const u of ['https://www.lidl.co.uk/c/legal-information/s10022935', 'https://www.lidl.co.uk/c/privacy-legal/s10023373']) {
  const t = text(await get(u));
  around(t, WORDS, 300, 6);
}

// Morrisons group website terms (morrisons.com), in case they cover the grocery site.
const idx = await get('https://www.morrisons.com/terms/');
const links = [...new Set([...idx.matchAll(/href="([^"]*terms[^"]*)"/g)].map((x) => new URL(x[1], 'https://www.morrisons.com/').href))];
console.log(`   terms links: ${links.join(' ')}`);
for (const u of links.filter((x) => /website|use|legal|condition/i.test(x)).slice(0, 4)) around(text(await get(u)), WORDS, 300, 4);
