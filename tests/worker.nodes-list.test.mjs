import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker.js';

function createFakeKvStore() {
  const store = new Map();

  return {
    async get(key, options = {}) {
      if (!store.has(key)) return null;
      const value = store.get(key);
      if (options?.type === 'json') {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      }
      return value;
    },
    async put(key, value) {
      store.set(key, typeof value === 'string' ? value : String(value));
    },
    async delete(key) {
      store.delete(key);
    },
    async list(options = {}) {
      const prefix = String(options?.prefix || '');
      const keys = [];
      for (const key of store.keys()) {
        if (!prefix || key.startsWith(prefix)) keys.push({ name: key });
      }
      return { keys };
    },
    dump() {
      return Object.fromEntries(store.entries());
    }
  };
}

async function loginAndGetCookie(env) {
  const response = await worker.fetch(
    new Request('https://example.com/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: env.ADMIN_PASS })
    }),
    env,
    { waitUntil() {} }
  );

  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie, 'expected auth cookie');
  return cookie;
}

test('list action deduplicates dirty node index entries before returning nodes', async () => {
  const kv = createFakeKvStore();
  const now = new Date().toISOString();

  await kv.put('node:demo', JSON.stringify({
    target: 'https://upstream.example.com',
    lines: [{ id: 'line-1', name: '线路1', target: 'https://upstream.example.com', latencyMs: 111, latencyUpdatedAt: now }],
    activeLineId: 'line-1',
    displayName: 'demo',
    name: 'demo',
    tag: 'T',
    tagColor: 'amber',
    remark: '',
    mediaAuthMode: 'auto',
    realClientIpMode: 'smart',
    headers: {},
    schemaVersion: 3,
    createdAt: now,
    updatedAt: now
  }));
  await kv.put('sys:nodes_index:v1', JSON.stringify(['demo', 'demo', 'DEMO']));

  const env = {
    KV: kv,
    ADMIN_PATH: '/admin',
    ADMIN_PASS: 'test-pass',
    JWT_SECRET: 'test-secret',
    __CONFIG_CACHE_NAMESPACE: `nodes-list-${Date.now()}-${Math.random()}`
  };

  const cookie = await loginAndGetCookie(env);
  const response = await worker.fetch(
    new Request('https://example.com/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie
      },
      body: JSON.stringify({ action: 'list' })
    }),
    env,
    { waitUntil() {} }
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(Array.isArray(payload.nodes), true);
  assert.equal(payload.nodes.length, 1);
  assert.equal(payload.nodes[0].name, 'demo');

  const repairedIndex = JSON.parse(kv.dump()['sys:nodes_index:v1']);
  assert.deepEqual(repairedIndex, ['demo']);
});
