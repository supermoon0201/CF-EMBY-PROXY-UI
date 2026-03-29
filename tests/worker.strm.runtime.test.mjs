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

test('invalid strm files return explicit error text and code', async () => {
  const env = {
    KV: createKvStore({
      'node:demo': JSON.stringify({
        target: 'https://upstream.example.com',
        lines: [{ id: 'line-1', name: 'Line 1', target: 'https://upstream.example.com' }],
        activeLineId: 'line-1'
      }),
      'sys:nodes_index:v1': JSON.stringify(['demo'])
    }),
    ADMIN_PATH: '/admin',
    ADMIN_PASS: 'test-pass',
    JWT_SECRET: 'test-secret',
    __CONFIG_CACHE_NAMESPACE: `strm-runtime-${Date.now()}-${Math.random()}`
  };
  const ctx = { waitUntil() {} };
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    if (request.url === 'https://upstream.example.com/video/test.strm') {
      return new Response('# comment only\nftp://bad.example.com/file', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    throw new Error(`unexpected fetch url: ${request.url}`);
  };

  try {
    const response = await worker.fetch(new Request('https://proxy.example.com/demo/video/test.strm'), env, ctx);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('X-Application-Error-Code'), 'STRM_INVALID_URL');
    assert.match(await response.text(), /STRM 无有效的 http\/https 地址/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
