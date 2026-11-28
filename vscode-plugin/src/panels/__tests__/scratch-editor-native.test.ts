import { scratchHostWorkerBytes } from './fixtures/scratch-host-worker-bundle.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
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
class TextTab { constructor(readonly uri: Uri) {} }
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
  let fallbackChoice: string | undefined; const fallbackNotices: string[][] = [];
  let paneAttached = false, initSuccess = true, holdInit = false, richEditor = true; const initializedSessions = new Set<string>();
  let focusMode: 'ok' | 'denied' | 'wrong-version' = 'ok';
  let provider!: VSCode.CustomTextEditorProvider, active = true, gate: ReturnType<typeof deferred> | undefined, dropped: string | undefined, applies = 0, saves = 0;
  let rendererSequence = 0, flushMode: 'auto' | 'hold' | 'refuse' = 'auto';
  const flushRequests: {requestId:string;paneSessionId:string;sequence:number}[] = [];
  const answerFlush = (): void => { for (const request of [...flushRequests]) { const ack = messages.filter(m => m.type === 'apply-ack').at(-1)?.draftSeq ?? 0; if (flushMode === 'hold' || flushMode === 'auto' && ack < request.sequence) continue; flushRequests.splice(flushRequests.indexOf(request),1); incoming.fire({type:'flush-ready',paneSessionId:request.paneSessionId,requestId:request.requestId,draftSeq:request.sequence,docVersion:doc.version,confirmed:flushMode === 'auto'}); } };
  const messages: ScratchHostToEditor[] = [], warnings: string[] = [], commands: { name: string; args: unknown[] }[] = [];
  const doc = { uri, version: 1, isDirty: false, isClosed: false, text: '# Before\n', getText() { return this.text; }, positionAt: (offset: number) => ({ line: 0, character: offset }),
    save: async () => { const waits: PromiseLike<unknown>[] = []; willSave.fire({ document: doc, waitUntil: p => { waits.push(p); } }); await Promise.all(waits); await writeFile(resolved.filePath, doc.text); doc.isDirty = false; saves++; return true; } };
  let activeTab = { input: new CustomTab(uri) };
  const groups = [{ viewColumn: 1, tabs: [{ input: activeTab.input as CustomTab | TextTab, get isDirty() { return doc.isDirty; } }] }];
  const closedTabs: string[] = []; let closeRefused = false, closeGate: ReturnType<typeof deferred> | undefined;
  let deletionMode: 'ok' | 'pending' | 'wrong-version' = 'ok', refreshed = 0, failRefresh = false;
  const panel = { viewColumn: 1, get active() { return active; }, visible: true, title: 'Scratchpad', reveal: () => { active = true; }, dispose: () => { paneAttached = false; disposed.fire(); }, onDidDispose: disposed.listen,
    webview: { html: '', options: {}, cspSource: "'self' https://*.vscode-cdn.net", asWebviewUri: (_u: Uri) => ({ toString: () => 'https://file.vscode-resource.vscode-cdn.net/editor.js' }), onDidReceiveMessage: incoming.listen,
      postMessage: async (m: ScratchHostToEditor) => { if (m.type === dropped) return false; messages.push(m); if (m.type === 'flush-request') { flushRequests.push({requestId:m.requestId,paneSessionId:m.paneSessionId,sequence:rendererSequence}); setImmediate(answerFlush); } if (m.type === 'apply-ack') setImmediate(answerFlush); if (m.type === 'document-state' && !initializedSessions.has(m.paneSessionId)) { initializedSessions.add(m.paneSessionId); if (!holdInit) setImmediate(() => incoming.fire({ type: 'editor-initialized', paneSessionId: m.paneSessionId, success: initSuccess, message: initSuccess ? '' : 'fixture renderer failed' })); } if (m.type === 'delete-prepare') setImmediate(() => incoming.fire({ type: 'delete-ready', paneSessionId: m.paneSessionId, requestId: m.requestId, docVersion: doc.version - (deletionMode === 'wrong-version' ? 1 : 0), draftSeq: messages.filter(message => message.type === 'apply-ack').at(-1)?.draftSeq ?? 0, clean: deletionMode !== 'pending' })); if (m.type === 'focus-request') setImmediate(() => incoming.fire({ type: 'focus-ready', paneSessionId: m.paneSessionId, requestId: m.requestId, docVersion: m.docVersion + (focusMode === 'wrong-version' ? 1 : 0), draftSeq: m.draftSeq, focused: focusMode !== 'denied' })); return true; } } };
  const api = { Uri, Range, WorkspaceEdit: Edit, TabInputCustom: CustomTab, TabInputText: TextTab,
    window: { registerCustomEditorProvider: (_type: string, p: VSCode.CustomTextEditorProvider, options: { supportsMultipleEditorsPerDocument: boolean }) => { assert.equal(options.supportsMultipleEditorsPerDocument, true); provider = p; return { dispose: () => {} }; }, tabGroups: { all: groups, activeTabGroup: { viewColumn: 1, get activeTab() { return activeTab; } }, close: async (tabs: { input: CustomTab | TextTab }[]) => {
        const waiting = closeGate; closeGate = undefined; if (waiting) await waiting.promise;
        if (closeRefused) return false;
        for (const group of groups) group.tabs = group.tabs.filter(tab => { if (!tabs.includes(tab)) return true; closedTabs.push(tab.input.uri.toString()); return false; });
        if (!groups.some(group => group.tabs.some(tab => tab.input.uri.toString() === uri.toString()))) { panel.dispose(); doc.isClosed = true; closed.fire(doc); }
        return true;
      } }, showOpenDialog: async () => undefined, showWarningMessage: async (message: string, ...choices: string[]) => { fallbackNotices.push([message, ...choices]); return fallbackChoice; } },
    commands: { executeCommand: async (name: string, ...args: unknown[]) => { commands.push({ name, args }); if (name === 'vscode.openWith' && args[1] === SCRATCH_EDITOR_VIEW_TYPE && !paneAttached) {
      doc.isClosed = false; activeTab = { input: new CustomTab(uri) };
      if (!groups[0]!.tabs.some(tab => tab.input.uri.toString() === uri.toString())) groups[0]!.tabs.push({ input: activeTab.input, get isDirty() { return doc.isDirty; } });
      await provider.resolveCustomTextEditor(doc as unknown as VSCode.TextDocument, panel as unknown as VSCode.WebviewPanel, { isCancellationRequested: false }); paneAttached = true;
      const session = panel.webview.html.match(/data-pane-session="([^"]+)"/)![1]!; incoming.fire({ type: 'editor-ready', paneSessionId: session });
    } if (name === 'undo' || name === 'redo') { assert.equal(args.length, 0); doc.text = name === 'undo' ? '# Before\n' : '# Draft\n'; doc.version++; doc.isDirty = true; changed.fire({ document: doc }); } } },
    workspace: { get textDocuments() { return doc.isClosed ? [] : [doc]; }, getWorkspaceFolder: () => undefined, onDidChangeTextDocument: changed.listen, onWillSaveTextDocument: willSave.listen, onDidCloseTextDocument: closed.listen,
      applyEdit: async (edit: Edit) => { applies++; const pending = gate; gate = undefined; if (pending) await pending.promise; const change = edit.edits[0]!; assert.equal(change.uri, uri); doc.text = doc.text.slice(0, change.range.start.character) + change.text + doc.text.slice(change.range.end.character); doc.version++; doc.isDirty = true; changed.fire({ document: doc }); return true; } },
  } as unknown as typeof VSCode;
  let sendSelection: (text: string, assertCurrent: () => void) => Promise<void> = async () => { throw new Error('Chat unavailable'); };
  const preferenceWrites: boolean[] = []; let persistedPreference = false, preferenceGate: ReturnType<typeof deferred> | undefined;
  const recovery = new ScratchRecoveryStore(join(dir, 'recovery'));
  await mkdir(join(dir, 'out', 'scratch-editor'), { recursive: true });
  await writeFile(join(dir, 'out', 'scratch-editor', 'validator.js'), '/* trusted fixture asset */');
  await writeFile(join(dir, 'out', 'scratch-validation-host-worker.js'), await scratchHostWorkerBytes());
  const preference = new ScratchLockPreference({get:<T>()=>persistedPreference as T,update:async(_key,value)=>{preferenceWrites.push(value as boolean);persistedPreference=value as boolean;const pending=preferenceGate;preferenceGate=undefined;if(pending)await pending.promise;}});
  const host = registerScratchEditor({ richEditor: () => richEditor, refresh: async () => { refreshed++; if (failRefresh) throw new Error('refresh unavailable'); }, api, store, extensionPath: dir, recovery, sendSelection: (text, assertCurrent) => sendSelection(text, assertCurrent), preference, warn: m => warnings.push(m) });
  const open = async () => { await provider.resolveCustomTextEditor(doc as unknown as VSCode.TextDocument, panel as unknown as VSCode.WebviewPanel, { isCancellationRequested: false }); paneAttached = true; const id = panel.webview.html.match(/data-pane-session="([^"]+)"/)![1]!; incoming.fire({ type: 'editor-ready', paneSessionId: id }); await until(() => messages.some(m => m.type === 'document-state')); return id; };
  return { dir, host, doc, panel, provider: () => provider, api, changed, willSave, closed, incoming, disposed, messages, warnings, commands, recovery, uri, entry, resolved, open,
    send: (id: string, m: object) => { const draft = m as {type?:string;draftSeq?:number}; if (draft.type === 'draft') rendererSequence = Math.max(rendererSequence,draft.draftSeq ?? 0); incoming.fire({ ...m, paneSessionId: id }); },
    preference, get persistedPreference(){return persistedPreference;}, blockPreference:()=>{preferenceGate=deferred();return preferenceGate;}, preferenceWrites, flushRequests, setFlushMode: (mode: typeof flushMode) => { flushMode = mode; }, answerFlush,
    block: () => { gate = deferred(); return gate; },
    blockValidation: () => { validateGate = deferred(); return validateGate; }, get validating() { return validating; },
    closedTabs, groups, store,
    get refreshed() { return refreshed; },
    fallbackNotices, setFallbackChoice: (choice: string) => { fallbackChoice = choice; },
    setInitialization: (success: boolean, hold = false) => { initSuccess = success; holdInit = hold; },
    setRichEditor: (enabled: boolean) => { richEditor = enabled; },
    setRefreshFailure: () => { failRefresh = true; },
    setDeleteMode: (mode: typeof deletionMode) => { deletionMode = mode; },
    refuseClose: () => { closeRefused = true; },
    blockClose: () => { closeGate = deferred(); return closeGate; },
    addTab: (target: Uri, group = 1) => { while (groups.length <= group) groups.push({ viewColumn: groups.length + 1, tabs: [] }); groups[group]!.tabs.push({ input: new TextTab(target), get isDirty() { return target.toString() === uri.toString() && doc.isDirty; } }); },
    routeSelection: (route: typeof sendSelection) => { sendSelection = route; },
    setFocusMode: (value: typeof focusMode) => { focusMode = value; },
    setDropped: (value: string) => { dropped = value; }, setActive: (value: boolean) => { active = value; },
    get applies() { return applies; }, get saves() { return saves; },
    external: (text: string) => { doc.text = text; doc.version++; changed.fire({ document: doc }); },
  };
}
const draft = { type: 'draft', draftSeq: 1, editId: 'edit_1', baseVersion: 1, baseDigest: scratchDigest('# Before\n'), markdown: '# Draft\n', apply: true };

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
  assert.equal((await h.recovery.list(h.uri.toString()))[0]?.draft.markdown, '# Draft\n', 'Closed pane has no acknowledgement');
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


const selection = { type: 'send-selection', requestId: 'send_1', draftSeq: 1, docVersion: 1, selectedText: 'Exact first paragraph.\n\nSecond 😀 paragraph.' };
test('scratch native selection Send drains its captured draft and inserts once despite duplicate messages', async () => fixture(async h => {
  const inserted: string[] = [];
  h.routeSelection(async (text, assertCurrent) => { assertCurrent(); inserted.push(text); });
  const id = await h.open(), gate = h.block(); h.send(id, draft); await until(() => h.applies === 1);
  const captured = { ...selection };
  h.send(id, captured); h.send(id, captured); captured.selectedText = 'Later mutation';
  await new Promise(r => setTimeout(r, 25)); assert.deepEqual(inserted, []);
  gate.resolve(); await until(() => h.messages.some(m => m.type === 'selection-result'));
  assert.deepEqual(inserted, [selection.selectedText]);
  assert.equal(h.messages.filter(m => m.type === 'selection-result').length, 1);
  assert.equal(h.commands.some(c => c.name === 'undo' || c.name === 'redo'), false);
  // A delayed renderer acknowledgement may legitimately leave a captured base
  // version behind our own already applied native edit.
  h.send(id, { ...selection, requestId: 'send_2' });
  await until(() => inserted.length === 2);
}));

test('scratch native selection refuses external source changes before Send and during chat readiness', async () => fixture(async h => {
  let reached = false; const ready = deferred(); const inserted: string[] = [];
  h.routeSelection(async (text, assertCurrent) => { reached = true; await ready.promise; assertCurrent(); inserted.push(text); });
  const id = await h.open(); h.send(id, draft); await until(() => h.messages.some(m => m.type === 'apply-ack'));
  h.send(id, selection); await until(() => reached);
  h.external('# Changed while chat opens\n'); ready.resolve();
  await until(() => h.messages.some(m => m.type === 'selection-result' && !m.sent)); assert.deepEqual(inserted, []);
  reached = false;
  h.send(id, { ...selection, requestId: 'send_2' });
  await until(() => h.messages.filter(m => m.type === 'selection-result').length === 2);
  assert.equal(reached, false); assert.deepEqual(inserted, []);
}));

test('scratch native selection refuses newer typing or pane disposal during chat readiness', async () => {
  for (const change of ['typing', 'dispose'] as const) await fixture(async h => {
    let reached = false; const ready = deferred(); const inserted: string[] = [];
    h.routeSelection(async (text, assertCurrent) => { reached = true; await ready.promise; assertCurrent(); inserted.push(text); });
    const id = await h.open();
    h.send(id, { ...selection, draftSeq: 0 }); await until(() => reached);
    if (change === 'dispose') h.panel.dispose(); else h.send(id, draft);
    ready.resolve(); await until(() => h.warnings.some(m => m.includes('Source changed')));
    assert.deepEqual(inserted, []);
  });
});


test('scratch native selection bounds concurrent requests and reports dropped confirmation without resending', async () => fixture(async h => {
  let reached = false; const ready = deferred(), inserted: string[] = [];
  h.routeSelection(async (text, assertCurrent) => { reached = true; await ready.promise; assertCurrent(); inserted.push(text); });
  const id = await h.open(); h.setDropped('selection-result');
  h.send(id, { ...selection, draftSeq: 0 }); await until(() => reached);
  h.send(id, { ...selection, draftSeq: 0, requestId: 'send_2' });
  await new Promise(r => setTimeout(r, 25));
  ready.resolve(); await until(() => h.warnings.some(m => m.includes('confirmation was not delivered')));
  assert.deepEqual(inserted, [selection.selectedText]);
}));


test('scratch native assets persist portable bytes correlate failure cancellation and forbid locked uploads', async () => fixture(async h => {
  const id = await h.open(), png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  h.send(id, { type: 'asset-request', requestId: 'a1', action: 'upload-image', name: 'pasted.png', mediaType: 'image/png', dataBase64: png });
  await until(() => h.messages.some(m => m.type === 'asset-result' && m.requestId === 'a1'));
  const stored = h.messages.find(m => m.type === 'asset-result' && m.requestId === 'a1');
  assert.ok(stored?.type === 'asset-result'); assert.match(stored.href, /^assets\/[A-Za-z0-9-]+\.png$/);
  assert.deepEqual(await readFile(join(h.dir, 'scratches', stored.href)), Buffer.from(png, 'base64')); assert.equal(h.applies, 0);
  h.send(id, { type: 'asset-request', requestId: 'a2', action: 'resolve-image', href: '../elsewhere.png' });
  await until(() => h.messages.some(m => m.type === 'action-error' && m.requestId === 'a2'));
  h.send(id, { type: 'asset-request', requestId: 'a3', action: 'pick-image' });
  await until(() => h.messages.some(m => m.type === 'asset-result' && m.requestId === 'a3' && m.href === ''));
  h.send(id, { type: 'lock', requestId: 'lock_' + (h.messages.filter(m => m.type === 'lock-state').length + 1), locked: true, draftSeq: h.messages.filter(m => m.type === 'apply-ack').at(-1)?.draftSeq ?? 0, docVersion: h.doc.version });
  h.send(id, { type: 'asset-request', requestId: 'a4', action: 'upload-image', name: 'pasted.png', mediaType: 'image/png', dataBase64: png });
  await until(() => h.messages.some(m => m.type === 'action-error' && m.requestId === 'a4')); assert.equal(h.applies, 0);
}));


test('scratch native deletion closes only exact URI tabs across groups before guarded unlink and isolates refresh failure', async () => fixture(async h => {
  await h.open(); const unrelated = Uri.file(join(h.dir, 'unrelated.md')); h.addTab(h.uri); h.addTab(unrelated, 2); h.setRefreshFailure();
  assert.equal(await h.host.deleteDocument(h.entry.id), 'deleted');
  await assert.rejects(readFile(h.resolved.filePath), { code: 'ENOENT' });
  assert.deepEqual(h.closedTabs, [h.uri.toString(), h.uri.toString()]);
  assert.equal(h.groups[2]?.tabs.length, 1); assert.equal(h.refreshed, 1);
  assert.ok(h.warnings.some(message => message.includes('list refresh failed')));
}));

test('scratch native deletion cancels dirty pending recovery unconfirmed panes and close cancellation without unlink', async () => {
  for (const state of ['dirty', 'pending', 'staged', 'recovery', 'renderer-pending', 'wrong-version', 'close-cancelled'] as const) await fixture(async h => {
    const id = await h.open(); let result: Promise<'deleted' | 'cancelled'>;
    if (state === 'dirty') h.doc.isDirty = true;
    if (state === 'staged') { h.send(id, { ...draft, apply: false }); await until(() => h.messages.some(m => m.type === 'receipt')); assert.equal(h.applies, 0); }
    if (state === 'recovery') await h.recovery.retain(h.uri.toString(), { ...draft, paneSessionId: 'other-window' } as never);
    if (state === 'renderer-pending') h.setDeleteMode('pending');
    if (state === 'wrong-version') h.setDeleteMode('wrong-version');
    if (state === 'close-cancelled') h.refuseClose();
    if (state === 'pending') {
      const gate = h.block(); h.send(id, draft); await until(() => h.applies === 1);
      result = h.host.deleteDocument(h.entry.id); await new Promise(r => setTimeout(r, 25)); assert.equal(h.closedTabs.length, 0); gate.resolve();
    } else result = h.host.deleteDocument(h.entry.id);
    assert.equal(await result, 'cancelled', state);
    assert.equal(await readFile(h.resolved.filePath, 'utf8'), '# Before\n'); assert.equal(h.closedTabs.length, 0, state);
    if (state === 'renderer-pending' || state === 'wrong-version' || state === 'close-cancelled') assert.ok(h.messages.some(m => m.type === 'delete-release'));
  });
});

test('scratch native deletion excludes reopen until close settles and attempts reopen on unlink failure', async () => fixture(async h => {
  await h.open(); const gate = h.blockClose();
  const original = h.store.deleteScratch; h.store.deleteScratch = async () => { throw new Error('unlink refused'); };
  const deleting = h.host.deleteDocument(h.entry.id); const refusal = assert.rejects(deleting, /unlink refused/);
  await until(() => h.messages.some(m => m.type === 'delete-prepare'));
  await assert.rejects(h.host.openDocument(h.entry.id), /being deleted/);
  assert.equal(await readFile(h.resolved.filePath, 'utf8'), '# Before\n'); gate.resolve(); await refusal;
  assert.ok(h.commands.some(c => c.name === 'vscode.openWith')); assert.equal(await readFile(h.resolved.filePath, 'utf8'), '# Before\n');
  h.store.deleteScratch = original;
}));


test('scratch save refresh admission is exact URI scoped and activation owns one disposable save listener', async () => fixture(async h => {
  assert.equal(await h.host.accepts(h.uri as unknown as VSCode.Uri), true);
  assert.equal(await h.host.accepts(Uri.file(join(h.dir, h.entry.id)) as unknown as VSCode.Uri), false);
  const source = await readFile(fileURLToPath(new URL('../../extension.ts', import.meta.url)), 'utf8');
  assert.equal(source.match(/workspace\.onDidSaveTextDocument\(/g)?.length, 1);
  assert.match(source, /context\.subscriptions\.push\(vscode\.workspace\.onDidSaveTextDocument/);
  assert.match(source, /scratchEditor\.accepts\(document\.uri\)/);
}));

test('scratch native open awaits renderer initialization and reports failed or disposed initialization without changing the file', async () => {
  await fixture(async h => {
    h.setInitialization(true, true); let finished = false;
    const opening = h.host.openDocument(h.entry.id).then(() => { finished = true; });
    await until(() => h.messages.some(m => m.type === 'document-state')); await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(finished, false);
    const state = h.messages.find(m => m.type === 'document-state')!;
    h.send(state.paneSessionId, { type: 'editor-initialized', success: true, message: '' }); await opening;
    assert.equal(await readFile(h.resolved.filePath, 'utf8'), '# Before\n');
  });
  await fixture(async h => {
    h.setInitialization(false); await assert.rejects(h.host.openDocument(h.entry.id), /fixture renderer failed/);
    assert.equal(await readFile(h.resolved.filePath, 'utf8'), '# Before\n');
  });
  await fixture(async h => {
    h.setInitialization(true, true); const opening = h.host.openDocument(h.entry.id), refused = assert.rejects(opening, /disposed/);
    await until(() => h.messages.some(m => m.type === 'document-state')); await h.host.dispose(); await refused;
    assert.equal(h.incoming.size, 0);
  });
});
test('scratch rich-editor off path explicitly opens the same native file in the text editor', async () => fixture(async h => {
  h.setRichEditor(false); await h.host.openDocument(h.entry.id);
  const command = h.commands.find(command => command.name === 'vscode.openWith'); assert.ok(command);
  assert.equal((command.args[0] as Uri).toString(), h.uri.toString()); assert.equal(command.args[1], 'default');
  assert.ok(h.warnings.some(message => message.includes('disabled'))); assert.equal(h.incoming.size, 0);
  assert.equal(await readFile(h.resolved.filePath, 'utf8'), '# Before\n');
}));


test('scratch initialization failure offers explicit same-file text fallback and never auto-opens it', async () => {
  await fixture(async h => {
    h.setInitialization(false); await assert.rejects(h.host.openDocument(h.entry.id), /fixture renderer failed/);
    assert.ok(h.fallbackNotices.some(notice => notice.includes('Open in text editor')));
    assert.equal(h.commands.some(command => command.args[1] === 'default'), false);
  });
  await fixture(async h => {
    h.setInitialization(false); h.setFallbackChoice('Open in text editor');
    await assert.rejects(h.host.openDocument(h.entry.id), /fixture renderer failed/);
    await until(() => h.commands.some(command => command.args[1] === 'default'));
    const fallback = h.commands.find(command => command.args[1] === 'default')!;
    assert.equal((fallback.args[0] as Uri).toString(), h.uri.toString());
    assert.equal(await readFile(h.resolved.filePath, 'utf8'), '# Before\n');
  });
});

test('scratch native duplicate deletion requests share one close unlink and refresh operation', async () => fixture(async h => {
  await h.open(); const gate = h.blockClose();
  const first = h.host.deleteDocument(h.entry.id), second = h.host.deleteDocument(h.entry.id);
  await until(() => h.messages.some(message => message.type === 'delete-prepare')); gate.resolve();
  assert.deepEqual(await Promise.all([first, second]), ['deleted', 'deleted']);
  assert.equal(h.refreshed, 1); assert.equal(h.closedTabs.length, 1);
}));


test('scratch native locked panes refuse Undo Redo including a lock acquired during command drain', async () => fixture(async h => {
  const id = await h.open();
  h.send(id, { type: 'lock', requestId: 'lock_' + (h.messages.filter(m => m.type === 'lock-state').length + 1), locked: true, draftSeq: h.messages.filter(m => m.type === 'apply-ack').at(-1)?.draftSeq ?? 0, docVersion: h.doc.version });
  for (const type of ['undo', 'redo']) h.send(id, { type, draftSeq: 0, docVersion: h.doc.version });
  await until(() => h.messages.filter(m => m.type === 'action-error').length === 2);
  assert.equal(h.commands.some(c => c.name === 'undo' || c.name === 'redo'), false);
  h.send(id, { type: 'save', draftSeq: 0, docVersion: h.doc.version }); await until(() => h.saves === 1);
  h.send(id, { type: 'lock', requestId: 'lock_2', locked: false, draftSeq: h.messages.filter(m => m.type === 'apply-ack').at(-1)?.draftSeq ?? 0, docVersion: h.doc.version });
  await until(() => h.messages.some(m => m.type === 'lock-state' && m.requestId === 'lock_2' && m.success));
  const gate = h.blockValidation();
  h.send(id, { type: 'undo', draftSeq: 0, docVersion: h.doc.version }); await until(() => h.validating);
  h.send(id, { type: 'lock', requestId: 'lock_' + (h.messages.filter(m => m.type === 'lock-state').length + 1), locked: true, draftSeq: h.messages.filter(m => m.type === 'apply-ack').at(-1)?.draftSeq ?? 0, docVersion: h.doc.version }); gate.resolve();
  await until(() => h.messages.filter(m => m.type === 'action-error').length === 3);
  assert.equal(h.commands.some(c => c.name === 'undo' || c.name === 'redo'), false);
  assert.equal(h.doc.text, '# Before\n');
}));

test('scratch native Save flush is bounded and explicit Save never re-enters its own queue',async()=>fixture(async h=>{
  const id=await h.open();
  h.send(id,{type:'save',draftSeq:0,docVersion:1});await until(()=>h.saves===1);
  assert.equal(h.messages.filter(m=>m.type==='flush-request').length,0,'Explicit Save skips only its own onWillSave flush');
  h.setFlushMode('hold');const before=performance.now();await h.doc.save();
  assert.ok(performance.now()-before<1500,'Best-effort flush remains within the native save listener budget');
  assert.equal(h.saves,2);assert.ok(h.warnings.some(m=>m.includes('earlier document version')));
  const old=h.messages.filter(m=>m.type==='flush-request').at(-1)!;
  h.setFlushMode('auto');h.answerFlush();await h.doc.save();assert.equal(h.saves,3);
  const fresh=h.messages.filter(m=>m.type==='flush-request').at(-1)!;
  assert.notEqual(fresh.requestId,old.requestId,'A stale reply cannot satisfy a later native save');
  h.setFlushMode('hold');const closing=h.doc.save();await until(()=>h.flushRequests.length>0);
  await h.host.dispose();await closing;assert.equal(h.saves,4,'Close cancels the native waiter without deadlock');
}));

test('scratch native Save flush can promote the captured pending draft without entering the command queue',async()=>fixture(async h=>{
  const id=await h.open();h.send(id,{...draft,apply:false});await until(()=>h.messages.some(m=>m.type==='receipt'));
  const saving=h.doc.save();await until(()=>h.flushRequests.length===1);
  assert.equal(h.saves,0);h.send(id,{...draft,apply:true});await saving;
  assert.equal(h.saves,1);assert.equal(await readFile(h.resolved.filePath,'utf8'),'# Draft\n');
  assert.equal(h.messages.filter(m=>m.type==='flush-request').length,1);
}));

test('scratch native captured lock keeps admission permitted until acknowledgement and cancels without a late lock',async()=>{
  for(const cancel of [false,true])await fixture(async h=>{
    const id=await h.open();h.send(id,{...draft,apply:false});await until(()=>h.messages.some(m=>m.type==='receipt'));
    h.send(id,{type:'lock',requestId:'lock_1',locked:true,draftSeq:1,docVersion:1});
    await new Promise(resolve=>setTimeout(resolve,10));assert.equal(h.messages.some(m=>m.type==='lock-state'),false,'Pending validation is not yet locked');
    if(cancel){h.send(id,{type:'lock-cancel',requestId:'lock_1'});await until(()=>h.messages.some(m=>m.type==='lock-state'&&m.requestId==='lock_1'));}
    h.send(id,{...draft,apply:true});await until(()=>h.messages.some(m=>m.type==='apply-ack'));
    await until(()=>h.messages.some(m=>m.type==='lock-state'&&m.requestId==='lock_1'));
    const result=h.messages.find(m=>m.type==='lock-state'&&m.requestId==='lock_1')!;
    assert.equal(result.type,'lock-state');if(result.type!=='lock-state')throw new Error('Missing lock result');
    assert.equal(result.success,!cancel);assert.equal(result.locked,!cancel);assert.equal(h.doc.text,'# Draft\n');
    if(cancel){h.send(id,{type:'undo',draftSeq:1,docVersion:h.doc.version});await until(()=>h.commands.some(c=>c.name==='undo'));assert.equal(h.messages.some(m=>m.type==='lock-state'&&m.success),false);}
  });
});

test('scratch lock requests are idempotent while pending and stale replay never changes the preference',async()=>fixture(async h=>{
  const id=await h.open();h.send(id,{...draft,apply:false});await until(()=>h.messages.some(m=>m.type==='receipt'));
  const lock={type:'lock',requestId:'lock_1',locked:true,draftSeq:1,docVersion:1};
  h.send(id,lock);h.send(id,lock);await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(h.messages.some(m=>m.type==='lock-state'),false,'Duplicate pending request does not fail or cancel the original');
  h.send(id,{...draft,apply:true});await until(()=>h.messages.some(m=>m.type==='lock-state'));
  assert.deepEqual(h.preferenceWrites,[true]);h.send(id,lock);await until(()=>h.messages.filter(m=>m.type==='lock-state').length===2);assert.deepEqual(h.preferenceWrites,[true]);
  h.send(id,{type:'lock',requestId:'lock_2',locked:false,draftSeq:1,docVersion:h.doc.version});await until(()=>h.messages.some(m=>m.type==='lock-state'&&m.requestId==='lock_2'));
  h.send(id,lock);await until(()=>h.messages.filter(m=>m.type==='lock-state').length===4);
  const replay=h.messages.filter(m=>m.type==='lock-state').at(-1)!;
  assert.equal(replay.type,'lock-state');if(replay.type!=='lock-state')throw new Error('Missing replay refusal');
  assert.equal(replay.success,false);assert.equal(replay.locked,false);assert.deepEqual(h.preferenceWrites,[true,false]);
}));

test('scratch lock cancellation restores provisional preference before a later request commits',async()=>fixture(async h=>{
  const id=await h.open(),gate=h.blockPreference();
  h.send(id,{type:'lock',requestId:'lock_1',locked:true,draftSeq:0,docVersion:1});await until(()=>h.preferenceWrites.length===1);
  assert.equal(h.persistedPreference,true,'Storage write is deliberately paused after changing its value');
  assert.equal(h.preference.initial(),false,'New panes still see the committed default during persistence');
  h.send(id,{type:'lock-cancel',requestId:'lock_1'});await until(()=>h.messages.some(m=>m.type==='lock-state'&&m.requestId==='lock_1'));
  const cancelled=h.messages.find(m=>m.type==='lock-state'&&m.requestId==='lock_1')!;assert.equal(cancelled.type,'lock-state');if(cancelled.type==='lock-state'){assert.equal(cancelled.success,false);assert.equal(cancelled.locked,false);}
  h.send(id,{type:'lock',requestId:'lock_2',locked:true,draftSeq:0,docVersion:1});
  gate.resolve();await until(()=>h.messages.some(m=>m.type==='lock-state'&&m.requestId==='lock_2'&&m.success));
  assert.deepEqual(h.preferenceWrites,[true,false,true],'Restoration occupies the same preference queue before the later commit');
  assert.equal(h.persistedPreference,true);assert.equal(h.preference.initial(),true);
  assert.equal(h.messages.some(m=>m.type==='lock-state'&&m.requestId==='lock_1'&&m.success),false);
  h.send(id,{type:'lock',requestId:'lock_2',locked:true,draftSeq:0,docVersion:1});await until(()=>h.messages.filter(m=>m.type==='lock-state'&&m.requestId==='lock_2').length===2);assert.deepEqual(h.preferenceWrites,[true,false,true],'Late old completion cannot overwrite the newer idempotency record');
}));

test('scratch lost lock confirmation resynchronizes the actual committed mode and delayed original cannot execute after cancellation',async()=>fixture(async h=>{
  const id=await h.open();h.setDropped('lock-state');h.send(id,{type:'lock',requestId:'lock_1',locked:true,draftSeq:0,docVersion:1});
  await until(()=>h.warnings.some(m=>m.includes('confirmation was not delivered')));assert.equal(h.preference.initial(),true);assert.equal(h.persistedPreference,true);
  h.setDropped('none');h.send(id,{type:'lock-cancel',requestId:'lock_1'});await until(()=>h.messages.some(m=>m.type==='lock-state'&&m.requestId==='lock_1'));
  const actual=h.messages.find(m=>m.type==='lock-state'&&m.requestId==='lock_1')!;assert.equal(actual.type,'lock-state');if(actual.type==='lock-state'){assert.equal(actual.locked,true);assert.equal(actual.success,true);}
  h.send(id,{type:'lock-cancel',requestId:'lock_2'});await until(()=>h.messages.some(m=>m.type==='lock-state'&&m.requestId==='lock_2'));
  h.send(id,{type:'lock',requestId:'lock_2',locked:false,draftSeq:0,docVersion:1});await until(()=>h.messages.filter(m=>m.type==='lock-state'&&m.requestId==='lock_2').length===2);
  assert.deepEqual(h.preferenceWrites,[true]);assert.equal(h.preference.initial(),true,'Late original request was tombstoned, not executed');
}));

test('scratch lock preference rollback also covers source changes and close during persistence',async()=>{
  for(const outcome of ['external','close'])await fixture(async h=>{
    const id=await h.open(),gate=h.blockPreference();
    h.send(id,{type:'lock',requestId:'lock_1',locked:true,draftSeq:0,docVersion:1});await until(()=>h.preferenceWrites.length===1);
    if(outcome==='external')h.external('# External during preference write\n');else await h.host.dispose();
    gate.resolve();await until(()=>h.preferenceWrites.length===2);
    assert.deepEqual(h.preferenceWrites,[true,false]);assert.equal(h.preference.initial(),false);assert.equal(h.persistedPreference,false);
    if(outcome==='external'){await until(()=>h.messages.some(m=>m.type==='lock-state'));assert.equal(h.doc.text,'# External during preference write\n');assert.equal(h.messages.some(m=>m.type==='lock-state'&&m.success),false);}
  });
});
