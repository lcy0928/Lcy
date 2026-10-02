import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLang, glossaryTranslate, translate, translateSync, decodeEntities, sampleTerm } from '../js/translate.js';

test('detectLang', () => {
  assert.equal(detectLang('手搖磨豆機'), 'zh');
  assert.equal(detectLang('Comandante C40'), 'en');
});

test('glossary prefers the longest term and keeps brand/model words', () => {
  assert.equal(glossaryTranslate('Comandante C40 手搖磨豆機', 'zh', 'en'), 'Comandante C40 manual coffee grinder');
  assert.equal(glossaryTranslate('手搖磨豆機', 'zh', 'de'), 'Handkaffeemühle');
  assert.equal(glossaryTranslate('磨豆機', 'zh', 'fr'), 'moulin à café');
  assert.equal(glossaryTranslate('Ariel 洗衣珠', 'zh', 'nl'), 'Ariel wasmiddel capsules');
  assert.equal(glossaryTranslate('倫敦', 'zh', 'en'), 'London');
});

test('English input: glossary words translated, everything else kept', () => {
  assert.equal(glossaryTranslate('Comandante C40 hand grinder', 'en', 'de'), 'Comandante C40 Handkaffeemühle');
  assert.equal(glossaryTranslate('oat milk', 'en', 'zh'), '燕麥奶');
  assert.equal(glossaryTranslate('Fellow Ode grinder', 'en', 'zh'), 'Fellow Ode 磨豆機');
  // "milk" inside "buttermilk" is not a whole word
  assert.equal(glossaryTranslate('buttermilk', 'en', 'de'), 'buttermilk');
  assert.equal(glossaryTranslate('milk bread', 'en', 'de'), 'Milch Brot');
});

test('unknown Chinese words need machine translation', () => {
  assert.equal(glossaryTranslate('手沖支架', 'zh', 'en'), null);
  // partly covered phrases go to machine translation whole
  assert.equal(glossaryTranslate('鮮奶油', 'zh', 'en'), null);
});

// Fake network: Google answers unless told otherwise; MyMemory as the backup.
function fakeNet({ google = 'ok', mymemory = 'ok', out = 'pour-over stand' } = {}) {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(decodeURIComponent(url));
    if (url.includes('translate.googleapis.com')) {
      if (google === 'down') throw new Error('offline');
      if (google === 'busy') return { ok: false, status: 429, json: async () => ({}) };
      if (google === 'no-yue' && url.includes('sl=yue')) return { ok: false, status: 400, json: async () => ({}) };
      if (google === 'echo') return { ok: true, status: 200, json: async () => [[['手沖支架', '手沖支架']]] };
      return { ok: true, status: 200, json: async () => [[[out, '手沖支架', null, null, 10]], null, 'yue'] };
    }
    if (mymemory === 'quota') return { ok: true, json: async () => ({ responseStatus: 429, responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' } }) };
    if (mymemory === 'down') throw new Error('offline');
    return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: `${out} (mm)` } }) };
  };
  return { asked, fetchImpl };
}

test('Google reads Chinese as Cantonese, fills the gaps, caches, and never sends brand names', async () => {
  const { asked, fetchImpl } = fakeNet();
  const r = await translate('Hario 手沖支架', 'zh', 'en', fetchImpl);
  assert.deepEqual(r, { text: 'Hario pour-over stand', ok: true });
  assert.equal(asked.length, 1);
  assert.match(asked[0], /translate\.googleapis\.com.*sl=yue&tl=en.*q=手沖支架$/);
  assert.ok(!asked[0].includes('Hario'));
  // cached now: no second request, and the sync path can use it
  await translate('Hario 手沖支架', 'zh', 'en', fetchImpl);
  assert.equal(asked.length, 1);
  assert.equal(translateSync('Hario 手沖支架', 'zh', 'en'), 'Hario pour-over stand');
});

test('Cantonese not accepted: Google tries Traditional Chinese next', async () => {
  const { asked, fetchImpl } = fakeNet({ google: 'no-yue', out: 'drip stand' });
  assert.deepEqual(await translate('手沖支架', 'zh', 'nl', fetchImpl), { text: 'drip stand', ok: true });
  assert.match(asked[0], /sl=yue&tl=nl/);
  assert.match(asked[1], /sl=zh-TW&tl=nl/);
});

test('Google unavailable or unhelpful: MyMemory answers instead', async () => {
  const words = { down: '磨豆刷', busy: '咖啡渣盒', echo: '奶泡杯架' };
  for (const google of ['down', 'busy', 'echo']) {
    const { asked, fetchImpl } = fakeNet({ google, out: `stand-${google}` });
    const r = await translate(words[google], 'zh', 'fr', fetchImpl);
    assert.deepEqual(r, { text: `stand-${google} (mm)`, ok: true }, google);
    assert.match(asked.at(-1), /mymemory.*langpair=zh-TW\|fr/);
  }
});

test('both services failing keep the original words', async () => {
  const { fetchImpl } = fakeNet({ google: 'down', mymemory: 'quota' });
  assert.deepEqual(await translate('Hario 手沖支架', 'zh', 'de', fetchImpl), { text: 'Hario 手沖支架', ok: false });
  const off = fakeNet({ google: 'down', mymemory: 'down' });
  assert.deepEqual(await translate('手沖支架', 'zh', 'it', off.fetchImpl), { text: '手沖支架', ok: false });
});

test('your fixes win, for the whole search and inside longer ones', async () => {
  const mine = { '雞翼': { en: 'wings' }, '我嘅特別字': { en: 'my special word' } };
  const memo = (phrase, lang) => mine[phrase]?.[lang];
  const net = async () => { throw new Error('should not fetch'); };
  assert.equal(translateSync('雞翼', 'zh', 'en', memo), 'wings');
  assert.equal(translateSync('Tyson 雞翼', 'zh', 'en', memo), 'Tyson wings');
  assert.equal(translateSync('Tyson 雞翼', 'zh', 'de', memo), 'Tyson Hähnchenflügel', 'other languages unchanged');
  assert.deepEqual(await translate('我嘅特別字', 'zh', 'en', net, memo), { text: 'my special word', ok: true });
});

test('Hong Kong words: fruit, colours, clothes, brands', () => {
  const en = (q) => glossaryTranslate(q, 'zh', 'en');
  assert.equal(en('士多啤梨'), 'strawberries');
  assert.equal(en('車厘子'), 'cherries');
  assert.equal(en('急凍雞翼'), 'frozen chicken wings');
  assert.equal(en('白色T恤'), 'white t-shirt');
  assert.equal(en('男裝 黑色 冷衫'), "men's black jumper");
  assert.equal(en('二手 手搖磨豆機'), 'second hand manual coffee grinder');
  assert.equal(en('蘋果手機'), 'iPhone');
  assert.equal(en('蘋果'), 'apples');
  assert.equal(en('叉電線'), 'charging cable');
  assert.equal(glossaryTranslate('雪櫃', 'zh', 'de'), 'Kühlschrank');
  assert.equal(glossaryTranslate('有機牛奶', 'zh', 'nl'), 'biologisch melk');
  // English brand phrases are not broken up
  assert.equal(glossaryTranslate('Apple Watch', 'en', 'de'), 'Apple Watch');
  assert.equal(glossaryTranslate('pepper grinder', 'en', 'de'), 'Pfeffermühle');
  assert.equal(glossaryTranslate('iPhone 15', 'en', 'zh'), 'iPhone 15');
});

test('English input never calls the network', async () => {
  const fetchImpl = async () => { throw new Error('should not fetch'); };
  assert.deepEqual(await translate('Comandante C40', 'en', 'de', fetchImpl), { text: 'Comandante C40', ok: true });
});

test('decodeEntities and sampleTerm', () => {
  assert.equal(decodeEntities('moulin &agrave; caf&#233; &amp; co'), 'moulin &agrave; café & co');
  assert.equal(sampleTerm('磨豆機', 'de'), 'Kaffeemühle');
  assert.equal(sampleTerm('牛奶', 'nl'), 'melk');
});

test('supermarket words: orange juice in every language', () => {
  assert.equal(glossaryTranslate('橙汁', 'zh', 'en'), 'orange juice');
  assert.equal(glossaryTranslate('橙汁', 'zh', 'nl'), 'sinaasappelsap');
  assert.equal(glossaryTranslate('橙汁', 'zh', 'de'), 'Orangensaft');
  assert.equal(glossaryTranslate('orange juice', 'en', 'de'), 'Orangensaft');
  assert.equal(glossaryTranslate('orange juice', 'en', 'zh'), '橙汁');
  assert.equal(glossaryTranslate('Tropicana 橙汁', 'zh', 'nl'), 'Tropicana sinaasappelsap');
  // "Apple" the brand is not turned into fruit.
  assert.equal(glossaryTranslate('蘋果手機', 'zh', 'en'), 'iPhone');
});
