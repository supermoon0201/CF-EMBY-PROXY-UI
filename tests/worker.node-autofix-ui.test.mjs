import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

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
    }
  };
}

async function startWorkerServer() {
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
  await kv.put('sys:nodes_index:v1', JSON.stringify(['demo']));

  const env = {
    KV: kv,
    ADMIN_PATH: '/admin',
    ADMIN_PASS: 'test-pass',
    JWT_SECRET: 'test-secret',
    __CONFIG_CACHE_NAMESPACE: `node-autofix-ui-${Date.now()}-${Math.random()}`
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    const mode = request.headers.get('X-Forwarded-For')
      ? 'dual'
      : (request.headers.get('X-Real-IP') ? 'realip_only' : 'off');

    if (url.origin === 'https://upstream.example.com') {
      if (url.pathname === '/System/Info/Public') {
        return new Response(JSON.stringify({ ok: true, mode }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.pathname === '/Items' && url.search === '?Limit=1&StartIndex=0') {
        return new Response(JSON.stringify({ ok: mode === 'realip_only', mode }), {
          status: mode === 'realip_only' ? 200 : 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.pathname === '/Items/Latest' && url.search === '?Limit=1') {
        return new Response(JSON.stringify({ ok: false, mode }), {
          status: mode === 'dual' ? 403 : 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return originalFetch(input, init);
  };

  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) headers.set(key, value.join(', '));
        else if (value !== undefined) headers.set(key, value);
      }
      const request = new Request(`http://127.0.0.1:${server.address().port}${req.url}`, {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body
      });
      const response = await worker.fetch(request, env, { waitUntil() {} });
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        res.end(Buffer.from(await response.arrayBuffer()));
      } else {
        res.end();
      }
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error?.stack || error));
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    restoreFetch() {
      globalThis.fetch = originalFetch;
    }
  };
}

test('nodeCompatAutofix does not crash Vue when node cards rerender after the action completes', async () => {
  const { server, baseUrl, restoreFetch } = await startWorkerServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  const consoleMessages = [];

  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('console', msg => consoleMessages.push(`${msg.type()}: ${msg.text()}`));

  try {
    const loginResponse = await context.request.post(`${baseUrl}/admin/login`, {
      data: { password: 'test-pass' }
    });
    const cookie = loginResponse.headers()['set-cookie'] || '';
    const authToken = cookie.match(/auth_token=([^;]+)/)?.[1] || '';
    assert.ok(authToken, 'expected auth cookie after login');

    await context.addCookies([{ name: 'auth_token', value: authToken, url: baseUrl }]);
    await page.goto(`${baseUrl}/admin`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => !!window.App);
    await page.evaluate(() => window.App.navigate('#nodes'));
    await page.waitForTimeout(1200);

    await page.getByTitle('自动修复兼容模式').first().click();
    await page.getByText('真实客户端 IP 透传已自动调整为：严格（仅保留 X-Real-IP）').waitFor();
    await page.waitForTimeout(1800);

    assert.deepEqual(
      pageErrors,
      [],
      `page errors: ${JSON.stringify(pageErrors)} console: ${JSON.stringify(consoleMessages)}`
    );
    assert.equal(
      consoleMessages.some(message => message.includes('insertBefore') || message.includes('emitsOptions')),
      false,
      `unexpected Vue console errors: ${JSON.stringify(consoleMessages)}`
    );
  } finally {
    await context.close();
    await browser.close();
    restoreFetch();
    await new Promise(resolve => server.close(resolve));
  }
});
