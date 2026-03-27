# Worker Node Compat Autofix and Multi-Line Failover Design

**Date:** 2026-03-28

**Project:** `CF-EMBY-PROXY-UI`

**Goal:** Add two targeted backend capabilities to `worker.js`:

1. a manual node-level `realClientIpMode` autofix action that probes the node through the current Worker path and picks the best compatibility mode
2. a lightweight multi-line short circuit breaker plus round-robin cursor for nodes with multiple upstream lines

---

## 1. Background

The current `worker.js` already supports:

- canonical four-mode `realClientIpMode` normalization
- node-level multi-line upstream definitions with `lines` and `activeLineId`
- proxy-side retry loops across multiple upstream targets
- admin actions for node save/list/delete and latency probing

What it does **not** currently provide:

- a built-in action to diagnose and automatically repair a node's `realClientIpMode`
- cross-request short-term memory that avoids repeatedly trying a recently failed upstream line first

The paid reference Worker demonstrates both behaviors in a practical form. This design ports only the useful operational behaviors and keeps the current `worker.js` architecture intact.

---

## 2. Goals

### Primary Goals

1. Add a manual admin action that evaluates `realClientIpMode` candidates for a node and writes back the best mode when a materially better option is found.
2. Add an in-memory per-node multi-line failover mechanism that:
   - rotates the preferred starting line across requests
   - temporarily bans clearly failing lines
   - still has an all-lines fallback when every line is currently banned

### Secondary Goals

1. Keep node storage schema unchanged.
2. Keep the implementation local to `worker.js`.
3. Add pure helper coverage so the new decision logic is testable without Wrangler.

---

## 3. Non-Goals

1. Do not make autofix run automatically on every node save.
2. Do not add scheduled bulk autofix for all nodes.
3. Do not persist line-ban state to KV or D1.
4. Do not introduce a heavyweight health-check subsystem or a separate line-health database.
5. Do not replace the current retry pipeline or node `lines` schema.

---

## 4. Design Decisions

## 4.1 `realClientIpMode` Autofix Is a Manual Admin Action

Add a new authenticated admin action:

- `nodeCompatAutofix`

This action is triggered manually from the admin UI for a single node. It does not run as a side effect of `save`, `import`, or scheduled tasks.

### Why Manual First

- keeps node save latency predictable
- avoids hidden config mutation after a normal edit
- makes the action explainable to the user
- matches the operational style of the paid Worker

---

## 4.2 Probe Strategy for Autofix

The autofix action probes the node **through the current Worker route**, not by contacting the upstream directly. This ensures the decision is based on the actual request path, headers, and compatibility behavior used in production.

### Probe Endpoints

Use the node route prefix plus secret if present, then probe:

1. `/System/Info/Public`
2. `/Items?Limit=1&StartIndex=0`
3. `/Items/Latest?Limit=1`

### Candidate Modes

Probe these canonical modes:

1. `realip_only`
2. `off`
3. `dual`

If the current node mode is already one of those values, move it to the front of the list so the current setting is evaluated first.

`smart` is not probed as an independent candidate because in the current transport layer it intentionally resolves to the same effective header behavior as `realip_only`.

---

## 4.3 Probe Scoring and Selection

Each candidate mode is evaluated by three probe responses:

- public probe
- media probe A
- media probe B

### Probe Interpretation

- `2xx` or `3xx` counts as healthy
- `401` is acceptable and counts as relatively healthy
- `403` without an obvious WAF/challenge signature is weakly acceptable
- `5xx`, timeout, and explicit WAF/challenge signals are unhealthy

### Pass Rule

A mode is considered usable when:

- the public probe is healthy
- and at least one media probe is healthy

### Scoring

Use a weighted additive score:

- healthy public probe: positive weight
- healthy media probes: slightly higher weight than public probe
- timeout / `5xx` / WAF: strong penalty
- `403` without WAF: light penalty
- higher latency: increasing penalty

### Sticky Selection Rule

If the original mode is one of `realip_only`, `off`, `dual`, and:

- it passes
- and its score is within a small margin of the best score

then keep the original mode instead of flipping to another nearly equivalent mode.

Sticky margin:

- `15%`

This reduces oscillation from noisy probe timing.

---

## 4.4 Autofix Writeback Rules

If no candidate mode passes:

- keep the original node mode unchanged
- return a failure payload with detailed probe results

If a best mode is selected:

- write the new mode back through the existing node KV storage path
- invalidate the node cache so later requests see the updated mode

### Response Shape

Return:

- `ok`
- `name`
- `mode`
- `bestMode`
- `bestScore`
- `originalMode`
- `changed`
- `tried`

Where `tried` contains structured probe details per candidate mode.

---

## 4.5 Multi-Line Short Circuit Breaker and Round-Robin Cursor

For nodes with multiple upstream lines, add two in-memory runtime structures:

- `GLOBALS.LineCursor`
  a `Map<string, number>` storing the next preferred line index per node
- `GLOBALS.LineBan`
  a `Map<string, { exp: number } | number>`-style TTL entry keyed by node plus line target

These states are isolate-local and intentionally ephemeral.

### Why In-Memory Only

- this is a fast operational hint, not a source-of-truth data model
- persistence would add unnecessary KV/D1 complexity
- line quality is short-lived and request-path dependent

---

## 4.6 Line Ordering Rules

Before entering the existing upstream retry loop for a node with multiple lines:

1. build the normal retry target list from the node's ordered lines
2. rotate the list so the current cursor position is first
3. skip currently banned lines during the first pass when there are other available lines
4. if all lines are skipped because they are banned, run a second pass that ignores bans

### Cursor Update Rule

When a line succeeds and returns the final upstream response:

- advance the cursor to the next line index for the next request

This creates lightweight round-robin behavior without changing request semantics inside the current request.

---

## 4.7 Ban Rules

Ban a line for a short period when it returns a clearly bad result or throws during fetch.

Initial ban triggers:

- thrown fetch error
- `403`
- `404`
- `416`
- `5xx`

Initial ban duration:

- `60 seconds`

### Intentional Scope

Do **not** ban for:

- `2xx`
- `3xx`
- `401`
- `429`

`401` is commonly a legitimate upstream auth state, and `429` is too ambiguous to treat as line-specific failure in this first version.

---

## 4.8 Integration Point in `worker.js`

### Autofix

Implement inside the existing admin action system:

- add pure helper functions near the current exported test helpers
- add one new `Database.ApiHandlers.nodeCompatAutofix`

### Multi-Line Failover

Integrate around the current upstream target selection path used by `fetchUpstreamWithRetryLoop()`.

Integration shape:

1. derive a per-node runtime key
2. order the retry targets using cursor plus ban state
3. run the existing retry loop using the ordered targets
4. on clear line-specific failure, ban that line
5. on success, advance the cursor

The existing retry logic, protocol fallback, 403 compatibility ladder, and no-range fallback remain the source of truth for request handling.

---

## 4.9 Helper Functions to Add

Add small, testable helpers for the new decision logic.

Helpers to add:

- `buildNodeCompatAutofixCandidateModes(originalMode)`
- `scoreNodeCompatProbeResult(result, weight = 1)`
- `selectNodeCompatAutofixMode({ originalMode, tried, stickyMargin })`
- `shouldBanUpstreamLine(status, error)`
- `buildRotatedRetryTargets(targets, startIndex)`
- `orderRetryTargetsWithLineState(nodeName, retryTargets, nowMsValue)`
- `advanceLineCursor(currentIndex, total)`

These helpers stay pure unless they are directly reading or mutating the in-memory line state maps.

---

## 5. Testing Strategy

Add focused unit coverage first.

### Extend Existing Test File

Modify:

- `tests/worker.phase1.test.mjs`

### Add Coverage For

1. autofix candidate-mode ordering
2. sticky mode selection when original mode is close enough to best
3. failure selection when no candidate passes
4. line-ban predicate for status/error combinations
5. retry target rotation by cursor index
6. ban-aware ordering that skips banned lines on the first pass
7. fallback ordering when all lines are banned

### Manual Verification

1. choose a known problematic node and trigger `nodeCompatAutofix`
2. confirm the returned probe detail is readable and the node mode updates only when appropriate
3. confirm a healthy node does not flap modes unnecessarily
4. create a node with multiple lines where one line predictably fails
5. verify repeated requests stop hitting the failing line first during the ban window
6. verify success moves the preferred starting line forward
7. verify playback and normal proxy requests still use the existing compatibility ladder and retry behavior

---

## 6. Files Expected to Change

- `worker.js`
- `tests/worker.phase1.test.mjs`
- `worker-config-form-dictionary.md` if the UI exposes the new manual node action in a user-facing description
- `README.md` if the new node maintenance action is documented

---

## 7. Risks and Mitigations

### Risk: Autofix Probes Misclassify a Healthy Node

Mitigation:

- keep the action manual
- keep sticky retention for near-tied original modes
- return detailed probe data for operator inspection

### Risk: Over-Banning Lines During Short Incidents

Mitigation:

- keep the ban TTL short
- keep the all-lines second-pass fallback
- do not persist bans across isolates

### Risk: Retry Logic Becomes Too Coupled

Mitigation:

- keep new line-state logic in small helper functions
- integrate ordering and state updates around the retry loop, not inside unrelated compatibility helpers

---

## 8. Final Recommendation

Implement both features in a narrow, operationally safe form:

1. a manual `nodeCompatAutofix` action that probes the current Worker route and updates `realClientIpMode` only when justified
2. an isolate-local multi-line failover layer that adds short bans and cursor-based rotation ahead of the existing upstream retry loop

This preserves the current `worker.js` architecture, keeps side effects understandable, and targets the parts of the paid Worker that most directly improve real playback stability.
