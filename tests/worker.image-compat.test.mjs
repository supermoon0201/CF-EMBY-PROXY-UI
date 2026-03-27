import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker.js';

function createKvStore(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    async get(key, options = {}) {
      const value = store.has(key) ? store.get(key) : null;
      if (value === null || value === undefined) return null;
      if (options.type === 'json') {
        if (typeof value === 'string') return JSON.parse(value);
        return value;
      }
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
    async list() {
      return { keys: [], list_complete: true };
    }
  };
}

test('retries image requests with compatibility headers after upstream 403', async (t) => {
  const env = {
    KV: createKvStore({
      'node:demo': JSON.stringify({
        target: 'https://upstream.example.com'
      })
    }),
    __CONFIG_CACHE_NAMESPACE: `image-compat-${Date.now()}`,
    ADMIN_PASS: 'test-pass',
    JWT_SECRET: 'test-secret'
  };
  const ctx = { waitUntil() {} };
  const calls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    calls.push({ url, headers });

    if (url === 'https://upstream.example.com/emby/Items/123/Images/Primary?tag=abc') {
      const referer = headers.get('Referer');
      const accept = headers.get('Accept') || '';
      const acceptEncoding = headers.get('Accept-Encoding') || '';
      const recovered = !referer && accept.includes('image/') && acceptEncoding === 'identity';
      if (recovered) {
        return new Response('ok-image', {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' }
        });
      }
      return new Response('blocked', {
        status: 403,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    throw new Error(`unexpected fetch url: ${url}`);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request(
    'https://proxy.example.com/demo/emby/Items/123/Images/Primary?tag=abc',
    {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: 'https://proxy.example.com/web/index.html',
        'User-Agent': 'Mozilla/5.0'
      }
    }
  );

  const response = await worker.fetch(request, env, ctx);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok-image');
  assert.ok(calls.length >= 2, 'expected a compatibility retry for image requests');
  assert.equal(calls.at(-1).headers.get('Referer'), null);
  assert.match(calls.at(-1).headers.get('Accept') || '', /image\//);
  assert.equal(calls.at(-1).headers.get('Accept-Encoding'), 'identity');
});

test('retries image requests with browser-like image headers when upstream requires them', async (t) => {
  const env = {
    KV: createKvStore({
      'node:demo': JSON.stringify({
        target: 'https://upstream.example.com'
      })
    }),
    __CONFIG_CACHE_NAMESPACE: `image-browserish-${Date.now()}`,
    ADMIN_PASS: 'test-pass',
    JWT_SECRET: 'test-secret'
  };
  const ctx = { waitUntil() {} };
  const calls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    calls.push({ url, headers });

    if (url === 'https://upstream.example.com/emby/Items/456/Images/Backdrop?tag=def') {
      const referer = headers.get('Referer');
      const accept = headers.get('Accept') || '';
      const userAgent = headers.get('User-Agent') || '';
      const acceptEncoding = headers.get('Accept-Encoding') || '';
      const recovered = !referer
        && /image\//.test(accept)
        && /Mozilla\/5\.0/.test(userAgent)
        && acceptEncoding === 'identity';
      if (recovered) {
        return new Response('browserish-image', {
          status: 200,
          headers: { 'Content-Type': 'image/webp' }
        });
      }
      return new Response('blocked', {
        status: 403,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    throw new Error(`unexpected fetch url: ${url}`);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request(
    'https://proxy.example.com/demo/emby/Items/456/Images/Backdrop?tag=def',
    {
      headers: {
        Accept: '*/*',
        Referer: 'https://proxy.example.com/web/index.html',
        'User-Agent': 'EmbyTheater/1.0'
      }
    }
  );

  const response = await worker.fetch(request, env, ctx);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'browserish-image');
  assert.ok(calls.length >= 2, 'expected a browser-like compatibility retry for image requests');
  assert.match(calls.at(-1).headers.get('Accept') || '', /image\//);
  assert.match(calls.at(-1).headers.get('User-Agent') || '', /Mozilla\/5\.0/);
  assert.equal(calls.at(-1).headers.get('Accept-Encoding'), 'identity');
});
