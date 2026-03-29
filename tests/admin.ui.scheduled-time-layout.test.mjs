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

test('rendered admin ui keeps scheduled maintenance timezone label outside native time input shell', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(
    html,
    /<div class="flex items-center gap-3">\s*<input type="time" id="cfg-scheduled-maintenance-time"[^>]+class="[^"]*min-w-0[^"]*flex-1[^"]*w-full[^"]*rounded-xl[^"]*"[^>]*>\s*<span class="[^"]*shrink-0[^"]*inline-flex[^"]*rounded-xl[^"]*border[^"]*px-3[^"]*py-2[^"]*text-xs[^"]*">\{\{ App\.getScheduledTimezoneLabel\(\) \}\}<\/span>/,
  );
});
