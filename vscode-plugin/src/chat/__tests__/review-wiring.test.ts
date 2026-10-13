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

test("review wiring: the review host is given notifyChat bound to the chat host's submitExternal and a readCompanion, and neither host module imports the other", () => {
  const ext = code(read('..', '..', 'extension.ts'));
  const block = /createDocsReviewHost\(\{([\s\S]*?)\n    \}\);/.exec(ext)?.[1];
  assert.ok(block, 'the review host is built in extension.ts');
  assert.match(block!, /notifyChat: \(text\) => chatHost\.submitExternal\(text\),/, "notifyChat hands the message to the chat host's submitExternal");
  assert.match(block!, /readCompanion: createCompanionReader\(\{ root: \(\) => vscode\.workspace\.workspaceFolders\?\.\[0\]\?\.uri\.fsPath \}\),/, 'readCompanion reads under the first workspace folder');
  assert.match(ext, /import \{ createCompanionReader \} from '\.\/chat\/companion-reader\.js';/);
  // The pane names the workspace folder to the daemon on every call, so it does not depend on the daemon's default.
  assert.match(block!, /client: createDocsReviewClient\(client, \{ repo: \(\) => vscode\.workspace\.workspaceFolders\?\.\[0\]\?\.uri\.fsPath \}\),/);
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
  const create = /createPanel: \(\{ viewType, title \}\) => \{([\s\S]*?)\n      \},/.exec(block!)?.[1];
  assert.ok(create, 'createPanel builds the panel itself');
  assert.match(create!, /const panel = vscode\.window\.createWebviewPanel\(viewType, title, vscode\.ViewColumn\.Active, \{ enableScripts: true \}\);/);
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
