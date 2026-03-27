import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker.js';

function createAdminEnv() {
  return {
    ADMIN_PATH: '/admin',
    ADMIN_PASS: 'test-pass',
    JWT_SECRET: 'test-secret'
  };
}

function extractLastInlineScript(html) {
  const scripts = [...String(html || '').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.ok(scripts.length > 0, 'expected at least one inline script in rendered admin html');
  return scripts.at(-1);
}

test('rendered admin ui inline script is syntactically valid', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();
  const script = extractLastInlineScript(html);

  assert.equal(response.status, 200);
  assert.doesNotThrow(() => new Function(script));
});

test('rendered admin ui scheduler probes candidates through admin api instead of browser https ip fetch', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();
  const script = extractLastInlineScript(html);

  assert.equal(response.status, 200);
  assert.match(script, /apiCall\('probeRemoteCandidateIp'/);
  assert.doesNotMatch(script, /fetch\('https:\/\/'\s*\+\s*target\s*\+\s*'\/cdn-cgi\/trace'/);
});

test('rendered admin ui scheduler copy action uses browser bridge clipboard helper', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();
  const script = extractLastInlineScript(html);

  assert.equal(response.status, 200);
  assert.match(script, /uiBrowserBridge\.writeClipboard\(/);
  assert.doesNotMatch(script, /this\.writeClipboard\(/);
});

test('rendered admin ui node card exposes nodeCompatAutofix action', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();
  const script = extractLastInlineScript(html);

  assert.equal(response.status, 200);
  assert.match(script, /apiCall\('nodeCompatAutofix'/);
  assert.match(html, /自动修复兼容/);
});

test('rendered admin ui scheduler copy button keeps pill content from shrinking', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /App\.copySchedulerIpsForItdog\(\)[^>]+class="[^"]*inline-flex[^"]*shrink-0[^"]*whitespace-nowrap/);
});

test('rendered admin ui scheduler table keeps ipv6 candidate cells wrapped without squeezing adjacent columns', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(
    html,
    /<th class="py-3 px-4 w-\[26rem\]">候选 IP<\/th>[\s\S]*?<td class="[^"]*py-3[^"]*px-4[^"]*w-\[26rem\][^"]*font-mono[^"]*text-xs[^"]*break-all[^"]*whitespace-normal[^"]*leading-6[^"]*text-slate-700[^"]*dark:text-slate-200[^"]*">/
  );
  assert.match(html, /<th class="py-3 px-4 w-28">线路<\/th>/);
  assert.match(html, /<th class="py-3 px-4 w-32">来源<\/th>/);
  assert.match(html, /<th class="py-3 px-4 w-28">延迟<\/th>/);
  assert.match(html, /<td class="py-3 px-4 whitespace-nowrap">/);
  assert.match(html, /<td class="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">/);
  assert.match(html, /<td class="py-3 px-4 text-sm font-medium whitespace-nowrap"/);
});
