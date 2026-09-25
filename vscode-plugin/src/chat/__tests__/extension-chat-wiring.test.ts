/**
 * Story E20260925edb76e2e:S003 / t4 + t5 — extension wiring source-scan.
 *
 * Mirrors config/__tests__/seam.test.ts's regex-over-source idiom: proves the chat
 * panel is registered behind the insrc.chat.enabled gate with the real vscode
 * channel seams injected, the chat host module is vscode-free, and package.json
 * contributes the command + config. No runtime.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = join(HERE, '..', '..', 'extension.ts');
const CHAT_PANEL = join(HERE, '..', 'chat-panel.ts');
const SESSION_STORE = join(HERE, '..', 'session-store.ts');
const PROTOCOL = join(HERE, '..', 'protocol.ts');
const PKG = join(HERE, '..', '..', '..', 'package.json');

const read = (p: string): string => readFileSync(p, 'utf8');

test('extension.ts gates the chat command on insrc.chat.enabled (config read)', () => {
  const src = read(EXT);
  assert.match(src, /getConfiguration\(\)\.get<boolean>\('insrc\.chat\.enabled'\)/, 'reads the flag via getConfiguration().get with the full dotted key');
  assert.match(src, /if \(chatEnabled\)/, 'the chat wiring is inside the flag gate');
  assert.match(src, /commands\.register\(\{ id: 'insrc\.chat\.open'/, 'registers insrc.chat.open (into the subscriptions-backed registry)');
});

test('extension.ts constructs createChatPanelHost with the real injected vscode seams + memento store', () => {
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  const b = block![1]!;
  assert.match(b, /createChatPanelHost\(\{/, 'builds the chat host');
  assert.match(b, /vscode\.window\.createWebviewPanel\(/, 'injects the real createWebviewPanel');
  assert.match(b, /panel\.webview\.onDidReceiveMessage\(/, 'injects the inbound registrar');
  assert.match(b, /panel\.webview\.postMessage\(message\)\.then\(undefined/, 'injects the fire-and-forget postMessage');
  assert.match(b, /panel\.onDidDispose\(/, 'injects onDidDispose');
  assert.match(b, /createMementoChatSessionStore\(\{ memento: context\.globalState, maxSessions: \d+ \}\)/, 'the sc4 store binds over context.globalState (k3) with a bounded history cap (S005)');
  assert.match(b, /createProviderRegistry\(\{ spawn: nodeSpawner, isInstalled: defaultBinaryProbe \}\)/, 'the sc5 registry over the installed CLIs');
});

test('the chat host + protocol + store modules are vscode-free', () => {
  for (const p of [CHAT_PANEL, SESSION_STORE, PROTOCOL]) {
    const src = read(p);
    assert.doesNotMatch(src, /from ['"]vscode['"]/, `${p} imports nothing from 'vscode'`);
    assert.doesNotMatch(src, /require\(['"]vscode['"]\)/, `${p} has no vscode require`);
  }
});

test('package.json contributes the chat command + the insrc.chat.enabled config (default false)', () => {
  const pkg = JSON.parse(read(PKG)) as {
    contributes: { commands: Array<{ command: string }>; configuration: Array<{ properties?: Record<string, { type?: string; default?: unknown }> }> };
  };
  assert.ok(pkg.contributes.commands.some((c) => c.command === 'insrc.chat.open'), 'insrc.chat.open command contributed');
  const props = Object.assign({}, ...pkg.contributes.configuration.map((g) => g.properties ?? {}));
  assert.ok('insrc.chat.enabled' in props, 'insrc.chat.enabled config contributed');
  assert.equal(props['insrc.chat.enabled'].type, 'boolean');
  assert.equal(props['insrc.chat.enabled'].default, false, 'flag defaults off');
});
