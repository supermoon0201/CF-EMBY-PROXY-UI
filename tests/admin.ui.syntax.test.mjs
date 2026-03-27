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
