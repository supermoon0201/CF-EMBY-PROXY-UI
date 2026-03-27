# Worker `.strm` Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `.strm` parsing support to `worker.js` so non-Emby `.strm` files can resolve to the first valid external URL and then continue through the existing direct/proxy decision chain.

**Architecture:** Keep `worker.js` as the single runtime and plug `.strm` handling into `Proxy.handle()` as a narrow pre-upstream special-case. Add pure helper exports first, then add one resolver/orchestrator helper that reuses current upstream fetch, redirect decision, and response-shaping logic instead of creating a second playback pipeline.

**Tech Stack:** Cloudflare Workers ESM, single-file `worker.js`, Node built-in `node:test`, local `wrangler dev` smoke verification.

---

### Task 1: Add Pure `.strm` Helper Tests and Minimal Exports

**Files:**
- Create: `tests/worker.strm.phase2.test.mjs`
- Modify: `worker.js`

- [ ] **Step 1: Write the failing test**

Create `tests/worker.strm.phase2.test.mjs` with focused pure helper coverage:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isResolvableStrmRequest,
  extractFirstValidStrmUrl
} from '../worker.js';

test('matches normal .strm paths and excludes emby stream.strm', () => {
  assert.equal(isResolvableStrmRequest('/foo/bar.strm'), true);
  assert.equal(isResolvableStrmRequest('/emby/videos/123/stream.strm'), false);
  assert.equal(isResolvableStrmRequest('/Items/1/Download'), false);
});

test('extracts the first valid http url from strm text', () => {
  const text = '# comment\n\nhttps://example.com/video.m3u8\nhttps://backup.example.com/file';
  assert.equal(extractFirstValidStrmUrl(text), 'https://example.com/video.m3u8');
});

test('ignores invalid protocols and returns empty string when unresolved', () => {
  const text = 'magnet:?xt=urn:btih:demo\nftp://example.com/file\n';
  assert.equal(extractFirstValidStrmUrl(text), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test --experimental-default-type=module tests/worker.strm.phase2.test.mjs
```

Expected:

- FAIL because the helper exports do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Modify `worker.js` to export:

- `isResolvableStrmRequest(proxyPath = "")`
- `extractFirstValidStrmUrl(text = "")`

Rules:

- match `*.strm`
- exclude `/emby/videos/<id>/stream.strm`
- return only the first valid `http/https` URL
- ignore blank lines and `#` comments
- reject non-HTTP protocols by returning an empty string

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test --experimental-default-type=module tests/worker.strm.phase2.test.mjs
```

Expected:

- PASS for all `.strm` helper assertions.

- [ ] **Step 5: Commit**

```bash
git add tests/worker.strm.phase2.test.mjs worker.js
git commit -m "test: add strm parsing helpers"
```

### Task 2: Wire `.strm` Resolution into the Proxy Flow

**Files:**
- Modify: `worker.js`
- Test: `tests/worker.strm.phase2.test.mjs`

- [ ] **Step 1: Write the failing test**

Extend the `.strm` helper test file with edge cases that the runtime wiring depends on:

```js
test('treats whitespace-only and comment-only strm text as unresolved', () => {
  assert.equal(extractFirstValidStrmUrl('  \n# a\n# b\n'), '');
});

test('keeps https query strings from the strm line itself', () => {
  assert.equal(
    extractFirstValidStrmUrl('https://example.com/file.m3u8?token=abc'),
    'https://example.com/file.m3u8?token=abc'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test --experimental-default-type=module tests/worker.strm.phase2.test.mjs
```

Expected:

- FAIL because the parser does not cover all requested edge cases yet.

- [ ] **Step 3: Write minimal implementation**

Modify `worker.js` to add narrow runtime helpers inside `Proxy`:

- a helper that fetches the upstream `.strm` file as text using the existing upstream retry/protocol-fallback stack
- a helper that converts a resolved `.strm` URL into the same redirect/proxy follow-up path used for external redirects
- a helper such as `tryResolveStrmUpstreamState(...)` that returns either `null` or a ready-to-use upstream state

Integration constraints:

- run the `.strm` resolver before `maybeBuildDirectRedirectResponse(...)`
- do not inherit the original request query string onto the resolved external URL
- strip `Range` / `If-Range` while fetching the `.strm` text
- if the `.strm` upstream fetch returns non-2xx, keep that response
- if `.strm` text has no valid `http/https` URL, return `400`
- after resolution, continue through the existing external direct/proxy decision chain instead of duplicating free-edition `handleDirect()`

- [ ] **Step 4: Run verification**

Run:

```bash
node --test --experimental-default-type=module tests/worker.strm.phase2.test.mjs
node --test --experimental-default-type=module tests/worker.phase1.test.mjs
```

Expected:

- new `.strm` tests PASS
- existing phase1 tests still PASS

- [ ] **Step 5: Commit**

```bash
git add worker.js tests/worker.strm.phase2.test.mjs
git commit -m "feat: resolve strm links through proxy rules"
```

### Task 3: Update Docs and Smoke Test the Worker

**Files:**
- Modify: `README.md`
- Modify if needed: `docs/superpowers/specs/2026-03-27-worker-strm-phase2-design.md`

- [ ] **Step 1: Write the regression checklist**

Record the manual checks before editing docs:

```text
- normal .strm resolves and follows existing external direct/proxy rules
- emby stream.strm stays on the old path
- invalid .strm text returns 400
- worker boots locally after wiring
```

- [ ] **Step 2: Write minimal documentation update**

Update `README.md` to mention:

- non-Emby `.strm` parsing support
- reuse of current direct/proxy policy after resolution
- invalid `.strm` files returning explicit errors

- [ ] **Step 3: Run verification**

Run:

```bash
npx wrangler dev --port 8787
node --test --experimental-default-type=module tests/worker.strm.phase2.test.mjs
node --test --experimental-default-type=module tests/worker.phase1.test.mjs
git diff -- worker.js README.md tests/worker.strm.phase2.test.mjs
```

Expected:

- local Worker boots
- both test files PASS
- diff surface only contains intended `.strm` implementation and doc changes

- [ ] **Step 4: Commit**

```bash
git add worker.js README.md tests/worker.strm.phase2.test.mjs
git commit -m "docs: describe strm phase2 support"
```
