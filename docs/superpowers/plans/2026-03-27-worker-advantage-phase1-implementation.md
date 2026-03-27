# Worker Advantage Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the phase-1 migration set to `worker.js`: scheduler admin page, remote candidate IP retrieval, richer real-client-IP compatibility modes, a media 403 compatibility ladder, and a no-Range fallback for broken `bytes=0-...` upstreams.

**Architecture:** Keep `worker.js` as the only runtime and extend its existing admin action + proxy pipeline. Use a minimal Node `node:test` harness for the new pure helper behaviors, then wire those helpers into the admin UI and proxy flow with manual regression checks for the Worker-specific integration points.

**Tech Stack:** Cloudflare Workers ESM, single-file `worker.js`, browser-side admin UI, Node built-in `node:test` for lightweight verification, manual `wrangler dev` validation.

---

### Task 1: Add a Minimal Test Harness for New Pure Behaviors

**Files:**
- Create: `docs/superpowers/plans/2026-03-27-worker-advantage-phase1-implementation.md`
- Create: `tests/worker.phase1.test.mjs`
- Modify: `worker.js`

- [ ] **Step 1: Write the failing test**

Create `tests/worker.phase1.test.mjs` with focused tests for the pure helpers that phase 1 needs:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeNodeRealClientIpMode,
  getRealClientIpHeaderMode,
  parseRemoteCandidateIpsFromSource,
  buildMedia403CompatibilityModes,
  shouldFallbackToNoRange
} from '../worker.js';

test('maps legacy and new real client IP modes', () => {
  assert.equal(normalizeNodeRealClientIpMode('forward'), 'dual');
  assert.equal(normalizeNodeRealClientIpMode('strip'), 'realip_only');
  assert.equal(normalizeNodeRealClientIpMode('disable'), 'off');
  assert.equal(normalizeNodeRealClientIpMode('smart'), 'smart');
  assert.equal(getRealClientIpHeaderMode({ realClientIpMode: 'smart' }), 'real-ip-only');
  assert.equal(getRealClientIpHeaderMode({ realClientIpMode: 'dual' }), 'full');
});

test('deduplicates parsed candidate IPs from remote source text', () => {
  const parsed = parseRemoteCandidateIpsFromSource('电信 1.1.1.1 联通 1.1.1.1 ipv6 2400:3200::1', 'uouin');
  assert.deepEqual(parsed.map(item => item.ip), ['1.1.1.1', '[2400:3200::1]']);
});

test('builds media 403 compatibility ladder in the expected order', () => {
  assert.deepEqual(buildMedia403CompatibilityModes('smart'), ['origin', 'off', 'dual', 'realip_only']);
});

test('falls back to no-range only for broken bytes=0- responses', () => {
  assert.equal(shouldFallbackToNoRange('bytes=0-', 200, ''), true);
  assert.equal(shouldFallbackToNoRange('bytes=0-', 206, 'bytes 0-1/10'), false);
  assert.equal(shouldFallbackToNoRange('bytes=100-', 200, ''), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test --experimental-default-type=module tests/worker.phase1.test.mjs
```

Expected:

- FAIL because the named exports/helpers do not exist yet, or because the old mode normalization still returns the three-value model.

- [ ] **Step 3: Write minimal implementation**

Modify `worker.js` so the tested helpers exist as named exports and use the new phase-1 semantics:

```js
export function normalizeNodeRealClientIpMode(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'smart' || normalized === 'auto') return 'smart';
  if (['realip_only', 'realip', 'strip', 'strict', 'x-real-ip'].includes(normalized)) return 'realip_only';
  if (['off', 'disable', 'none', 'close'].includes(normalized)) return 'off';
  if (['dual', 'both', 'full', 'forward'].includes(normalized)) return 'dual';
  return 'smart';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test --experimental-default-type=module tests/worker.phase1.test.mjs
```

Expected:

- PASS for the pure helper assertions

- [ ] **Step 5: Commit**

```bash
git add tests/worker.phase1.test.mjs worker.js
git commit -m "test: add phase1 worker compatibility helpers"
```

### Task 2: Expand Node Real-Client-IP Modes in Admin State and Persistence

**Files:**
- Modify: `worker.js`
- Test: `tests/worker.phase1.test.mjs`
- Verify manually: node modal in admin UI

- [ ] **Step 1: Write the failing test**

Extend the mode-mapping test to cover node-record normalization and default behavior:

```js
test('normalizes node records to smart/realip_only/off/dual', () => {
  const node = Database.buildNodeRecord('demo', { target: 'https://demo.test', realClientIpMode: 'forward' }, {});
  assert.equal(node.realClientIpMode, 'dual');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test --experimental-default-type=module tests/worker.phase1.test.mjs
```

Expected:

- FAIL because node normalization still persists `forward/strip/disable`

- [ ] **Step 3: Write minimal implementation**

Modify `worker.js` in these areas:

- the backend `normalizeNodeRealClientIpMode`
- `getRealClientIpHeaderMode`
- node normalization / `Database.buildNodeRecord`
- the duplicated frontend `normalizeNodeRealClientIpMode`
- node modal defaults and `<select id="form-real-client-ip-mode">` options

Use these UI-visible values:

```html
<option value="smart">自动（推荐，仅 X-Real-IP）</option>
<option value="realip_only">严格（仅 X-Real-IP）</option>
<option value="off">保守（不透传）</option>
<option value="dual">最大兼容（X-Real-IP + X-Forwarded-For）</option>
```

- [ ] **Step 4: Run verification**

Run:

```bash
node --test --experimental-default-type=module tests/worker.phase1.test.mjs
```

Then manually verify with:

```bash
npx wrangler dev
```

Expected:

- tests PASS
- existing nodes using legacy values still load
- node editor shows the new four-mode selector

- [ ] **Step 5: Commit**

```bash
git add worker.js tests/worker.phase1.test.mjs
git commit -m "feat: expand real client ip compatibility modes"
```

### Task 3: Add Remote Candidate IP Parsing and Admin Action

**Files:**
- Modify: `worker.js`
- Test: `tests/worker.phase1.test.mjs`

- [ ] **Step 1: Write the failing test**

Add parser tests for the two remote-source text formats:

```js
test('parses uouin line-tagged candidates', () => {
  const text = '电信 1.1.1.1 联通 2.2.2.2 ipv6 2400:3200::1';
  const parsed = parseRemoteCandidateIpsFromSource(text, 'uouin');
  assert.equal(parsed.length, 3);
});

test('parses github top list candidates and removes private IPs', () => {
  const text = '1.1.1.1 10.0.0.1 8.8.8.8';
  const parsed = parseRemoteCandidateIpsFromSource(text, 'github-top10');
  assert.deepEqual(parsed.map(item => item.ip), ['1.1.1.1', '8.8.8.8']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test --experimental-default-type=module tests/worker.phase1.test.mjs
```

Expected:

- FAIL because the parser does not support both source modes yet

- [ ] **Step 3: Write minimal implementation**

Modify `worker.js` to add:

- a pure parser helper for remote source text
- a fetch helper that retrieves both source URLs with timeouts and error isolation
- a new admin action: `listRemoteCandidateIps`

Shape the action response around:

```js
return jsonResponse({
  ok: true,
  type,
  totalCount: candidates.length,
  candidates,
  sourceSummary
});
```

- [ ] **Step 4: Run verification**

Run:

```bash
node --test --experimental-default-type=module tests/worker.phase1.test.mjs
```

Then smoke the action in local dev:

```bash
npx wrangler dev
```

Expected:

- tests PASS
- admin action returns deduplicated, structured candidates

- [ ] **Step 5: Commit**

```bash
git add worker.js tests/worker.phase1.test.mjs
git commit -m "feat: add remote candidate ip admin action"
```

### Task 4: Add Scheduler Admin View and DNS Save Integration

**Files:**
- Modify: `worker.js`
- Verify manually: admin UI scheduler + DNS pages

- [ ] **Step 1: Write the failing test**

Write a small parser/unit test for the scheduler-side sorting helper if extracted as a pure helper:

```js
test('keeps only the fastest usable top3 candidates', () => {
  const top = selectTopCandidatesForDns([
    { ip: '1.1.1.1', latencyMs: 120 },
    { ip: '2.2.2.2', latencyMs: 80 },
    { ip: '3.3.3.3', latencyMs: 9999 },
    { ip: '4.4.4.4', latencyMs: 95 }
  ]);
  assert.deepEqual(top.map(item => item.ip), ['2.2.2.2', '4.4.4.4', '1.1.1.1']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test --experimental-default-type=module tests/worker.phase1.test.mjs
```

Expected:

- FAIL because scheduler helper/state is missing

- [ ] **Step 3: Write minimal implementation**

Modify `worker.js` to:

- add a new `NAV_ITEMS` entry for `#scheduler`
- add a new `view-section` for the scheduler UI
- add scheduler state fields into the app state
- add methods to:
  - load candidates
  - run browser-side latency tests
  - copy IPs for ITDog
  - build DNS payloads
  - call `saveDnsRecords` using the existing `currentHost`

Do not create a second DNS-write API. The scheduler must reuse `listDnsRecords` and `saveDnsRecords`.

- [ ] **Step 4: Run verification**

Run:

```bash
npx wrangler dev
```

Expected:

- scheduler page renders
- candidate fetch works
- latency test results appear and sort
- single-IP save and TOP3 save both update DNS through the existing flow
- existing `#dns` page still behaves the same

- [ ] **Step 5: Commit**

```bash
git add worker.js
git commit -m "feat: add scheduler admin page"
```

### Task 5: Add Media 403 Compatibility Ladder and No-Range Fallback

**Files:**
- Modify: `worker.js`
- Test: `tests/worker.phase1.test.mjs`
- Verify manually: playback against known-problem upstream

- [ ] **Step 1: Write the failing test**

Add pure tests for ladder order and no-Range trigger conditions:

```js
test('returns the phase1 media 403 ladder order', () => {
  assert.deepEqual(buildMedia403CompatibilityModes('realip_only'), ['origin', 'off', 'dual', 'realip_only']);
});

test('no-range fallback ignores non-zero range starts', () => {
  assert.equal(shouldFallbackToNoRange('bytes=100-', 200, ''), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test --experimental-default-type=module tests/worker.phase1.test.mjs
```

Expected:

- FAIL because the ladder helper and no-range decision helper are incomplete or absent

- [ ] **Step 3: Write minimal implementation**

Modify `worker.js` to add:

- a helper that decides whether the current request qualifies for media 403 compatibility replay
- a helper that builds the compatibility mode ladder
- a helper that decides whether no-Range replay should happen
- replay logic inside `executeUpstreamFlow()` for the 403 ladder
- a one-time replay branch that removes `Range` / `If-Range` and sets `Accept-Encoding: identity` for broken `bytes=0-...` responses

Constraints:

- do not fold the ladder into generic target retry loops
- retry against the already chosen upstream target
- keep the existing 5xx retry and redirect logic intact

- [ ] **Step 4: Run verification**

Run:

```bash
node --test --experimental-default-type=module tests/worker.phase1.test.mjs
```

Then manually verify with:

```bash
npx wrangler dev
```

Expected:

- tests PASS
- known 403-prone playback path can recover
- broken `bytes=0-...` path can recover with a no-Range replay
- normal `206` partial responses remain unchanged

- [ ] **Step 5: Commit**

```bash
git add worker.js tests/worker.phase1.test.mjs
git commit -m "feat: harden media compatibility retries"
```

### Task 6: Update Docs and Run Final Regression Pass

**Files:**
- Modify: `README.md`
- Modify: `worker-config-form-dictionary.md`
- Modify: `docs/superpowers/specs/2026-03-27-worker-advantage-migration-design.md` if implementation reality differs

- [ ] **Step 1: Write the failing test**

There is no automated doc test in this repo. Instead, write the regression checklist first in the PR notes or working notes:

```text
- scheduler page loads
- legacy node modes still deserialize
- new node mode labels save correctly
- DNS page unchanged
- playback path works on known-good node
- compatibility path works on known-bad node
```

- [ ] **Step 2: Run verification baseline**

Run:

```bash
npx wrangler dev
```

Expected:

- baseline app boots and admin loads before doc updates are finalized

- [ ] **Step 3: Write minimal implementation**

Update docs to reflect:

- the new scheduler page
- the four real-client-IP modes
- the compatibility hardening behavior and its intended scope

- [ ] **Step 4: Run final verification**

Run:

```bash
npx wrangler dev
git diff -- worker.js README.md worker-config-form-dictionary.md
```

Expected:

- local manual regression passes
- diff only contains intended implementation/doc surface

- [ ] **Step 5: Commit**

```bash
git add worker.js README.md worker-config-form-dictionary.md
git commit -m "docs: describe phase1 worker migration changes"
```

