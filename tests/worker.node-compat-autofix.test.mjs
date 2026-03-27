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
        if (!prefix || key.startsWith(prefix)) {
          keys.push({ name: key });
        }
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
  assert.ok(cookie, 'expected login response to set auth cookie');
  return cookie;
}

test('nodeCompatAutofix rewrites node mode only when a better compat mode passes probes', async () => {
  const kv = createFakeKvStore();
  await kv.put('node:demo', JSON.stringify({
    target: 'https://upstream.example.com',
    lines: [
      { id: 'line-1', name: 'Line 1', target: 'https://upstream.example.com' }
    ],
    activeLineId: 'line-1',
    realClientIpMode: 'smart'
  }));

  const env = {
    KV: kv,
    ADMIN_PATH: '/admin',
    ADMIN_PASS: 'test-pass',
    JWT_SECRET: 'test-secret',
    __CONFIG_CACHE_NAMESPACE: `node-compat-autofix-${Date.now()}-${Math.random()}`
  };

  const cookie = await loginAndGetCookie(env);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    const xForwardedFor = request.headers.get('X-Forwarded-For');
    const xRealIp = request.headers.get('X-Real-IP');
    const mode = xForwardedFor ? 'dual' : (xRealIp ? 'realip_only' : 'off');

    if (url.origin !== 'https://upstream.example.com') {
      throw new Error(`Unexpected fetch origin: ${url.origin}`);
    }

    if (url.pathname === '/System/Info/Public') {
      return new Response(JSON.stringify({ ok: true, mode }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/Items' && url.search === '?Limit=1&StartIndex=0') {
      return new Response(JSON.stringify({ ok: mode === 'off', mode }), {
        status: mode === 'off' ? 200 : 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/Items/Latest' && url.search === '?Limit=1') {
      return new Response(JSON.stringify({ ok: mode === 'off', mode }), {
        status: mode === 'off' ? 200 : 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    throw new Error(`Unexpected fetch target: ${url.pathname}${url.search}`);
  };

  try {
    const response = await worker.fetch(
      new Request('https://example.com/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie
        },
        body: JSON.stringify({ action: 'nodeCompatAutofix', name: 'demo' })
      }),
      env,
      { waitUntil() {} }
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'off');
    assert.equal(payload.changed, true);

    const persistedNode = JSON.parse(kv.dump()['node:demo']);
    assert.equal(persistedNode.realClientIpMode, 'off');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
