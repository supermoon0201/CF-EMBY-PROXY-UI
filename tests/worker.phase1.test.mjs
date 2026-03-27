import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeNodeRealClientIpMode,
  getRealClientIpHeaderMode,
  parseRemoteCandidateIpsFromSource,
  buildRemoteCandidateProbeUrl,
  buildMedia403CompatibilityModes,
  shouldFallbackToNoRange,
  selectTopCandidatesForDns,
  buildNodeCompatAutofixCandidateModes,
  selectNodeCompatAutofixMode,
  shouldBanUpstreamLine,
  buildRotatedRetryTargets,
  advanceLineCursor
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

test('parses uouin html table rows for carrier and ipv6 candidates', () => {
  const parsed = parseRemoteCandidateIpsFromSource(`
    <table>
      <tbody>
        <tr><th scope="row">1</th><td>电信</td><td>172.64.82.114</td></tr>
        <tr><th scope="row">2</th><td>联通</td><td>104.16.1.1</td></tr>
        <tr><th scope="row">3</th><td>移动</td><td>104.17.1.1</td></tr>
        <tr><th scope="row">4</th><td>多线</td><td>104.18.1.1</td></tr>
        <tr><th scope="row">5</th><td>IPV6</td><td>2a06:98c1:3121::1</td></tr>
      </tbody>
    </table>
  `, 'uouin');

  assert.deepEqual(
    parsed.map(item => ({ lineType: item.lineType, ip: item.ip })),
    [
      { lineType: '电信', ip: '172.64.82.114' },
      { lineType: '联通', ip: '104.16.1.1' },
      { lineType: '移动', ip: '104.17.1.1' },
      { lineType: '多线', ip: '104.18.1.1' },
      { lineType: 'ipv6', ip: '[2a06:98c1:3121::1]' }
    ]
  );
});

test('parses github top list candidates and removes private IPs', () => {
  const parsed = parseRemoteCandidateIpsFromSource('1.1.1.1 10.0.0.1 8.8.8.8 8.8.8.8', 'github-top10');
  assert.deepEqual(parsed.map(item => item.ip), ['1.1.1.1', '8.8.8.8']);
});

test('builds worker-side remote candidate probe urls over http for ip targets', () => {
  assert.equal(buildRemoteCandidateProbeUrl('162.159.45.186'), 'http://162.159.45.186/cdn-cgi/trace');
  assert.equal(buildRemoteCandidateProbeUrl('[2606:4700:4700::1111]'), 'http://[2606:4700:4700::1111]/cdn-cgi/trace');
  assert.equal(buildRemoteCandidateProbeUrl('not-an-ip'), '');
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

test('orders node compat autofix candidates and keeps sticky original mode', () => {
  assert.deepEqual(buildNodeCompatAutofixCandidateModes('dual'), ['dual', 'realip_only', 'off']);
  assert.deepEqual(buildNodeCompatAutofixCandidateModes('smart'), ['realip_only', 'off', 'dual']);

  const selected = selectNodeCompatAutofixMode({
    originalMode: 'off',
    stickyMargin: 0.15,
    tried: [
      { mode: 'off', pass: true, score: 90 },
      { mode: 'dual', pass: true, score: 100 },
      { mode: 'realip_only', pass: false, score: -10 }
    ]
  });

  assert.deepEqual(selected, { mode: 'off', bestMode: 'dual', changed: false });
});

test('decides upstream line bans and retry rotation helpers', () => {
  assert.equal(shouldBanUpstreamLine(403, null), true);
  assert.equal(shouldBanUpstreamLine(503, null), true);
  assert.equal(shouldBanUpstreamLine(401, null), false);
  assert.equal(shouldBanUpstreamLine(429, null), false);
  assert.equal(shouldBanUpstreamLine(0, new Error('network')), true);
  assert.deepEqual(buildRotatedRetryTargets(['a', 'b', 'c'], 1), ['b', 'c', 'a']);
  assert.equal(advanceLineCursor(2, 3), 0);
});
