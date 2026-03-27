# Worker Phase 2 `.strm` Parsing Design

## Goal

Add a narrow `.strm` playback special-case to `worker.js` so non-Emby `*.strm` files can be fetched as text, resolved to the first valid external URL, and then handed back into the existing `worker.js` direct/proxy decision chain.

## Scope

This design only covers the Phase 2 `.strm` capability.

In scope:

- Detect regular `.strm` requests in `Proxy.handle()`
- Exclude Emby-native `/emby/videos/.../stream.strm`
- Fetch upstream `.strm` text without `Range` / `If-Range`
- Extract the first valid `http/https` URL
- Reuse existing external redirect decision logic instead of creating a second playback pipeline
- Add focused pure tests and manual smoke checks

Out of scope:

- EMOS headers or EMOS-only compatibility branches
- Unsigned raw-hop / `__raw__` routing
- General-purpose text playlist parsing beyond `.strm`
- Large refactors of the existing proxy state machine

## Chosen Approach

Use a front-loaded `.strm` resolver inside `Proxy.handle()` before the normal upstream fetch path is executed.

The resolver does not return a final playback policy by itself. Its job is only:

1. confirm the request is a resolvable `.strm`
2. fetch the `.strm` body as text
3. extract the first valid external URL
4. convert that URL into the same kind of target that the current redirect/proxy logic already understands

After resolution, `worker.js` continues to apply its current rules:

- `forceExternalProxy`
- `wangpandirect`
- same-origin continue-proxy behavior
- redirect follow-up handling
- response header shaping
- logging and diagnostics

This keeps `.strm` as a parsing feature, not a second transport stack.

## Integration Point

The entry point is `Proxy.handle()` in `worker.js`.

Recommended order:

1. `prepareExecutionContext()`
2. `resolveEarlyResponse()`
3. `parseTargetBases()`
4. `buildProxyRequestState()`
5. `createBuildFetchOptions()`
6. `tryResolveStrmRequest(...)`
7. if `.strm` resolution succeeded, continue through existing direct/proxy handling using the resolved URL
8. otherwise continue the current normal upstream flow unchanged

The `.strm` resolver should run before any direct 307 optimization that would otherwise redirect the raw `.strm` file itself.

## Request Matching Rules

The resolver only triggers when all of the following are true:

- request path ends with `.strm`
- request path does not match `/emby/videos/<id>/stream.strm`
- request method is `GET` or `HEAD`
- the request is not a WebSocket upgrade

Everything else keeps the current behavior.

## Resolver Behavior

### 1. Fetch the `.strm` file

The Worker fetches the current node upstream `.strm` resource as plain text.

Rules:

- force `GET` for the `.strm` text retrieval
- remove `Range` and `If-Range`
- preserve normal auth/header preparation from the current node
- use the same timeout/protocol-fallback framework already used by `worker.js`
- do not treat the `.strm` body as a cacheable metadata object

If the upstream `.strm` fetch fails, return the upstream response as-is.

### 2. Parse text content

Parsing rules:

- split by lines
- trim whitespace
- ignore empty lines
- ignore comment lines that start with `#`
- take the first line that matches a valid `http://` or `https://` URL
- reject non-HTTP protocols

If no valid URL is found, return `400`.

### 3. Re-enter existing decision logic

Once a valid external URL is extracted, the resolver must not directly choose “proxy” or “direct”.

Instead it passes that URL back into the existing policy chain so `worker.js` can keep deciding:

- direct handoff when external direct is allowed
- continue-proxy when external proxy is forced
- later redirect handling if the external target itself returns `30x`

This should be implemented by reusing current redirect/external-target helpers where possible, rather than by duplicating `handleDirect()` behavior from the free edition.

## Data-Flow Shape

The resolved `.strm` target should be represented in a form that can be consumed by the existing upstream flow.

Recommended implementation shape:

- add pure helpers such as:
  - `isResolvableStrmRequest(proxyPath)`
  - `extractFirstValidStrmUrl(text)`
- add one orchestrator helper such as:
  - `tryResolveStrmUpstreamState(execution, transport, buildFetchOptions, targetBases)`

That helper should return either:

- `null` when the request is not a resolvable `.strm`
- a ready-to-use upstream state object, or another narrow structured result that lets `Proxy.handle()` continue through the existing direct/proxy path without inventing a parallel response builder

The main rule is that `.strm` must plug into the current state machine, not fork away from it.

## Error Handling

Error handling should be explicit and narrow:

- upstream `.strm` fetch returns non-2xx:
  return that upstream response
- `.strm` body cannot be decoded or parsed:
  return `500` only for true internal parsing failure
- no valid external URL found:
  return `400`
- resolved URL uses a non-`http/https` protocol:
  return `400`

The resolver should not silently fall back to treating invalid `.strm` text as a normal media stream.

## Query and Header Rules

The resolved external URL must not inherit the original Emby/Jellyfin query string.

Reason:

- playback queries such as authorization or stream-control flags for the original media endpoint are not safe to append to arbitrary external links
- the free edition also stripped request query before direct handoff

Header rules:

- `.strm` text fetch strips `Range` / `If-Range`
- normal downstream playback request handling stays under current `worker.js` behavior
- no EMOS headers are introduced in this phase

## Logging and Diagnostics

The resolved `.strm` request should still use the normal `worker.js` logging path.

Expected result:

- final success/failure is logged once through the existing access-log path
- no second, special `.strm` logging subsystem is introduced
- if later needed, `.strm` origin can be added as a lightweight diagnostic field, but that is not required for this phase

## Testing Strategy

### Automated tests

Extend `tests/worker.phase1.test.mjs` or create a new focused test file with pure helper coverage for:

- `.strm` path detection
- Emby `stream.strm` exclusion
- first-valid-URL extraction
- comment/blank-line skipping
- invalid protocol rejection

The tests should remain pure Node `node:test` checks; no Worker runtime mocking is needed for the first pass.

### Manual verification

Use `npx wrangler dev` and verify:

1. a regular `.strm` file resolves and then follows the existing direct/proxy policy
2. `/emby/videos/.../stream.strm` does not trigger the resolver
3. invalid `.strm` content returns an explicit `400`
4. a `.strm` file that points to an external URL which then redirects still follows the current redirect handling rules

## Risks and Mitigations

Risk: `.strm` resolution is inserted too late and a direct 307 optimization bypasses parsing.
Mitigation: run the resolver before the direct 307 branch.

Risk: the resolver duplicates too much of the external redirect logic and drifts from normal behavior.
Mitigation: reuse current redirect decision helpers and absolute-fetch helpers.

Risk: original media query parameters leak into external disk links.
Mitigation: resolved external URL is used as-is without inheriting the original query string.

Risk: invalid `.strm` files become ambiguous runtime failures.
Mitigation: return explicit `400` for bad text / bad URL cases.

## Acceptance Criteria

- non-Emby `.strm` requests can be resolved to the first valid external URL
- Emby-native `stream.strm` requests remain untouched
- resolved targets still honor `worker.js` existing external direct/proxy policy
- invalid `.strm` text returns explicit client-facing errors
- targeted helper tests pass
- local `wrangler dev` boot still succeeds after the feature is wired in
