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
  assert.equal(glossaryTranslate('有機牛奶', 'zh', 'en'), null);
});

test('machine translation fills the gaps, caches, and never sends brand names', async () => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(decodeURIComponent(url));
    return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'organic milk' } }) };
  };
  const r = await translate('Meiji 有機牛奶', 'zh', 'en', fetchImpl);
  assert.deepEqual(r, { text: 'Meiji organic milk', ok: true });
  assert.equal(asked.length, 1);
  assert.match(asked[0], /q=有機牛奶&langpair=zh-TW\|en/);
  assert.ok(!asked[0].includes('Meiji'));
  // cached now: no second request, and the sync path can use it
  await translate('Meiji 有機牛奶', 'zh', 'en', fetchImpl);
  assert.equal(asked.length, 1);
  assert.equal(translateSync('Meiji 有機牛奶', 'zh', 'en'), 'Meiji organic milk');
});

test('quota or network errors fall back to the original words', async () => {
  const quota = async () => ({ ok: true, json: async () => ({ responseStatus: 429, responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' } }) });
  assert.deepEqual(await translate('Hario 手沖支架', 'zh', 'de', quota), { text: 'Hario 手沖支架', ok: false });
  const down = async () => { throw new Error('offline'); };
  assert.deepEqual(await translate('手沖支架', 'zh', 'fr', down), { text: '手沖支架', ok: false });
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
