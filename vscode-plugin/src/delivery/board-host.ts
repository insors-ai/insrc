/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivery board's host (E2 s1): one editor-tab webview panel over the
 * board state.
 *
 * The host owns the panel channel and the board state. Every refresh stamps the
 * next request number, asks the delivery client for a snapshot and dispatches
 * the answer to reduceBoardState; after every dispatch it posts the
 * down-messages derived from the new state. A superseded answer is logged
 * through warn(), a failed or timed-out one through error(). Once the panel is
 * disposed an outstanding answer is discarded without being dispatched, posted
 * or logged, and the next open() starts a new panel with a fresh state.
 *
 * The document is CSP-locked (default-src 'none') with one nonce'd script that
 * renders the status and the s1 item list as text (textContent only) and posts
 * only BoardUpMessage envelopes. vscode-free: extension.ts supplies the panel.
 */

import type { ChatPanelChannel, ChatPanelLogger } from '../chat/chat-panel.js';
import { parseBoardUpMessage, type BoardUpMessage } from './board-protocol.js';
import { boardDownMessages, initialBoardState, reduceBoardState, type BoardEvent, type BoardState } from './board-state.js';
import type { DeliveryClient, DeliveryResult } from './delivery-client.js';
import type { DeliverySnapshot } from './delivery-contract.js';
import { DISPLAY_LABELS } from './labels.js';

export const BOARD_VIEW_TYPE = 'insrc.deliveryBoard';
export const BOARD_TITLE = 'Delivery board';

export interface DeliveryBoardHostDeps {
  readonly createPanel: (opts: { readonly viewType: string; readonly title: string }) => ChatPanelChannel;
  readonly client: DeliveryClient;
  readonly logger: ChatPanelLogger;
  /** ISO-8601 time; stamps failures and measures elapsed time. */
  readonly now: () => string;
  readonly genNonce: () => string;
}

export interface DeliveryBoardHost {
  open(): void;
  dispose(): void;
}

/** Escape a value for an HTML attribute (the CSP meta content). */
function attr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The webview script. Everything shown is set with textContent, and the only
 * messages posted are the 'ready' and 'refresh' board up-messages.
 */
export const BOARD_WEBVIEW_SCRIPT =
  `(function(){` +
  `const vs=acquireVsCodeApi();` +
  `const send=function(p){vs.postMessage({v:1,payload:p});};` +
  `const status=document.getElementById('status');` +
  `const notice=document.getElementById('notice');` +
  `const list=document.getElementById('items');` +
  `document.getElementById('refresh').addEventListener('click',function(){send({type:'refresh'});});` +
  `window.addEventListener('message',function(e){` +
  `const m=e.data;if(!m||m.v!==1||!m.payload)return;const p=m.payload;` +
  `if(p.type==='status'){const s=p.status;` +
  `const parts=[];if(s.message)parts.push(s.message);else parts.push(s.state==='ready'?'Up to date.':s.state);` +
  `if(s.takenAt)parts.push('Snapshot taken at '+s.takenAt+(s.stale?' (stale).':'.'));` +
  `status.textContent=parts.join(' ');status.setAttribute('data-state',s.state);` +
  `notice.textContent=s.partialNotice||'';return;}` +
  `if(p.type==='items'){while(list.firstChild)list.removeChild(list.firstChild);` +
  `for(const it of p.items){const li=document.createElement('li');` +
  `li.textContent=it.kind+' \\u00b7 '+(it.title===null?it.itemId:it.title)+(it.stageLabel===null?'':' \\u00b7 '+it.stageLabel);` +
  `li.setAttribute('data-item-id',it.itemId);list.appendChild(li);}return;}` +
  `});` +
  `send({type:'ready'});` +
  `})();`;

export function renderBoardDocument(nonce: string): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">` +
    `<title>${BOARD_TITLE}</title></head><body>` +
    `<header><h1>${BOARD_TITLE}</h1><button id="refresh" type="button">Refresh</button></header>` +
    `<p id="status" role="status" aria-live="polite"></p>` +
    `<p id="notice"></p>` +
    `<ul id="items" aria-label="Work items"></ul>` +
    `<script nonce="${attr(nonce)}">${BOARD_WEBVIEW_SCRIPT}</script></body></html>`
  );
}

export function createDeliveryBoardHost(deps: DeliveryBoardHostDeps): DeliveryBoardHost {
  let channel: ChatPanelChannel | undefined;
  let state: BoardState = initialBoardState();
  let nextSeq = 0;
  /** Bumped on every dispose; an answer from an earlier panel generation is discarded. */
  let generation = 0;

  function post(): void {
    for (const m of boardDownMessages(state, DISPLAY_LABELS)) channel?.postMessage(m);
  }

  function dispatch(event: BoardEvent): void {
    state = reduceBoardState(state, event);
    post();
  }

  function elapsedMs(since: string): number {
    return Math.max(0, Date.parse(deps.now()) - Date.parse(since));
  }

  async function refresh(): Promise<void> {
    const gen = generation;
    const seq = ++nextSeq;
    const started = deps.now();
    dispatch({ type: 'refresh-requested', seq });
    // The client resolves every failure to a typed result; a throw is turned into one so the board never stays on 'loading'.
    const result: DeliveryResult<DeliverySnapshot> = await deps.client.snapshot().catch((err: unknown) => ({
      ok: false as const,
      failure: { kind: 'read-failed' as const, message: err instanceof Error ? err.message : String(err) },
    }));
    if (gen !== generation || channel === undefined) return;   // the panel was closed meanwhile
    const at = deps.now();
    if (seq !== state.latestSeq) {
      const n = result.ok ? result.value.items.length : 0;
      const answer = result.ok ? `${n} item${n === 1 ? '' : 's'}` : result.failure.kind;
      deps.logger.warn(`delivery board: dropped the answer to refresh ${seq} (${answer}); refresh ${state.latestSeq} is newer (${elapsedMs(started)} ms)`);
      return;
    }
    if (!result.ok) {
      deps.logger.error(`delivery board: refresh ${seq} ${result.failure.kind} after ${elapsedMs(started)} ms: ${result.failure.message}`);
    }
    try {
      dispatch({ type: 'snapshot-arrived', seq, result, at });
    } catch (err) {
      // A malformed snapshot that slipped past the client: show it as a failed refresh rather than a frozen board.
      const message = err instanceof Error ? err.message : String(err);
      deps.logger.error(`delivery board: refresh ${seq} could not be applied: ${message}`);
      dispatch({ type: 'snapshot-arrived', seq, result: { ok: false, failure: { kind: 'read-failed', message } }, at });
    }
  }

  function handle(msg: BoardUpMessage): void {
    const sel = state.selection;
    switch (msg.type) {
      case 'ready': post(); return;
      case 'refresh': void refresh(); return;
      case 'set-view': dispatch({ type: 'selection-changed', selection: { ...sel, view: msg.view } }); return;
      case 'set-scope': dispatch({ type: 'selection-changed', selection: { ...sel, scope: msg.scope } }); return;
      case 'set-search': dispatch({ type: 'selection-changed', selection: { ...sel, search: msg.search } }); return;
      case 'set-attention': dispatch({ type: 'selection-changed', selection: { ...sel, needsAttentionOnly: msg.on } }); return;
      case 'select-item': dispatch({ type: 'selection-changed', selection: { ...sel, selectedItemId: msg.itemId } }); return;
      case 'close-details': dispatch({ type: 'selection-changed', selection: { ...sel, selectedItemId: null } }); return;
      case 'set-density': dispatch({ type: 'selection-changed', selection: { ...sel, density: msg.density } }); return;
      case 'open-evidence': return;   // opening evidence is s4's
    }
  }

  function reset(): void {
    generation++;
    channel = undefined;
    state = initialBoardState();
    nextSeq = 0;
  }

  return {
    open(): void {
      if (channel !== undefined) {
        channel.reveal();
        void refresh();
        return;
      }
      const opened = deps.createPanel({ viewType: BOARD_VIEW_TYPE, title: BOARD_TITLE });
      channel = opened;
      opened.onDidDispose(() => { if (channel === opened) reset(); });
      opened.onMessage(raw => {
        const msg = parseBoardUpMessage(raw);
        if (msg === null) {
          deps.logger.warn('delivery board: ignored a malformed webview message');
          return;
        }
        handle(msg);
      });
      opened.setHtml(renderBoardDocument(deps.genNonce()));
      void refresh();
    },
    dispose(): void {
      const open = channel;
      reset();
      open?.dispose();
    },
  };
}
