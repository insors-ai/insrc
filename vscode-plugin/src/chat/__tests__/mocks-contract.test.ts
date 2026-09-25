/**
 * Story E20260925edb76e2e:S001 / t3 — sc1 mock-deliverable contract suite.
 *
 * Locks the five mock HTML deliverables to the shipped tokens (the drift error
 * path): each checked-in mock must be byte-identical to what gen-mocks produces
 * now, so a token change without regeneration fails here. Also proves the module
 * boundary invariants (vscode-free, VS-Code-webview-only, anti-chat-bubble).
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/mocks-contract.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderTerminalStyle, surfaceClass, terminalTheme, SURFACE_KINDS } from '../design-tokens.js';
import { mockHtml, MOCK_FILE } from '../mocks/gen-mocks.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOCKS_DIR = join(HERE, '..', 'mocks');
const DESIGN_TOKENS_TS = join(HERE, '..', 'design-tokens.ts');

const readMock = (file: string): string => readFileSync(join(MOCKS_DIR, file), 'utf8');
const styleOf = (html: string): string => {
  const m = /<style>[\s\S]*?<\/style>/.exec(html);
  assert.ok(m, 'mock contains a <style> block');
  return m![0]!;
};

test('mock round-trip: each mock\'s <style> equals renderTerminalStyle(terminalTheme) byte-for-byte', () => {
  const expected = renderTerminalStyle(terminalTheme);
  for (const kind of SURFACE_KINDS) {
    assert.equal(styleOf(readMock(MOCK_FILE[kind])), expected, `${MOCK_FILE[kind]} <style> is in sync with the tokens`);
  }
});

test('mock files are up to date with the generator (regenerating produces no diff)', () => {
  for (const kind of SURFACE_KINDS) {
    assert.equal(readMock(MOCK_FILE[kind]), mockHtml(kind), `${MOCK_FILE[kind]} is byte-identical to gen-mocks output`);
  }
});

test('mock coverage: exactly five surfaces, each referencing its surfaceClass root class', () => {
  const htmlFiles = readdirSync(MOCKS_DIR).filter((f) => f.endsWith('.html'));
  assert.equal(htmlFiles.length, 5, 'exactly five mock HTML files');
  for (const kind of SURFACE_KINDS) {
    const html = readMock(MOCK_FILE[kind]);
    assert.ok(html.includes(`class="${surfaceClass(kind)}"`), `${MOCK_FILE[kind]} references its root class ${surfaceClass(kind)}`);
  }
});

test('VS-Code-webview-only: mock files reference no remote origin / asWebviewUri (ac2)', () => {
  for (const kind of SURFACE_KINDS) {
    const html = readMock(MOCK_FILE[kind]);
    assert.doesNotMatch(html, /https?:\/\//, `${MOCK_FILE[kind]} has no remote origin`);
    assert.doesNotMatch(html, /asWebviewUri/, `${MOCK_FILE[kind]} has no asWebviewUri`);
  }
});

test('anti-chat-bubble: mock markup uses the terminal vocabulary and no bubble constructs (ac1)', () => {
  for (const kind of SURFACE_KINDS) {
    const html = readMock(MOCK_FILE[kind]);
    assert.ok(/insrc-term__(box|marker|rule|sel|dim)/.test(html), `${MOCK_FILE[kind]} uses terminal vocabulary`);
    assert.doesNotMatch(html, /bubble|message-box|chat-bubble/i, `${MOCK_FILE[kind]} has no chat-bubble construct`);
  }
});

test('design-tokens.ts is vscode-free (source scan)', () => {
  const src = readFileSync(DESIGN_TOKENS_TS, 'utf8');
  assert.doesNotMatch(src, /from ['"]vscode['"]/, 'no vscode import');
  assert.doesNotMatch(src, /require\(['"]vscode['"]\)/, 'no vscode require');
});
