/** Loaded only by an isolated VS Code --extensionTestsPath process. */
import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { focusNativeScratchEditor } from './scratch-native-cdp.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { registerScratchEditor, SCRATCH_EDITOR_VIEW_TYPE } from '../../scratch-editor-native.js';
import { createScratchStore } from '../../../chat/scratch-store.js';
import { ScratchRecoveryStore } from '../../scratch-editor-recovery.js';
import { ScratchLockPreference } from '../../scratch-editor-lock.js';
import type { ScratchHostToEditor } from '../../scratch-editor-protocol.js';

export function activate() {}
async function until(predicate: () => boolean, message: string, attempts = 600): Promise<void> { for (let i = 0; i < attempts && !predicate(); i++) await new Promise(r => setTimeout(r, 50)); assert.ok(predicate(), message); }
export async function run(): Promise<void> {
  const root = process.env['INSRC_NATIVE_FIXTURE_ROOT']!;
  const evidencePath = join(root, 'evidence.json');
  const warnings: string[] = [], frames: ScratchHostToEditor[] = [], commands: string[] = [], incomingTypes: string[] = [];
  const manual = process.env['INSRC_NATIVE_MANUAL_FOCUS'] === '1';
  let paneId = '', nativePanel: vscode.WebviewPanel | undefined;
  const receivers = new Set<(m: unknown) => unknown>();
  const override = {
    registerCustomEditorProvider: (viewType: string, provider: vscode.CustomTextEditorProvider, options: unknown) => vscode.window.registerCustomEditorProvider(viewType, {
      resolveCustomTextEditor: async (doc, panel, token) => {
        nativePanel = panel;
        const webview = new Proxy(panel.webview, { get(target, key) {
          if (key === 'postMessage') return async (m: ScratchHostToEditor) => { frames.push(m); return await target.postMessage(m); };
          if (key === 'onDidReceiveMessage') return (listener: (m: unknown) => unknown) => { receivers.add(listener); const d = target.onDidReceiveMessage(m => { if (m && typeof m === 'object' && typeof m.type === 'string') incomingTypes.push(m.type); return listener(m); }); return { dispose: () => { receivers.delete(listener); d.dispose(); } }; };
          const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
        }, set(target, key, value) { return Reflect.set(target, key, value, target); } });
        const wrapped = new Proxy(panel, { get(target, key) { if (key === 'webview') return webview; const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; } });
        await provider.resolveCustomTextEditor(doc, wrapped, token);
        paneId = panel.webview.html.match(/data-pane-session="([^"]+)"/)![1]!;
      },
    }, options as Parameters<typeof vscode.window.registerCustomEditorProvider>[2]),
  };
  const windowApi = new Proxy(vscode.window, { get(target, key) { return key === 'registerCustomEditorProvider' ? override.registerCustomEditorProvider : Reflect.get(target, key, target); } });
  const commandApi = new Proxy(vscode.commands, { get(target, key) { if (key === 'executeCommand') return async (name: string, ...args: unknown[]) => { commands.push(`start:${name}`); const result = await vscode.commands.executeCommand(name, ...args); commands.push(`end:${name}`); return result; }; return Reflect.get(target, key, target); } });
  const api = new Proxy(vscode, { get(target, key) { return key === 'window' ? windowApi : key === 'commands' ? commandApi : Reflect.get(target, key, target); } });
  const store = createScratchStore({ root: join(root, 'scratches') });
  const note = await store.createScratch(`Native lifecycle ${process.pid}`,  '# Native baseline\n');
  const resolved = await store.resolveScratch(note.id), uri = vscode.Uri.file(resolved.filePath);
  const host = registerScratchEditor({ api, extensionPath: process.env['INSRC_NATIVE_FIXTURE_EXTENSION']!, store,
    preference: new ScratchLockPreference({ get: <T>() => false as T, update: async () => {} }),
    recovery: new ScratchRecoveryStore(join(root, 'recovery')), warn: m => warnings.push(m),
  });
  const emit = (message: object) => { for (const fn of receivers) fn({ ...message, paneSessionId: paneId }); };
  try {
    await host.openDocument(note.id);
    await until(() => frames.some(f => f.type === 'document-state'), 'Actual webview ready handshake');
    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())!;
    assert.ok(doc); assert.equal(doc.isDirty, false);
    if (!manual) { const mounted = await focusNativeScratchEditor(Number(process.env['INSRC_NATIVE_DEBUG_PORT']), note.id); assert.match(mounted.text, /Native baseline/); }
    // Native changes must reach the real browser without creating any draft.
    const edit = new vscode.WorkspaceEdit(); edit.replace(uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), '# Native changed\n');
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    await until(() => frames.some(f => f.type === 'document-state' && f.markdown === '# Native changed\n'), 'Native change broadcast');
    assert.equal(doc.isDirty, true);
    if (manual) emit({ type: 'save', draftSeq: 0, docVersion: doc.version });
    else await focusNativeScratchEditor(Number(process.env['INSRC_NATIVE_DEBUG_PORT']), note.id, { action: 'save', expectedText: 'Native changed' });
    await until(() => !doc.isDirty, 'Native Save completed');
    assert.equal(await readFile(resolved.filePath, 'utf8'), '# Native changed\n');
    assert.equal(nativePanel!.active, true);
    const statusPath = process.env['INSRC_NATIVE_MANUAL_STATUS'] ?? join(root, 'manual-status.json');
    if (manual) await writeFile(statusPath, JSON.stringify({ stage: 'undo', window: note.id, instruction: 'Click Native changed in the isolated Scratchpad qualification window, then press Ctrl+Z once.' }));
    else await focusNativeScratchEditor(Number(process.env['INSRC_NATIVE_DEBUG_PORT']), note.id, { action: 'undo', expectedText: 'Native changed' });
    await until(() => doc.getText() === '# Native baseline\n', 'Native Undo exact target', manual ? 4800 : 600);
    if (manual) await writeFile(statusPath, JSON.stringify({ stage: 'redo', window: note.id, instruction: 'In the same scratchpad press Ctrl+Shift+Z once.' }));
    else await focusNativeScratchEditor(Number(process.env['INSRC_NATIVE_DEBUG_PORT']), note.id, { action: 'redo', expectedText: 'Native baseline' });
    await until(() => doc.getText() === '# Native changed\n', 'Native Redo exact target', manual ? 4800 : 600);
    assert.ok(incomingTypes.includes('undo') && incomingTypes.includes('redo'), 'Real keyboard shortcuts must traverse the renderer drain bridge');
    if (manual) await writeFile(statusPath, JSON.stringify({ stage: 'complete', window: note.id }));
    // Real afterDelay autosave and its onWillSave lifecycle, not a mock save.
    await vscode.workspace.getConfiguration().update('files.autoSave', 'afterDelay', vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration().update('files.autoSaveDelay', 500, vscode.ConfigurationTarget.Global);
    const auto = new vscode.WorkspaceEdit(); auto.replace(uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), '# Autosaved native text\n');
    assert.equal(await vscode.workspace.applyEdit(auto), true);
    await until(() => !doc.isDirty, 'Native autosave completed');
    assert.equal(await readFile(resolved.filePath, 'utf8'), '# Autosaved native text\n');
    assert.equal(warnings.length, 0, warnings.join('\n'));
    const otherUri = vscode.Uri.file(join(root, 'other.md')); await writeFile(otherUri.fsPath, '# Other document\n');
    const other = await vscode.workspace.openTextDocument(otherUri); await vscode.window.showTextDocument(other, { preview: false });
    const otherVersion = other.version, sourceVersion = doc.version;
    emit({ type: 'undo', draftSeq: 0, docVersion: doc.version });
    await until(() => frames.some(f => f.type === 'action-error'), 'Wrong-target Undo refused');
    assert.equal(other.version, otherVersion); assert.equal(other.getText(), '# Other document\n'); assert.equal(doc.version, sourceVersion);
    await mkdir(root, { recursive: true });
    await writeFile(evidencePath, JSON.stringify({ passed: true, vscode: vscode.version, platform: process.platform, uri: uri.toString(), manualKeyboard: manual, incomingTypes, nativeSave: true, nativeUndo: true, nativeRedo: true, nativeAutosave: true, wrongTargetRefused: true, profile: { builtinAI: process.env['INSRC_NATIVE_BUILTIN_AI'] === '1', displayBackend: 'x11', privateDisplay: process.env['INSRC_NATIVE_PRIVATE_DISPLAY'] === '1', display: process.env['DISPLAY'] }, frames: frames.map(f => ({ type: f.type, ...('version' in f ? { version: f.version } : {}) })), warnings }, null, 2));
  } catch (error) { await writeFile(evidencePath, JSON.stringify({ passed: false, error: String(error), stack: error instanceof Error ? error.stack : undefined, warnings, frames, commands, incomingTypes, documents: vscode.workspace.textDocuments.filter(d => d.uri.toString() === uri.toString()).map(d => ({ version: d.version, text: d.getText(), dirty: d.isDirty })), active: { textEditor: vscode.window.activeTextEditor?.document.uri.toString(), panel: nativePanel?.active, input: vscode.window.tabGroups.activeTabGroup.activeTab?.input } }, null, 2)); throw error; }
  finally { nativePanel?.dispose(); await host.dispose(); }
}
