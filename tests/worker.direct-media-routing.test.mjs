import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker.js';

function createKvStore(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    async get(key, options = {}) {
      const value = store.has(key) ? store.get(key) : null;
      if (value === null || value === undefined) return null;
      if (options?.type === 'json') {
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
    async put(key, value) {
      store.set(key, typeof value === 'string' ? value : String(value));
    },
    async delete(key) {
      store.delete(key);
    },
    async list() {
      return { keys: [], list_complete: true };
    }
  };
}

function createEnv(config = {}) {
  return {
    KV: createKvStore({
      'node:demo': JSON.stringify({
        target: 'https://upstream.example.com',
        lines: [
          { id: 'line-1', name: 'Line 1', target: 'https://upstream.example.com' }
        ],
        activeLineId: 'line-1',
        mediaAuthMode: 'auto',
        realClientIpMode: 'smart'
      }),
      'sys:nodes_index:v1': JSON.stringify(['demo']),
      'sys:theme': JSON.stringify(config)
    }),
    ADMIN_PATH: '/admin',
    ADMIN_PASS: 'test-pass',
    JWT_SECRET: 'test-secret',
    __CONFIG_CACHE_NAMESPACE: `direct-media-routing-${Date.now()}-${Math.random()}`
  };
}

test('safe media auth is appended to direct manifest redirects', async () => {
  const env = createEnv({ directHlsDash: true });
  const ctx = { waitUntil() {} };
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    calls.push(request.url);
    throw new Error(`unexpected upstream fetch: ${request.url}`);
  };

  try {
    const response = await worker.fetch(new Request('https://proxy.example.com/demo/emby/Videos/1/master.m3u8', {
      headers: {
        Authorization: 'MediaBrowser Token="abc123", DeviceId="dev-1"',
        'X-Emby-Device-Id': 'dev-1'
      }
    }), env, ctx);

    assert.equal(response.status, 307);
    assert.deepEqual(calls, []);
    const location = new URL(response.headers.get('Location'));
    assert.equal(location.origin, 'https://upstream.example.com');
    assert.equal(location.pathname, '/emby/Videos/1/master.m3u8');
    assert.equal(location.searchParams.get('api_key'), 'abc123');
    assert.equal(location.searchParams.get('DeviceId'), 'dev-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('manifest direct mode falls back to proxy when request carries cookies or private auth headers', async () => {
  const env = createEnv({ directHlsDash: true });
  const ctx = { waitUntil() {} };
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    calls.push({
      url: request.url,
      cookie: request.headers.get('Cookie') || '',
      customAuth: request.headers.get('X-Custom-Auth') || ''
    });
    if (request.url === 'https://upstream.example.com/emby/Videos/1/master.m3u8') {
      return new Response('#EXTM3U', {
        status: 200,
        headers: { 'Content-Type': 'application/vnd.apple.mpegurl' }
      });
    }
    throw new Error(`unexpected upstream fetch: ${request.url}`);
  };

  try {
    const response = await worker.fetch(new Request('https://proxy.example.com/demo/emby/Videos/1/master.m3u8', {
      headers: {
        Cookie: 'sid=1',
        'X-Custom-Auth': 'private-secret'
      }
    }), env, ctx);

    assert.equal(response.status, 200);
    assert.equal(await response.text(), '#EXTM3U');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://upstream.example.com/emby/Videos/1/master.m3u8');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
