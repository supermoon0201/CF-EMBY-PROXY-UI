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

test('rendered admin ui scheduler copy button keeps pill content from shrinking', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /App\.copySchedulerIpsForItdog\(\)[^>]+class="[^"]*inline-flex[^"]*shrink-0[^"]*whitespace-nowrap/);
});
