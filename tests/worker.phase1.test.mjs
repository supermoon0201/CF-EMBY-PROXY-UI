import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeNodeRealClientIpMode,
  getRealClientIpHeaderMode,
  parseRemoteCandidateIpsFromSource,
  buildMedia403CompatibilityModes,
  shouldFallbackToNoRange,
  selectTopCandidatesForDns
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

test('parses github top list candidates and removes private IPs', () => {
  const parsed = parseRemoteCandidateIpsFromSource('1.1.1.1 10.0.0.1 8.8.8.8 8.8.8.8', 'github-top10');
  assert.deepEqual(parsed.map(item => item.ip), ['1.1.1.1', '8.8.8.8']);
});

test('builds media 403 compatibility ladder in the expected order', () => {
  assert.deepEqual(buildMedia403CompatibilityModes('smart'), ['origin', 'off', 'dual', 'realip_only']);
});

test('falls back to no-range only for broken bytes=0- responses', () => {
  assert.equal(shouldFallbackToNoRange('bytes=0-', 200, ''), true);
  assert.equal(shouldFallbackToNoRange('bytes=0-', 206, 'bytes 0-1/10'), false);
  assert.equal(shouldFallbackToNoRange('bytes=100-', 200, ''), false);
});

test('keeps only the fastest usable top3 candidates', () => {
  const top = selectTopCandidatesForDns([
    { ip: '1.1.1.1', latencyMs: 120 },
    { ip: '2.2.2.2', latencyMs: 80 },
    { ip: '3.3.3.3', latencyMs: 9999 },
    { ip: '4.4.4.4', latencyMs: 95 }
  ]);
  assert.deepEqual(top.map(item => item.ip), ['2.2.2.2', '4.4.4.4', '1.1.1.1']);
});
