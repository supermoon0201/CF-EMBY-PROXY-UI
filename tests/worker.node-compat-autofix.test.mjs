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

function createEnv(kv, overrides = {}) {
  return {
    KV: kv,
    ADMIN_PATH: '/admin',
    ADMIN_PASS: 'test-pass',
    JWT_SECRET: 'test-secret',
    __CONFIG_CACHE_NAMESPACE: `node-compat-autofix-${Date.now()}-${Math.random()}`,
    ...overrides
  };
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

  const env = createEnv(kv);

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

test('nodeCompatAutofix accepts 401 media probes and bypasses firewall side effects with the current admin IP', async () => {
  const kv = createFakeKvStore();
  await kv.put('node:demo', JSON.stringify({
    target: 'https://upstream.example.com',
    secret: 's3cr3t',
    lines: [
      { id: 'line-1', name: 'Line 1', target: 'https://upstream.example.com' }
    ],
    activeLineId: 'line-1',
    realClientIpMode: 'smart'
  }));
  await kv.put('sys:theme', JSON.stringify({
    ipBlacklist: '203.0.113.9',
    rateLimitRpm: 1
  }));

  const env = createEnv(kv);
  const cookie = await loginAndGetCookie(env);
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    const xForwardedFor = request.headers.get('X-Forwarded-For');
    const xRealIp = request.headers.get('X-Real-IP');
    const mode = xForwardedFor ? 'dual' : (xRealIp ? 'realip_only' : 'off');

    if (url.origin !== 'https://upstream.example.com') {
      throw new Error(`Unexpected fetch origin: ${url.origin}`);
    }

    upstreamCalls.push({
      url: url.toString(),
      mode,
      xRealIp,
      xForwardedFor,
      internalProbeHeader: request.headers.get('X-Internal-Node-Compat-Probe')
    });

    if (url.pathname === '/System/Info/Public') {
      return new Response(JSON.stringify({ ok: true, mode }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/Items' && url.search === '?Limit=1&StartIndex=0') {
      return new Response(JSON.stringify({ ok: mode === 'off', mode }), {
        status: mode === 'off' ? 401 : 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/Items/Latest' && url.search === '?Limit=1') {
      return new Response(JSON.stringify({ ok: false, mode }), {
        status: 403,
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
          Cookie: cookie,
          'CF-Connecting-IP': '203.0.113.9'
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

    const realIpOnlyCalls = upstreamCalls.filter(call => call.mode === 'realip_only');
    const offCalls = upstreamCalls.filter(call => call.mode === 'off');
    assert.ok(realIpOnlyCalls.length >= 2, 'expected realip_only probes to reach upstream before autofix selects off');
    assert.ok(realIpOnlyCalls.every(call => call.xRealIp === '203.0.113.9'));
    assert.ok(realIpOnlyCalls.every(call => call.xForwardedFor === null));
    assert.ok(offCalls.length >= 2, 'expected off-mode probes to reach upstream through the worker route');
    assert.ok(offCalls.every(call => call.xRealIp === null));
    assert.ok(offCalls.every(call => call.xForwardedFor === null));
    assert.ok(upstreamCalls.every(call => call.internalProbeHeader === null));

    const offProbe = payload.tried.find(item => item.mode === 'off');
    assert.equal(offProbe.pass, true);
    assert.equal(offProbe.mediaProbe.status, 401);

    const persistedNode = JSON.parse(kv.dump()['node:demo']);
    assert.equal(persistedNode.realClientIpMode, 'off');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
