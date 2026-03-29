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

test('rendered admin ui node card exposes nodeCompatAutofix action', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();
  const script = extractLastInlineScript(html);

  assert.equal(response.status, 200);
  assert.match(script, /apiCall\('nodeCompatAutofix'/);
  assert.match(html, /自动修复兼容/);
});

test('rendered admin ui lucide bridge constrains placeholder shells before nesting svg children', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();
  const script = extractLastInlineScript(html);

  assert.equal(response.status, 200);
  assert.match(script, /element\.style\.display = 'inline-flex'/);
  assert.match(script, /element\.replaceChildren\(svgElement\)/);
});

test('rendered admin ui removes standalone scheduler view and keeps dns workspace actions inline', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.doesNotMatch(html, /id="view-scheduler"/);
  assert.match(html, /回填到当前站点 A\/AAAA 草稿/);
  assert.match(html, /API 抓取/);
});

test('rendered admin ui scheduler exposes configurable source modal entry', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();
  const script = extractLastInlineScript(html);

  assert.equal(response.status, 200);
  assert.match(html, /抓取源/);
  assert.match(html, /管理远程候选 IP 抓取源/);
  assert.match(script, /apiCall\('listRemoteCandidateSources'/);
  assert.match(script, /apiCall\('saveRemoteCandidateSources'/);
  assert.match(script, /schedulerSourceFilter: 'all'/);
  assert.match(script, /getSchedulerSourceOptions\(/);
});

test('rendered admin ui dns view embeds preferred ip workspace draft-fill actions', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();
  const script = extractLastInlineScript(html);

  assert.equal(response.status, 200);
  assert.match(html, /Preferred IP Workspace/);
  assert.match(html, /优选工作台/);
  assert.match(html, /当前站点 IP/);
  assert.match(html, /独立 IP 池/);
  assert.match(html, /导入/);
  assert.match(html, /API 抓取/);
  assert.match(html, /回填到当前站点 A\/AAAA 草稿/);
  assert.match(script, /shouldShowDnsWorkspace\(/);
  assert.match(script, /refreshDnsIpWorkspace\(/);
  assert.match(script, /refreshDnsIpPoolFromSourcesFromUi\(/);
  assert.match(script, /fillDnsDraftFromIpPoolFromUi\(/);
});

test('rendered admin ui dns workspace tables keep current-host and pool columns visible', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<button type="button" @click="App\.setDnsIpWorkspaceTab\('current'\)"/);
  assert.match(html, /<button type="button" @click="App\.setDnsIpWorkspaceTab\('pool'\)"/);
  assert.match(html, /<th class="px-4 py-3">真实 COLO<\/th>/);
  assert.match(html, /<th class="px-4 py-3">城市 \/ 国家<\/th>/);
  assert.match(html, /<th class="px-4 py-3">来源<\/th>/);
  assert.match(html, /App\.getDnsIpProbeStatusClass\(item\.probeStatus\)/);
  assert.match(html, /App\.formatDnsIpProbedAt\(item\)/);
});

test('rendered admin ui logs table exposes ingress and egress colo columns with wide layout', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin'), createAdminEnv(), {});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<table class="w-full text-left table-fixed min-w-\[1320px\] border-separate border-spacing-0">/);
  assert.match(html, /<th class="py-3 px-4 w-24 border-b border-slate-200 dark:border-slate-800">入站机房\(COLO\)<\/th>/);
  assert.match(html, /<th class="py-3 px-4 w-24 border-b border-slate-200 dark:border-slate-800">出站机房\(COLO\)<\/th>/);
  assert.match(html, /<td colspan="8" class="py-10 text-center text-slate-500 dark:text-slate-400">暂无匹配日志记录<\/td>/);
  assert.match(html, /App\.getLogColoValue\(log, 'ingress'\)/);
  assert.match(html, /App\.getLogColoValue\(log, 'egress'\)/);
});
