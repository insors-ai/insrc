/** Native qualification only: real VS Code models/panes; deterministic delays
 * surround public bridge/apply APIs, never replace the native document model. */
import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { registerScratchEditor, SCRATCH_EDITOR_VIEW_TYPE } from '../../scratch-editor-native.js';
import { createScratchStore } from '../../../chat/scratch-store.js';
import { ScratchRecoveryStore, SCRATCH_RECOVERY_BYTES } from '../../scratch-editor-recovery.js';
import { ScratchLockPreference } from '../../scratch-editor-lock.js';
import { focusNativeScratchEditor } from './scratch-native-cdp.js';
import type { ScratchHostToEditor } from '../../scratch-editor-protocol.js';

const tick = () => new Promise<void>(r => setTimeout(r, 30));
async function until(check: () => boolean | Promise<boolean>, label: string) { for (let n = 0; n < 1000; n++) { if (await check()) return; await tick(); } throw new Error(label); }
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
export function activate() {}
export async function run() {
  const root = process.env['INSRC_NATIVE_FIXTURE_ROOT']!, role = process.env['INSRC_NATIVE_ROLE']!, port = Number(process.env['INSRC_NATIVE_DEBUG_PORT']);
  const checks: Record<string, unknown> = {}, warnings: string[] = [];
  let completed = false;
  const evidence = (passed: boolean, extra = {}) => { completed = passed; return writeFile(join(root, `${role}.json`), JSON.stringify({ passed, vscode: vscode.version, platform: process.platform, node: process.version, role, privateDisplay: process.env['INSRC_NATIVE_PRIVATE_DISPLAY'] === '1', display: process.env['DISPLAY'], checks, warnings, ...extra }, null, 2)); };
  const store = createScratchStore({ root: join(root, 'scratches') });
  const recovery = new ScratchRecoveryStore(join(root, 'recovery'));
  const panes = new Map<string, { panel: vscode.WebviewPanel; session: string }>();
  const frames: ScratchHostToEditor[] = [];
  let delay: { type: 'receipt' | 'apply' | 'apply-ack'; gate: ReturnType<typeof deferred>; hit: boolean } | undefined;
  const windowApi = new Proxy(vscode.window, { get(target, key) {
    if (key !== 'registerCustomEditorProvider') return Reflect.get(target, key, target);
    return (viewType: string, provider: vscode.CustomTextEditorProvider, options: unknown) => target.registerCustomEditorProvider(viewType, { resolveCustomTextEditor: async (doc, panel, token) => {
      const webview = new Proxy(panel.webview, { get(target, key) {
        if (key === 'postMessage') return async (message: ScratchHostToEditor) => { frames.push(message); const waiting = delay; if (message.type === waiting?.type) { waiting.hit = true; await waiting.gate.promise; } return await target.postMessage(message); };
        const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
      }, set(target, key, value) { return Reflect.set(target, key, value, target); } });
      const wrapped = new Proxy(panel, { get(target, key) { if (key === 'webview') return webview; const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; } });
      await provider.resolveCustomTextEditor(doc, wrapped, token);
      const session = panel.webview.html.match(/data-pane-session="([^"]+)"/)![1]!;
      panes.set(session, { panel, session }); panel.onDidDispose(() => panes.delete(session));
    } }, options as Parameters<typeof target.registerCustomEditorProvider>[2]);
  } });
  const workspaceApi = new Proxy(vscode.workspace, { get(target, key) {
    if (key === 'applyEdit') return async (...args: Parameters<typeof target.applyEdit>) => { const waiting = delay; if (waiting?.type === 'apply') { waiting.hit = true; await waiting.gate.promise; } return await target.applyEdit(...args); };
    return Reflect.get(target, key, target);
  } });
  const api = new Proxy(vscode, { get(target, key) { return key === 'window' ? windowApi : key === 'workspace' ? workspaceApi : Reflect.get(target, key, target); } });
  const host = registerScratchEditor({ api, extensionPath: process.env['INSRC_NATIVE_FIXTURE_EXTENSION']!, store, recovery, preference: new ScratchLockPreference({ get: <T>() => false as T, update: async () => {} }), warn: m => warnings.push(m) });
  const text = async (uri: vscode.Uri, value: string) => { const doc = await vscode.workspace.openTextDocument(uri); const edit = new vscode.WorkspaceEdit(); edit.replace(uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), value); assert.equal(await vscode.workspace.applyEdit(edit), true); return doc; };
  try {
    if (role.startsWith('pending_')) {
      const type = role.slice('pending_'.length) as 'receipt' | 'apply' | 'apply-ack';
      assert.ok(['receipt', 'apply', 'apply-ack'].includes(type));
      const item = await store.createScratch(`Crash during ${type}`, '# Original interrupted file\n');
      const resolved = await store.resolveScratch(item.id), uri = vscode.Uri.file(resolved.filePath);
      await host.openDocument(item.id);
      const waiting = { type, gate: deferred(), hit: false }; delay = waiting;
      const marker = `Interrupted_${type.replaceAll('-', '_')}`;
      await focusNativeScratchEditor(port, item.id, { insertText: marker });
      await until(() => waiting.hit, `Blocked live ${type} phase`);
      const pending = await recovery.list(uri.toString());
      assert.equal(pending.length, 1); assert.ok(pending[0]!.draft.markdown.includes(marker));
      const record = JSON.stringify(pending[0]); assert.ok(Buffer.byteLength(record) <= SCRATCH_RECOVERY_BYTES);
      const visible = await focusNativeScratchEditor(port, item.id, { expectedText: marker });
      assert.match(visible.status, /Updating|pending|recover|retained|waiting/i); assert.doesNotMatch(visible.status, /saved/i);
      assert.equal(await readFile(resolved.filePath, 'utf8'), '# Original interrupted file\n');
      await writeFile(join(root, `${role}-manifest.json`), JSON.stringify({ id: item.id, marker, type, source: '# Original interrupted file\n', draft: pending[0]!.draft.markdown }));
      const nativeDirty = (await vscode.workspace.openTextDocument(uri)).isDirty;
      assert.equal(nativeDirty, type === 'apply-ack', 'Only the applied-but-unacknowledged stage changes the native dirty model');
      checks['interruptedWhileBlocked'] = { type, released: false, hostDisposed: false, recordBytes: Buffer.byteLength(record), bound: SCRATCH_RECOVERY_BYTES, status: visible.status, nativeDirty, source: '# Original interrupted file\n', draft: pending[0]!.draft.markdown };
      await evidence(true, { paused: true });
      await writeFile(join(root, `${role}-ready-for-restart`), 'Crash while the live operation is still blocked');
      await new Promise<void>(() => {}); // driver SIGKILL; no release, dispose or revert
      throw new Error('Pending crash probe must never resume');
    }
    if (role.startsWith('verify_')) {
      const pendingRole = `pending_${role.slice('verify_'.length)}`;
      const item = JSON.parse(await readFile(join(root, `${pendingRole}-manifest.json`), 'utf8'));
      const resolved = await store.resolveScratch(item.id), uri = vscode.Uri.file(resolved.filePath);
      assert.equal(await readFile(resolved.filePath, 'utf8'), item.source);
      const before = await recovery.list(uri.toString()); assert.equal(before.length, 1); assert.equal(before[0]!.draft.markdown, item.draft);
      await host.openDocument(item.id);
      await until(() => frames.some(f => f.type === 'recovery' && f.markdown === item.draft), 'Fresh process exposes interrupted draft');
      assert.equal(await readFile(resolved.filePath, 'utf8'), item.source);
      const doc = await vscode.workspace.openTextDocument(uri); assert.equal(doc.getText(), item.source); assert.equal(doc.isDirty, false);
      checks['pendingCrashRecovery'] = { type: item.type, exactDraft: true, sourceUnchanged: true, noReplay: true, cleanCanonical: true, recordBytes: Buffer.byteLength(JSON.stringify(before[0])), bound: SCRATCH_RECOVERY_BYTES, source: item.source, draft: item.draft };
      await evidence(true); return;
    }
    if (role === 'peer') {
      const configPath = join(root, 'peer-config.json');
      await until(async () => readFile(configPath, 'utf8').then(() => true, () => false), 'Primary peer config');
      const config = JSON.parse(await readFile(configPath, 'utf8')), uri = vscode.Uri.file(config.file);
      const doc = await vscode.workspace.openTextDocument(uri); await vscode.window.showTextDocument(doc, { preview: false });
      await writeFile(join(root, 'peer-ready'), 'ready');
      await until(async () => readFile(join(root, 'peer-edit'), 'utf8').then(() => true, () => false), 'Primary dirty checkpoint');
      await text(uri, '# Peer saved revision\n'); assert.equal(await doc.save(), true);
      await writeFile(join(root, 'peer-saved'), 'saved');
      await until(async () => readFile(join(root, 'peer-done'), 'utf8').then(() => true, () => false), 'Peer completion');
      checks['secondWindowSave'] = true; await evidence(true); return;
    }
    if (role === 'reload') {
      const manifest = JSON.parse(await readFile(join(root, 'recovery-manifest.json'), 'utf8')) as { id: string; marker: string; type: string }[];
      for (const item of manifest) {
        const resolved = await store.resolveScratch(item.id), uri = vscode.Uri.file(resolved.filePath);
        const before = await readFile(resolved.filePath, 'utf8');
        await host.openDocument(item.id);
        await until(() => frames.some(f => f.type === 'recovery' && f.markdown.includes(item.marker)), `Reload retained ${item.type} draft`);
        assert.equal(await readFile(resolved.filePath, 'utf8'), before, 'Reload never saves or replays recovery');
        const pending = await recovery.list(uri.toString()); assert.ok(pending.some(p => p.draft.markdown.includes(item.marker)));
        checks[item.type] = { retained: true, notReplayed: true, source: before, records: pending.length };
        for (const { panel } of [...panes.values()]) panel.dispose();
      }
      await evidence(true); return;
    }
    const note = await store.createScratch('Lifecycle matrix', '# Native lifecycle\n'), resolved = await store.resolveScratch(note.id), uri = vscode.Uri.file(resolved.filePath);
    await host.openDocument(note.id);
    let doc = await vscode.workspace.openTextDocument(uri);
    assert.equal(doc.isDirty, false);
    await focusNativeScratchEditor(port, note.id, { insertText: 'Typed ' });
    await until(() => doc.getText().includes('Typed ') && doc.isDirty, 'Real browser edit reached dirty TextDocument');
    await focusNativeScratchEditor(port, note.id, { action: 'save', expectedText: 'Typed' }); await until(() => !doc.isDirty, 'Real browser Save');
    assert.equal(await readFile(resolved.filePath, 'utf8'), doc.getText()); checks['nativeTypingSave'] = true;
    // Revert really runs against VS Code's dirty file model.
    const saved = doc.getText(); await text(uri, '# Revert this dirty change\n');
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await until(() => doc.getText() === saved && !doc.isDirty, 'Native revert restored saved source'); checks['nativeRevert'] = true;
    await vscode.commands.executeCommand('vscode.openWith', uri, SCRATCH_EDITOR_VIEW_TYPE, vscode.ViewColumn.Beside);
    await until(() => panes.size === 2, 'Two native custom editor groups');
    const changed = '# Both native groups\n'; await text(uri, changed);
    await until(() => [...panes.keys()].every(id => frames.some(f => f.type === 'document-state' && f.paneSessionId === id && f.markdown === changed)), 'Every native pane receives shared document');
    assert.equal(vscode.workspace.textDocuments.filter(d => d.uri.toString() === uri.toString()).length, 1); assert.equal(await doc.save(), true); checks['multipaneOneDocument'] = true;
    const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs.filter(t => t.input instanceof vscode.TabInputCustom && t.input.uri.toString() === uri.toString()));
    assert.equal(await vscode.window.tabGroups.close(tabs, true), true);
    await until(() => panes.size === 0, 'Native groups closed');
    await host.openDocument(note.id);
    // Native EOL conversion must agree with renderer proposal/ack bytes.
    doc = await vscode.workspace.openTextDocument(uri);
    const eol = new vscode.WorkspaceEdit(); eol.set(uri, [vscode.TextEdit.setEndOfLine(vscode.EndOfLine.CRLF)]); assert.equal(await vscode.workspace.applyEdit(eol), true); assert.equal(await doc.save(), true);
    const ackCount = frames.filter(f => f.type === 'apply-ack').length;
    await focusNativeScratchEditor(port, note.id, { insertText: 'CRLF ' });
    await until(() => frames.filter(f => f.type === 'apply-ack').length > ackCount, 'Native CRLF acknowledgement');
    assert.equal(/(?<!\r)\n/.test(doc.getText()), false); assert.equal(frames.filter(f => f.type === 'apply-ack').at(-1)?.markdown, doc.getText());
    assert.equal(await doc.save(), true); checks['nativeCRLFEdit'] = true;
    await writeFile(resolved.filePath, '# External clean change\r\n');
    await until(() => doc.getText() === '# External clean change\r\n', 'Clean external file refresh');
    await until(() => frames.some(f => f.type === 'document-state' && f.markdown === doc.getText()), 'External change browser broadcast'); checks['cleanExternalEdit'] = true;
    // A real second VS Code process owns an independent native dirty model.
    await writeFile(join(root, 'peer-config.json'), JSON.stringify({ file: resolved.filePath }));
    await until(async () => readFile(join(root, 'peer-ready'), 'utf8').then(() => true, () => false), 'Second window opened same URI');
    await text(uri, '# Primary dirty retained\r\n');
    await writeFile(join(root, 'peer-edit'), 'edit');
    await until(async () => readFile(join(root, 'peer-saved'), 'utf8').then(() => true, () => false), 'Second window saved');
    await new Promise(r => setTimeout(r, 1000));
    assert.equal(doc.getText(), '# Primary dirty retained\r\n'); assert.equal(doc.isDirty, true); assert.equal(await readFile(resolved.filePath, 'utf8'), '# Peer saved revision\r\n');
    assert.equal(await doc.save(), false, 'Native save conflict must not overwrite second-window source');
    assert.equal(await readFile(resolved.filePath, 'utf8'), '# Peer saved revision\r\n'); assert.equal(doc.getText(), '# Primary dirty retained\r\n');
    checks['crossWindowConflict'] = { disk: 'peer', dirty: 'primary', saveRefused: true };
    await writeFile(join(root, 'peer-done'), 'done');
    await vscode.commands.executeCommand('workbench.action.files.revert'); await until(() => !doc.isDirty, 'Explicit revert after conflict');
    for (const { panel } of [...panes.values()]) panel.dispose();
    const manifest: {id:string;marker:string;type:string}[] = [];
    for (const type of ['receipt', 'apply', 'apply-ack'] as const) {
      const item = await store.createScratch(`Delayed ${type}`, '# Original durable file\n');
      const path = await store.resolveScratch(item.id), target = vscode.Uri.file(path.filePath);
      await host.openDocument(item.id);
      const waiting = { type, gate: deferred(), hit: false }; delay = waiting;
      const marker = `Pending_${type.replaceAll('-', '_')}`;
      await focusNativeScratchEditor(port, item.id, { insertText: marker });
      await until(() => waiting.hit, `Delay reached ${type}`);
      const pending = await recovery.list(target.toString()); assert.ok(pending.some(p => p.draft.markdown.includes(marker)), 'Durable before receipt/apply/ack');
      const deliveries = frames.filter(f => f.type === 'apply-ack').length;
      // A dirty native tab requires an explicit discard decision. The durable
      // unconfirmed draft must survive that close and a process restart.
      if (type === 'apply-ack') await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      for (const { panel } of [...panes.values()]) panel.dispose();
      await until(() => panes.size === 0, 'Abrupt pane disposal delivered');
      waiting.gate.resolve(); delay = undefined;
      await until(async () => (await recovery.list(target.toString())).some(p => p.draft.markdown.includes(marker)), 'Draft survives closed transport');
      await new Promise(r => setTimeout(r, 100));
      assert.equal(await readFile(path.filePath, 'utf8'), '# Original durable file\n', 'No implicit save during delay/close');
      checks[`close-${type}`] = { persisted: true, diskUnchanged: true, deliveredAcksBeforeClose: deliveries };
      manifest.push({ id: item.id, marker, type });
    }
    await writeFile(join(root, 'recovery-manifest.json'), JSON.stringify(manifest));
    await evidence(true);
  } catch (error) { await evidence(false, { error: String(error), stack: error instanceof Error ? error.stack : undefined, frames: frames.slice(-20), documents: vscode.workspace.textDocuments.map(d => ({ uri: d.uri.toString(), dirty: d.isDirty, text: d.getText() })) }); throw error; }
  finally {
    delay?.gate.resolve();
    await host.dispose();
    // Test-process shutdown must not wait on an unsaved-files dialog. Recovery
    // records have already been asserted; explicitly revert only fixture files.
    for (const item of completed ? await store.listScratches() : []) {
      const resolved = await store.resolveScratch(item.id);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(resolved.filePath));
      await vscode.window.showTextDocument(doc, { preview: false });
      await vscode.commands.executeCommand('workbench.action.files.revert');
      assert.equal(doc.isDirty, false, 'Test-owned file explicitly reverted before process shutdown');
    }
    for (const { panel } of [...panes.values()]) panel.dispose();
    if (role === 'main' && checks['close-apply-ack']) await writeFile(join(root, 'main-ready-for-restart'), 'Durable checks and fixture cleanup complete');
  }
}
