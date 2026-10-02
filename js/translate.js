// Translate a search keyword into each site's language.
//
// Order of preference:
//   1. Built-in shopping glossary (instant, offline, reliable for common goods)
//   2. MyMemory free translation API — only for Chinese words the glossary
//      doesn't cover (no key needed, CORS-enabled, ~5,000 characters a day)
// Brand and model names (Latin words, numbers) are never sent for translation,
// and English input is only translated through the glossary, so names like
// "Comandante C40" or "Fellow Ode" stay exactly as typed.

export const LANGS = ['zh', 'en', 'de', 'fr', 'nl', 'it'];
export const LANG_LABEL = { zh: '中', en: 'EN', de: 'DE', fr: 'FR', nl: 'NL', it: 'IT' };
const MT_CODE = { zh: 'zh-TW', en: 'en', de: 'de', fr: 'fr', nl: 'nl', it: 'it' };

// [zh, en, de, fr, nl, it]; a cell may list alternatives with "|" (first is used for output).
const G = [
  // coffee
  ['手搖磨豆機|手動磨豆機', 'manual coffee grinder|hand grinder', 'Handkaffeemühle', 'moulin à café manuel', 'handmatige koffiemolen', 'macinacaffè manuale'],
  ['電動磨豆機', 'electric coffee grinder', 'elektrische Kaffeemühle', 'moulin à café électrique', 'elektrische koffiemolen', 'macinacaffè elettrico'],
  ['磨豆機|咖啡磨', 'coffee grinder|grinder', 'Kaffeemühle', 'moulin à café', 'koffiemolen', 'macinacaffè'],
  ['意式咖啡機|特濃咖啡機', 'espresso machine', 'Espressomaschine', 'machine à expresso', 'espressomachine', 'macchina per espresso'],
  ['咖啡機', 'coffee machine', 'Kaffeemaschine', 'machine à café', 'koffiezetapparaat', 'macchina da caffè'],
  ['咖啡豆', 'coffee beans', 'Kaffeebohnen', 'café en grains', 'koffiebonen', 'caffè in grani'],
  ['咖啡膠囊', 'coffee capsules|coffee pods', 'Kaffeekapseln', 'capsules de café', 'koffiecups', 'capsule caffè'],
  ['手沖壺', 'pour over kettle|gooseneck kettle', 'Schwanenhals Wasserkocher', 'bouilloire col de cygne', 'waterkoker zwanenhals', 'bollitore collo di cigno'],
  ['濾杯', 'coffee dripper|dripper', 'Kaffeefilter Handfilter', 'porte-filtre café', 'koffiefilterhouder', 'filtro caffè'],
  ['濾紙', 'coffee filter paper|coffee filters', 'Kaffeefilterpapier', 'filtres à café', 'koffiefilters', 'filtri caffè'],
  ['咖啡秤', 'coffee scale', 'Kaffeewaage', 'balance à café', 'koffieweegschaal', 'bilancia caffè'],
  ['奶泡機|打奶器', 'milk frother', 'Milchaufschäumer', 'mousseur à lait', 'melkopschuimer', 'montalatte'],
  ['法壓壺', 'french press|cafetiere', 'French Press', 'cafetière à piston', 'cafetière', 'caffettiera a pistone'],
  ['摩卡壺', 'moka pot', 'Espressokocher', 'cafetière italienne', 'percolator', 'moka'],
  ['咖啡', 'coffee', 'Kaffee', 'café', 'koffie', 'caffè'],
  // household & personal care
  ['洗衣珠|洗衣膠囊', 'laundry pods|laundry capsules', 'Waschmittel Pods', 'capsules de lessive', 'wasmiddel capsules', 'capsule detersivo'],
  ['洗衣液|洗衣粉', 'laundry detergent', 'Waschmittel', 'lessive', 'wasmiddel', 'detersivo bucato'],
  ['洗潔精', 'washing up liquid|dish soap', 'Spülmittel', 'liquide vaisselle', 'afwasmiddel', 'detersivo piatti'],
  ['洗碗機洗滌塊|洗碗粒', 'dishwasher tablets', 'Spülmaschinentabs', 'tablettes lave-vaisselle', 'vaatwastabletten', 'pastiglie lavastoviglie'],
  ['廁紙|衛生紙', 'toilet paper|toilet roll', 'Toilettenpapier', 'papier toilette', 'toiletpapier', 'carta igienica'],
  ['廚房紙', 'kitchen roll|paper towels', 'Küchenrolle', 'essuie-tout', 'keukenrol', 'carta da cucina'],
  ['紙巾', 'tissues', 'Taschentücher', 'mouchoirs', 'tissues', 'fazzoletti'],
  ['毛巾', 'towel', 'Handtuch', 'serviette', 'handdoek', 'asciugamano'],
  ['床單', 'bed sheet', 'Bettlaken', 'drap', 'laken', 'lenzuolo'],
  ['枕頭', 'pillow', 'Kopfkissen', 'oreiller', 'hoofdkussen', 'cuscino'],
  ['羽絨被', 'duvet', 'Bettdecke', 'couette', 'dekbed', 'piumone'],
  ['吸塵機', 'vacuum cleaner|hoover', 'Staubsauger', 'aspirateur', 'stofzuiger', 'aspirapolvere'],
  ['空氣清新機', 'air purifier', 'Luftreiniger', "purificateur d'air", 'luchtreiniger', "purificatore d'aria"],
  ['抽濕機', 'dehumidifier', 'Luftentfeuchter', 'déshumidificateur', 'luchtontvochtiger', 'deumidificatore'],
  ['風筒', 'hair dryer|hairdryer', 'Haartrockner', 'sèche-cheveux', 'haardroger', 'asciugacapelli'],
  ['電飯煲', 'rice cooker', 'Reiskocher', 'cuiseur à riz', 'rijstkoker', 'cuociriso'],
  ['氣炸鍋', 'air fryer', 'Heißluftfritteuse', 'friteuse sans huile', 'airfryer', 'friggitrice ad aria'],
  ['電熱水煲|熱水煲', 'electric kettle|kettle', 'Wasserkocher', 'bouilloire électrique', 'waterkoker', 'bollitore elettrico'],
  ['平底鑊|煎鍋', 'frying pan', 'Bratpfanne', 'poêle', 'koekenpan', 'padella'],
  ['菜刀', 'kitchen knife', 'Küchenmesser', 'couteau de cuisine', 'keukenmes', 'coltello da cucina'],
  ['洗頭水|洗髮水', 'shampoo', 'Shampoo', 'shampooing', 'shampoo', 'shampoo'],
  ['護髮素', 'conditioner', 'Spülung', 'après-shampooing', 'conditioner', 'balsamo'],
  ['沐浴露', 'shower gel|body wash', 'Duschgel', 'gel douche', 'douchegel', 'bagnoschiuma'],
  ['電動牙刷', 'electric toothbrush', 'elektrische Zahnbürste', 'brosse à dents électrique', 'elektrische tandenborstel', 'spazzolino elettrico'],
  ['牙刷', 'toothbrush', 'Zahnbürste', 'brosse à dents', 'tandenborstel', 'spazzolino'],
  ['牙膏', 'toothpaste', 'Zahnpasta', 'dentifrice', 'tandpasta', 'dentifricio'],
  ['防曬', 'sunscreen|sun cream', 'Sonnencreme', 'crème solaire', 'zonnebrand', 'crema solare'],
  ['尿片', 'nappies|diapers', 'Windeln', 'couches', 'luiers', 'pannolini'],
  // groceries
  ['燕麥奶', 'oat milk', 'Haferdrink', "lait d'avoine", 'havermelk', "latte d'avena"],
  ['豆奶|豆漿', 'soy milk', 'Sojamilch', 'lait de soja', 'sojamelk', 'latte di soia'],
  ['牛奶', 'milk', 'Milch', 'lait', 'melk', 'latte'],
  ['雞蛋', 'eggs', 'Eier', 'œufs', 'eieren', 'uova'],
  ['麵包', 'bread', 'Brot', 'pain', 'brood', 'pane'],
  ['白米|大米', 'rice', 'Reis', 'riz', 'rijst', 'riso'],
  ['意粉', 'pasta|spaghetti', 'Nudeln', 'pâtes', 'pasta', 'pasta'],
  ['即食麵|公仔麵', 'instant noodles', 'Instantnudeln', 'nouilles instantanées', 'instant noedels', 'noodles istantanei'],
  ['朱古力|巧克力', 'chocolate', 'Schokolade', 'chocolat', 'chocolade', 'cioccolato'],
  ['餅乾', 'biscuits|cookies', 'Kekse', 'biscuits', 'koekjes', 'biscotti'],
  ['茶葉|茶包', 'tea', 'Tee', 'thé', 'thee', 'tè'],
  ['橄欖油', 'olive oil', 'Olivenöl', "huile d'olive", 'olijfolie', "olio d'oliva"],
  ['芝士', 'cheese', 'Käse', 'fromage', 'kaas', 'formaggio'],
  ['牛油', 'butter', 'Butter', 'beurre', 'boter', 'burro'],
  ['乳酪', 'yogurt|yoghurt', 'Joghurt', 'yaourt', 'yoghurt', 'yogurt'],
  ['礦泉水', 'mineral water', 'Mineralwasser', 'eau minérale', 'mineraalwater', 'acqua minerale'],
  ['紅酒', 'red wine', 'Rotwein', 'vin rouge', 'rode wijn', 'vino rosso'],
  ['白酒', 'white wine', 'Weißwein', 'vin blanc', 'witte wijn', 'vino bianco'],
  ['啤酒', 'beer', 'Bier', 'bière', 'bier', 'birra'],
  ['橙汁', 'orange juice', 'Orangensaft', "jus d'orange", 'sinaasappelsap', "succo d'arancia"],
  ['蘋果汁', 'apple juice', 'Apfelsaft', 'jus de pomme', 'appelsap', 'succo di mela'],
  ['果汁', 'juice', 'Saft', 'jus', 'sap', 'succo'],
  ['汽水', 'soft drink|fizzy drink', 'Limonade', 'soda', 'frisdrank', 'bibita'],
  ['咖啡粉', 'ground coffee', 'gemahlener Kaffee', 'café moulu', 'gemalen koffie', 'caffè macinato'],
  ['糖', 'sugar', 'Zucker', 'sucre', 'suiker', 'zucchero'],
  ['鹽', 'salt', 'Salz', 'sel', 'zout', 'sale'],
  ['麵粉', 'flour', 'Mehl', 'farine', 'bloem', 'farina'],
  ['蜜糖|蜂蜜', 'honey', 'Honig', 'miel', 'honing', 'miele'],
  ['果醬', 'jam', 'Marmelade', 'confiture', 'jam', 'marmellata'],
  ['花生醬', 'peanut butter', 'Erdnussbutter', 'beurre de cacahuète', 'pindakaas', 'burro di arachidi'],
  ['粟米片|早餐穀物', 'cornflakes|cereal', 'Cornflakes', 'corn flakes', 'cornflakes', 'corn flakes'],
  ['薯片', 'crisps|chips', 'Chips', 'chips', 'chips', 'patatine'],
  ['雪糕', 'ice cream', 'Eis', 'glace', 'ijs', 'gelato'],
  ['雞胸', 'chicken breast', 'Hühnerbrust', 'blanc de poulet', 'kipfilet', 'petto di pollo'],
  ['雞肉|雞', 'chicken', 'Hähnchen', 'poulet', 'kip', 'pollo'],
  ['豬肉', 'pork', 'Schweinefleisch', 'porc', 'varkensvlees', 'maiale'],
  ['牛肉', 'beef', 'Rindfleisch', 'bœuf', 'rundvlees', 'manzo'],
  ['三文魚', 'salmon', 'Lachs', 'saumon', 'zalm', 'salmone'],
  ['香蕉', 'bananas', 'Bananen', 'bananes', 'bananen', 'banane'],
  ['橙', 'oranges', 'Orangen', 'oranges', 'sinaasappels', 'arance'],
  ['番茄|蕃茄', 'tomatoes', 'Tomaten', 'tomates', 'tomaten', 'pomodori'],
  ['薯仔|馬鈴薯', 'potatoes', 'Kartoffeln', 'pommes de terre', 'aardappelen', 'patate'],
  ['洋蔥', 'onions', 'Zwiebeln', 'oignons', 'uien', 'cipolle'],
  // electronics
  ['無線耳機|藍牙耳機', 'wireless earbuds', 'kabellose Kopfhörer', 'écouteurs sans fil', 'draadloze oordopjes', 'auricolari wireless'],
  ['耳機', 'headphones', 'Kopfhörer', 'casque audio', 'koptelefoon', 'cuffie'],
  ['手機', 'smartphone|mobile phone', 'Smartphone', 'smartphone', 'smartphone', 'smartphone'],
  ['平板電腦', 'tablet', 'Tablet', 'tablette', 'tablet', 'tablet'],
  ['手提電腦|筆記本電腦', 'laptop', 'Laptop', 'ordinateur portable', 'laptop', 'portatile'],
  ['電視', 'tv|television', 'Fernseher', 'téléviseur', 'televisie', 'televisore'],
  ['相機', 'camera', 'Kamera', 'appareil photo', 'camera', 'fotocamera'],
  ['尿袋|充電寶|行動電源', 'power bank', 'Powerbank', 'batterie externe', 'powerbank', 'power bank'],
  ['充電器|叉電器', 'charger', 'Ladegerät', 'chargeur', 'oplader', 'caricabatterie'],
  ['喇叭|音箱', 'speaker', 'Lautsprecher', 'enceinte', 'speaker', 'altoparlante'],
  ['顯示屏|電腦螢幕', 'monitor', 'Monitor', 'écran', 'monitor', 'monitor'],
  ['遊戲機', 'game console', 'Spielkonsole', 'console de jeux', 'spelcomputer', 'console'],
  ['智能手錶', 'smartwatch', 'Smartwatch', 'montre connectée', 'smartwatch', 'smartwatch'],
  // other
  ['行李箱|喼', 'suitcase', 'Koffer', 'valise', 'koffer', 'valigia'],
  ['背囊|背包', 'backpack|rucksack', 'Rucksack', 'sac à dos', 'rugzak', 'zaino'],
  ['波鞋|運動鞋', 'trainers|sneakers', 'Sneaker', 'baskets', 'sneakers', 'scarpe da ginnastica'],
  ['外套', 'jacket', 'Jacke', 'veste', 'jas', 'giacca'],
  ['太陽眼鏡', 'sunglasses', 'Sonnenbrille', 'lunettes de soleil', 'zonnebril', 'occhiali da sole'],
  ['手錶', 'watch', 'Uhr', 'montre', 'horloge', 'orologio'],
  ['玩具', 'toys', 'Spielzeug', 'jouets', 'speelgoed', 'giocattoli'],
  // cities (hotel search)
  ['倫敦', 'London', 'London', 'Londres', 'Londen', 'Londra'],
  ['巴黎', 'Paris', 'Paris', 'Paris', 'Parijs', 'Parigi'],
  ['曼徹斯特|曼城', 'Manchester', 'Manchester', 'Manchester', 'Manchester', 'Manchester'],
  ['愛丁堡', 'Edinburgh', 'Edinburgh', 'Édimbourg', 'Edinburgh', 'Edimburgo'],
  ['利物浦', 'Liverpool', 'Liverpool', 'Liverpool', 'Liverpool', 'Liverpool'],
  ['伯明翰', 'Birmingham', 'Birmingham', 'Birmingham', 'Birmingham', 'Birmingham'],
  ['牛津', 'Oxford', 'Oxford', 'Oxford', 'Oxford', 'Oxford'],
  ['劍橋', 'Cambridge', 'Cambridge', 'Cambridge', 'Cambridge', 'Cambridge'],
  ['柏林', 'Berlin', 'Berlin', 'Berlin', 'Berlijn', 'Berlino'],
  ['慕尼黑', 'Munich', 'München', 'Munich', 'München', 'Monaco di Baviera'],
  ['法蘭克福', 'Frankfurt', 'Frankfurt', 'Francfort', 'Frankfurt', 'Francoforte'],
  ['羅馬', 'Rome', 'Rom', 'Rome', 'Rome', 'Roma'],
  ['米蘭', 'Milan', 'Mailand', 'Milan', 'Milaan', 'Milano'],
  ['威尼斯', 'Venice', 'Venedig', 'Venise', 'Venetië', 'Venezia'],
  ['佛羅倫斯|翡冷翠', 'Florence', 'Florenz', 'Florence', 'Florence', 'Firenze'],
  ['巴塞隆拿|巴塞羅那', 'Barcelona', 'Barcelona', 'Barcelone', 'Barcelona', 'Barcellona'],
  ['馬德里', 'Madrid', 'Madrid', 'Madrid', 'Madrid', 'Madrid'],
  ['阿姆斯特丹', 'Amsterdam', 'Amsterdam', 'Amsterdam', 'Amsterdam', 'Amsterdam'],
  ['布魯塞爾', 'Brussels', 'Brüssel', 'Bruxelles', 'Brussel', 'Bruxelles'],
  ['維也納', 'Vienna', 'Wien', 'Vienne', 'Wenen', 'Vienna'],
  ['蘇黎世', 'Zurich', 'Zürich', 'Zurich', 'Zürich', 'Zurigo'],
  ['布拉格', 'Prague', 'Prag', 'Prague', 'Praag', 'Praga'],
  ['里斯本', 'Lisbon', 'Lissabon', 'Lisbonne', 'Lissabon', 'Lisbona'],
  ['都柏林', 'Dublin', 'Dublin', 'Dublin', 'Dublin', 'Dublino'],
  ['香港', 'Hong Kong', 'Hongkong', 'Hong Kong', 'Hongkong', 'Hong Kong'],
];

const ENTRIES = G.map((row) => Object.fromEntries(LANGS.map((l, i) => [l, row[i].split('|')])));

const hasCjk = (s) => /[㐀-鿿豈-﫿]/.test(s);
export const detectLang = (s) => (hasCjk(s) ? 'zh' : 'en');

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// ---- glossary ----

// Every (form, entry) pair for a source language, longest first so "手搖磨豆機" beats "磨豆機".
const formsFor = (src) =>
  ENTRIES.flatMap((e) => e[src].map((form) => ({ form, e }))).sort((a, b) => b.form.length - a.form.length);
const FORMS = Object.fromEntries(['zh', 'en'].map((l) => [l, formsFor(l)]));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Glossary matches inside one piece of text (longest forms first).
function matchGlossary(text, src) {
  let pieces = [{ text }];
  for (const { form, e } of FORMS[src]) {
    // English needs whole-word matches; no lookbehind so older iPhones (iOS < 16.4) still work.
    const re = src === 'zh' ? new RegExp(`()(${escapeRe(form)})`, 'g') : new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(form)})(?=$|[^\\p{L}\\p{N}])`, 'giu');
    pieces = pieces.flatMap((p) => {
      if (p.entry) return [p];
      const out = [];
      let last = 0;
      for (const m of p.text.matchAll(re)) {
        const start = m.index + m[1].length;
        if (start > last) out.push({ text: p.text.slice(last, start) });
        out.push({ text: m[2], entry: e });
        last = start + m[2].length;
      }
      if (last < p.text.length) out.push({ text: p.text.slice(last) });
      return out;
    });
  }
  return pieces;
}

/**
 * Split text into pieces: glossary hits, kept words (brands, models, sizes) and
 * Chinese phrases that still need machine translation.
 * @returns [{ text, entry?, keep? }]
 */
function segment(text, src) {
  if (src !== 'zh') {
    // English input is never machine-translated: glossary words or kept as typed.
    return matchGlossary(text, src).map((p) => (p.entry ? p : { text: p.text, keep: true }));
  }
  // Chinese input: Latin words are kept; each Chinese phrase is either fully covered
  // by the glossary or sent whole to machine translation (so 有機牛奶 → "organic milk").
  return text.split(/([\u3400-\u9fff\uf900-\ufaff]+)/).filter((s) => s).flatMap((run) => {
    if (!hasCjk(run)) return [{ text: run, keep: true }];
    const pieces = matchGlossary(run, 'zh');
    return pieces.every((p) => p.entry) ? pieces : [{ text: run }];
  });
}

const join = (parts) => clean(parts.join(' ').replace(/\s+([,.;:!?])/g, '$1'));

/** Glossary-only translation; null if some Chinese words need machine translation. */
export function glossaryTranslate(text, src, dst) {
  if (src === dst) return clean(text);
  const pieces = segment(text, src);
  if (pieces.some((p) => !p.entry && !p.keep)) return null;
  return join(pieces.map((p) => (p.entry ? p.entry[dst][0] : p.text)));
}

// ---- machine translation (MyMemory) ----

const CACHE_KEY = 'pricebook:tr';
const MAX_CACHE = 400;
let cache = null;

function loadCache() {
  if (cache) return cache;
  try { cache = JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY) || '{}'); } catch { cache = {}; }
  return cache;
}
function saveCache() {
  try {
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHE) for (const k of keys.slice(0, keys.length - MAX_CACHE)) delete cache[k];
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage full: keep in memory */ }
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

const mtKey = (text, src, dst) => `${src}|${dst}|${text}`;

async function machineTranslate(text, src, dst, fetchImpl) {
  const key = mtKey(text, src, dst);
  const c = loadCache();
  if (c[key]) return c[key];
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${MT_CODE[src]}|${MT_CODE[dst]}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const out = clean(decodeEntities(j?.responseData?.translatedText || '')).replace(/^["'“”]+|["'“”.。]+$/g, '');
  if (Number(j?.responseStatus) !== 200 || !out || /MYMEMORY WARNING|QUERY LENGTH|INVALID/i.test(out)) {
    throw new Error(j?.responseDetails || 'translation unavailable');
  }
  c[key] = out;
  saveCache();
  return out;
}

/** Translation from the glossary or the cache only (no network); null when not known yet. */
export function translateSync(text, src, dst) {
  const t = clean(text);
  if (!t || src === dst) return t;
  const g = glossaryTranslate(t, src, dst);
  if (g !== null) return g;
  const c = loadCache();
  const pieces = segment(t, src);
  const parts = [];
  for (const p of pieces) {
    if (p.entry) parts.push(p.entry[dst][0]);
    else if (p.keep) parts.push(p.text);
    else if (c[mtKey(p.text, src, dst)]) parts.push(c[mtKey(p.text, src, dst)]);
    else return null;
  }
  return join(parts);
}

/**
 * Full translation: glossary first, MyMemory for leftover Chinese words.
 * On failure the leftover words stay in the original language (ok=false).
 * @returns {Promise<{text:string, ok:boolean}>}
 */
export async function translate(text, src, dst, fetchImpl = globalThis.fetch) {
  const t = clean(text);
  if (!t || src === dst) return { text: t, ok: true };
  let ok = true;
  const parts = [];
  for (const p of segment(t, src)) {
    if (p.entry) parts.push(p.entry[dst][0]);
    else if (p.keep) parts.push(p.text);
    else {
      try {
        parts.push(await machineTranslate(p.text, src, dst, fetchImpl));
      } catch {
        ok = false;
        parts.push(p.text);
      }
    }
  }
  return { text: join(parts), ok };
}

/** A glossary term in a language, for sample searches (e.g. the link tester). */
export function sampleTerm(zh, lang) {
  const e = ENTRIES.find((x) => x.zh.includes(zh));
  return e ? e[lang][0] : zh;
}
