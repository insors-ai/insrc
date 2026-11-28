/**
 * Story E202611134642d49a:S001 / t7 — the scratchpad extension-host router.
 *
 * A vscode-free core that owns the six scratchpad webview->host intents and the
 * two host->webview pushes, over injected boundaries, so the behaviors the PLAN
 * names (scratch-new cancel/answer end-to-end, scratch-list error + later
 * recovery, send-to-chat reveal/ready/cap/disposed-drop, non-string field
 * rejection) are executable in a unit test instead of only source-scannable.
 *
 * extension.ts is the only module that imports `vscode`; it binds the real
 * showInputBox, chat open/ready/post, and panel factory here.
 */

import type { ScratchEntry, ScratchStore } from './scratch-store.js';
import type { HostToWebview, WebviewToHost } from './protocol.js';
import { capUtf8, type ScratchPanels } from '../panels/scratch-panels.js';
import type { ScratchChatTarget } from './scratch-chat-target.js';

/** The six scratchpad webview->host intents the chat channel routes here. */
export const SCRATCH_INTENT_TYPES: ReadonlySet<string> = new Set([
  'scratch-open-menu',
  'scratch-new',
  'scratch-open',
  'scratch-delete',
  'scratch-browse',
  'send-to-chat',
]);

/** Acquire the new scratchpad's title (VS Code's input box; undefined on cancel). */
export type ScratchTitlePrompt = () => Promise<string | undefined>;

/** The chat panel side of the send-to-chat / scratch-list routes. */
export interface ScratchChatSeam {
  /** Capture this exact panel lifetime for an awaited, checked insertion. */
  capture?(): ScratchChatTarget;
  /** Reveal the chat panel, opening it when closed. */
  open(): void;
  /** Resolves once the chat webview has posted its ready handshake. */
  ready(): Promise<void>;
  /** True when there is no live chat channel — a send is then dropped silently. */
  disposed(): boolean;
  /** Post one host->webview message to the chat channel. */
  post(msg: HostToWebview): void;
}

export interface ScratchHostDeps {
  readonly refresh?: () => Promise<void>;
  readonly store: ScratchStore;
  readonly panels: ScratchPanels;
  readonly chat: ScratchChatSeam;
  readonly promptTitle: ScratchTitlePrompt;
  readonly logger?: { warn(msg: string): void } | undefined;
}

export interface ScratchHost {
  refreshList(): Promise<void>;
  /** Explicit rich-editor selection route. Throws on stale source/delivery. */
  sendSelectionToChat(text: string, assertCurrent: () => void): Promise<void>;
  /** Handle one webview->host message; non-scratch types and malformed fields are ignored. */
  onMessage(msg: WebviewToHost): void;

}

/** The recent-list cap for the chat status-bar menu (top 5 by mtime). */
export const SCRATCH_MENU_LIMIT = 5;

export function createScratchHost(deps: ScratchHostDeps): ScratchHost {
  const log = deps.logger ?? { warn: () => {} };

  /**
   * Answer scratch-open-menu with the recent top-5; a store failure carries the error
   * field. `forceError` lets a caller that already failed (e.g. scratch-new's create)
   * still push the error line even when the list itself succeeds — otherwise the menu
   * would look healthy and hide the failure.
   */
  const sendScratchList = async (forceError?: string | undefined): Promise<void> => {
    let entries: readonly ScratchEntry[] = [];
    let error: string | undefined = forceError;
    try {
      entries = await deps.store.listScratches(SCRATCH_MENU_LIMIT);
    } catch (err) {
      error = `scratchpads unavailable: ${String(err)}`;
    }
    try { deps.chat.post({ type: 'scratch-list', entries, ...(error !== undefined ? { error } : {}) }); }
    catch (failure) { log.warn(`Scratchpad list could not be delivered: ${String(failure)}`); }
  };

  /** Reveal the chat, await the ready handshake, then push the capped insert; disposed drops silently. */
  const sendToChat = async (text: string, assertCurrent?: () => void): Promise<void> => {
    try {
      deps.chat.open();
      if (assertCurrent) {
        const target = deps.chat.capture?.();
        if (!target) throw new Error('Chat insertion is unavailable; retry Send.');
        await target.ready();
        if (target.disposed()) throw new Error('Chat closed before Send; retry.');
        assertCurrent();
        try {
          if (!await target.post({ type: 'insert-into-input', text: capUtf8(text) })) throw new Error('Delivery refused');
        } catch (cause) { throw new Error('Selection delivery was not confirmed; check the composer before retrying.', { cause }); }
        return;
      }
      await deps.chat.ready();
      if (deps.chat.disposed()) return;
      deps.chat.post({ type: 'insert-into-input', text: capUtf8(text) });
    } catch (err) {
      if (assertCurrent) throw err;
      log.warn(`[scratches] send-to-chat could not reach the chat: ${String(err)}`);
    }
  };

  const onMessage = (msg: WebviewToHost): void => {
    // Runtime guard: a non-string or unknown type is ignored without throwing.
    if (typeof msg !== 'object' || msg === null || typeof msg.type !== 'string' || !SCRATCH_INTENT_TYPES.has(msg.type)) {
      log.warn('[scratches] dropped malformed message: non-string or unknown type');
      return;
    }
    switch (msg.type) {
      case 'scratch-open-menu':
        void sendScratchList();
        return;
      case 'scratch-new':
        void (async () => {
          let title: string | undefined;
          try { title = await deps.promptTitle(); } catch (failure) { log.warn(`Scratchpad title prompt failed: ${String(failure)}`); await sendScratchList('Could not ask for a scratchpad title.'); return; }
          if (typeof title !== 'string' || !title.trim()) { await sendScratchList(); return; }
          let entry: ScratchEntry;
          try { entry = await deps.store.createScratch(title.trim()); }
          catch (failure) { log.warn(`Scratchpad create failed: ${String(failure)}`); await sendScratchList(`create failed: ${String(failure)}`); return; }
          try { await (deps.refresh ? deps.refresh() : deps.panels.refreshBrowse()); }
          catch (failure) { log.warn(`Scratchpad refresh failed after create: ${String(failure)}`); }
          try { await deps.panels.openDocument(entry.id); }
          catch (failure) { log.warn(`Created ${entry.id}, but opening failed: ${String(failure)}`); await sendScratchList(`Created ${entry.id}, but it could not be opened: ${String(failure)}`); return; }
          if (!deps.refresh) await sendScratchList();
        })().catch(failure => log.warn(`Scratchpad creation notification failed: ${String(failure)}`));
        return;
      case 'scratch-open':
        if (typeof msg.id !== 'string') { log.warn('[scratches] dropped malformed scratch-open: non-string id'); return; }
        void deps.panels.openDocument(msg.id).catch(failure => { log.warn(`Scratchpad open failed: ${String(failure)}`); void sendScratchList(`open failed: ${String(failure)}`); });
        return;
      case 'scratch-delete':
        if (typeof msg.id !== 'string') { log.warn('[scratches] dropped malformed scratch-delete: non-string id'); return; }
        void deps.panels.deleteDocument(msg.id).then(async result => {
          if (result === 'deleted' && !deps.refresh) { try { await deps.panels.refreshBrowse(); } catch (failure) { log.warn(`Scratchpad refresh failed after delete: ${String(failure)}`); } await sendScratchList(); }
        }).catch(failure => { log.warn(`Scratchpad deletion failed: ${String(failure)}`); void sendScratchList(`delete failed: ${String(failure)}`); });
        return;
      case 'scratch-browse':
        void deps.panels.openBrowse().then(opened => { if (!opened) return sendScratchList('Scratchpad browse could not be opened.'); }).catch(failure => { log.warn(`Scratchpad browse failed: ${String(failure)}`); void sendScratchList(`browse failed: ${String(failure)}`); });
        return;
      case 'send-to-chat':
        if (typeof msg.text !== 'string') { log.warn('[scratches] dropped malformed send-to-chat: non-string text'); return; }
        void sendToChat(msg.text);
        return;
      default:
        return; // not a scratch intent — the chat host handles it
    }
  };

  return { refreshList: () => sendScratchList(), onMessage, sendSelectionToChat: (text, assertCurrent) => sendToChat(text, assertCurrent) };
}
