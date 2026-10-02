import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeData, syncGist, GIST_FILE } from '../js/sync.js';

test('merge keeps newer records and unions the rest', () => {
  const local = {
    settings: { base: 'HKD', updatedAt: 5 },
    siteState: { amazon: { enabled: false, updatedAt: 10 } },
    customSites: [],
    items: [{ id: 'i1', name: 'Grinder', updatedAt: 10, quotes: [{ id: 'q1', price: 1, updatedAt: 10 }] }],
  };
  const remote = {
    settings: { base: 'GBP', updatedAt: 9 },
    siteState: { amazon: { enabled: true, updatedAt: 3 }, tesco: { enabled: false, updatedAt: 4 } },
    customSites: [{ id: 'c1', name: 'Mine', updatedAt: 1 }],
    items: [
      { id: 'i1', name: 'Grinder X', updatedAt: 20, quotes: [{ id: 'q2', price: 2, updatedAt: 15 }] },
      { id: 'i2', name: 'Hotel', updatedAt: 1, quotes: [] },
    ],
  };
  const m = mergeData(local, remote);
  assert.equal(m.settings.base, 'GBP');
  assert.equal(m.siteState.amazon.enabled, false);
  assert.equal(m.siteState.tesco.enabled, false);
  assert.equal(m.customSites.length, 1);
  const i1 = m.items.find((i) => i.id === 'i1');
  assert.equal(i1.name, 'Grinder X');
  assert.deepEqual(i1.quotes.map((q) => q.id).sort(), ['q1', 'q2']);
  assert.equal(m.items.length, 2);
});

test('tombstones win when newer', () => {
  const a = { items: [{ id: 'x', name: 'A', updatedAt: 1, quotes: [] }] };
  const b = { items: [{ id: 'x', name: 'A', deleted: true, updatedAt: 2, quotes: [] }] };
  assert.equal(mergeData(a, b).items[0].deleted, true);
});

function fakeGitHub(initial) {
  const gists = new Map(initial ? [['g1', initial]] : []);
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push(`${method} ${url.replace('https://api.github.com', '')}`);
    const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
    if (url.includes('/gists?')) return json([...gists.keys()].map((id) => ({ id, files: { [GIST_FILE]: {} } })));
    if (method === 'POST') { gists.set('new', JSON.parse(JSON.parse(opts.body).files[GIST_FILE].content)); return json({ id: 'new' }, 201); }
    const id = url.split('/').pop();
    if (!gists.has(id)) return json({}, 404);
    if (method === 'PATCH') { gists.set(id, JSON.parse(JSON.parse(opts.body).files[GIST_FILE].content)); return json({}); }
    return json({ files: { [GIST_FILE]: { content: JSON.stringify(gists.get(id)) } } });
  };
  return { fetchImpl, calls, gists };
}

test('syncGist creates a gist when none exists', async () => {
  const gh = fakeGitHub(null);
  const local = { items: [{ id: 'a', updatedAt: 1, quotes: [] }] };
  const r = await syncGist('tok', null, local, gh.fetchImpl);
  assert.equal(r.gistId, 'new');
  assert.equal(gh.gists.get('new').items[0].id, 'a');
});

test('syncGist finds, merges and writes back', async () => {
  const gh = fakeGitHub({ items: [{ id: 'remote', updatedAt: 1, quotes: [] }] });
  const r = await syncGist('tok', null, { items: [{ id: 'local', updatedAt: 1, quotes: [] }] }, gh.fetchImpl);
  assert.equal(r.gistId, 'g1');
  assert.deepEqual(gh.gists.get('g1').items.map((i) => i.id).sort(), ['local', 'remote']);
  assert.ok(gh.calls.some((c) => c.startsWith('PATCH')));
});

test('syncGist recovers when the remembered gist was deleted', async () => {
  const gh = fakeGitHub(null);
  const r = await syncGist('tok', 'gone', { items: [] }, gh.fetchImpl);
  assert.equal(r.gistId, 'new');
});

test('bad token surfaces the HTTP status', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(syncGist('bad', null, {}, fetchImpl), (e) => e.status === 401);
});
