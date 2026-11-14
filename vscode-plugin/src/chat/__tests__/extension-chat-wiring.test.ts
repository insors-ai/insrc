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
  // The channel seams live in the shared adapter (chat/webview-channel.ts) the chat adapter returns.
  assert.match(b, /return webviewChannel\(panel\);/, 'the chat adapter returns the shared channel');
  const channel = read(join(HERE, '..', 'webview-channel.ts'));
  assert.match(channel, /panel\.webview\.onDidReceiveMessage\(/, 'injects the inbound registrar');
  assert.match(channel, /panel\.webview\.postMessage\(message\)\.then\(undefined/, 'injects the fire-and-forget postMessage');
  assert.match(channel, /panel\.onDidDispose\(/, 'injects onDidDispose');
  assert.match(b, /createFileChatSessionStore\(\{\s*root: chatSessionsRoot,\s*logger: panelLog,\s*maxSessions: \d+,/, 'the sc4 store is the file store, with a bounded history cap (S005)');
  assert.match(b, /createProviderRegistry\(\{\s*spawn: nodeSpawner, isInstalled: defaultBinaryProbe, sessionOutput: chatOutput,\s*resolveOllamaTarget: createChatOllamaResolver\(/, 'the registry resolves Ollama routing at the shared spawn boundary');
  assert.match(b, /rawConfig: \(\) => configGateway.rawConfig\(\)/, 'Ollama routing reads daemon configuration through IPC');
});

test('the chat host + protocol + store modules are vscode-free', () => {
  for (const p of [CHAT_PANEL, SESSION_STORE, PROTOCOL]) {
    const src = read(p);
    assert.doesNotMatch(src, /from ['"]vscode['"]/, `${p} imports nothing from 'vscode'`);
    assert.doesNotMatch(src, /require\(['"]vscode['"]\)/, `${p} has no vscode require`);
  }
});

test('package.json contributes the chat command + the insrc.chat.enabled config (default on)', () => {
  const pkg = JSON.parse(read(PKG)) as {
    contributes: { commands: Array<{ command: string }>; configuration: Array<{ properties?: Record<string, { type?: string; default?: unknown }> }> };
  };
  assert.ok(pkg.contributes.commands.some((c) => c.command === 'insrc.chat.open'), 'insrc.chat.open command contributed');
  const props = Object.assign({}, ...pkg.contributes.configuration.map((g) => g.properties ?? {}));
  assert.ok('insrc.chat.enabled' in props, 'insrc.chat.enabled config contributed');
  assert.equal(props['insrc.chat.enabled'].type, 'boolean');
  assert.equal(props['insrc.chat.enabled'].default, true, 'flag defaults on (sidebar chat visible out of the box)');
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
  assert.match(b, /vscode\.commands\.executeCommand\(\s*'vscode\.diff'/, 'editor surface opens a native vscode.diff');
  assert.match(b, /'git',\s*\['-C', cwd/, 'baseline shells local git (no cloud REST, k2)');
});

test('chat wiring: the governance deps carry relPath and no computeDiff, and git is run with the given environment', () => {
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  const b = block![1]!;
  const gov = /editGovernance:\s*\{([\s\S]*?)\n      \},/.exec(b);
  assert.ok(gov, 'the editGovernance object is present');
  assert.match(gov![1]!, /relPath:\s*\(p\)\s*=>\s*relForGit\(chatCwd\(\), p\)/, 'relPath gives the path as git names it');
  assert.doesNotMatch(src, /computeDiff|defaultComputeDiff/, 'the per-file diff is gone');
  // runGit takes an environment and adds it to the process's own (GIT_INDEX_FILE for the private index).
  assert.match(b, /const runGit = \(cwd: string, args: string\[\], env\?: Record<string, string>\)/);
  assert.match(b, /env: \{ \.\.\.process\.env, \.\.\.env \}/);
  assert.match(b, /tempIndexPath:/);
  assert.match(b, /copyFile:/);
  assert.match(b, /removeFile:/);
});

test('S006: the edit-governor module is vscode-free', () => {
  const src = read(join(HERE, '..', 'edit-governor.ts'));
  assert.doesNotMatch(src, /from ['"]vscode['"]/, 'edit-governor.ts imports nothing from vscode');
  assert.doesNotMatch(src, /require\(['"]vscode['"]\)/, 'edit-governor.ts has no vscode require');
});

// ---- Chat group lock: setting + wiring (behaviour is pinned in group-lock.test.ts) ----

test('group-lock: package.json contributes insrc.chat.lockGroup (boolean, default true, machine scope)', () => {
  const pkg = JSON.parse(read(PKG)) as {
    contributes: { configuration: Array<{ properties?: Record<string, { type?: string; default?: unknown; scope?: string }> }> };
  };
  const props = Object.assign({}, ...pkg.contributes.configuration.map((g) => g.properties ?? {}));
  assert.ok('insrc.chat.lockGroup' in props, 'insrc.chat.lockGroup config contributed');
  assert.equal(props['insrc.chat.lockGroup'].type, 'boolean');
  assert.equal(props['insrc.chat.lockGroup'].default, true, 'lock defaults on');
  assert.equal(props['insrc.chat.lockGroup'].scope, 'machine');
});

test('group-lock: extension.ts wires thin seams into createChatGroupLock and attaches it in the one panel adapter', () => {
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  const b = block![1]!;
  assert.match(b, /createChatGroupLock\(\{/, 'builds the group lock inside the flag gate');
  assert.match(b, /getConfiguration\(\)\.get<boolean>\('insrc\.chat\.lockGroup'\) !== false/, 'reads the setting live with the full dotted key, default on');
  assert.match(b, /viewType: CHAT_VIEW_TYPE/, 'passes the exported chat view type');
  assert.match(b, /activeTabInput: \(\) => vscode\.window\.tabGroups\.activeTabGroup\.activeTab\?\.input/, 'hands over the raw tab input (the predicate lives in group-lock.ts)');
  assert.match(b, /tabGroups\.onDidChangeTabs\(/, 'retries on tab changes');
  assert.match(b, /tabGroups\.onDidChangeTabGroups\(/, 'retries on tab-group changes');
  assert.match(b, /executeCommand\('workbench\.action\.lockEditorGroup'\)/, 'the lock seam runs the built-in lock command');
  assert.match(
    b,
    /const webviewPanelChannel = \(panel: vscode\.WebviewPanel\): ChatPanelChannel => \{[\s\S]*?chatGroupLock\.attach\(panel\);[\s\S]*?const base = webviewChannel\(panel\);/,
    'the single create+restore adapter attaches the lock and wraps the shared channel',
  );
  // The view-type literal lives only in chat-panel.ts; extension.ts compares nothing itself.
  assert.doesNotMatch(src, /insrc\.chatPanel/, 'no chat view-type literal in extension.ts');
  assert.match(b, /registerWebviewPanelSerializer\(CHAT_VIEW_TYPE,/, 'the serializer is keyed by the exported constant');
});

test('group-lock: the module is vscode-free', () => {
  const src = read(join(HERE, '..', 'group-lock.ts'));
  assert.doesNotMatch(src, /from ['"]vscode['"]/, 'group-lock.ts imports nothing from vscode');
  assert.doesNotMatch(src, /require\(['"]vscode['"]\)/, 'group-lock.ts has no vscode require');
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
  // Over the shared daemon IPC client, naming the workspace folder as the repository on every call.
  assert.match(b, /createDocsReviewClient\(client, \{ repo: \(\) => vscode\.workspace\.workspaceFolders\?\.\[0\]\?\.uri\.fsPath \}\)/, 'the client is built over the shared daemon IPC client (k5)');
  assert.match(b, /commands\.register\(\{ id: 'insrc\.chat\.docsReview'/, 'registers the docs-review command');
});

test('S007: the docs-review host + client modules are vscode-free', () => {
  for (const f of ['docs-review-panel.ts', 'docs-review-client.ts']) {
    const src = read(join(HERE, '..', f));
    assert.doesNotMatch(src, /from ['"]vscode['"]/, `${f} imports nothing from vscode`);
    assert.doesNotMatch(src, /require\(['"]vscode['"]\)/, `${f} has no vscode require`);
  }
});

// ---- Editor-title icon: chat launched from the editor toolbar (like Claude/Codex) ----

test('editor-title: the chat opens from an editor/title icon, NOT an Activity Bar container', () => {
  const pkg = JSON.parse(read(PKG)) as {
    contributes: {
      viewsContainers?: Record<string, unknown>;
      views?: Record<string, unknown>;
      menus?: { 'editor/title'?: Array<{ command?: string; group?: string; when?: string }> };
      commands: Array<{ command: string; icon?: unknown }>;
    };
  };
  // No left-nav container/view.
  assert.ok(!pkg.contributes.viewsContainers, 'no viewsContainers (removed from the left Activity Bar)');
  assert.ok(!pkg.contributes.views, 'no contributed views');
  // The insrc icon lives in the editor title bar (top-right), the same place Claude/Codex use.
  const item = (pkg.contributes.menus?.['editor/title'] ?? []).find((m) => m.command === 'insrc.chat.open');
  assert.ok(item, 'insrc.chat.open contributed to editor/title');
  assert.equal(item!.group, 'navigation', 'shown as a navigation icon in the editor title toolbar');
  assert.equal(item!.when, 'insrc.chat.ready', 'gated on the activate-time context key (M1)');
  // The command carries the REAL insrc logo (themed light/dark), not a generic glyph.
  const cmd = pkg.contributes.commands.find((c) => c.command === 'insrc.chat.open');
  assert.deepEqual(cmd!.icon, { light: 'media/insrc-icon.svg', dark: 'media/insrc-icon-dark.svg' }, 'the command uses the real insrc icon (themed)');
});

test('editor-title: the real insrc icon SVGs exist, are non-empty, and ship in the .vsix', () => {
  for (const f of ['insrc-icon.svg', 'insrc-icon-dark.svg']) {
    const svg = read(join(HERE, '..', '..', '..', 'media', f));
    assert.match(svg, /<svg[\s\S]*<\/svg>/, `${f} is a valid SVG`);
    assert.ok(svg.length > 500, `${f} is the real (multi-shape) insrc mark, not a stub`);
  }
  const ignore = read(join(HERE, '..', '..', '..', '.vscodeignore'));
  assert.doesNotMatch(ignore, /^media(\/|\*)/m, '.vscodeignore does not exclude media/');
});

test('editor-title: extension.ts opens the chat as an editor-tab panel + gates the icon, docs-review intact', () => {
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  const b = block![1]!;
  assert.match(b, /const chatHost = createChatPanelHost\(\{/, 'builds the chat host');
  assert.match(b, /createPanel:[\s\S]*?vscode\.window\.createWebviewPanel\(viewType, title, vscode\.ViewColumn\.Beside/, 'the chat opens BESIDE the active editor (a split)');
  assert.match(b, /panel\.iconPath\s*=\s*\{[\s\S]*?insrc-icon\.svg[\s\S]*?insrc-icon-dark\.svg/, 'the chat tab is stamped with the real insrc icon (themed)');
  assert.match(b, /commands\.register\(\{ id: 'insrc\.chat\.open'[\s\S]*?chatHost\.open\(\)/, 'insrc.chat.open opens the editor-tab chat (no new command id)');
  assert.match(b, /setContext',\s*'insrc\.chat\.ready',\s*true/, 'M1: sets the insrc.chat.ready context key inside the chat gate');
  assert.match(b, /createDocsReviewHost\(\{/, 'docs-review host remains registered (untouched)');
  // The sidebar experiment is gone: no webview-view provider wiring remains.
  assert.doesNotMatch(b, /registerWebviewViewProvider/, 'no Activity Bar webview-view provider');
});

// ---- S001 (E20261010d6a4bc79): one CLI process per session ------------------------------

test('the extension passes a file-backed lock registry and the turnLockTimeoutMs setting', () => {
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  const b = block![1]!;
  const host = /createChatPanelHost\(\{([\s\S]*?)\n    \}\);/.exec(b);
  assert.ok(host, 'the createChatPanelHost call is present');
  assert.match(
    host![1]!,
    /sessionLocks: createFileSessionLocks\(\{ fs: nodeFsp, lockDir: join\(PATHS\.insrc, 'chat-locks'\), hostPid: process\.pid, logger: panelLog \}\)/,
    'a file-backed registry on ~/.insrc/chat-locks, owned by this extension host',
  );
  assert.match(host![1]!, /turnLockTimeoutMs: \(\) =>[\s\S]*?get<number>\('insrc\.chat\.turnLockTimeoutMs'\)/, 'a live read of the setting');
  assert.match(src, /import \{ createFileSessionLocks, defaultIsAlive, defaultProcessStartTime \} from '\.\/chat\/session-lock\.js';/);
});

test('package.json contributes insrc.chat.turnLockTimeoutMs (number, default 600000, minimum 1000)', () => {
  const pkg = JSON.parse(read(PKG)) as {
    contributes: { configuration: Array<{ properties?: Record<string, { type?: string; default?: unknown; minimum?: number }> }> };
  };
  const props = Object.assign({}, ...pkg.contributes.configuration.map((c) => c.properties ?? {})) as Record<string, { type?: string; default?: unknown; minimum?: number }>;
  const setting = props['insrc.chat.turnLockTimeoutMs'];
  assert.ok(setting, 'insrc.chat.turnLockTimeoutMs is contributed');
  assert.equal(setting!.type, 'number');
  assert.equal(setting!.default, 600000);
  assert.equal(setting!.minimum, 1000);
});

// ---- S001 (E202610101d04e560): the session output files ---------------------------------

test('the extension builds a session output on ~/.insrc/chat-output, passes it to the provider registry, and wires onEvict and the start-up sweep', () => {
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  const b = block![1]!;
  assert.match(src, /import \{ createSessionOutput \} from '\.\/chat\/session-output\.js';/);
  assert.match(b, /const chatOutput = createSessionOutput\(\{ root: join\(PATHS\.insrc, 'chat-output'\), logger: panelLog \}\)/, 'one root under ~/.insrc');
  assert.match(b, /createProviderRegistry\(\{\s*spawn: nodeSpawner, isInstalled: defaultBinaryProbe, sessionOutput: chatOutput,/, 'the registry keeps turn output in the session files');
  assert.match(b, /onEvict: \(id\) => \{\s*void chatOutput\.remove\(id\)/, "an evicted session's files are removed");
  assert.match(b, /const chatKeep = new Set\(\[\.\.\.chatStore\.list\(\)\.map\(\(c\) => c\.id\), \.\.\.migratedChats\.kept\]\);/, 'the sweep keeps the sessions in the store and those the migration left behind');
  assert.match(b, /void chatOutput\s*\.sweep\(\{ olderThanMs: CHAT_OUTPUT_MAX_AGE_MS, keep: chatKeep \}\)/, 'stale files of sessions not in the store are swept at start');
  assert.match(src, /const CHAT_OUTPUT_MAX_AGE_MS = 30 \* 24 \* 60 \* 60 \* 1000;/, '30 days');
});

test("extension.ts runs the migration before it builds the file store over join(PATHS.insrc, 'chat-sessions') with the session cap and the onEvict, and the output sweep keeps the store's ids and the migration's kept ids", () => {
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  const b = block![1]!;
  assert.match(src, /import \{ createFileChatSessionStore, migrateChatSessionsFromMemento \} from '\.\/chat\/session-file-store\.js';/);
  // One root for the migration and the store.
  assert.match(b, /const chatSessionsRoot = join\(PATHS\.insrc, 'chat-sessions'\);/, 'the sessions directory is under ~/.insrc');
  const migrate = b.indexOf('migrateChatSessionsFromMemento({ memento: context.globalState, root: chatSessionsRoot, logger: panelLog })');
  const build = b.indexOf('createFileChatSessionStore({');
  const sweep = b.indexOf('.sweep({');
  assert.ok(migrate >= 0, 'the migration reads context.globalState and writes to the same root');
  assert.ok(build > migrate, 'the store is built after the migration');
  assert.ok(sweep > build, 'the sweep runs after both');
  // The store: the same root, the cap and the onEvict.
  const store = /createFileChatSessionStore\(\{([\s\S]*?)\n    \}\);/.exec(b);
  assert.ok(store, 'the store construction is present');
  assert.match(store![1]!, /root: chatSessionsRoot,/);
  assert.match(store![1]!, /maxSessions: 200,/);
  assert.match(store![1]!, /onEvict: \(id\) => \{\s*void chatOutput\.remove\(id\)/);
  // The sweep keeps the store's ids and the ids the migration left in globalState.
  assert.match(b, /const chatKeep = new Set\(\[\.\.\.chatStore\.list\(\)\.map\(\(c\) => c\.id\), \.\.\.migratedChats\.kept\]\);/);
  assert.match(b, /void chatOutput\s*\.sweep\(\{ olderThanMs: CHAT_OUTPUT_MAX_AGE_MS, keep: chatKeep \}\)/);
  // The Memento store is no longer constructed by the extension, and nothing else writes chat keys.
  assert.equal(src.includes('createMementoChatSessionStore'), false);
  assert.equal(/insrc\.chat\.(index|session)/.test(src), false);
});

// ---- Story E2026101259da3204:S001 t8: chat attachments ----

test('extension wiring: the store is built on ~/.insrc/chat-attachments, the picker and opener are injected, onEvict removes a session\'s attachments and the start-up sweep uses the same keep set', () => {
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  const b = block![1]!;
  assert.match(src, /import \{ createAttachmentStore \} from '\.\/chat\/attachment-store\.js';/);
  // The store: its root is under ~/.insrc, beside the sessions and their output.
  assert.match(b, /const chatAttachments = createAttachmentStore\(\{ root: join\(PATHS\.insrc, 'chat-attachments'\), logger: panelLog \}\);/);

  // The chat host gets the store and the two VS Code calls.
  // (E202611031bd72813:S001 t5 adds the sessionOutput seam between links and attachments.)
  const seams = /createChatPanelHost\(\{\s*(?:links: linkOpener,\s*)?(?:sessionOutput: chatOutput,[^\n]*\n\s*)?attachments: \{([\s\S]*?)\n      \},/.exec(b);
  assert.ok(seams, 'the attachments seams are passed to the chat host');
  assert.match(seams![1]!, /store: chatAttachments,/);
  assert.match(
    seams![1]!,
    /pickFiles: async \(\) => \(\(await vscode\.window\.showOpenDialog\(\{ canSelectMany: true, openLabel: 'Attach' \}\)\) \?\? \[\]\)\.map\(\(uri\) => uri\.fsPath\),/,
    'the picker is the native dialog, many files, none when dismissed',
  );
  assert.match(seams![1]!, /open: \(path\) => \{[\s\S]*?executeCommand\('vscode\.open', vscode\.Uri\.file\(path\)\)/, 'the opener runs vscode.open on a file URI');
  assert.match(seams![1]!, /\.then\(undefined, \(e: unknown\) => panelLog\.warn\(/, 'a failed open is logged, never thrown');

  // An evicted session loses its output files and its attachments; each failure is logged.
  const store = /createFileChatSessionStore\(\{([\s\S]*?)\n    \}\);/.exec(b);
  assert.ok(store, 'the store construction is present');
  assert.match(store![1]!, /onEvict: \(id\) => \{\s*void chatOutput\.remove\(id\)\.catch\(/);
  assert.match(store![1]!, /void chatAttachments\.removeSession\(id\)\.catch\(\(e: unknown\) => panelLog\.warn\(/);

  // The start-up sweeps share one keep set and one age.
  assert.equal((b.match(/const chatKeep = /g) ?? []).length, 1);
  assert.match(b, /void chatOutput\s*\.sweep\(\{ olderThanMs: CHAT_OUTPUT_MAX_AGE_MS, keep: chatKeep \}\)\s*\.catch\(/);
  assert.match(b, /void chatAttachments\s*\.sweep\(\{ olderThanMs: CHAT_OUTPUT_MAX_AGE_MS, keep: chatKeep \}\)\s*\.catch\(\(e: unknown\) => panelLog\.warn\(/);
  assert.ok(b.indexOf('chatAttachments\n      .sweep(') > b.indexOf('createFileChatSessionStore({'), 'the sweep runs after the store is built');

  // The plugin's own declaration of the vscode module has the dialog; the store module needs no vscode.
  const decl = read(join(HERE, '..', '..', 'vscode.d.ts'));
  assert.match(decl, /export function showOpenDialog\(options\?: \{ canSelectMany\?: boolean \| undefined; openLabel\?: string \| undefined \}\): PromiseLike<readonly Uri\[\] \| undefined>;/);
  const storeSrc = read(join(HERE, '..', 'attachment-store.ts'));
  assert.doesNotMatch(storeSrc, /from ['"]vscode['"]/);
});

test('extension wiring: without a queue the chat command, the chat-ready context, the chat tab serializer and the review host\'s notifyChat are not set up, and with a queue they are', () => {
  const src = read(EXT).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /const chatOffered = chatIsOffered\(chatQueue\);/, 'availability is read from the queue factory result');
  assert.match(src, /if \(chatOffered\) void vscode\.commands\.executeCommand\('setContext', 'insrc\.chat\.ready', true\);/, 'the ready context (the editor-title icon) is set only with a queue');
  assert.match(src, /if \(chatOffered\) commands\.register\(\{ id: 'insrc\.chat\.open'/, 'the chat command is registered only with a queue');
  assert.match(src, /if \(chatOffered\) context\.subscriptions\.push\(\s*vscode\.window\.registerWebviewPanelSerializer\(CHAT_VIEW_TYPE/, 'the chat tab serializer is registered only with a queue');
  assert.match(src, /\.\.\.\(chatOffered \? \{ notifyChat: \(text: string\) => chatHost\.submitExternal\(text\) \} : \{\}\),/, "the review host's hand-over is bound only with a queue");
  // Nothing else turns the chat on outside the gate.
  assert.equal((src.match(/'insrc\.chat\.ready'/g) ?? []).length, 1, 'one place sets the ready context');
  assert.equal((src.match(/registerWebviewPanelSerializer\(CHAT_VIEW_TYPE/g) ?? []).length, 1, 'one chat serializer');
  assert.equal((src.match(/id: 'insrc\.chat\.open'/g) ?? []).length, 1, 'one chat command registration');
});

test('extension wiring: package.json lists insrc.chat.open in menus.commandPalette only when insrc.chat.ready', () => {
  const pkg = JSON.parse(read(PKG)) as { contributes: { menus: Record<string, Array<{ command: string; when?: string }>> } };
  const palette = pkg.contributes.menus['commandPalette'] ?? [];
  assert.deepEqual(palette.filter((m) => m.command === 'insrc.chat.open'), [{ command: 'insrc.chat.open', when: 'insrc.chat.ready' }]);
  const title = pkg.contributes.menus['editor/title'] ?? [];
  assert.deepEqual(title.filter((m) => m.command === 'insrc.chat.open').map((m) => m.when), ['insrc.chat.ready'], 'the editor-title icon is gated the same way');
});

test("extension wiring: a restored chat tab gets the chat's current title, since VS Code keeps the title a tab was saved with", () => {
  const src = read(EXT).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /deserializeWebviewPanel: \(panel\) => \{\s*try \{\s*panel\.title = CHAT_PANEL_TITLE;[^\n]*\n\s*chatHost\.adopt\(/, 'the title is set before the panel is adopted');
  assert.match(read(CHAT_PANEL), /export const CHAT_PANEL_TITLE = 'insrc ctrl';/);
  assert.match(read(CHAT_PANEL), /title: CHAT_PANEL_TITLE \}/, 'a fresh panel uses the same title');
});

test('extension wiring: the repo-config panel probes mcp.status WITH the selected repo path, so the project-layer .vibe/config.toml counts for vibe', () => {
  const src = read(EXT).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /mcpRegistration: \(repoPath\?: string\) => daemonData\.mcpRegistration\(repoPath, repoConfigReadTimeoutMs\)/,
    'the selected repo path and timeout are forwarded to the daemon probe');
});


// ---- Story E202611134642d49a:S001 t7: scratchpad extension wiring (store + host handlers) ----
//
// The four PLAN-named tests drive the REAL vscode-free scratch host (chat/scratch-host.ts)
// over fakes — executing the cancellation/answer flows, error+recovery, reveal/ready/cap
// ordering and disposal drop — and assert the extension.ts binding (store root next to the
// attachment store, injected input boundary, channel interceptor) by source scan.
import { createScratchHost, SCRATCH_INTENT_TYPES, type ScratchChatSeam } from '../scratch-host.js';
import { createScratchPanels, SCRATCHPADS_VIEW_TYPE, type ScratchPanels } from '../../panels/scratch-panels.js';
import type { ScratchStore, ScratchEntry } from '../scratch-store.js';
import type { PanelFactory, PanelHandle } from '../../panels/types.js';
import type { HostToWebview } from '../protocol.js';
import { runShell, ofType } from './chat-shell.test.js';
import { fire, type BodyStub } from './fake-dom.js';

interface FakeScratchStore extends ScratchStore {
  readonly calls: string[];
  failList: boolean;
  failCreate: boolean;
  failDelete: boolean;
  entries: ScratchEntry[];
  created: string[];
  deleted: string[];
}
const fakeStore = (): FakeScratchStore => {
  const s: FakeScratchStore = {
    calls: [], failList: false, failCreate: false, failDelete: false, created: [], deleted: [],
    entries: [{ id: '20260113-090000-late.md', name: '20260113-090000-late', mtime: 400, size: 1 }],
    listScratches: async (limit?: number) => {
      s.calls.push(`list:${limit ?? 'all'}`);
      if (s.failList) throw new Error('EACCES: permission denied');
      return s.entries.slice(0, limit);
    },
    createScratch: async (title: string) => {
      s.calls.push(`create:${title}`);
      if (s.failCreate) throw new Error('ENOSPC: no space left on device');
      s.created.push(title);
      const e: ScratchEntry = { id: `${title}.md`, name: title, mtime: 500, size: 0 };
      s.entries = [e, ...s.entries];
      return e;
    },
    readScratch: async (id: string) => ({ entry: s.entries.find((e) => e.id === id) ?? { id, name: id, mtime: 0, size: 0 }, content: 'body' }),
    deleteScratch: async (id: string) => {
      s.calls.push(`delete:${id}`);
      if (s.failDelete) throw new Error('EPERM: operation not permitted');
      s.deleted.push(id); s.entries = s.entries.filter((e) => e.id !== id);
    },
  };
  return s;
};

interface FakePanels extends ScratchPanels {
  readonly calls: string[];
}
const fakePanels = (): FakePanels => {
  const p: FakePanels = {
    calls: [],
    openBrowse: async () => { p.calls.push('openBrowse'); return undefined; },
    openDocument: async (id: string) => { p.calls.push(`openDocument:${id}`); return undefined; },
    refreshBrowse: async () => { p.calls.push('refreshBrowse'); },
    closeDocumentIfShowing: (id: string) => { p.calls.push(`closeDocumentIfShowing:${id}`); },
    invalidateId: (id: string) => { p.calls.push(`invalidateId:${id}`); },
    showingId: undefined,
    dispose: () => { p.calls.push('dispose'); },
  };
  return p;
};

interface FakeChat extends ScratchChatSeam {
  readonly posted: HostToWebview[];
  opened: number;
  readyCalls: number;
  isDisposed: boolean;
  /** When true, ready() stays pending until releaseReady() — tests control the handshake. */
  gateReady: boolean;
  private release?: () => void;
}
const fakeChat = (): FakeChat => {
  const c: FakeChat = {
    posted: [], opened: 0, readyCalls: 0, isDisposed: false, gateReady: false,
    open: () => { c.opened++; },
    ready: () => {
      c.readyCalls++;
      if (!c.gateReady) return Promise.resolve();
      return new Promise<void>((r) => { c.release = r; });
    },
    disposed: () => c.isDisposed,
    post: (msg: HostToWebview) => { c.posted.push(msg); },
  };
  return c;
};
/** Flush the microtask queue so fire-and-forget async handlers settle. */
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('extension-chat-wiring.test.ts: extension.ts constructs createScratchStore with root join(PATHS.insrc, \'scratches\') (ac1)', () => {
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  const b = block![1]!;
  // The store is constructed NEXT TO the attachment store (the ac1 adjacency), inside the gate.
  assert.match(b, /createAttachmentStore\(\{\s*root:\s*join\(PATHS\.insrc,\s*'chat-attachments'\),\s*logger:\s*panelLog\s*\}\);\s*\n([\s\S]*?)createScratchStore\(\{\s*root:\s*join\(PATHS\.insrc,\s*'scratches'\),\s*logger:\s*panelLog\s*\}\)/, 'createScratchStore({ root: join(PATHS.insrc, \'scratches\'), logger: panelLog }) sits right after createAttachmentStore, with fs omitted');
  assert.match(b, /createScratchHost\(\{[\s\S]*?store:\s*scratchStore,[\s\S]*?panels:\s*scratchPanels,[\s\S]*?promptTitle:/, 'the vscode-free scratch host is constructed over the store, panels and the injected input boundary');
  assert.match(b, /promptTitle:\s*\(\)\s*=>\s*Promise\.resolve\(vscode\.window\.showInputBox\(/, 'the scratch-new title comes from the showInputBox boundary, not a direct call inside the handler');
  assert.match(b, /scratchpads:\s*\{\s*enabled:\s*true\s*\}/, 'the chat host gets the scratchpads seam enabled');
  assert.match(b, /createScratchPanels\(\{[\s\S]*?panels:\s*scratchPanelFactory,[\s\S]*?genNonce:\s*makeNonce,[\s\S]*?setPanelTitle:/, 'the panels controller gets the title-capable factory, nonce source and setPanelTitle adapter');
  assert.match(b, /onSendToChat:\s*\(text\)\s*=>\s*scratchHost\.onMessage\(\{\s*type:\s*'send-to-chat',\s*text\s*\}\)/, 'the document view send-to-chat routes through the shared scratch host');
  // The scratch-host module itself is vscode-free.
  const host = read(join(HERE, '..', 'scratch-host.ts'));
  assert.doesNotMatch(host, /from ['"]vscode['"]/, 'scratch-host.ts imports nothing from vscode');
  // ISSUE-3183af2a: the scratch panel factory's postMessage adapter no longer swallows a
  // dropped post — a false delivery result or a rejection is logged via panelLog, and the
  // delivery promise is RETURNED so the panels controller's wrap() can log at its boundary too.
  assert.match(b, /return panel\.webview\.postMessage\(message\)\.then\(\s*\(delivered\)/, 'the scratch factory checks the postMessage delivery result and returns the promise');
  assert.match(b, /delivered === false\)\s*panelLog\.warn\(/, 'an undelivered post (webview not ready / disposed) is logged, not silent');
  assert.match(b, /\(\)\s*=>\s*\{\s*\n?\s*panelLog\.warn\([\s\S]*?return false;/, 'a rejected post (disposed panel) is logged and resolves false, not silent');
  // The controller's own wrap() logs drops through the injected logger (behavioral test in
  // scratch-panel.test.ts); here we pin the source wiring so a regression is caught.
  const sp = read(join(HERE, '..', '..', 'panels', 'scratch-panels.ts'));
  assert.match(sp, /return Promise\.resolve\(panel\.postMessage\(m\)\)\.then\(/, 'wrap() consumes the delivery promise');
  assert.match(sp, /delivered === false\)\s*log\.warn\(/, 'wrap() logs a false delivery via the injected logger');
  assert.match(sp, /\(\)\s*=>\s*\{\s*\n?\s*log\.warn\(/, 'wrap() logs a rejection via the injected logger');
  assert.match(sp, /catch \(err\) \{\s*\n?\s*log\.warn\([\s\S]*?threw synchronously/, 'wrap() contains and logs a synchronous throw');
});

test('extension-chat-wiring.test.ts: scratch-new title acquisition end-to-end — prompt cancelled -> no create + unchanged list; prompt answered -> create + list refresh + document open', async () => {
  const store = fakeStore();
  const panels = fakePanels();
  const chat = fakeChat();
  let promptAnswer: string | undefined = undefined;
  const host = createScratchHost({ store, panels, chat, promptTitle: async () => promptAnswer, logger: { warn: () => {} } });
  // Cancelled prompt: no create, and the UNCHANGED list is re-sent.
  host.onMessage({ type: 'scratch-new' });
  await flush();
  assert.deepEqual(store.created, [], 'a cancelled prompt creates nothing');
  assert.deepEqual(store.calls.filter((c) => c.startsWith('create:')), [], 'createScratch is never called');
  const cancelList = chat.posted.filter((m) => m.type === 'scratch-list');
  assert.equal(cancelList.length, 1, 'the unchanged list is re-sent once');
  assert.deepEqual((cancelList[0] as { entries: unknown }).entries, store.entries, 'the re-sent list is unchanged');
  assert.ok(!('error' in (cancelList[0] as object)), 'no error field on a successful list');
  // Blank-after-trim prompt: same no-op contract.
  chat.posted.length = 0;
  promptAnswer = '   ';
  host.onMessage({ type: 'scratch-new' });
  await flush();
  assert.deepEqual(store.created, [], 'a blank-trimmed prompt creates nothing');
  assert.equal(chat.posted.filter((m) => m.type === 'scratch-list').length, 1, 'the unchanged list is re-sent again');
  // Non-string prompt answer: dropped (no create), unchanged list re-sent.
  chat.posted.length = 0;
  promptAnswer = 42 as unknown as string | undefined;
  host.onMessage({ type: 'scratch-new' });
  await flush();
  assert.deepEqual(store.created, [], 'a non-string prompt answer creates nothing');
  assert.equal(chat.posted.filter((m) => m.type === 'scratch-list').length, 1, 'the unchanged list is re-sent after a malformed title');
  // Answered prompt: create + browse refresh + document open + re-sent list.
  chat.posted.length = 0;
  promptAnswer = 'My Pad';
  host.onMessage({ type: 'scratch-new' });
  await flush();
  assert.deepEqual(store.created, ['My Pad'], 'the answered prompt creates the scratchpad with the trimmed title');
  assert.deepEqual(panels.calls, ['refreshBrowse', 'openDocument:My Pad.md'], 'the browse table refreshes then the new document opens');
  const lists = chat.posted.filter((m) => m.type === 'scratch-list');
  assert.equal(lists.length, 1, 'the changed list is re-sent');
  assert.equal(((lists[0] as { entries: ScratchEntry[] }).entries)[0]?.id, 'My Pad.md', 'the new scratchpad heads the list');
});

test('extension-chat-wiring.test.ts: scratch-new with a FAILING create still re-sends the list but WITH the error field (the menu must not look healthy after a failed create)', async () => {
  const store = fakeStore();
  const panels = fakePanels();
  const chat = fakeChat();
  const host = createScratchHost({ store, panels, chat, promptTitle: async () => 'Broken Pad', logger: { warn: () => {} } });
  store.failCreate = true; // createScratch rejects; the subsequent listScratches succeeds
  host.onMessage({ type: 'scratch-new' });
  await flush();
  assert.deepEqual(store.created, [], 'nothing was created');
  assert.deepEqual(panels.calls, [], 'no browse refresh / document open on a failed create');
  const lists = chat.posted.filter((m) => m.type === 'scratch-list');
  assert.equal(lists.length, 1, 'the list is still re-sent after a failed create');
  const list = lists[0] as { entries: ScratchEntry[]; error?: string };
  assert.deepEqual(list.entries, store.entries.slice(0, 5), 'the entries are the (unchanged, successful) list');
  assert.match(list.error ?? '', /^create failed: Error: ENOSPC: no space left on device$/, 'the re-sent list carries the create error, not a silent healthy menu');
  // A later successful create recovers: the next list has NO error field.
  chat.posted.length = 0;
  store.failCreate = false;
  host.onMessage({ type: 'scratch-new' });
  await flush();
  const recovered = chat.posted.filter((m) => m.type === 'scratch-list');
  assert.equal(recovered.length, 1, 'the recovered create re-sends the list');
  assert.ok(!('error' in (recovered[0] as object)), 'the recovered list carries no error field');
});

test('extension-chat-wiring.test.ts: ISSUE-3183af2a defect 1 — a FAILING browse refresh does NOT skip opening the new document; a failed open is logged, not silent', async () => {
  const store = fakeStore();
  const panels = fakePanels();
  const chat = fakeChat();
  const warns: string[] = [];
  const host = createScratchHost({ store, panels, chat, promptTitle: async () => 'My Pad', logger: { warn: (m) => { warns.push(m); } } });
  // refreshBrowse rejects: the create still opens its document — opening is the point of the intent.
  const origRefresh = panels.refreshBrowse;
  panels.refreshBrowse = async () => { panels.calls.push('refreshBrowse'); throw new Error('browse refresh exploded'); };
  // openDocument fails (panel factory error): returns undefined.
  panels.openDocument = async (id: string) => { panels.calls.push(`openDocument:${id}`); return undefined; };
  host.onMessage({ type: 'scratch-new' });
  await flush();
  assert.deepEqual(store.created, ['My Pad'], 'the scratchpad was created');
  assert.deepEqual(panels.calls, ['refreshBrowse', 'openDocument:My Pad.md'], 'the document open is attempted even though the browse refresh failed');
  assert.ok(warns.some((w) => /browse refresh failed after create/.test(w)), 'the refresh failure is logged');
  assert.ok(warns.some((w) => /created My Pad\.md but its document panel did not open/.test(w)), 'the failed open is visible in the log instead of silent');
  assert.equal(chat.posted.filter((m) => m.type === 'scratch-list').length, 1, 'the list is still re-sent');
  // Recovery: refreshBrowse succeeds again, openDocument returns a handle -> no warnings at all.
  chat.posted.length = 0; panels.calls.length = 0; warns.length = 0;
  panels.refreshBrowse = origRefresh;
  panels.openDocument = async (id: string) => { panels.calls.push(`openDocument:${id}`); return { id } as never; };
  host.onMessage({ type: 'scratch-new' });
  await flush();
  assert.deepEqual(panels.calls, ['refreshBrowse', 'openDocument:My Pad.md']);
  assert.deepEqual(warns, [], 'a clean refresh + successful open logs nothing');
  assert.equal(chat.posted.filter((m) => m.type === 'scratch-list').length, 1, 'the list is re-sent on the clean path too');
});

test('extension-chat-wiring.test.ts: scratch-delete with a FAILING delete still re-sends the list but WITH the delete error field; the panels are still closed/refreshed; a later successful delete clears it (t7 delete-failure surfacing)', async () => {
  const store = fakeStore();
  const panels = fakePanels();
  const chat = fakeChat();
  const host = createScratchHost({ store, panels, chat, promptTitle: async () => undefined, logger: { warn: () => {} } });
  store.failDelete = true; // deleteScratch rejects; the subsequent listScratches succeeds
  host.onMessage({ type: 'scratch-delete', id: '20260113-090000-late.md' });
  await flush();
  assert.deepEqual(store.deleted, [], 'nothing was actually deleted');
  assert.deepEqual(panels.calls, ['invalidateId:20260113-090000-late.md', 'closeDocumentIfShowing:20260113-090000-late.md', 'refreshBrowse'], 'the delete still invalidates, closes and refreshes the panels');
  const lists = chat.posted.filter((m) => m.type === 'scratch-list');
  assert.equal(lists.length, 1, 'the list is still re-sent after a failed delete');
  const list = lists[0] as { entries: ScratchEntry[]; error?: string };
  assert.equal(list.entries.length, 1, 'the entries are the (unchanged, successful) list — the scratch is still there');
  assert.match(list.error ?? '', /^delete failed: Error: EPERM: operation not permitted$/, 'the re-sent list carries the delete error, not a silent success');
  // A later successful delete recovers: the next list has NO error field.
  chat.posted.length = 0;
  store.failDelete = false;
  host.onMessage({ type: 'scratch-delete', id: '20260113-090000-late.md' });
  await flush();
  const recovered = chat.posted.filter((m) => m.type === 'scratch-list');
  assert.equal(recovered.length, 1, 'the recovered delete re-sends the list');
  assert.ok(!('error' in (recovered[0] as object)), 'the recovered list carries no error field');
  assert.deepEqual(store.deleted, ['20260113-090000-late.md'], 'the retry actually deleted the scratch');
});

test('extension-chat-wiring.test.ts: scratch-list error field renders the unavailable row and a later success recovers; host switch cases for all six webview->host messages and both host->webview pushes', async () => {
  // The interceptor routes exactly the six intents.
  assert.deepEqual([...SCRATCH_INTENT_TYPES].sort(), ['scratch-browse', 'scratch-delete', 'scratch-new', 'scratch-open', 'scratch-open-menu', 'send-to-chat'], 'exactly the six scratch intents are intercepted');
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  assert.match(block![1]!, /SCRATCH_INTENT_TYPES\.has\(p\.type\)\)\s*scratchOnMessage\(p as WebviewToHost\)/, 'the wrapped chat channel routes the six intents to the scratch host before the chat listener');
  const store = fakeStore();
  const panels = fakePanels();
  const chat = fakeChat();
  const host = createScratchHost({ store, panels, chat, promptTitle: async () => undefined });
  // Store failure: the scratch-list push carries entries: [] + the unavailable error field.
  store.failList = true;
  host.onMessage({ type: 'scratch-open-menu' });
  await flush();
  let list = chat.posted.find((m) => m.type === 'scratch-list') as { entries: unknown; error?: string } | undefined;
  assert.ok(list, 'a scratch-list push is posted');
  assert.deepEqual(list!.entries, [], 'entries is empty on failure');
  assert.match(list!.error ?? '', /^scratchpads unavailable: /, 'the error field carries the unavailable prefix (the webview renders it as the error row)');
  // A later success recovers: entries posted with NO error field.
  chat.posted.length = 0;
  store.failList = false;
  host.onMessage({ type: 'scratch-open-menu' });
  await flush();
  list = chat.posted.find((m) => m.type === 'scratch-list') as { entries: ScratchEntry[]; error?: string } | undefined;
  assert.ok(list, 'a later scratch-list push is posted');
  assert.equal(list!.entries.length, 1, 'the recovered list carries the entries');
  assert.ok(!('error' in list!), 'no error field on success — distinct from the failure push');
  // All six intents dispatch to their handlers.
  chat.posted.length = 0; panels.calls.length = 0; store.calls.length = 0;
  host.onMessage({ type: 'scratch-open-menu' });
  host.onMessage({ type: 'scratch-open', id: 'a.md' });
  host.onMessage({ type: 'scratch-delete', id: 'b.md' });
  host.onMessage({ type: 'scratch-browse' });
  host.onMessage({ type: 'send-to-chat', text: 'hello' });
  await flush();
  assert.ok(store.calls.includes('list:5'), 'scratch-open-menu -> top-5 list');
  assert.ok(panels.calls.includes('openDocument:a.md'), 'scratch-open -> document panel');
  assert.deepEqual(store.deleted, ['b.md'], 'scratch-delete -> store delete');
  assert.ok(panels.calls.includes('invalidateId:b.md'), 'scratch-delete invalidates pending opens of the id');
  assert.ok(panels.calls.includes('closeDocumentIfShowing:b.md'), 'scratch-delete closes the document panel if it shows the id');
  assert.ok(panels.calls.includes('refreshBrowse'), 'scratch-delete refreshes the browse table');
  assert.ok(panels.calls.includes('openBrowse'), 'scratch-browse -> browse panel');
  assert.equal(chat.posted.filter((m) => m.type === 'insert-into-input').length, 1, 'send-to-chat -> insert-into-input push');
  // Malformed fields are rejected (dropped + logged), never thrown.
  assert.doesNotThrow(() => {
    host.onMessage({ type: 'scratch-open', id: 42 as unknown as string });
    host.onMessage({ type: 'scratch-delete', id: null as unknown as string });
    host.onMessage({ type: 'send-to-chat', text: 7 as unknown as string });
  });
  await flush();
  assert.ok(!panels.calls.includes('openDocument:42'), 'a non-string scratch-open id is dropped');
  assert.deepEqual(store.deleted, ['b.md'], 'a non-string scratch-delete id is dropped');
  assert.equal(chat.posted.filter((m) => m.type === 'insert-into-input').length, 1, 'a non-string send-to-chat text is dropped');
  // Malformed/unknown payload.type: the runtime guard drops them without throwing or dispatching.
  const dispatchesBefore = store.calls.length + panels.calls.length + chat.posted.length;
  assert.doesNotThrow(() => {
    host.onMessage(42 as unknown as WebviewToHost);
    host.onMessage(null as unknown as WebviewToHost);
    host.onMessage({ type: 7 } as unknown as WebviewToHost);
    host.onMessage({ type: 'not-a-scratch-intent' } as unknown as WebviewToHost);
    host.onMessage({} as unknown as WebviewToHost);
  });
  await flush();
  assert.equal(store.calls.length + panels.calls.length + chat.posted.length, dispatchesBefore, 'a non-string or unknown payload.type dispatches nothing');
  // Both host->webview pushes are the protocol's two scratch pushes.
  assert.ok(chat.posted.some((m) => m.type === 'scratch-list') && chat.posted.some((m) => m.type === 'insert-into-input'), 'both host->webview pushes (scratch-list, insert-into-input) are used');
  // End-to-end render: the REAL webview shell (runShell) shows the error row from a failed
  // store and re-renders the recovered entries from a later successful push.
  {
    const v = runShell({ hostDeps: { scratchpads: { enabled: true } } });
    const menu = v.el('insrc-scratchmenu');
    const renderStore = fakeStore();
    const renderHost = createScratchHost({
      store: renderStore,
      panels: fakePanels(),
      chat: {
        open: () => {},
        ready: () => Promise.resolve(),
        disposed: () => false,
        post: (m) => { if (m.type === 'scratch-list') v.msg(m); },
      },
      promptTitle: async () => undefined,
    });
    const lblOf = (c: BodyStub): string => (c.querySelector('.lbl') as BodyStub | null)?.textContent ?? '';
    const labels = (): string[] => menu.children.slice(1).map(lblOf);
    fire(v.el('insrc-scratch'), 'click');
    assert.deepEqual(ofType(v, 'scratch-open-menu'), [{ type: 'scratch-open-menu' }], 'the status-bar scratch button posts scratch-open-menu into the host router');
    renderStore.failList = true;
    renderHost.onMessage({ type: 'scratch-open-menu' });
    await flush();
    assert.equal(menu.children.length, 1, 'the failure renders exactly one row (no action strip on error)');
    assert.match(lblOf(menu.children[0]!), /^scratchpads unavailable: .*EACCES/, 'the real menu renders the unavailable error row');
    assert.equal(menu.children[0]!.attrs['aria-disabled'], 'true', 'the error row is disabled in the real render');
    renderStore.failList = false;
    renderHost.onMessage({ type: 'scratch-open-menu' });
    await flush();
    assert.match(menu.children[0]!.className, /scratchacts/, 'a later success re-renders the icon action strip on top');
    assert.deepEqual(labels(), ['20260113-090000-late'], 'a later success re-renders the recovered entries in the real menu');
  }
  // Panel-factory failure: the REAL controller returns undefined, logs a warning, and the
  // next open retries and succeeds (the ac-mapped coverage the wiring suite must carry).
  {
    const warns: string[] = [];
    const logger = { warn: (m: string) => { warns.push(m); } };
    interface FakePanel extends PanelHandle { readonly viewType: string }
    const made: FakePanel[] = [];
    let failFactory = false;
    const factory: PanelFactory = (o) => {
      if (failFactory) throw new Error('editor busy');
      const listeners: Array<() => void> = [];
      const h: FakePanel = {
        viewType: o.viewType,
        setHtml: () => {},
        reveal: () => {},
        onDidDispose: (l) => { listeners.push(l); },
        onMessage: () => {},
        postMessage: () => {},
        dispose: () => { listeners.forEach((l) => l()); },
      };
      made.push(h);
      return h;
    };
    const panels = createScratchPanels({ panels: factory, store: fakeStore(), logger, genNonce: () => 'n' });
    const first = await panels.openBrowse();
    assert.ok(first !== undefined, 'the first browse opens');
    assert.equal(made.length, 1);
    assert.equal(made[0]!.viewType, SCRATCHPADS_VIEW_TYPE, 'the browse panel uses the scratchpads view type');
    made[0]!.dispose(); // clear the cached singleton so the next open goes through the factory
    failFactory = true;
    const before = warns.length;
    const failed = await panels.openBrowse();
    assert.equal(failed, undefined, 'a factory failure returns undefined (never throws)');
    assert.ok(warns.length > before && warns[warns.length - 1]!.includes('editor busy'), 'the failure is logged with its reason');
    failFactory = false;
    const retried = await panels.openBrowse();
    assert.ok(retried !== undefined && made.length === 2, 'the next open retries and succeeds');
    panels.dispose();
  }
});

test('extension-chat-wiring.test.ts: send-to-chat reveals the chat panel, awaits the ready handshake, then pushes insert-into-input capped at 65,536 UTF-8 bytes; disposed chat drops silently', async () => {
  const store = fakeStore();
  const panels = fakePanels();
  const chat = fakeChat();
  const host = createScratchHost({ store, panels, chat, promptTitle: async () => undefined });
  // Reveal + ready ordering: with a gated ready, open() is called BEFORE ready() resolves,
  // and nothing is posted until the handshake fires.
  chat.gateReady = true;
  host.onMessage({ type: 'send-to-chat', text: 'selection text' });
  await flush();
  assert.equal(chat.opened, 1, 'send-to-chat reveals (opens) the chat panel first');
  assert.equal(chat.readyCalls, 1, 'then awaits the ready handshake');
  assert.equal(chat.posted.length, 0, 'nothing is posted before ready');
  (chat as unknown as { release: () => void }).release!();
  await flush();
  const pushed = chat.posted.filter((m) => m.type === 'insert-into-input');
  assert.equal(pushed.length, 1, 'insert-into-input is pushed after ready');
  assert.deepEqual(pushed[0], { type: 'insert-into-input', text: 'selection text' }, 'the text passes through unchanged under the cap');
  // Cap: >65,536 UTF-8 bytes is truncated with an ellipsis, final string within the cap.
  chat.posted.length = 0; chat.gateReady = false;
  const big = '😀'.repeat(20_000); // 80,000 bytes
  host.onMessage({ type: 'send-to-chat', text: big });
  await flush();
  const capped = chat.posted.find((m) => m.type === 'insert-into-input') as { text: string } | undefined;
  assert.ok(capped, 'the capped insert is pushed');
  assert.ok(Buffer.byteLength(capped!.text, 'utf8') <= 65_536, 'the final string is within 65,536 UTF-8 bytes');
  assert.ok(capped!.text.endsWith('…'), 'the truncated insert ends with the ellipsis');
  assert.ok(!capped!.text.includes('\uD83D') || capped!.text.codePointAt(capped!.text.length - 2) !== 0xD83D, 'no split surrogate pair before the ellipsis');
  // Disposed chat: open + ready still run, but the push is dropped silently (no throw).
  chat.posted.length = 0;
  chat.isDisposed = true;
  assert.doesNotThrow(() => host.onMessage({ type: 'send-to-chat', text: 'x' }));
  await flush();
  assert.equal(chat.opened, 3, 'a closed chat is opened before the disposed check (once per send-to-chat)');
  assert.equal(chat.posted.filter((m) => m.type === 'insert-into-input').length, 0, 'a disposed chat drops the text silently');
  // extension.ts binding: open-before-disposed-check ordering and the capped push.
  const src = read(EXT);
  const block = /if \(chatEnabled\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(block, 'the chatEnabled block is present');
  const chatSeam = /const chatSeam: ScratchChatSeam = \{([\s\S]*?)\n    \};/.exec(block![1]!);
  assert.ok(chatSeam, 'the chat seam is built inside the gate');
  assert.match(chatSeam![1]!, /open:\s*\(\)\s*=>\s*chatHost\.open\(\)/, 'the seam opens the chat host');
  assert.match(chatSeam![1]!, /disposed:\s*\(\)\s*=>\s*chatChannel === undefined/, 'disposed reflects the live channel');
  assert.match(chatSeam![1]!, /post:\s*\(msg: HostToWebview\)\s*=>\s*\{\s*chatChannel\?\.postMessage\(\{\s*v:\s*1,\s*payload:\s*msg\s*\}\);?\s*\}/, 'posts are enveloped and fire-and-forget');
  const hostSrc = read(join(HERE, '..', 'scratch-host.ts'));
  assert.match(hostSrc, /deps\.chat\.open\(\);\s*\n\s*await deps\.chat\.ready\(\);\s*\n\s*if \(deps\.chat\.disposed\(\)\) return;/, 'the host opens the chat, awaits ready, THEN checks disposed (a closed chat is opened first)');
  assert.match(hostSrc, /type:\s*'insert-into-input',\s*text:\s*capUtf8\(text\)/, 'the push is capped via the shared capUtf8');
});
