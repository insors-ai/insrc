/**
 * Story E202610138d4b90c9:S001 t13 — the review pane's wiring in the extension, and the
 * reader of an artifact's HTML documents.
 *
 * The wiring is read from extension.ts's source (it needs vscode to run); the reader is
 * run against a real temporary folder.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/review-wiring.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPANION_MAX_BYTES, createCompanionReader } from '../companion-reader.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(HERE, ...parts), 'utf8');
/** Source with its comments removed, so prose about a module is not read as an import of it. */
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test("review wiring: the review host's notifyChat is bound to the chat host's submitExternal when there is a queue and absent when there is none, it is given a readCompanion, and neither host module imports the other", () => {
  const ext = code(read('..', '..', 'extension.ts'));
  const block = /createDocsReviewHost\(\{([\s\S]*?)\n    \}\);/.exec(ext)?.[1];
  assert.ok(block, 'the review host is built in extension.ts');
  assert.match(
    block!,
    /\.\.\.\(chatOffered \? \{ notifyChat: \(text: string\) => chatHost\.submitExternal\(text\) \} : \{\}\),/,
    "with a queue notifyChat hands the message to the chat host's submitExternal; without one there is no binding",
  );
  assert.match(ext, /const chatOffered = chatIsOffered\(chatQueue\);/, 'chat availability comes from the queue factory result');
  assert.match(block!, /readCompanion: createCompanionReader\(\{ root: \(\) => vscode\.workspace\.workspaceFolders\?\.\[0\]\?\.uri\.fsPath \}\),/, 'readCompanion reads under the first workspace folder');
  assert.match(ext, /import \{ createCompanionReader \} from '\.\/chat\/companion-reader\.js';/);
  // The pane names the workspace folder to the daemon on every call, so it does not depend on the daemon's default.
  // (Story E20261013e62a9269:S001: the client is made once, before the chat host, and shared with the presenter.)
  assert.match(ext, /const reviewClient = createDocsReviewClient\(client, \{ repo: \(\) => vscode\.workspace\.workspaceFolders\?\.\[0\]\?\.uri\.fsPath \}\);/);
  assert.match(block!, /client: reviewClient,/);
  // Both hosts are built in the same gated block, the chat host first, so the binding is to a host that exists.
  assert.ok(ext.indexOf('const chatHost = createChatPanelHost({') > 0);
  assert.ok(ext.indexOf('const chatHost = createChatPanelHost({') < ext.indexOf('const reviewHost = createDocsReviewHost({'));

  // Neither host module imports the other. The chat host imports nothing of the review pane.
  const chat = code(read('..', 'chat-panel.ts'));
  assert.doesNotMatch(chat, /from '\.\/docs-review[^']*'/, 'the chat host does not import the review pane');
  // The review host takes from the chat host's module only the shared attribute escaper and
  // two types (the channel and the logger, which every webview host shares): never the chat
  // host itself. It reaches the chat through the function it is given.
  const review = code(read('..', 'docs-review-panel.ts'));
  const fromChat = [...review.matchAll(/import ([^;]*?) from '\.\/chat-panel\.js';/g)].map((m) => m[1]);
  assert.deepEqual(fromChat, ['{ attr, type ChatPanelChannel, type ChatPanelLogger }']);
  assert.doesNotMatch(review, /createChatPanelHost|submitExternal/, 'the review host never names the chat host');
  assert.match(review, /deps\.notifyChat\(text\)/, 'it calls the function it was given');
  // The reader and the comment source are free of both hosts and of vscode.
  for (const file of ['companion-reader.ts', 'docs-review-comments.ts']) {
    const src = code(read('..', file));
    assert.doesNotMatch(src, /from '(?:vscode|\.\/chat-panel\.js|\.\/docs-review-panel\.js)'/, `${file} imports neither host nor vscode`);
  }
});

test("review wiring: readCompanion answers the text of an .html file under the workspace's docs/ folder and undefined for another extension, a path that leaves docs/, a missing file and a file over 8 MB", async () => {
  const root = mkdtempSync(join(tmpdir(), 'insrc-companion-'));
  const outside = mkdtempSync(join(tmpdir(), 'insrc-companion-out-'));
  try {
    mkdirSync(join(root, 'docs', 'epics', 'x', 'S001'), { recursive: true });
    const PAGE = '<!doctype html><html><body><script>draw()</script>é</body></html>';
    writeFileSync(join(root, 'docs', 'epics', 'x', 'S001', 'sequence-diagram.html'), PAGE);
    writeFileSync(join(root, 'docs', 'epics', 'x', 'S001', 'LLD.md'), '# LLD');
    writeFileSync(join(root, 'docs', 'epics', 'x', 'S001', 'UPPER.HTML'), 'upper');
    writeFileSync(join(root, 'top.html'), 'outside docs');
    writeFileSync(join(outside, 'secret.html'), 'secret');
    mkdirSync(join(root, 'docs', 'dir.html'));
    const readCompanion = createCompanionReader({ root: () => root });

    // The text of an .html file under docs/.
    assert.equal(await readCompanion('docs/epics/x/S001/sequence-diagram.html'), PAGE);
    assert.equal(await readCompanion('docs/epics/x/S001/UPPER.HTML'), 'upper', 'the extension is matched without regard to case');
    assert.equal(await readCompanion('docs/epics/x/../x/S001/sequence-diagram.html'), PAGE, 'a path that stays under docs/ is fine');

    // Another extension.
    assert.equal(await readCompanion('docs/epics/x/S001/LLD.md'), undefined);
    assert.equal(await readCompanion('docs/epics/x/S001/sequence-diagram.html.md'), undefined);
    // A path that leaves docs/: by '..', by not being under it, or by being absolute.
    assert.equal(await readCompanion('docs/../top.html'), undefined);
    assert.equal(await readCompanion('top.html'), undefined);
    assert.equal(await readCompanion(`docs/../../${outside.split('/').pop()}/secret.html`), undefined);
    assert.equal(await readCompanion(join(outside, 'secret.html')), undefined);
    assert.equal(await readCompanion(join(root, 'docs', 'epics', 'x', 'S001', 'sequence-diagram.html')), undefined, 'an absolute path is refused even when it is under docs/');
    // A symlink under docs/ that leads out of it.
    symlinkSync(join(outside, 'secret.html'), join(root, 'docs', 'leak.html'));
    assert.equal(await readCompanion('docs/leak.html'), undefined);
    symlinkSync(outside, join(root, 'docs', 'out'));
    assert.equal(await readCompanion('docs/out/secret.html'), undefined);
    // A missing file, and something that is not a file.
    assert.equal(await readCompanion('docs/epics/x/S001/missing.html'), undefined);
    assert.equal(await readCompanion('docs/dir.html'), undefined);
    assert.equal(await readCompanion(''), undefined);
    assert.equal(await readCompanion(7 as unknown as string), undefined);

    // The size limit: exactly 8 MB is read, one byte more is not.
    assert.equal(COMPANION_MAX_BYTES, 8 * 1024 * 1024);
    const big = join(root, 'docs', 'big.html');
    writeFileSync(big, '');
    truncateSync(big, COMPANION_MAX_BYTES);
    assert.equal((await readCompanion('docs/big.html'))?.length, COMPANION_MAX_BYTES);
    truncateSync(big, COMPANION_MAX_BYTES + 1);
    assert.equal(await readCompanion('docs/big.html'), undefined);

    // No workspace folder, or one with no docs/ folder: nothing is read, nothing is thrown.
    assert.equal(await createCompanionReader({ root: () => undefined })('docs/epics/x/S001/sequence-diagram.html'), undefined);
    assert.equal(await createCompanionReader({ root: () => outside })('docs/secret.html'), undefined);
    assert.equal(await createCompanionReader({ root: () => { throw new Error('no workspace'); } })('docs/a.html'), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

// Story E202610131f74c81f:S001 t3: the pane's tab icon and the watcher of the open document.
test("review wiring: extension.ts sets the review panel's iconPath to the pair and gives the review host a watchDocument bound to file watchers under the workspace folder", () => {
  const ext = code(read('..', '..', 'extension.ts'));
  const block = /createDocsReviewHost\(\{([\s\S]*?)\n    \}\);/.exec(ext)?.[1];
  assert.ok(block, 'the review host is built in extension.ts');
  // The icon is set on the vscode panel before it is wrapped as a channel.
  const create = /createPanel: \(\{ viewType, title, quiet \}\) => \{([\s\S]*?)\n      \},/.exec(block!)?.[1];
  assert.ok(create, 'createPanel builds the panel itself');
  // Without quiet the pane is created in an open group without the chat tab, else as before in the active column (standalone d27fe899).
  assert.match(create!, /: vscode\.window\.createWebviewPanel\(viewType, title, column \?\? vscode\.ViewColumn\.Active, \{ enableScripts: true \}\);/);
  assert.match(create!, /panel\.iconPath = \{\s*light: vscode\.Uri\.file\(join\(context\.extensionPath, 'media', 'insrc-review-icon\.svg'\)\),\s*dark: vscode\.Uri\.file\(join\(context\.extensionPath, 'media', 'insrc-review-icon-dark\.svg'\)\),\s*\};/);
  assert.ok(create!.indexOf('panel.iconPath') < create!.indexOf('return webviewChannel(panel);'), 'before it is wrapped');
  // The watcher: one VS Code file watcher per path, under the first workspace folder, all three events, disposed together.
  const watch = /watchDocument: \(relPaths, onChange\) => \{([\s\S]*?)\n      \},/.exec(block!)?.[1];
  assert.ok(watch, 'the host is given watchDocument');
  assert.match(watch!, /const folder = vscode\.workspace\.workspaceFolders\?\.\[0\];/);
  assert.match(watch!, /if \(folder === undefined\) return \{ dispose: \(\) => \{\} \};/, 'with no folder it watches nothing and still answers a disposer');
  assert.match(watch!, /vscode\.workspace\.createFileSystemWatcher\(new vscode\.RelativePattern\(folder, rel\)\)/);
  for (const ev of ['onDidChange', 'onDidCreate', 'onDidDelete']) assert.match(watch!, new RegExp(`w\\.${ev}\\(onChange\\);`), `${ev} reports a change`);
  assert.match(watch!, /return \{ dispose: \(\) => \{ for \(const w of watchers\) w\.dispose\(\); \} \};/);
  // The host itself stays free of vscode.
  assert.doesNotMatch(code(read('..', 'docs-review-panel.ts')), /from 'vscode'/);
});

// Story E20261013e62a9269:S001: a document the chat presents is opened in the review pane.
test("extension wiring: the chat host's presenter opens a document through the review host's openArtifact with the pending list's id and path and quiet set; createPanel creates the pane in an open editor group that holds no chat tab and otherwise in the active column without quiet, or beside the chat without focus with it; there is no presenter when the review pane is not created", () => {
  const ext = code(read('..', '..', 'extension.ts'));
  assert.match(ext, /import \{ createReviewPresenter \} from '\.\/chat\/review-presenter\.js';/);
  // The presenter: the pending list from the review client, the open through the review host, quietly.
  const made = /const reviewPresenter = createReviewPresenter\(\{([\s\S]*?)\n    \}\);/.exec(ext)?.[1];
  assert.ok(made, 'the presenter is built in extension.ts');
  assert.match(made!, /pendingDocuments: \(\) => reviewClient\.pendingDocuments\(\),/);
  assert.match(made!, /open: \(target\) => docsReviewHost\?\.openArtifact\(\{ \.\.\.target, quiet: true \}\),/, "the target's id and path, as the list gave them, with quiet");
  assert.match(made!, /log: panelLog,/);
  // It is given to the chat host,
  const chat = /const chatHost = createChatPanelHost\(\{([\s\S]*?)\n    \}\);/.exec(ext)?.[1];
  assert.ok(chat);
  assert.match(chat!, /presenter: reviewPresenter,/);
  // and reaches the review host through the variable the review host is assigned to once made.
  assert.match(ext, /docsReviewHost = reviewHost;/);
  // No presenter without the review pane: both are made in the one block the chat's flag gates,
  // the presenter before the chat host and the review host after it; the presenter is made nowhere else.
  const iPresenter = ext.indexOf('const reviewPresenter = createReviewPresenter({');
  const iChat = ext.indexOf('const chatHost = createChatPanelHost({');
  const iReview = ext.indexOf('const reviewHost = createDocsReviewHost({');
  assert.ok(iPresenter > 0 && iPresenter < iChat && iChat < iReview);
  assert.equal(ext.split('createReviewPresenter(').length - 1, 1);
  assert.equal(ext.split('createChatPanelHost(').length - 1, 1, 'one chat host, so one place a presenter could be given');
  const gate = ext.lastIndexOf("if (", iPresenter);
  assert.ok(gate > 0 && ext.slice(gate, iPresenter).split('\n  }\n').length === 1, 'still inside the block that the chat flag opens');
  assert.ok(ext.indexOf('const reviewHost = createDocsReviewHost({') < ext.indexOf('docsReviewHost = reviewHost;'));

  // The pane's creation: a group without the chat tab when there is one (read through a try, by the placement function);
  // otherwise today's placement: quiet goes beside the chat without focus, not quiet into the active column.
  const block = /createDocsReviewHost\(\{([\s\S]*?)\n    \}\);/.exec(ext)?.[1];
  const create = /createPanel: \(\{ viewType, title, quiet \}\) => \{([\s\S]*?)\n      \},/.exec(block!)?.[1];
  assert.ok(create);
  assert.match(create!, /const column = reviewColumn\(\);/);
  assert.match(create!, /const panel = quiet === true\s*\? vscode\.window\.createWebviewPanel\(viewType, title, \{ viewColumn: column \?\? vscode\.ViewColumn\.Beside, preserveFocus: true \}, \{ enableScripts: true \}\)\s*: vscode\.window\.createWebviewPanel\(viewType, title, column \?\? vscode\.ViewColumn\.Active, \{ enableScripts: true \}\);/);
  // The column comes from the tab groups, read in a try, through the placement function; a read that throws gives today's placement.
  assert.match(ext, /const reviewColumn = \(\): vscode\.ViewColumn \| undefined => \{\s*try \{\s*const groups = vscode\.window\.tabGroups\.all\.map\(/);
  assert.match(ext, /return chooseReviewColumn\(groups, CHAT_VIEW_TYPE\) as vscode\.ViewColumn \| undefined;\s*\} catch \(err\) \{\s*panelLog\.warn\([^\n]*\);\s*return undefined;/);
  assert.match(ext, /import \{ chooseReviewColumn \} from '\.\/chat\/review-column\.js';/);
  // The channel's reveal passes preserveFocus on to the panel, and reveals as before without it.
  const channel = code(read('..', 'webview-channel.ts'));
  assert.match(channel, /reveal: \(opts\) => \(opts\?\.preserveFocus === true \? panel\.reveal\(undefined, true\) : panel\.reveal\(\)\),/);
});
