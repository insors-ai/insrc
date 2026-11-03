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
  assert.match(b, /createProviderRegistry\(\{ spawn: nodeSpawner, isInstalled: defaultBinaryProbe(, sessionOutput: chatOutput)? \}\)/, 'the sc5 registry over the installed CLIs');
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
    /const webviewPanelChannel = \(panel: vscode\.WebviewPanel\): ChatPanelChannel => \{[\s\S]*?chatGroupLock\.attach\(panel\);\s*return webviewChannel\(panel\);/,
    'the single create+restore adapter attaches the lock',
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
  assert.match(b, /createProviderRegistry\(\{ spawn: nodeSpawner, isInstalled: defaultBinaryProbe, sessionOutput: chatOutput \}\)/, 'the registry keeps turn output in the session files');
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
  const seams = /createChatPanelHost\(\{\s*(?:links: linkOpener,\s*)?attachments: \{([\s\S]*?)\n      \},/.exec(b);
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
  assert.match(src, /mcpRegistration: \(repoPath\?: string\) => daemonData\.mcpRegistration\(repoPath\)/, 'the selected repo path is forwarded to the daemon probe');
});
