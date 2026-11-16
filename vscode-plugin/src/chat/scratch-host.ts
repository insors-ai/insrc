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
import { capUtf8, type ScratchDocWebviewToHost, type ScratchPanels } from '../panels/scratch-panels.js';

/** The six scratchpad webview->host intents the chat channel routes here. */
export const SCRATCH_INTENT_TYPES: ReadonlySet<string> = new Set([
  'scratch-open-menu',
  'scratch-new',
  'scratch-open',
  'scratch-delete',
  'scratch-browse',
  'send-to-chat',
]);

/** The document-panel channel's intents (Story 01ac1e4b6a6c9c2f/s1 t2/t4): these arrive on
 * the scratchpad DOCUMENT webview's own onMessage, NOT the chat channel, so the chat-side
 * SCRATCH_INTENT_TYPES interception cannot see them — extension.ts routes them straight here. */
export const SCRATCH_DOC_INTENT_TYPES: ReadonlySet<string> = new Set<ScratchDocWebviewToHost['type']>([
  'scratch-save',
  'scratch-dirty',
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
  /** Handle one DOCUMENT-channel message from the scratchpad document webview
   * (scratch-save / scratch-dirty — these never arrive on the chat channel). */
  onDocMessage(msg: ScratchDocWebviewToHost): void;
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

  /** Document-channel route (Story 01ac1e4b6a6c9c2f/s1 t4). The document webview's
   * 'scratch-save' is validated (string id/text, finite number gen — anything else is
   * warned + dropped), persisted via store.updateScratch, and answered through
   * panels.replySaved with the SAME gen so the webview's gen-guard accepts it; the
   * browse table and the chat menu list both refresh so the mtime shows the save.
   * 'scratch-dirty' carries no payload to persist — it is accepted (and ignored beyond
   * validation) so a malformed one is still surfaced in the log. */
  const onDocMessage = (msg: ScratchDocWebviewToHost): void => {
    if (msg === null || typeof msg !== 'object' || !SCRATCH_DOC_INTENT_TYPES.has(msg.type)) {
      log.warn('[scratches] dropped malformed document message: unknown type');
      return;
    }
    switch (msg.type) {
      case 'scratch-dirty': {
        if (typeof msg.id !== 'string' || typeof msg.dirty !== 'boolean' || typeof msg.gen !== 'number' || !Number.isFinite(msg.gen)) {
          log.warn('[scratches] dropped malformed scratch-dirty: non-string id, non-boolean dirty or non-number gen');
          return;
        }
        return; // dirty state rides the panel title host-side; nothing to persist
      }
      case 'scratch-save': {
        if (typeof msg.id !== 'string' || typeof msg.text !== 'string' || typeof msg.gen !== 'number' || !Number.isFinite(msg.gen)) {
          log.warn('[scratches] dropped malformed scratch-save: non-string id/text or non-number gen');
          return;
        }
        const gen = Math.floor(msg.gen);
        void (async (): Promise<void> => {
          let ok = true;
          let error: string | undefined;
          try {
            await deps.store.updateScratch(msg.id, msg.text);
          } catch (err) {
            ok = false;
            error = String(err);
            log.warn(`[scratches] save failed for ${msg.id}: ${String(err)}`);
          }
          // Answer through the live-generation guard so a stale page load's save reply
          // is dropped by replySaved instead of reaching a superseded webview.
          deps.panels.replySaved(gen, { type: 'scratch-saved', id: msg.id, gen, ok, ...(error !== undefined ? { error } : {}) });
          // Refresh the browse table and the chat menu list even on failure so the
          // mtime/state stays truthful (a failed save leaves the file unchanged).
          try {
            await deps.panels.refreshBrowse();
          } catch (err) {
            log.warn(`[scratches] browse refresh failed after save: ${String(err)}`);
          }
          void sendScratchList();
        })();
        return;
      }
      default:
        return;
    }
  };

  return { onMessage, onDocMessage };
}
