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

test('multi-line failover rotates cursor and skips recently banned lines on later requests', async (t) => {
  const env = {
    KV: createKvStore({
      'node:demo': JSON.stringify({
        target: 'https://a.example.com',
        lines: [
          { id: 'line-1', name: 'A', target: 'https://a.example.com' },
          { id: 'line-2', name: 'B', target: 'https://b.example.com' },
          { id: 'line-3', name: 'C', target: 'https://c.example.com' }
        ],
        activeLineId: 'line-1'
      })
    }),
    ADMIN_PATH: '/admin',
    ADMIN_PASS: 'test-pass',
    JWT_SECRET: 'test-secret',
    __CONFIG_CACHE_NAMESPACE: `line-failover-${Date.now()}-${Math.random()}`
  };
  const ctx = { waitUntil() {} };
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = request.url;
    calls.push(url);

    if (url === 'https://a.example.com/emby/System/Info/Public') {
      return new Response('a-fail', { status: 503 });
    }
    if (url === 'https://b.example.com/emby/System/Info/Public') {
      return new Response('b-ok', { status: 200 });
    }
    if (url === 'https://c.example.com/emby/System/Info/Public') {
      return new Response('c-ok', { status: 200 });
    }

    throw new Error(`unexpected fetch url: ${url}`);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const first = await worker.fetch(new Request('https://proxy.example.com/demo/emby/System/Info/Public'), env, ctx);
  const second = await worker.fetch(new Request('https://proxy.example.com/demo/emby/System/Info/Public'), env, ctx);
  const third = await worker.fetch(new Request('https://proxy.example.com/demo/emby/System/Info/Public'), env, ctx);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 200);
  assert.deepEqual(calls.slice(0, 2), [
    'https://a.example.com/emby/System/Info/Public',
    'https://b.example.com/emby/System/Info/Public'
  ]);
  assert.equal(calls[2], 'https://c.example.com/emby/System/Info/Public');
  assert.equal(calls[3], 'https://b.example.com/emby/System/Info/Public');
});

test('line cursor does not let prior api requests reroute later image requests onto a different line', async (t) => {
  const env = {
    KV: createKvStore({
      'node:demo-image': JSON.stringify({
        target: 'https://a.example.com',
        lines: [
          { id: 'line-1', name: 'A', target: 'https://a.example.com' },
          { id: 'line-2', name: 'B', target: 'https://b.example.com' }
        ],
        activeLineId: 'line-1'
      })
    }),
    ADMIN_PATH: '/admin',
    ADMIN_PASS: 'test-pass',
    JWT_SECRET: 'test-secret',
    __CONFIG_CACHE_NAMESPACE: `line-failover-image-${Date.now()}-${Math.random()}`
  };
  const ctx = { waitUntil() {} };
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = request.url;
    calls.push(url);

    if (url === 'https://a.example.com/emby/System/Info/Public') {
      return new Response('a-public-ok', { status: 200 });
    }
    if (url === 'https://b.example.com/emby/System/Info/Public') {
      return new Response('b-public-ok', { status: 200 });
    }
    if (url === 'https://a.example.com/emby/Items/123/Images/Primary?tag=abc') {
      return new Response('a-image-ok', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' }
      });
    }
    if (url === 'https://b.example.com/emby/Items/123/Images/Primary?tag=abc') {
      return new Response('b-image-missing', { status: 404 });
    }

    throw new Error(`unexpected fetch url: ${url}`);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const apiResponse = await worker.fetch(new Request('https://proxy.example.com/demo-image/emby/System/Info/Public'), env, ctx);
  const imageResponse = await worker.fetch(new Request('https://proxy.example.com/demo-image/emby/Items/123/Images/Primary?tag=abc'), env, ctx);

  assert.equal(apiResponse.status, 200);
  assert.equal(imageResponse.status, 200);
  assert.equal(await imageResponse.text(), 'a-image-ok');
  assert.deepEqual(calls, [
    'https://a.example.com/emby/System/Info/Public',
    'https://a.example.com/emby/Items/123/Images/Primary?tag=abc'
  ]);
});
