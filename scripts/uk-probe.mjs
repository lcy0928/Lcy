// Temporary: can GitHub's servers read Morrisons / Lidl GB, and what do their terms
// and robots.txt say about automated access? Prints findings only; writes nothing.
const UA = 'PriceBook/1.0 (personal price comparison; +https://github.com/lcy0928/Lcy)';
const WORDS = /automat|robot|spider|scrap|crawl|data.?mining|harvest|extract/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const text = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ');

async function get(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' } });
    const body = await res.text();
    console.log(`\n== ${url}\n   HTTP ${res.status} ${res.headers.get('content-type') || ''} ${body.length} bytes`);
    await sleep(1500);
    return { status: res.status, body };
  } catch (e) {
    console.log(`\n== ${url}\n   ${e.message}`);
    return { status: 0, body: '' };
  }
}

function robots(body) {
  let on = false;
  const out = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*user-agent\s*:\s*(.*)$/i);
    if (m) on = m[1].trim() === '*';
    else if (on && /^\s*(dis)?allow/i.test(line)) out.push(line.trim());
  }
  console.log(`   User-agent * rules (${out.length}): ${out.slice(0, 40).join(' | ')}`);
}

function terms(body) {
  const sentences = text(body).split(/(?<=[.;:])\s+/).filter((s) => WORDS.test(s));
  console.log(`   clauses about automated access (${sentences.length}):`);
  for (const s of sentences.slice(0, 8)) console.log(`   > ${s.slice(0, 400)}`);
}

function links(body, base, re) {
  const set = new Set();
  for (const m of body.matchAll(/href="([^"]+)"/g)) if (re.test(m[1])) set.add(new URL(m[1], base).href);
  return [...set].slice(0, 6);
}

function page(body) {
  console.log(`   ld+json: ${(body.match(/application\/ld\+json/g) || []).length}, £ signs: ${(body.match(/£/g) || []).length}, __NEXT_DATA__: ${body.includes('__NEXT_DATA__')}, __NUXT__: ${body.includes('__NUXT__')}`);
  const i = body.indexOf('£');
  if (i >= 0) console.log(`   around first £: ${text(body.slice(Math.max(0, i - 300), i + 200)).slice(0, 300)}`);
  if (/^\s*[[{]/.test(body)) console.log(`   json: ${body.slice(0, 600)}`);
}

// Morrisons
robots((await get('https://groceries.morrisons.com/robots.txt')).body);
const mt = await get('https://groceries.morrisons.com/content/terms-and-conditions');
terms(mt.body);
for (const u of links(mt.body, 'https://groceries.morrisons.com/', /terms|conditions|legal|website-use/i)) {
  if (u.includes('terms-and-conditions')) continue;
  terms((await get(u)).body);
}
page((await get('https://groceries.morrisons.com/search?q=orange%20juice')).body);

// Lidl GB
robots((await get('https://www.lidl.co.uk/robots.txt')).body);
const home = await get('https://www.lidl.co.uk/');
const legal = links(home.body, 'https://www.lidl.co.uk/', /terms|legal|conditions|imprint/i);
console.log(`   legal links: ${legal.join(' ')}`);
for (const u of legal.slice(0, 4)) terms((await get(u)).body);
page((await get('https://www.lidl.co.uk/q/search?q=orange%20juice')).body);
