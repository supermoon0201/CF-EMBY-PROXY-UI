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

test('treats whitespace-only and comment-only strm text as unresolved', () => {
  assert.equal(extractFirstValidStrmUrl('  \n# a\n# b\n'), '');
});

test('keeps https query strings from the strm line itself', () => {
  assert.equal(
    extractFirstValidStrmUrl('https://example.com/file.m3u8?token=abc'),
    'https://example.com/file.m3u8?token=abc'
  );
});
