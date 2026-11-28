/** Public VS Code API adapter, injected by activation. Note content remains a
 * native TextDocument; recovery is separate extension-owned storage. Native
 * saves use normal VS Code file semantics, not ScratchStore's no-follow I/O. */
import type * as VSCode from 'vscode';
import { basename, dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { ScratchStore } from '../chat/scratch-store.js';
import { ScratchDocumentController } from './scratch-editor-provider.js';
import { ScratchRecoveryStore } from './scratch-editor-recovery.js';
import { ScratchLockPreference } from './scratch-editor-lock.js';
import { scratchEditorHtml } from './scratch-editor-html.js';
import { makeNonce } from './html.js';
import { createScratchHostValidator } from './scratch-validation-host.js';
import { parseScratchEditorMessage, type ScratchHostToEditor, type ScratchSelectionSend, type ScratchEditorToHost } from './scratch-editor-protocol.js';

import { readScratchImage, storeScratchImage, resolveScratchImage, scratchWorkspaceLink } from './scratch-editor-assets.js';

export const SCRATCH_EDITOR_VIEW_TYPE = 'insrc.scratchpad.editor';
export interface ScratchNativeDeps {
  readonly api: typeof VSCode;
  readonly extensionPath: string;
  readonly recovery: ScratchRecoveryStore;
  readonly preference: ScratchLockPreference;
  readonly store: ScratchStore;
  readonly warn: (message: string) => void;
  readonly richEditor?: (() => boolean) | undefined;
  readonly refresh?: () => Promise<void>;
  readonly sendSelection?: (text: string, assertCurrent: () => void) => Promise<void>;
}
type LockRequest = Extract<ScratchEditorToHost,{type:'lock'}>;
type LockResult = Extract<ScratchHostToEditor,{type:'lock-state'}>;
interface Pane {
  readonly id: string;
  readonly panel: VSCode.WebviewPanel;
  locked: boolean;
  ready: boolean;
  initialized: boolean;
  initFailure?: string | undefined;
  disposed: boolean;
  readonly listeners: VSCode.Disposable[];
  lockSequence: number;
  lastLock?: { readonly request: LockRequest; readonly result: LockResult } | undefined;
  lock?: { readonly requestId: string; readonly request: LockRequest; readonly abort: AbortController } | undefined;
  flush?: { readonly requestId: string; readonly promise: Promise<boolean>; readonly settle: (confirmed: boolean) => void } | undefined;
  deletion?: { readonly requestId: string; readonly settle: (ready: boolean) => void };
  selection?: { readonly request: ScratchSelectionSend; readonly promise: Promise<void>; pending: boolean };
  focus?: { readonly requestId: string; readonly version: number; readonly sequence: number; readonly settle: (focused: boolean) => void };
}
interface DocumentEntry {
  readonly document: VSCode.TextDocument;
  readonly controller: ScratchDocumentController;
  readonly validator: ReturnType<typeof createScratchHostValidator>;
  readonly panes: Map<string, Pane>;
  commands: Promise<void>;
  skipSaveFlush: boolean;
  closing?: Promise<void>;
}
export function registerScratchEditor(deps: ScratchNativeDeps): {
  openDocument(id: string): Promise<void>;
  deleteDocument(id: string): Promise<'deleted' | 'cancelled'>;
  accepts(uri: VSCode.Uri): Promise<boolean>;
  dispose(): Promise<void>;
} {
  const { api, recovery, preference, store, warn } = deps;
  const documents = new Map<string, DocumentEntry>();
  let stopped = false;
  const deleting = new Set<string>();
  const opening = new Set<(error: Error) => void>();
  const deleteJobs = new Map<string, Promise<'deleted' | 'cancelled'>>();
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
    const validator = createScratchHostValidator(join(deps.extensionPath, 'out', 'scratch-validation-host-worker.js'));
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
      admit: (source, draft, base) => validator.client.run({ source, draft, baseKey: `${base.version}:${base.digest}` }),
      warn,
    });
    void validator.client.ready.catch(() => controller.validationUnavailable());
    const entry: DocumentEntry = { document, controller, validator, panes: new Map(), commands: Promise.resolve(), skipSaveFlush: false };
    documents.set(key, entry); return entry;
  }
  function requestRendererFlush(entry: DocumentEntry, pane: Pane): Promise<boolean> {
    if (!pane.ready || pane.disposed || entry.closing) return Promise.resolve(false);
    if (pane.flush) return pane.flush.promise;
    const requestId = randomUUID(); let settle!: (value: boolean) => void;
    const promise = new Promise<boolean>(resolve => { settle = resolve; });
    const timer = setTimeout(() => settle(false), 1000);
    pane.flush = {requestId,promise,settle};
    void delivered(pane, {type:'flush-request',paneSessionId:pane.id,requestId}).then(sent => {if (!sent) settle(false);}, () => settle(false));
    void promise.finally(() => { clearTimeout(timer); if (pane.flush?.requestId === requestId) pane.flush = undefined; });
    return promise;
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
  const panelResource = (pane: Pane, path: string): string => pane.panel.webview.asWebviewUri(api.Uri.file(path)).toString();
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
    if (message.type === 'editor-initialized') {
      pane.initialized = message.success;
      pane.initFailure = message.success ? undefined : message.message || 'Scratchpad initialization failed.';
      return;
    }
    if (message.type === 'delete-ready') {
      const pending = pane.deletion;
      if (pending?.requestId === message.requestId) pending.settle(message.clean && message.docVersion === entry.controller.snapshot.version && message.draftSeq === entry.controller.latestSequence(pane.id));
      return;
    }
    if (message.type === 'focus-ready') {
      const pending = pane.focus;
      if (pending?.requestId === message.requestId) pending.settle(message.focused && pending.version === message.docVersion && pending.sequence === message.draftSeq);
      return;
    }
    if (message.type === 'draft') { await entry.controller.receive(pane.id, message); return; }
    if (message.type === 'flush-ready') {
      if (pane.flush?.requestId === message.requestId) pane.flush.settle(message.confirmed && !entry.controller.conflicted &&
        message.draftSeq === entry.controller.latestSequence(pane.id) && message.draftSeq <= entry.controller.appliedSequence(pane.id) && message.docVersion === entry.controller.snapshot.version);
      return;
    }
    if (message.type === 'lock-cancel') { if (pane.lock?.requestId === message.requestId) pane.lock.abort.abort(); return; }
    if (message.type === 'lock') {
      const sameRequest = (request: LockRequest): boolean => request.locked === message.locked && request.draftSeq === message.draftSeq && request.docVersion === message.docVersion;
      if (pane.lock?.requestId === message.requestId && sameRequest(pane.lock.request)) return;
      if (pane.lastLock?.request.requestId === message.requestId && sameRequest(pane.lastLock.request)) { await delivered(pane,pane.lastLock.result); return; }
      if (pane.lock || Number(message.requestId.slice(5)) <= pane.lockSequence) {
        if (pane.lock?.requestId === message.requestId) pane.lock.abort.abort();
        await delivered(pane,{type:'lock-state',paneSessionId:pane.id,requestId:message.requestId,locked:pane.locked,success:false,message:'Stale, conflicting or concurrent lock request refused.'}); return; }
      const abort = new AbortController(); pane.lockSequence = Number(message.requestId.slice(5)); pane.lock = {requestId:message.requestId,request:{...message},abort};
      let success = false, notice = '';
      try {
        const initial = entry.controller.snapshot;
        if (message.docVersion !== initial.version && message.draftSeq <= entry.controller.appliedSequence(pane.id)) throw new Error('Source changed before locking; retry.');
        const confirmed = await entry.controller.waitForSequence(pane.id,message.draftSeq,10_000,abort.signal);
        await validate(entry.document.uri);
        const current = (): boolean => !abort.signal.aborted && !pane.disposed && !stopped && !entry.controller.conflicted && entry.controller.latestSequence(pane.id) === message.draftSeq && entry.controller.snapshot.version === confirmed.version && entry.controller.snapshot.digest === confirmed.digest;
        if (!current()) throw new Error('Source changed while locking; text retained.');
        await preference.remember(message.locked);
        if (!current()) throw new Error('Lock was cancelled or source changed; previous pane state retained.');
        pane.locked = message.locked; entry.controller.setLocked(pane.id,message.locked); success = true;
      } catch (failure) { notice = failure instanceof Error ? failure.message : 'Lock change failed; previous pane state retained.'; warn(notice); }
      finally { if (pane.lock?.requestId === message.requestId) pane.lock = undefined; }
      const result: LockResult = {type:'lock-state',paneSessionId:pane.id,requestId:message.requestId,locked:pane.locked,success,message:notice};
      pane.lastLock = {request:{...message},result}; await delivered(pane,result); return;
    }
    if (message.type === 'open-text') {
      await validate(entry.document.uri);
      if (entry.controller.hasPending) warn('Unapplied scratchpad text remains in recovery; opening the text editor does not apply it.');
      await api.commands.executeCommand('vscode.openWith', entry.document.uri, 'default'); return;
    }
    if (message.type === 'asset-request') {
      try {
        await validate(entry.document.uri);
        const initial = entry.controller.snapshot, sequence = entry.controller.latestSequence(pane.id);
        const assertCurrent = (): void => {
          const current = entry.controller.snapshot;
          if (stopped || pane.disposed || entry.document.isClosed || pane.locked || pane.lock || entry.controller.conflicted || current.version !== initial.version || current.digest !== initial.digest || entry.controller.latestSequence(pane.id) !== sequence) throw new Error('Scratchpad changed during the asset action; retry.');
        };
        let href = '', path: string | undefined;
        if (message.action === 'resolve-image') {
          path = await resolveScratchImage(entry.document.uri.fsPath, message.href); href = message.href;
        } else {
          assertCurrent();
          if (message.action === 'upload-image') {
            const bytes = Buffer.from(message.dataBase64, 'base64');
            const result = await storeScratchImage(entry.document.uri.fsPath, bytes, message.mediaType);
            href = result.href; path = result.path;
          } else {
            const picked = (await api.window.showOpenDialog({ canSelectMany: false, openLabel: message.action === 'pick-image' ? 'Insert image' : 'Insert workspace link' }))?.[0];
            if (picked) {
              assertCurrent();
              if (picked.scheme !== 'file') throw new Error('Choose a local workspace file.');
              const workspace = api.workspace.getWorkspaceFolder(picked);
              if (!workspace) throw new Error('Choose a file inside an open workspace.');
              // Resolve against the workspace before reading a picked image too.
              const link = await scratchWorkspaceLink(entry.document.uri.fsPath, picked.fsPath, workspace.uri.fsPath);
              if (message.action === 'pick-link') href = link;
              else { const image = await readScratchImage(picked.fsPath), stored = await storeScratchImage(entry.document.uri.fsPath, image.bytes, image.mediaType); href = stored.href; path = stored.path; }
            }
          }
          assertCurrent();
        }
        await delivered(pane, { type: 'asset-result', paneSessionId: pane.id, requestId: message.requestId, href, displayUrl: path ? panelResource(pane, path) : '' });
      } catch (failure) {
        const messageText = failure instanceof Error ? failure.message : 'Image or link could not be inserted.';
        warn(`Scratchpad: ${messageText}`);
        await delivered(pane, { type: 'action-error', paneSessionId: pane.id, requestId: message.requestId, message: messageText });
      }
      return;
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
      if (action.type !== 'save' && (pane.locked || pane.lock)) throw new Error('Unlock this scratchpad before Undo or Redo.');
      const initial = entry.controller.snapshot;
      if (action.docVersion !== initial.version && action.draftSeq <= entry.controller.appliedSequence(pane.id)) throw new Error('Source changed before the action; retry.');
      const confirmed = await entry.controller.waitForSequence(pane.id, action.draftSeq);
      await validate(entry.document.uri);
      if (pane.disposed || entry.document.isClosed || entry.controller.latestSequence(pane.id) !== action.draftSeq ||
        entry.controller.snapshot.version !== confirmed.version || entry.controller.snapshot.digest !== confirmed.digest) throw new Error('The pane changed while draining; retry.');
      if (action.type === 'save') {
        entry.skipSaveFlush = true;
        try { if (!await entry.document.save()) throw new Error('Scratchpad was not saved.'); } finally { entry.skipSaveFlush = false; }
      } else {
        if (!targetActive(entry, pane)) throw new Error('The intended scratchpad is no longer active; retry the action there.');
        // Native Undo/Redo are focus-based, not URI-targeted. Reveal the exact
        // existing pane before dispatch, then recheck after the native focus
        // round trip so another editor cannot inherit a queued action.
        pane.panel.reveal(undefined, false);
        await api.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await focusForCommand(entry, pane, confirmed.version, action.draftSeq);
        if (pane.locked || pane.lock || !targetActive(entry, pane) || entry.controller.snapshot.version !== confirmed.version) throw new Error('The intended document changed before undo/redo; retry.');
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
        pane.focus?.settle(false); pane.deletion?.settle(false); pane.flush?.settle(false); pane.lock?.abort.abort();
        for (const listener of pane.listeners) listener.dispose();
      }
      const closed = entry.validator.dispose(); void closed.catch(() => {});
      await entry.controller.dispose(); await closed;
      const key = entry.document.uri.toString(); if (documents.get(key) === entry) documents.delete(key);
    })();
    return entry.closing;
  }
  async function freezeDeletion(entry: DocumentEntry, requestId: string): Promise<boolean> {
    for (const pane of entry.panes.values()) {
      if (pane.disposed || !pane.ready || pane.lock) return false;
      let settle!: (ready: boolean) => void;
      const ready = new Promise<boolean>(resolve => { settle = resolve; });
      pane.deletion = { requestId, settle };
      const timer = setTimeout(() => settle(false), 2000);
      try { if (!await delivered(pane, { type: 'delete-prepare', paneSessionId: pane.id, requestId }) || !await ready) return false; } catch { return false; }
      finally { clearTimeout(timer); delete pane.deletion; }
    }
    return true;
  }
  const matchingTabs = (key: string): VSCode.Tab[] => api.window.tabGroups.all.flatMap(group => group.tabs.filter(tab => {
    const input = tab.input;
    return (input instanceof api.TabInputText || input instanceof api.TabInputCustom) && input.uri.toString() === key;
  }));
  const dirty = (key: string): boolean => api.workspace.textDocuments.some(doc => !doc.isClosed && doc.uri.toString() === key && doc.isDirty) || matchingTabs(key).some(tab => tab.isDirty);
  async function deleteDocument(id: string): Promise<'deleted' | 'cancelled'> {
    const existing = deleteJobs.get(id); if (existing) return existing;
    const resolved = await store.resolveScratch(id), uri = api.Uri.file(resolved.filePath), key = uri.toString();
    const resolvedJob = deleteJobs.get(id); if (resolvedJob) return resolvedJob;
    deleting.add(key);
    const requestId = randomUUID(), entry = documents.get(key);
    const operation = async (): Promise<'deleted' | 'cancelled'> => {
      const cancel = (): 'cancelled' => { warn('Deletion cancelled. Save or revert the scratchpad and resolve pending or recovered drafts before retrying.'); return 'cancelled'; };
      try {
        if (stopped) return cancel();
        if (entry?.closing) await entry.closing;
        else if (entry) { await entry.controller.flush(); if (entry.controller.hasPending || entry.controller.conflicted) return cancel(); }
        if (dirty(key) || (await recovery.list(key)).length) return cancel();
        if (entry && !entry.closing && !await freezeDeletion(entry, requestId)) return cancel();
        const version = entry?.controller.snapshot;
        const current = (): boolean => !stopped && !dirty(key) && (!entry || !entry.controller.hasPending && !entry.controller.conflicted && entry.controller.snapshot.version === version?.version && entry.controller.snapshot.digest === version.digest);
        if (!current()) return cancel();
        const tabs = matchingTabs(key);
        if (!tabs.length && entry && [...entry.panes.values()].some(pane => !pane.disposed)) return cancel();
        if (tabs.length && !await api.window.tabGroups.close(tabs, true)) return cancel();
        if (matchingTabs(key).length) return cancel();
        if (entry) await closeEntry(entry);
        await validate(uri);
        if (!current() || matchingTabs(key).length || (await recovery.list(key)).length) return cancel();
        // Recheck after the last asynchronous recovery read. Exclusion is local
        // to this window; other windows retain normal external-delete behavior.
        if (!current() || matchingTabs(key).length) return cancel();
        try { await store.deleteScratch(id); }
        catch (failure) {
          deleting.delete(key);
          try { await openDocument(id); } catch { warn('Scratchpad deletion failed and its file could not be reopened.'); }
          throw failure;
        }
        try { await deps.refresh?.(); } catch { warn('Scratchpad deleted, but list refresh failed.'); } return 'deleted';
      } finally {
        deleting.delete(key);
        if (entry) for (const pane of entry.panes.values()) if (!pane.disposed) {
          try { if (!await delivered(pane, { type: 'delete-release', paneSessionId: pane.id, requestId })) warn('Scratchpad deletion release could not be confirmed; reopen its pane.'); } catch { warn('Scratchpad deletion release could not be confirmed; reopen its pane.'); }
        }
      }
    };
    const command = entry ? entry.commands.catch(() => {}).then(operation) : Promise.resolve().then(operation);
    if (entry) entry.commands = command.then(() => {}, () => {});
    const result = command.finally(() => { deleteJobs.delete(id); }); deleteJobs.set(id, result); return result;
  }
  function awaitEditor(key: string, column: VSCode.ViewColumn): Promise<void> {
    let cancel!: (error: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      let finished = false, target: Pane | undefined;
      const finish = (error?: Error): void => { if (finished) return; finished = true; clearTimeout(deadline); clearInterval(poll); opening.delete(cancel); if (error) reject(error); else resolve(); };
      cancel = error => finish(error);
      const check = (): void => {
        if (stopped) { finish(new Error('Scratchpad editor was disposed while opening.')); return; }
        target ??= [...(documents.get(key)?.panes.values() ?? [])].find(candidate => !candidate.disposed && candidate.panel.viewColumn === column);
        if (target?.disposed) finish(new Error('Scratchpad pane closed while opening.'));
        else if (target?.initFailure) finish(new Error(target.initFailure));
        else if (target?.initialized) finish();
      };
      const deadline = setTimeout(() => finish(new Error('Scratchpad editor did not initialize; the file is retained.')), 15_000);
      const poll = setInterval(check, 25); opening.add(cancel); check();
    });
    return promise;
  }
  async function openDocument(id: string): Promise<void> {
    const resolved = await store.resolveScratch(id), uri = api.Uri.file(resolved.filePath);
    if (stopped || deleting.has(uri.toString())) throw new Error('Scratchpad editor is disposed or the file is being deleted.');
    if (deps.richEditor?.() === false) {
      warn('Rich scratchpad editing is disabled. Opening this file in the text editor.');
      await api.commands.executeCommand('vscode.openWith', uri, 'default'); return;
    }
    try {
      const shows = (group: VSCode.TabGroup): boolean => group.tabs.some(tab => tab.input instanceof api.TabInputCustom && tab.input.viewType === SCRATCH_EDITOR_VIEW_TYPE && tab.input.uri.toString() === uri.toString());
      const before = new Set(api.window.tabGroups.all.filter(shows).map(group => group.viewColumn));
      // Let VS Code choose placement, including its locked-group behavior.
      await api.commands.executeCommand('vscode.openWith', uri, SCRATCH_EDITOR_VIEW_TYPE);
      const groups = api.window.tabGroups.all.filter(shows), fresh = groups.filter(group => !before.has(group.viewColumn));
      const active = api.window.tabGroups.activeTabGroup, input = active.activeTab?.input;
      const activeMatches = input instanceof api.TabInputCustom && input.viewType === SCRATCH_EDITOR_VIEW_TYPE && input.uri.toString() === uri.toString();
      const target = fresh.length === 1 ? fresh[0] : activeMatches ? active : groups.length === 1 ? groups[0] : undefined;
      if (!target) throw new Error('Could not confirm the scratchpad editor target; the file is retained.');
      await awaitEditor(uri.toString(), target.viewColumn);
    } catch (failure) {
      if (!stopped) {
        try {
          void Promise.resolve(api.window.showWarningMessage('The rich scratchpad editor could not open. The file is retained.', 'Open in text editor')).then(async choice => {
            if (choice !== 'Open in text editor' || stopped || deleting.has(uri.toString())) return;
            await validate(uri);
            if (!stopped && !deleting.has(uri.toString())) await api.commands.executeCommand('vscode.openWith', uri, 'default');
          }).catch(() => warn('The scratchpad text fallback could not be opened.'));
        } catch { warn('The scratchpad fallback notice could not be shown.'); }
      }
      throw failure;
    }
  }
  const provider: VSCode.CustomTextEditorProvider = {
    resolveCustomTextEditor: async (document, panel, token) => {
      await validate(document.uri);
      if (stopped || deleting.has(document.uri.toString()) || token.isCancellationRequested || document.isClosed) throw new Error('Scratchpad opening was cancelled.');
      const previous = documents.get(document.uri.toString()); if (previous?.closing) await previous.closing;
      // Closing can yield while extension shutdown or cancellation begins.
      // Do not attach listeners or publish a new entry after that boundary.
      if (stopped || deleting.has(document.uri.toString()) || token.isCancellationRequested || document.isClosed) throw new Error('Scratchpad opening was cancelled.');
      const workerSource = await readFile(join(deps.extensionPath, 'out', 'scratch-editor', 'validator.js'), 'utf8');
      if (stopped || deleting.has(document.uri.toString()) || token.isCancellationRequested || document.isClosed) throw new Error('Scratchpad opening was cancelled.');
      const entry = entryFor(document);
      const pane: Pane = { id: randomUUID(), panel, lockSequence: 0, locked: preference.initial(), ready: false, initialized: false, disposed: false, listeners: [] };
      entry.panes.set(pane.id, pane);
      const assets = api.Uri.file(join(deps.extensionPath, 'out', 'scratch-editor'));
      panel.webview.options = { enableScripts: true, localResourceRoots: [assets, api.Uri.file(join(dirname(document.uri.fsPath), 'assets'))] };
      pane.listeners.push(panel.webview.onDidReceiveMessage(value => { void handle(entry, pane, value).catch(failure => error(pane, failure instanceof Error ? `Scratchpad: ${failure.message}` : 'Scratchpad action failed; source and pending recovery are retained.')); }));
      pane.listeners.push(panel.onDidDispose(() => {
        pane.disposed = true; entry.controller.removePane(pane.id);
        pane.focus?.settle(false); pane.deletion?.settle(false); pane.flush?.settle(false); pane.lock?.abort.abort();
        for (const listener of pane.listeners) listener.dispose(); entry.panes.delete(pane.id);
        if (!entry.panes.size) void closeEntry(entry).catch(() => warn('Scratchpad closing failed; pending recovery was retained.'));
      }));
      panel.webview.html = scratchEditorHtml({ workerSource, cspSource: panel.webview.cspSource, script: panel.webview.asWebviewUri(api.Uri.file(join(assets.fsPath, 'editor.js'))).toString(), style: panel.webview.asWebviewUri(api.Uri.file(join(assets.fsPath, 'editor.css'))).toString() }, makeNonce(), pane.id);
    },
  };
  const listeners = [
    api.window.registerCustomEditorProvider(SCRATCH_EDITOR_VIEW_TYPE, provider, { supportsMultipleEditorsPerDocument: true, webviewOptions: { retainContextWhenHidden: true } }),
    api.workspace.onDidChangeTextDocument(event => { const entry = documents.get(event.document.uri.toString()); if (entry?.document === event.document) { entry.validator.client.invalidateBase(); entry.controller.documentChanged(); } }),
    api.workspace.onWillSaveTextDocument(event => {
      const entry = documents.get(event.document.uri.toString());
      if (entry?.skipSaveFlush) { entry.skipSaveFlush = false; return; }
      if (entry && !entry.closing) event.waitUntil((async () => {
        const results = await Promise.all([...entry.panes.values()].map(pane => requestRendererFlush(entry,pane)));
        if (results.some(confirmed => !confirmed) || entry.controller.hasPending || entry.controller.conflicted) warn('Save may contain an earlier document version; pending draft remains recoverable.');
        return [];
      })());
    }),
    api.workspace.onDidCloseTextDocument(document => { const entry = documents.get(document.uri.toString()); if (entry?.document === document) void closeEntry(entry).catch(() => warn('Scratchpad document closed with pending recovery.')); }),
  ];
  return {
    openDocument, deleteDocument,
    accepts: async uri => { try { await validate(uri); return true; } catch { return false; } },
    dispose: async () => { stopped = true; for (const cancel of [...opening]) cancel(new Error('Scratchpad editor was disposed while opening.')); for (const listener of listeners) listener.dispose(); for (const entry of [...documents.values()]) await closeEntry(entry); },
  };
}
