// Cloud sync through a private GitHub Gist.
// Merge is last-write-wins per record (items, quotes, sites) using updatedAt;
// deletions are kept as tombstones ({deleted: true}) so they propagate.

const API = 'https://api.github.com';
export const GIST_FILE = 'pricebook-data.json';

const newer = (x, y) => {
  if (!x) return y;
  if (!y) return x;
  return (y.updatedAt || 0) > (x.updatedAt || 0) ? y : x;
};

function mergeById(xs = [], ys = [], deep) {
  const m = new Map();
  for (const x of xs) m.set(x.id, x);
  for (const y of ys) {
    const x = m.get(y.id);
    m.set(y.id, x ? (deep ? deep(x, y) : newer(x, y)) : y);
  }
  return [...m.values()];
}

const mergeItem = (x, y) => ({ ...newer(x, y), quotes: mergeById(x.quotes, y.quotes) });

function mergeMap(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = newer(out[k], v);
  return out;
}

export function mergeData(local = {}, remote = {}) {
  return {
    v: 1,
    settings: newer(local.settings, remote.settings),
    siteState: mergeMap(local.siteState, remote.siteState),
    customSites: mergeById(local.customSites, remote.customSites),
    items: mergeById(local.items, remote.items, mergeItem),
  };
}

export class SyncError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function gh(token, path, opts = {}, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(API + path, {
      ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new SyncError('offline', 0);
  }
  if (!res.ok) throw new SyncError(`GitHub ${res.status}`, res.status);
  return res.json();
}

async function findGist(token, fetchImpl) {
  for (let page = 1; page <= 5; page++) {
    const list = await gh(token, `/gists?per_page=100&page=${page}`, {}, fetchImpl);
    const hit = list.find((g) => g.files && g.files[GIST_FILE]);
    if (hit) return hit.id;
    if (list.length < 100) return null;
  }
  return null;
}

async function readGist(token, id, fetchImpl) {
  const g = await gh(token, `/gists/${id}`, {}, fetchImpl);
  const f = g.files?.[GIST_FILE];
  if (!f) return null;
  const content = f.truncated ? await (await fetchImpl(f.raw_url)).text() : f.content;
  return JSON.parse(content);
}

const body = (data) => JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(data) } } });

/**
 * Pull, merge, push. Returns { gistId, merged }.
 * A 404 on a remembered gist id falls back to searching / creating.
 */
export async function syncGist(token, gistId, local, fetchImpl = fetch) {
  let id = gistId;
  let remote = null;
  if (id) {
    try {
      remote = await readGist(token, id, fetchImpl);
    } catch (e) {
      if (e.status !== 404) throw e;
      id = null;
    }
  }
  if (!id) {
    id = await findGist(token, fetchImpl);
    if (id) remote = await readGist(token, id, fetchImpl);
  }
  if (!id) {
    const created = await gh(token, '/gists', {
      method: 'POST',
      body: JSON.stringify({
        description: 'PriceBook 格價簿 — synced data',
        public: false,
        files: { [GIST_FILE]: { content: JSON.stringify(local) } },
      }),
    }, fetchImpl);
    return { gistId: created.id, merged: local };
  }
  const merged = remote ? mergeData(local, remote) : local;
  if (JSON.stringify(merged) !== JSON.stringify(remote)) {
    await gh(token, `/gists/${id}`, { method: 'PATCH', body: body(merged) }, fetchImpl);
  }
  return { gistId: id, merged };
}
