# Worker Advantage Migration Design

**Date:** 2026-03-27

**Project:** `CF-EMBY-PROXY-UI`

**Goal:** Migrate the proven strengths from `mk-worker.js` and `免费版1.7+emos版本.js` into `worker.js` without breaking the existing SaaS-style admin UI, DNS editor, logging pipeline, or current proxy architecture.

---

## 1. Background

The repository currently has three relevant Worker variants:

- `worker.js`
  The mainline version. It already contains the full admin console, Cloudflare DNS editing, dashboard statistics, runtime status, config snapshots, KV/D1 integrations, metadata prewarm, and a mature proxy pipeline.
- `mk-worker.js`
  A lightweight operational panel focused on remote candidate IP collection, browser-side speed testing, and updating the fastest IPs into Cloudflare DNS.
- `免费版1.7+emos版本.js`
  A compatibility-focused proxy variant with practical playback hardening, including richer real-client-IP modes, 403 compatibility retries, no-Range fallback for broken upstreams, `.strm` parsing, and direct-link handling.

The migration must preserve `worker.js` as the primary architecture. The other two files are source material for selective feature adoption, not alternative runtimes to merge wholesale.

---

## 2. Goals

### Primary Goals

1. Add a new admin page to `worker.js` for remote candidate IP retrieval, browser-side latency testing, and fast DNS scheduling.
2. Expand `worker.js` node real-client-IP compatibility from the current three-value model to a richer four-mode model compatible with the free version.
3. Strengthen media compatibility in `worker.js` by adding a targeted 403 retry ladder for playback-sensitive requests.
4. Add a no-Range fallback for broken upstreams/CDNs when `Range: bytes=0-...` does not return a valid partial response.

### Secondary Goals

1. Keep all existing DNS editing flows, confirmation prompts, DNS history, and Cloudflare error handling unchanged as the source of truth.
2. Reuse the current admin action dispatch model instead of adding a parallel `/api/*` interface.
3. Make the migration incremental and reversible, with clear phase boundaries.

---

## 3. Non-Goals

1. Do not replace the existing `#dns` view with the `mk-worker.js` page.
2. Do not copy the `mk-worker.js` standalone login, route CRUD, or simplified DNS APIs into `worker.js`.
3. Do not replace `worker.js` cache/state machinery with the free version’s `TTLMap` architecture.
4. Do not import the free version’s full keepalive/reminder subsystem.
5. Do not introduce an unsigned public `__raw__` proxy route in `worker.js`.

---

## 4. Design Decisions

## 4.1 Admin UI: Add a New Scheduler Page

`worker.js` already separates admin routes into `#dashboard`, `#nodes`, `#logs`, `#dns`, and `#settings`. The safest integration path is to add one more dedicated view instead of overloading the existing DNS editor.

### New Admin View

- Add a new navigation item, recommended hash: `#scheduler`
- Add a dedicated view section for:
  - candidate source selection
  - remote candidate IP retrieval
  - browser-side speed test
  - result sorting and filtering
  - copy-to-clipboard / ITDog helper actions
  - save-selected-IP(s)-to-DNS actions

### UI Responsibility Boundary

The new page is an operational accelerator, not a replacement for the current DNS editor:

- `#scheduler`
  Fast workflow for candidate discovery, latency testing, and “push best result(s) into DNS”.
- `#dns`
  Precise Cloudflare DNS editor, source of truth for final record visualization, mixed A/AAAA editing, CNAME mode, DNS history, and explicit save confirmation.

This separation keeps the current DNS page stable and limits regression risk.

---

## 4.2 Backend Interface: Reuse the Current Admin Action Model

`worker.js` already centralizes admin calls through `apiCall(action, payload)` and action handlers inside `Database.ApiHandlers`. The migration should stay inside this pattern.

### New Action

Add one new admin action:

- `listRemoteCandidateIps`

Suggested response payload:

- `ok`
- `sourceSummary`
- `type`
- `totalCount`
- `candidates`
  - `ip`
  - `family`
  - `lineType`
  - `source`
  - `displayText`

### Existing Actions to Reuse

- `listDnsRecords`
  Used to detect the current host and current DNS state.
- `saveDnsRecords`
  Used to persist the selected A/AAAA results into Cloudflare DNS with existing confirmation and validation logic.

### Explicit Rejection

Do not port `mk-worker.js`’s `/api/update-dns` or `/api/get-remote-ips` as separate public endpoints. The logic should be folded into the authenticated admin action system.

---

## 4.3 Candidate Retrieval and Speed Test Flow

### Candidate Retrieval

Port the remote-source collection idea from `mk-worker.js` into the new action:

- source A:
  `https://api.uouin.com/cloudflare.html`
- source B:
  `https://raw.githubusercontent.com/ZhiXuanWang/cf-speed-dns/refs/heads/main/ipTop10.html`

The server side should:

1. fetch the configured source set
2. parse IPv4/IPv6 candidates
3. normalize bracketed IPv6 formatting for display consistency
4. deduplicate candidates
5. return structured results

### Browser-side Testing

Keep latency testing in the browser, not in the Worker:

- this reflects the user-to-candidate path more accurately than Worker-to-candidate testing
- it avoids server-side fan-out complexity
- it matches the practical behavior of `mk-worker.js`

### DNS Save Flow

When the user selects one IP or the current TOP3 result:

1. load `currentHost` via `listDnsRecords`
2. build `records` payload using `A`/`AAAA`
3. call `saveDnsRecords`
4. refresh scheduler page state and optionally refresh the DNS page state

If `currentHost` cannot be determined, the page should still allow fetch, test, and copy actions, but disable DNS write actions.

---

## 4.4 Real Client IP Compatibility Mode Expansion

`worker.js` currently uses a three-value node mode:

- `forward`
- `strip`
- `disable`

The free version uses a richer compatibility-oriented model:

- `smart`
- `realip_only`
- `off`
- `dual`

### Decision

Upgrade `worker.js` normalization so it accepts both the old and new enums, then continue to map into the current transport-layer header semantics.

### Proposed Canonical Values

- `smart`
- `realip_only`
- `off`
- `dual`

### Legacy Compatibility Mapping

- `forward` -> `dual`
- `strip` -> `realip_only`
- `disable` / `none` -> `off`
- `auto` -> `smart`

### Transport Mapping

- `smart` -> `real-ip-only`
- `realip_only` -> `real-ip-only`
- `off` -> `none`
- `dual` -> `full`

### Rationale

`smart` should resolve to the safer default behavior used by the free version: preserve `X-Real-IP` while avoiding the more aggressive `X-Forwarded-For` dual forwarding unless explicitly requested.

This gives `worker.js` better compatibility with upstreams that are sensitive to forwarded-chain behavior while keeping the existing header injection pipeline intact.

---

## 4.5 403 Compatibility Ladder for Media-Sensitive Requests

`worker.js` already has a coarse 403-triggered protocol fallback. It does not have the free version’s more targeted compatibility ladder that changes Origin/Referer and real-client-IP strategy across multiple attempts.

### Decision

Add a dedicated helper under `executeUpstreamFlow()` for media-sensitive compatibility retries. Do not merge this into the generic upstream retry loops.

### Trigger Conditions

Only trigger the ladder when all of the following are true:

1. the first upstream response is `403`
2. the request is eligible for replay
   - `GET` / `HEAD`, or buffered body
3. the request is likely playback-sensitive
   - `isBigStream`
   - `isManifest`
   - `isSegment`
   - optionally playback-auth related API routes if already classified

### Ladder Strategy

The helper should retry against the same resolved upstream target, not restart node selection.

Suggested ladder order:

1. origin/referer repair for current target origin
2. `off`
   remove client-IP forwarding and suspicious browser fetch headers
3. `dual`
   restore Origin/Referer and forward both `X-Real-IP` + `X-Forwarded-For`
4. `realip_only`
   keep Origin/Referer but only send `X-Real-IP`

### Replay Rules

- keep `Range`
- keep `If-Range`
- preserve the same request method/body when replay-safe
- apply `Accept-Encoding: identity` where appropriate for compatibility

### EMOS Boundary

Do not hardwire EMOS headers into the main path. If EMOS support is added later, it must be opt-in and gated by explicit environment/config presence.

---

## 4.6 No-Range Fallback for Broken `bytes=0-...` Requests

The free version contains a practical workaround for upstreams that receive `Range: bytes=0-...` but fail to return a valid `206`/`Content-Range`, or return `416`.

`worker.js` currently has no equivalent fallback.

### Decision

Add one targeted no-Range fallback for media/direct-link compatible flows.

### Trigger Conditions

All of the following must be true:

1. request contains `Range`
2. range start is `0`
3. upstream response is not a valid partial response:
   - not `206` and no `Content-Range`, or
   - status `416`

### Fallback Behavior

Replay once with:

- `Range` removed
- `If-Range` removed
- `Accept-Encoding: identity`

### Scope

Keep this fallback narrow:

- media-oriented requests only
- one extra replay only
- no repeated downgrade loops

This prevents unnecessary retries on non-playback requests.

---

## 4.7 Phase 2: `.strm` Parsing and Optional Direct-Link Enhancements

`.strm` support is valuable but not required to deliver the first migration milestone.

### Phase 2 Additions

1. detect `.strm` requests that are not Emby’s internal `/stream.strm`
2. fetch the `.strm` text without Range headers
3. extract the first valid `http/https` URL
4. route the extracted URL through existing direct/proxy policy decisions

### Deferred Items

These are explicitly deferred out of the first implementation phase:

1. unsigned `__raw__` route support
2. full external 302 raw-hop serialization
3. EMOS-specific header injection defaults

If a raw-hop mechanism is added later, it must be signed and host-restricted to avoid turning `worker.js` into an open proxy surface.

---

## 5. Implementation Phasing

## Phase 1

Deliverable:

- new `#scheduler` page
- `listRemoteCandidateIps` action
- DNS save integration through `saveDnsRecords`
- expanded real-client-IP compatibility modes
- 403 media compatibility ladder
- no-Range fallback for broken `bytes=0-...` upstreams

## Phase 2

Deliverable:

- `.strm` parsing direct/proxy handoff
- optional EMOS compatibility hooks
- re-evaluated signed raw-hop design if still required

---

## 6. Files Expected to Change

### `worker.js`

Primary target for all phase-1 work:

- add scheduler view and navigation
- add scheduler client-side state/methods
- add new admin action handler
- expand node real-client-IP mode normalization
- add media compatibility replay helper
- add no-Range fallback helper

### `README.md`

Update after implementation to describe:

- scheduler page
- richer real-client-IP modes
- playback compatibility enhancements

### `worker-config-form-dictionary.md`

Update if node mode labels or meanings change in the admin UI.

---

## 7. Testing Strategy

Because the repo has no automated suite, the rollout must rely on manual verification with `wrangler dev` or a test deployment.

### Scheduler Page

1. open new scheduler page
2. fetch candidate IPs for multiple source types
3. confirm browser-side latency test runs and sorts correctly
4. save single-IP and TOP3 results through existing DNS save flow
5. verify DNS history and current records still render correctly in `#dns`

### Node Compatibility Modes

1. verify existing nodes using `forward` / `strip` / `disable` still load
2. save new nodes using `smart` / `realip_only` / `off` / `dual`
3. confirm header behavior matches expected transport mapping

### 403 Ladder

1. run against a node/upstream known to reject some default playback requests
2. verify first 403 can recover without breaking generic 5xx retry logic
3. confirm only media-sensitive requests enter the ladder

### No-Range Fallback

1. verify a normal partial-content upstream still returns `206`
2. verify a broken `bytes=0-` upstream can recover after stripping Range
3. confirm non-media requests do not use the fallback

### Regression Checks

1. dashboard loads
2. nodes page loads and saves nodes
3. logs page still loads
4. DNS page still edits records and preserves confirmation behavior
5. proxy playback still works on a known-good node

---

## 8. Risks and Mitigations

### Risk: Retry-State Explosion

If the compatibility ladder is embedded into generic retry loops, the state machine becomes difficult to reason about.

Mitigation:

- keep ladder logic inside a dedicated helper called from `executeUpstreamFlow()`
- run ladder only after the first concrete 403 response from the chosen upstream target

### Risk: DNS UI Regression

The scheduler page may accidentally duplicate or bypass existing DNS editing rules.

Mitigation:

- reuse `listDnsRecords` and `saveDnsRecords`
- do not create a second DNS write path

### Risk: Over-broad Direct Proxy Features

A raw external route can become an abuse surface.

Mitigation:

- defer raw-hop support
- require signed, host-restricted design if added later

---

## 9. Final Recommendation

Use `worker.js` as the only runtime and absorb targeted strengths from the other two files in phases.

Phase 1 should focus on high-value, low-architecture-risk improvements:

1. scheduler page
2. real-client-IP compatibility mode expansion
3. 403 media compatibility ladder
4. no-Range fallback

Phase 2 should cover narrowly scoped playback enhancements that need extra validation:

1. `.strm` parsing
2. optional EMOS handling
3. signed raw-hop design if still justified

