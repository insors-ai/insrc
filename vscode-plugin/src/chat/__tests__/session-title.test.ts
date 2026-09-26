/**
 * Story E20260926f9563bf5:S001 / t6 — the header session-name clamp (ac4).
 *
 * Pure unit tests + host<->webview single-source parity (mirrors markers.test.ts):
 * a >32-char name clamps to 32 chars + a trailing ellipsis; <=32 is unchanged; and
 * the eval'd webview source computes the identical string as the host clamp.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/session-title.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampSessionTitle, clampSessionTitleWebviewSource, SESSION_TITLE_MAXLEN } from '../session-title.js';

test('clampSessionTitle: a name longer than 32 chars -> 32 chars + a trailing ellipsis (ac4)', () => {
  const long = 'x'.repeat(40);
  const out = clampSessionTitle(long);
  assert.equal(out, 'x'.repeat(32) + '…');
  assert.equal(out.length, 33, '32 name chars + one ellipsis glyph');
  assert.ok(out.endsWith('…'), 'a trailing ellipsis');
});

test('clampSessionTitle: a name of exactly 32 chars is unchanged (no ellipsis)', () => {
  const at = 'y'.repeat(SESSION_TITLE_MAXLEN);
  assert.equal(clampSessionTitle(at), at);
  assert.doesNotMatch(clampSessionTitle(at), /…/);
});

test('clampSessionTitle: a short name is unchanged', () => {
  assert.equal(clampSessionTitle('add a --json flag'), 'add a --json flag');
  assert.equal(clampSessionTitle(''), '');
});

test('parity: eval(clampSessionTitleWebviewSource()) equals clampSessionTitle for every sample (drift fails build)', () => {
  // eslint-disable-next-line no-eval
  const webviewClamp = eval(`(${clampSessionTitleWebviewSource()})`) as (s: string) => string;
  const samples = ['', 'short', 'z'.repeat(32), 'z'.repeat(33), 'refactor the whole rendering pipeline end to end today'];
  for (const s of samples) {
    assert.equal(webviewClamp(s), clampSessionTitle(s), `webview/host clamp drift on len=${s.length}`);
  }
  // The webview clamp is also defensive against a null/undefined name.
  assert.equal(webviewClamp(undefined as unknown as string), '');
});

test('clampSessionTitleWebviewSource() is CSP-safe: no import/remote/vscode', () => {
  const src = clampSessionTitleWebviewSource();
  assert.doesNotMatch(src, /\bimport\b/);
  assert.doesNotMatch(src, /https?:\/\//);
  assert.doesNotMatch(src, /\bvscode\b/);
});
