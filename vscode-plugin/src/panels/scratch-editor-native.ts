/** Public VS Code API adapter, injected by activation. Note content remains a
 * native TextDocument; recovery is separate extension-owned storage. Native
 * saves use normal VS Code file semantics, not ScratchStore's no-follow I/O. */
import type * as VSCode from 'vscode';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ScratchStore } from '../chat/scratch-store.js';
import { ScratchDocumentController } from './scratch-editor-provider.js';
import { ScratchRecoveryStore } from './scratch-editor-recovery.js';
import { ScratchLockPreference } from './scratch-editor-lock.js';
import { scratchEditorHtml } from './scratch-editor-html.js';
import { makeNonce } from './html.js';
import { checkScratchMarkdownEdit, scratchSourceCodec } from './scratch-markdown.js';
import { parseScratchEditorMessage, type ScratchHostToEditor, type ScratchSelectionSend } from './scratch-editor-protocol.js';

export const SCRATCH_EDITOR_VIEW_TYPE = 'insrc.scratchpad.editor';
export interface ScratchNativeDeps {
  readonly api: typeof VSCode;
  readonly extensionPath: string;
  readonly recovery: ScratchRecoveryStore;
  readonly preference: ScratchLockPreference;
  readonly store: ScratchStore;
  readonly warn: (message: string) => void;
  readonly sendSelection?: (text: string, assertCurrent: () => void) => Promise<void>;
}
interface Pane {
  readonly id: string;
  readonly panel: VSCode.WebviewPanel;
  locked: boolean;
  ready: boolean;
  disposed: boolean;
  readonly listeners: VSCode.Disposable[];
  selection?: { readonly request: ScratchSelectionSend; readonly promise: Promise<void>; pending: boolean };
  focus?: { readonly requestId: string; readonly version: number; readonly sequence: number; readonly settle: (focused: boolean) => void };
}
interface DocumentEntry {
  readonly document: VSCode.TextDocument;
  readonly controller: ScratchDocumentController;
  readonly panes: Map<string, Pane>;
  commands: Promise<void>;
  closing?: Promise<void>;
}
export function registerScratchEditor(deps: ScratchNativeDeps): {
  openDocument(id: string): Promise<void>;
  dispose(): Promise<void>;
} {
  const { api, recovery, preference, store, warn } = deps;
  const documents = new Map<string, DocumentEntry>();
  let stopped = false;
  async function validate(uri: VSCode.Uri): Promise<void> {
    if (uri.scheme !== 'file') throw new Error('Only existing scratchpad files can use this editor.');
    const resolved = await store.resolveScratch(basename(uri.fsPath));
    if (api.Uri.file(resolved.filePath).toString() !== uri.toString()) throw new Error('This file is outside the scratchpad directory.');
  }
  const delivered = async (pane: Pane, message: ScratchHostToEditor): Promise<boolean> => {
    if (pane.disposed) return false;
    return await pane.panel.webview.postMessage(message);
  };
  async function error(pane: Pane, message: string): Promise<void> {
    warn(message);
    if (!pane.disposed) {
      try { if (!await delivered(pane, { type: 'action-error', paneSessionId: pane.id, requestId: 'action', message })) warn('Scratchpad error notice could not be delivered.'); }
      catch { warn('Scratchpad error notice could not be delivered.'); }
    }
  }
  function entryFor(document: VSCode.TextDocument): DocumentEntry {
    const key = document.uri.toString(), existing = documents.get(key);
    if (existing) {
      if (existing.document !== document || existing.closing) throw new Error('Scratchpad is closing; retry opening after pending work finishes.');
      return existing;
    }
    const controller = new ScratchDocumentController({
      read: () => ({ version: document.version, markdown: document.getText() }),
      applyEdit: async edit => {
        // No await between this check and applyEdit. VS Code's public API
        // conversion attaches the current open document version to each edit.
        if (document.isClosed || document.version !== edit.baseVersion) return false;
        const native = new api.WorkspaceEdit();
        native.replace(document.uri, new api.Range(document.positionAt(edit.start), document.positionAt(edit.end)), edit.text);
        return await api.workspace.applyEdit(native);
      },
      retainDraft: draft => recovery.retain(key, draft),
      draftApplied: async draft => { await recovery.clearApplied(key, draft); },
      admit: (source, draft) => checkScratchMarkdownEdit(source, draft, scratchSourceCodec, scratchSourceCodec.parse(draft)),
      warn,
    });
    const entry: DocumentEntry = { document, controller, panes: new Map(), commands: Promise.resolve() };
    documents.set(key, entry); return entry;
  }
  async function drain(entry: DocumentEntry): Promise<void> {
    for (const pane of entry.panes.values()) if (pane.ready && !pane.disposed) {
      await entry.controller.waitForSequence(pane.id, entry.controller.latestSequence(pane.id));
    }
  }
  function targetActive(entry: DocumentEntry, pane: Pane): boolean {
    const input = api.window.tabGroups.activeTabGroup.activeTab?.input;
    const textEditor = api.window.activeTextEditor;
    return (!textEditor || textEditor.document.uri.toString() === entry.document.uri.toString()) &&
      pane.panel.active && input instanceof api.TabInputCustom && input.viewType === SCRATCH_EDITOR_VIEW_TYPE && input.uri.toString() === entry.document.uri.toString();
  }
  async function focusForCommand(entry: DocumentEntry, pane: Pane, version: number, sequence: number): Promise<void> {
    const requestId = randomUUID();
    let settle!: (focused: boolean) => void;
    const result = new Promise<boolean>(resolve => { settle = resolve; });
    pane.focus = { requestId, version, sequence, settle };
    const timer = setTimeout(() => settle(false), 1500);
    try {
      if (!await delivered(pane, { type: 'focus-request', paneSessionId: pane.id, requestId, docVersion: version, draftSeq: sequence }) || !await result) throw new Error('Scratchpad focus could not be confirmed; retry Undo/Redo in this pane.');
      if (!targetActive(entry, pane) || entry.controller.snapshot.version !== version || entry.controller.latestSequence(pane.id) !== sequence) throw new Error('Document changed before undo/redo; retry.');
    } finally { clearTimeout(timer); delete pane.focus; }
  }
  async function recover(entry: DocumentEntry, pane: Pane): Promise<void> {
    const records = await recovery.list(entry.document.uri.toString());
    if (!records.length || pane.disposed) return;
    await delivered(pane, { type: 'recovery', paneSessionId: pane.id, draftSeq: records[0]!.draft.draftSeq, markdown: records[0]!.draft.markdown });
    const choice = await api.window.showWarningMessage('A scratchpad draft was not confirmed. The original file has not been overwritten.', 'Open recovery copy', 'Discard recovery', 'Keep recovery');
    if (choice !== 'Open recovery copy' && choice !== 'Discard recovery') return;
    let record = records[0]!;
    if (records.length > 1) {
      const selected = await api.window.showQuickPick(records.map((r, index) => ({ label: `Draft ${index + 1}`, description: r.draft.markdown.slice(0, 100).replace(/\s+/g, ' '), record: r })), { placeHolder: 'Choose the pending draft' });
      if (!selected) return; record = selected.record;
    }
    if (choice === 'Discard recovery') { await recovery.discard(record); return; }
    const copy = await api.workspace.openTextDocument({ content: record.draft.markdown, language: 'markdown' });
    await api.window.showTextDocument(copy, { preview: false }); // explicit copy; never replay into source
  }
  async function handle(entry: DocumentEntry, pane: Pane, value: unknown): Promise<void> {
    const message = parseScratchEditorMessage(value);
    if (!message || message.paneSessionId !== pane.id || pane.disposed || stopped) throw new Error('Invalid scratchpad message/session.');
    if (message.type === 'editor-ready') {
      if (pane.ready) return;
      pane.ready = true;
      entry.controller.addPane(pane.id, m => delivered(pane, m), pane.locked);
      await recover(entry, pane); return;
    }
    if (!pane.ready) throw new Error('Scratchpad is not ready.');
    if (message.type === 'focus-ready') {
      const pending = pane.focus;
      if (pending?.requestId === message.requestId) pending.settle(message.focused && pending.version === message.docVersion && pending.sequence === message.draftSeq);
      return;
    }
    if (message.type === 'draft') { await entry.controller.receive(pane.id, message); return; }
    if (message.type === 'lock') {
      // Enforce a new lock immediately; failed preference writes are visible.
      pane.locked = message.locked; entry.controller.setLocked(pane.id, message.locked);
      await preference.remember(message.locked); return;
    }
    if (message.type === 'open-text') {
      await validate(entry.document.uri);
      if (entry.controller.hasPending) warn('Unapplied scratchpad text remains in recovery; opening the text editor does not apply it.');
      await api.commands.executeCommand('vscode.openWith', entry.document.uri, 'default'); return;
    }
    if (message.type === 'send-selection') {
      const captured = Object.freeze({ ...message }), previous = pane.selection;
      if (previous && Number(captured.requestId.slice(5)) <= Number(previous.request.requestId.slice(5))) {
        if (Object.keys(captured).every(key => captured[key as keyof ScratchSelectionSend] === previous.request[key as keyof ScratchSelectionSend])) return previous.promise;
        throw new Error('Stale or conflicting selection request; retry Send.');
      }
      if (previous?.pending) {
        await delivered(pane, { type: 'selection-result', paneSessionId: pane.id, requestId: captured.requestId, sent: false, message: 'A selection is still being sent; check the composer before retrying.' }); return;
      }
      const command = entry.commands.catch(() => {}).then(async () => {
        try {
          if (!entry.controller.selectionSourceMatches(pane.id, captured.draftSeq, captured.docVersion)) throw new Error('Source changed before Send; reselect and retry.');
          const confirmed = await entry.controller.waitForSequence(pane.id, captured.draftSeq);
          await validate(entry.document.uri);
          const assertCurrent = (): void => {
            const current = entry.controller.snapshot;
            if (stopped || pane.disposed || entry.document.isClosed || entry.controller.conflicted || entry.controller.latestSequence(pane.id) !== captured.draftSeq ||
              current.version !== confirmed.version || current.digest !== confirmed.digest) throw new Error('Source changed while preparing Send; reselect and retry.');
          };
          assertCurrent();
          if (!deps.sendSelection) throw new Error('Chat is unavailable; retry Send.');
          await deps.sendSelection(captured.selectedText, assertCurrent);
          if (pane.selection?.request === captured) pane.selection.pending = false;
          if (!await delivered(pane, { type: 'selection-result', paneSessionId: pane.id, requestId: captured.requestId, sent: true, message: 'Selection sent to the chat composer.' })) warn('Selection sent, but confirmation was not delivered. Check the composer before retrying.');
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : 'Selection could not be inserted; retry Send.';
          warn(`Scratchpad: ${message}`);
          if (pane.selection?.request === captured) pane.selection.pending = false;
          if (!await delivered(pane, { type: 'selection-result', paneSessionId: pane.id, requestId: captured.requestId, sent: false, message })) warn('Selection failure notice was not delivered; the captured selection remains in its pane.');
        } finally { if (pane.selection?.request === captured) pane.selection.pending = false; }
      });
      pane.selection = { request: captured, promise: command, pending: true };
      entry.commands = command.catch(() => {}); await command; return;
    }
    if (message.type !== 'save' && message.type !== 'undo' && message.type !== 'redo') throw new Error('This scratchpad action is not available yet.');
    const action = message;
    const command = entry.commands.catch(() => {}).then(async () => {
      const initial = entry.controller.snapshot;
      if (action.docVersion !== initial.version && action.draftSeq <= entry.controller.appliedSequence(pane.id)) throw new Error('Source changed before the action; retry.');
      const confirmed = await entry.controller.waitForSequence(pane.id, action.draftSeq);
      await validate(entry.document.uri);
      if (pane.disposed || entry.document.isClosed || entry.controller.latestSequence(pane.id) !== action.draftSeq ||
        entry.controller.snapshot.version !== confirmed.version || entry.controller.snapshot.digest !== confirmed.digest) throw new Error('The pane changed while draining; retry.');
      if (action.type === 'save') {
        if (!await entry.document.save()) throw new Error('Scratchpad was not saved.');
      } else {
        if (!targetActive(entry, pane)) throw new Error('The intended scratchpad is no longer active; retry the action there.');
        // Native Undo/Redo are focus-based, not URI-targeted. Reveal the exact
        // existing pane before dispatch, then recheck after the native focus
        // round trip so another editor cannot inherit a queued action.
        pane.panel.reveal(undefined, false);
        await api.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await focusForCommand(entry, pane, confirmed.version, action.draftSeq);
        if (!targetActive(entry, pane) || entry.controller.snapshot.version !== confirmed.version) throw new Error('The intended document changed before undo/redo; retry.');
        await api.commands.executeCommand(action.type);
      }
    });
    entry.commands = command.catch(() => {}); await command;
  }
  function closeEntry(entry: DocumentEntry): Promise<void> {
    if (entry.closing) return entry.closing;
    entry.closing = (async () => {
      for (const pane of entry.panes.values()) {
        pane.disposed = true; entry.controller.removePane(pane.id);
        pane.focus?.settle(false);
        for (const listener of pane.listeners) listener.dispose();
      }
      await entry.controller.dispose();
      const key = entry.document.uri.toString(); if (documents.get(key) === entry) documents.delete(key);
    })();
    return entry.closing;
  }
  const provider: VSCode.CustomTextEditorProvider = {
    resolveCustomTextEditor: async (document, panel, token) => {
      await validate(document.uri);
      if (stopped || token.isCancellationRequested || document.isClosed) throw new Error('Scratchpad opening was cancelled.');
      const previous = documents.get(document.uri.toString()); if (previous?.closing) await previous.closing;
      // Closing can yield while extension shutdown or cancellation begins.
      // Do not attach listeners or publish a new entry after that boundary.
      if (stopped || token.isCancellationRequested || document.isClosed) throw new Error('Scratchpad opening was cancelled.');
      const entry = entryFor(document);
      const pane: Pane = { id: randomUUID(), panel, locked: preference.initial(), ready: false, disposed: false, listeners: [] };
      entry.panes.set(pane.id, pane);
      const assets = api.Uri.file(join(deps.extensionPath, 'out', 'scratch-editor'));
      panel.webview.options = { enableScripts: true, localResourceRoots: [assets] };
      pane.listeners.push(panel.webview.onDidReceiveMessage(value => { void handle(entry, pane, value).catch(failure => error(pane, failure instanceof Error ? `Scratchpad: ${failure.message}` : 'Scratchpad action failed; source and pending recovery are retained.')); }));
      pane.listeners.push(panel.onDidDispose(() => {
        pane.disposed = true; entry.controller.removePane(pane.id);
        pane.focus?.settle(false);
        for (const listener of pane.listeners) listener.dispose(); entry.panes.delete(pane.id);
        if (!entry.panes.size) void closeEntry(entry).catch(() => warn('Scratchpad closing failed; pending recovery was retained.'));
      }));
      panel.webview.html = scratchEditorHtml({ cspSource: panel.webview.cspSource, script: panel.webview.asWebviewUri(api.Uri.file(join(assets.fsPath, 'editor.js'))).toString(), style: panel.webview.asWebviewUri(api.Uri.file(join(assets.fsPath, 'editor.css'))).toString() }, makeNonce(), pane.id);
    },
  };
  const listeners = [
    api.window.registerCustomEditorProvider(SCRATCH_EDITOR_VIEW_TYPE, provider, { supportsMultipleEditorsPerDocument: true, webviewOptions: { retainContextWhenHidden: true } }),
    api.workspace.onDidChangeTextDocument(event => { const entry = documents.get(event.document.uri.toString()); if (entry?.document === event.document) entry.controller.documentChanged(); }),
    api.workspace.onWillSaveTextDocument(event => {
      const entry = documents.get(event.document.uri.toString());
      if (entry && !entry.closing) event.waitUntil(drain(entry).then(() => [], () => { warn('Save may contain an earlier document version; pending draft remains recoverable.'); return []; }));
    }),
    api.workspace.onDidCloseTextDocument(document => { const entry = documents.get(document.uri.toString()); if (entry?.document === document) void closeEntry(entry).catch(() => warn('Scratchpad document closed with pending recovery.')); }),
  ];
  return {
    openDocument: async id => { const resolved = await store.resolveScratch(id); if (stopped) throw new Error('Scratchpad editor is disposed.'); await api.commands.executeCommand('vscode.openWith', api.Uri.file(resolved.filePath), SCRATCH_EDITOR_VIEW_TYPE); },
    dispose: async () => { stopped = true; for (const listener of listeners) listener.dispose(); for (const entry of [...documents.values()]) await closeEntry(entry); },
  };
}
