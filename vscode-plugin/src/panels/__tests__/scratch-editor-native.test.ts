import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type * as VSCode from 'vscode';
import { createScratchStore } from '../../chat/scratch-store.js';
import { registerScratchEditor, SCRATCH_EDITOR_VIEW_TYPE } from '../scratch-editor-native.js';
import { ScratchRecoveryStore } from '../scratch-editor-recovery.js';
import { ScratchLockPreference } from '../scratch-editor-lock.js';
import { scratchDigest } from '../scratch-editor-provider.js';
import { scratchEditorHtml } from '../scratch-editor-html.js';
import { makeNonce } from '../html.js';
import type { ScratchHostToEditor } from '../scratch-editor-protocol.js';

function events<T>() { const listeners = new Set<(e: T) => unknown>(); return { listen: (fn: (e: T) => unknown) => { listeners.add(fn); return { dispose: () => listeners.delete(fn) }; }, fire: (e: T) => { for (const fn of [...listeners]) fn(e); }, get size() { return listeners.size; } }; }
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
async function until(predicate: () => boolean): Promise<void> { for (let i = 0; i < 300 && !predicate(); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(predicate(), 'native adapter checkpoint'); }
class Uri {
  readonly scheme: string; readonly fsPath: string; readonly path: string;
  constructor(private readonly value: string) { const parsed = new URL(value); this.scheme = parsed.protocol.slice(0, -1); this.path = parsed.pathname; this.fsPath = fileURLToPath(parsed); }
  toString() { return this.value; }
  static file(path: string) { return new Uri(pathToFileURL(path).href); }
}
class Range { constructor(readonly start: { character: number }, readonly end: { character: number }) {} }
class Edit { readonly edits: { uri: Uri; range: Range; text: string }[] = []; replace(uri: Uri, range: Range, text: string) { this.edits.push({ uri, range, text }); } }
class CustomTab { constructor(readonly uri: Uri, readonly viewType = SCRATCH_EDITOR_VIEW_TYPE) {} }
async function fixture(run: (h: Awaited<ReturnType<typeof harness>>) => Promise<void>) {
  const h = await harness(); try { await run(h); } finally { await h.host.dispose(); await rm(h.dir, { recursive: true, force: true }); }
}
async function harness() {
  const dir = await mkdtemp(join(tmpdir(), 'insrc-native-unit-')), root = join(dir, 'scratches');
  const store = createScratchStore({ root }), entry = await store.createScratch('Native', '# Before\n'), resolved = await store.resolveScratch(entry.id), uri = Uri.file(resolved.filePath);
  const changed = events<{ document: unknown }>(), willSave = events<{ document: unknown; waitUntil(p: PromiseLike<unknown>): void }>(), closed = events<unknown>();
  const incoming = events<unknown>(), disposed = events<void>();
  let validateGate: ReturnType<typeof deferred> | undefined, validating = false;
  const resolveOriginal = store.resolveScratch;
  store.resolveScratch = async id => { const result = await resolveOriginal(id); const pending = validateGate; validateGate = undefined; if (pending) { validating = true; await pending.promise; validating = false; } return result; };
  let focusMode: 'ok' | 'denied' | 'wrong-version' = 'ok';
  let provider!: VSCode.CustomTextEditorProvider, active = true, gate: ReturnType<typeof deferred> | undefined, dropped: string | undefined, applies = 0, saves = 0;
  const messages: ScratchHostToEditor[] = [], warnings: string[] = [], commands: { name: string; args: unknown[] }[] = [];
  const doc = { uri, version: 1, isDirty: false, isClosed: false, text: '# Before\n', getText() { return this.text; }, positionAt: (offset: number) => ({ line: 0, character: offset }),
    save: async () => { const waits: PromiseLike<unknown>[] = []; willSave.fire({ document: doc, waitUntil: p => { waits.push(p); } }); await Promise.all(waits); await writeFile(resolved.filePath, doc.text); doc.isDirty = false; saves++; return true; } };
  let activeTab = { input: new CustomTab(uri) };
  const panel = { get active() { return active; }, visible: true, title: 'Scratchpad', reveal: () => { active = true; }, dispose: () => disposed.fire(), onDidDispose: disposed.listen,
    webview: { html: '', options: {}, cspSource: "'self' https://*.vscode-cdn.net", asWebviewUri: (_u: Uri) => ({ toString: () => 'https://file.vscode-resource.vscode-cdn.net/editor.js' }), onDidReceiveMessage: incoming.listen,
      postMessage: async (m: ScratchHostToEditor) => { if (m.type === dropped) return false; messages.push(m); if (m.type === 'focus-request') setImmediate(() => incoming.fire({ type: 'focus-ready', paneSessionId: m.paneSessionId, requestId: m.requestId, docVersion: m.docVersion + (focusMode === 'wrong-version' ? 1 : 0), draftSeq: m.draftSeq, focused: focusMode !== 'denied' })); return true; } } };
  const api = { Uri, Range, WorkspaceEdit: Edit, TabInputCustom: CustomTab,
    window: { registerCustomEditorProvider: (_type: string, p: VSCode.CustomTextEditorProvider, options: { supportsMultipleEditorsPerDocument: boolean }) => { assert.equal(options.supportsMultipleEditorsPerDocument, true); provider = p; return { dispose: () => {} }; }, tabGroups: { activeTabGroup: { get activeTab() { return activeTab; } } }, showWarningMessage: async () => undefined },
    commands: { executeCommand: async (name: string, ...args: unknown[]) => { commands.push({ name, args }); if (name === 'undo' || name === 'redo') { assert.equal(args.length, 0); doc.text = name === 'undo' ? '# Before\n' : '# Draft\n'; doc.version++; doc.isDirty = true; changed.fire({ document: doc }); } } },
    workspace: { onDidChangeTextDocument: changed.listen, onWillSaveTextDocument: willSave.listen, onDidCloseTextDocument: closed.listen,
      applyEdit: async (edit: Edit) => { applies++; const pending = gate; gate = undefined; if (pending) await pending.promise; const change = edit.edits[0]!; assert.equal(change.uri, uri); doc.text = doc.text.slice(0, change.range.start.character) + change.text + doc.text.slice(change.range.end.character); doc.version++; doc.isDirty = true; changed.fire({ document: doc }); return true; } },
  } as unknown as typeof VSCode;
  const recovery = new ScratchRecoveryStore(join(dir, 'recovery'));
  const host = registerScratchEditor({ api, store, extensionPath: dir, recovery, preference: new ScratchLockPreference({ get: <T>() => false as T, update: async () => {} }), warn: m => warnings.push(m) });
  const open = async () => { await provider.resolveCustomTextEditor(doc as unknown as VSCode.TextDocument, panel as unknown as VSCode.WebviewPanel, { isCancellationRequested: false }); const id = panel.webview.html.match(/data-pane-session="([^"]+)"/)![1]!; incoming.fire({ type: 'editor-ready', paneSessionId: id }); await until(() => messages.some(m => m.type === 'document-state')); return id; };
  return { dir, host, doc, panel, provider: () => provider, api, changed, willSave, closed, incoming, disposed, messages, warnings, commands, recovery, uri, entry, resolved, open,
    send: (id: string, m: object) => incoming.fire({ ...m, paneSessionId: id }),
    block: () => { gate = deferred(); return gate; },
    blockValidation: () => { validateGate = deferred(); return validateGate; }, get validating() { return validating; },
    setFocusMode: (value: typeof focusMode) => { focusMode = value; },
    setDropped: (value: string) => { dropped = value; }, setActive: (value: boolean) => { active = value; },
    get applies() { return applies; }, get saves() { return saves; },
    external: (text: string) => { doc.text = text; doc.version++; changed.fire({ document: doc }); },
  };
}
const draft = { type: 'draft', draftSeq: 1, editId: 'edit_1', baseVersion: 1, baseDigest: scratchDigest('# Before\n'), markdown: '# Draft\n' };

test('scratch native adapter drains captured save and routes undo redo to the exact active custom document', async () => fixture(async h => {
  const id = await h.open(), gate = h.block(); h.send(id, draft); await until(() => h.applies === 1);
  h.send(id, { type: 'save', draftSeq: 1, docVersion: 1 }); assert.equal(h.saves, 0); gate.resolve(); await until(() => h.saves === 1);
  assert.equal(await readFile(h.resolved.filePath, 'utf8'), '# Draft\n');
  h.send(id, { type: 'undo', draftSeq: 1, docVersion: h.doc.version }); await until(() => h.commands.some(c => c.name === 'undo'));
  assert.equal(h.doc.text, '# Before\n');
  h.send(id, { type: 'redo', draftSeq: 1, docVersion: h.doc.version }); await until(() => h.commands.some(c => c.name === 'redo'));
  assert.equal(h.doc.text, '# Draft\n');
  h.setActive(false); h.send(id, { type: 'undo', draftSeq: 1, docVersion: h.doc.version }); await until(() => h.warnings.length > 0);
  assert.equal(h.commands.filter(c => c.name === 'undo').length, 1);
  assert.ok(h.messages.filter(m => m.type === 'document-state').length >= 3, 'undo/redo broadcast without proposals');
}));

test('scratch native adapter awaits asynchronous receipt delivery and retains a dropped draft', async () => fixture(async h => {
  const id = await h.open(); h.setDropped('receipt'); h.send(id, draft);
  await until(() => h.messages.some(m => m.type === 'conflict'));
  assert.equal(h.applies, 0); assert.equal(h.doc.text, '# Before\n'); assert.equal((await h.recovery.list(h.uri.toString()))[0]?.draft.markdown, '# Draft\n');
}));

test('scratch native adapter rejects unrelated URIs and disposes listeners without cancelling accepted work', async () => fixture(async h => {
  const refused = { ...h.doc, uri: Uri.file(join(h.dir, h.entry.id)) };
  await assert.rejects(h.provider().resolveCustomTextEditor(refused as unknown as VSCode.TextDocument, h.panel as unknown as VSCode.WebviewPanel, { isCancellationRequested: false }), /outside/);
  const id = await h.open(), gate = h.block(); h.send(id, draft); await until(() => h.applies === 1);
  h.panel.dispose(); const done = h.host.dispose(); gate.resolve(); await done;
  assert.equal(h.doc.text, '# Draft\n'); assert.equal(h.changed.size, 0); assert.equal(h.willSave.size, 0); assert.equal(h.closed.size, 0); assert.equal(h.incoming.size, 0);
  assert.deepEqual(await h.recovery.list(h.uri.toString()), []);
}));

test('scratch native save hook drains pending source and idle external changes broadcast without edits', async () => fixture(async h => {
  const id = await h.open(); h.external('# External\n'); await until(() => h.messages.some(m => m.type === 'document-state' && m.markdown === '# External\n'));
  assert.equal(h.applies, 0);
  const gate = h.block();
  h.send(id, { ...draft, baseVersion: h.doc.version, baseDigest: scratchDigest('# External\n') }); await until(() => h.applies === 1);
  const saving = h.doc.save();
  await new Promise(r => setTimeout(r, 25)); assert.equal(h.saves, 0);
  assert.equal(await readFile(h.resolved.filePath, 'utf8'), '# Before\n');
  gate.resolve(); await saving; assert.equal(await readFile(h.resolved.filePath, 'utf8'), '# Draft\n');
}));

test('scratch editor HTML accepts the production nonce and only a bounded opaque pane session', () => {
  const assets = { cspSource: "'self' https://*.vscode-cdn.net", script: 'https://file.vscode-resource.vscode-cdn.net/editor.js', style: 'https://file.vscode-resource.vscode-cdn.net/editor.css' };
  assert.match(scratchEditorHtml(assets, makeNonce(), 'pane_1'), /data-pane-session="pane_1"/);
  assert.throws(() => scratchEditorHtml(assets, 'nonce', 'bad"session'));
  assert.throws(() => scratchEditorHtml(assets, 'bad nonce', 'pane'));
});


test('scratch native adapter refuses commands when source changes during asynchronous validation', async () => fixture(async h => {
  const id = await h.open(), gate = h.blockValidation();
  h.send(id, { type: 'undo', draftSeq: 0, docVersion: h.doc.version }); await until(() => h.validating);
  h.external('# Intervening edit\n'); gate.resolve(); await until(() => h.messages.some(m => m.type === 'action-error'));
  assert.equal(h.commands.some(c => c.name === 'undo'), false); assert.equal(h.doc.text, '# Intervening edit\n');
}));


test('scratch native adapter requires a matching renderer focus acknowledgement before Undo', async () => fixture(async h => {
  const id = await h.open();
  for (const mode of ['denied', 'wrong-version'] as const) {
    h.setFocusMode(mode); const errors = h.messages.filter(m => m.type === 'action-error').length;
    h.send(id, { type: 'undo', draftSeq: 0, docVersion: h.doc.version });
    await until(() => h.messages.filter(m => m.type === 'action-error').length > errors);
    assert.equal(h.commands.some(c => c.name === 'undo'), false); assert.equal(h.doc.text, '# Before\n');
  }
}));


test('scratch native adapter drains pending edits before both Undo and Redo', async () => {
  for (const action of ['undo', 'redo'] as const) await fixture(async h => {
    const id = await h.open(), gate = h.block();
    h.send(id, draft); await until(() => h.applies === 1);
    h.send(id, { type: action, draftSeq: 1, docVersion: 1 });
    await new Promise(r => setTimeout(r, 25));
    assert.equal(h.commands.some(c => c.name === action), false);
    assert.equal(h.messages.some(m => m.type === 'focus-request'), false);
    gate.resolve(); await until(() => h.commands.some(c => c.name === action));
    assert.equal(h.doc.version, 3);
    assert.equal(h.doc.text, action === 'undo' ? '# Before\n' : '# Draft\n');
    assert.equal(h.commands.filter(c => c.name === action).length, 1);
  });
});

test('scratch native adapter rejects a waiting resolve when shutdown starts', async () => fixture(async h => {
  const id = await h.open(), gate = h.block();
  h.send(id, draft); await until(() => h.applies === 1);
  h.panel.dispose();
  const resolving = h.provider().resolveCustomTextEditor(h.doc as unknown as VSCode.TextDocument, h.panel as unknown as VSCode.WebviewPanel, { isCancellationRequested: false });
  // Let URI validation finish so resolution is waiting on the closing entry.
  await new Promise(r => setTimeout(r, 25));
  const shutdown = h.host.dispose();
  const rejected = assert.rejects(Promise.resolve(resolving), /cancelled/);
  gate.resolve(); await rejected; await shutdown;
  assert.equal(h.incoming.size, 0);
  assert.equal(h.disposed.size, 0);
  assert.equal(h.changed.size, 0);
  assert.equal(h.doc.text, '# Draft\n');
}));
