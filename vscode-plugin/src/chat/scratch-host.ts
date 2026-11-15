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
  readonly store: ScratchStore;
  readonly panels: ScratchPanels;
  readonly chat: ScratchChatSeam;
  readonly promptTitle: ScratchTitlePrompt;
  readonly logger?: { warn(msg: string): void } | undefined;
}

export interface ScratchHost {
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
    deps.chat.post({ type: 'scratch-list', entries, ...(error !== undefined ? { error } : {}) });
  };

  /** Reveal the chat, await the ready handshake, then push the capped insert; disposed drops silently. */
  const sendToChat = async (text: string): Promise<void> => {
    try {
      deps.chat.open();
      await deps.chat.ready();
      if (deps.chat.disposed()) return;
      deps.chat.post({ type: 'insert-into-input', text: capUtf8(text) });
    } catch (err) {
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
        void (async (): Promise<void> => {
          // Titleless intent: the host acquires the title via the injected prompt. A cancelled,
          // non-string or blank-trimmed prompt creates nothing and re-sends the UNCHANGED list.
          const raw = await deps.promptTitle();
          if (typeof raw !== 'string') {
            if (raw !== undefined) log.warn('[scratches] dropped malformed scratch-new: non-string title');
            void sendScratchList();
            return;
          }
          const title = raw;
          if (title.trim() === '') {
            void sendScratchList();
            return;
          }
          try {
            const entry = await deps.store.createScratch(title.trim());
            // Opening the new document is the POINT of this intent: a browse-tab
            // refresh failure must not skip it, and a failed open must be visible
            // in the log instead of silently looking like nothing happened.
            try {
              await deps.panels.refreshBrowse();
            } catch (err) {
              log.warn(`[scratches] browse refresh failed after create: ${String(err)}`);
            }
            const opened = await deps.panels.openDocument(entry.id);
            if (opened === undefined) log.warn(`[scratches] created ${entry.id} but its document panel did not open`);
            void sendScratchList();
          } catch (err) {
            // The create failed: re-send the list WITH the error so the menu surfaces
            // the failure instead of silently looking unchanged/healthy.
            log.warn(`[scratches] create failed: ${String(err)}`);
            void sendScratchList(`create failed: ${String(err)}`);
          }
        })();
        return;
      case 'scratch-open':
        if (typeof msg.id !== 'string') { log.warn('[scratches] dropped malformed scratch-open: non-string id'); return; }
        void deps.panels.openDocument(msg.id);
        return;
      case 'scratch-delete':
        if (typeof msg.id !== 'string') { log.warn('[scratches] dropped malformed scratch-delete: non-string id'); return; }
        void (async (): Promise<void> => {
          deps.panels.invalidateId(msg.id);
          let deleteError: string | undefined;
          try {
            await deps.store.deleteScratch(msg.id);
          } catch (err) {
            // A failed delete must not look like success: carry the error into the
            // re-sent list so the menu says what happened.
            deleteError = `delete failed: ${String(err)}`;
            log.warn(`[scratches] delete failed for ${msg.id}: ${String(err)}`);
          }
          deps.panels.closeDocumentIfShowing(msg.id);
          await deps.panels.refreshBrowse();
          void sendScratchList(deleteError);
        })();
        return;
      case 'scratch-browse':
        void deps.panels.openBrowse();
        return;
      case 'send-to-chat':
        if (typeof msg.text !== 'string') { log.warn('[scratches] dropped malformed send-to-chat: non-string text'); return; }
        void sendToChat(msg.text);
        return;
      default:
        return; // not a scratch intent — the chat host handles it
    }
  };

  return { onMessage };
}
