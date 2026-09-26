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

// ---- S006: diffView setting + edit-governance wiring ----

test('S006: package.json contributes insrc.chat.diffView (string enum chat|editor, default chat)', () => {
  const pkg = JSON.parse(read(PKG)) as {
    contributes: { configuration: Array<{ properties?: Record<string, { type?: string; default?: unknown; enum?: unknown[] }> }> };
  };
  const props = Object.assign({}, ...pkg.contributes.configuration.map((g) => g.properties ?? {}));
  assert.ok('insrc.chat.diffView' in props, 'insrc.chat.diffView config contributed');
  assert.equal(props['insrc.chat.diffView'].type, 'string');
  assert.deepEqual(props['insrc.chat.diffView'].enum, ['chat', 'editor'], 'enum is chat|editor');
  assert.equal(props['insrc.chat.diffView'].default, 'chat', 'diffView defaults to chat');
});

test('S006: extension.ts reads insrc.chat.diffView (full dotted key) + injects editGovernance seams', () => {
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  const b = block![1]!;
  assert.match(b, /getConfiguration\(\)\.get<DiffView>\('insrc\.chat\.diffView'\)/, 'reads diffView with the full dotted key');
  assert.match(b, /editGovernance:\s*\{/, 'passes editGovernance into createChatPanelHost');
  assert.match(b, /computeDiff:\s*defaultComputeDiff/, 'injects the graph-free computeDiff');
  assert.match(b, /vscode\.commands\.executeCommand\(\s*'vscode\.diff'/, 'editor surface opens a native vscode.diff');
  assert.match(b, /'git',\s*\['-C', cwd/, 'baseline shells local git (no cloud REST, k2)');
});

test('S006: the edit-governor module is vscode-free', () => {
  const src = read(join(HERE, '..', 'edit-governor.ts'));
  assert.doesNotMatch(src, /from ['"]vscode['"]/, 'edit-governor.ts imports nothing from vscode');
  assert.doesNotMatch(src, /require\(['"]vscode['"]\)/, 'edit-governor.ts has no vscode require');
});

// ---- S007: docs-review pane wiring ----

test('S007: package.json contributes the insrc.chat.docsReview command', () => {
  const pkg = JSON.parse(read(PKG)) as { contributes: { commands: Array<{ command: string }> } };
  assert.ok(pkg.contributes.commands.some((c) => c.command === 'insrc.chat.docsReview'), 'insrc.chat.docsReview command contributed');
});

test('S007: extension.ts wires the docs-review host inside the chat gate over the shared client', () => {
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  const b = block![1]!;
  assert.match(b, /createDocsReviewHost\(\{/, 'builds the docs-review host inside the flag gate');
  assert.match(b, /createDocsReviewClient\(client\)/, 'the client is built over the shared daemon IPC client (no new capability, k5)');
  assert.match(b, /commands\.register\(\{ id: 'insrc\.chat\.docsReview'/, 'registers the docs-review command');
});

test('S007: the docs-review host + client modules are vscode-free', () => {
  for (const f of ['docs-review-panel.ts', 'docs-review-client.ts']) {
    const src = read(join(HERE, '..', f));
    assert.doesNotMatch(src, /from ['"]vscode['"]/, `${f} imports nothing from vscode`);
    assert.doesNotMatch(src, /require\(['"]vscode['"]\)/, `${f} has no vscode require`);
  }
});

// ---- S-activitybar: sidebar chat webview view ----

test('S-activitybar: package.json contributes the insrc Activity Bar container + insrc.chatView webview view', () => {
  const pkg = JSON.parse(read(PKG)) as {
    contributes: {
      viewsContainers?: { activitybar?: Array<{ id: string; title: string; icon: string }> };
      views?: Record<string, Array<{ id: string; type?: string; when?: string }>>;
      commands: Array<{ command: string }>;
    };
  };
  const container = (pkg.contributes.viewsContainers?.activitybar ?? []).find((c) => c.id === 'insrc');
  assert.ok(container, 'insrc Activity Bar container contributed');
  assert.equal(container!.icon, 'media/insrc.svg', 'container uses the themeable media/insrc.svg icon');
  const view = (pkg.contributes.views?.['insrc'] ?? []).find((v) => v.id === 'insrc.chatView');
  assert.ok(view, 'insrc.chatView view contributed under the insrc container');
  assert.equal(view!.type, 'webview', 'the chat view is a webview view');
  assert.equal(view!.when, 'insrc.chat.ready', 'the view is gated on the activate-time context key (M1: not the live config key, so a runtime toggle cannot surface a provider-less broken pane)');
  // No new command id — the sidebar reuses insrc.chat.open.
  assert.ok(!pkg.contributes.commands.some((c) => c.command === 'insrc.chatView.focus'), 'no manual focus command is contributed (VS Code auto-generates it)');
});

test('S-activitybar: media/insrc.svg exists, is themeable (currentColor), and is not .vscodeignore’d', () => {
  const svg = read(join(HERE, '..', '..', '..', 'media', 'insrc.svg'));
  assert.match(svg, /currentColor/, 'the icon uses currentColor so VS Code themes it');
  const ignore = read(join(HERE, '..', '..', '..', '.vscodeignore'));
  assert.doesNotMatch(ignore, /^media(\/|\*)/m, '.vscodeignore does not exclude media/');
});

test('S-activitybar: extension.ts registers the sidebar provider + repoints insrc.chat.open, leaving docs-review intact', () => {
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  const b = block![1]!;
  assert.match(b, /createChatSidebarViewProvider\(\{/, 'builds the sidebar view provider');
  assert.match(b, /registerWebviewViewProvider\(\s*'insrc\.chatView'/, 'registers the provider with the exact contributed view id');
  assert.match(b, /retainContextWhenHidden:\s*true/, 'retains the webview context when hidden');
  assert.match(b, /view\.webview\.options\s*=\s*\{\s*enableScripts:\s*true\s*\}/, 'enables scripts on the view');
  assert.match(b, /makeHost:\s*\(createPanel\)\s*=>\s*createChatPanelHost\(\{\s*\.\.\.chatHostDeps,\s*createPanel\s*\}\)/, 'reuses createChatPanelHost with the shared deps + per-resolve createPanel');
  assert.match(b, /commands\.register\(\{ id: 'insrc\.chat\.open'[\s\S]*?executeCommand\('insrc\.chatView\.focus'\)/, 'insrc.chat.open focuses the sidebar view (no new command id)');
  assert.match(b, /createDocsReviewHost\(\{/, 'docs-review host remains registered (untouched)');
  // H1: the host resumes the last active session across rebuilds; the provider persists it.
  assert.match(b, /resumeSessionId:\s*\(\)\s*=>\s*context\.globalState\.get/, 'H1: chatHostDeps.resumeSessionId reads the persisted last-session id');
  assert.match(b, /onActiveSession:\s*\(id\)\s*=>\s*\{[\s\S]*?context\.globalState\.update\(LAST_CHAT_SESSION_KEY, id\)/, 'H1: the provider persists the active session id');
  // M1: the view is gated on an activate-time context key, set only inside the flag gate.
  assert.match(b, /setContext',\s*'insrc\.chat\.ready',\s*true/, 'M1: sets the insrc.chat.ready context key inside the chat gate');
});

test('S-activitybar: the chat-view-channel adapter module is runtime-vscode-free', () => {
  const src = read(join(HERE, '..', 'chat-view-channel.ts'));
  assert.doesNotMatch(src, /import\s+\{[^}]*\}\s+from ['"]vscode['"]/, 'no value import from vscode');
  assert.doesNotMatch(src, /import\s+\*\s+as\s+\w+\s+from ['"]vscode['"]/, 'no namespace import from vscode');
  assert.doesNotMatch(src, /require\(['"]vscode['"]\)/, 'no vscode require');
});
