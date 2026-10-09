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
 * The host also keeps the board's paging (E2 s2): show-more raises one
 * column's page, and a scope, search or attention change resets it. Every
 * derive keeps the new state only when it renders, and items whose stage is
 * not one of the six are logged once per applied refresh.
 *
 * The document is CSP-locked (default-src 'none') with one nonce'd script that
 * renders the status and the board's columns, cards and controls as text
 * (textContent only) and posts only BoardUpMessage envelopes. vscode-free: extension.ts supplies the panel.
 */

import type { ChatPanelChannel, ChatPanelLogger } from '../chat/chat-panel.js';
import { showMore, unknownStages, type BoardPaging } from './board-model.js';
import { parseBoardUpMessage, type BoardScope, type BoardUpMessage } from './board-protocol.js';
import {
  boardDownMessages, initialBoardState, reduceBoardState, shownSnapshot,
  type BoardEvent, type BoardSelection, type BoardState,
} from './board-state.js';
import type { DeliveryClient, DeliveryResult } from './delivery-client.js';
import type { DeliverySnapshot } from './delivery-contract.js';
import { errorText } from './guards.js';
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
 * messages posted are board up-messages: ready, refresh, set-search,
 * set-scope, set-attention, show-more, set-view (the tabs) and select-item
 * (follow links in the issue view).
 */
export const BOARD_WEBVIEW_SCRIPT = [
  `(function(){`,
  `const vs=acquireVsCodeApi();`,
  `const send=function(p){vs.postMessage({v:1,payload:p});};`,
  `const byId=function(id){return document.getElementById(id);};`,
  `const status=byId('status'),notice=byId('notice'),totals=byId('totals'),board=byId('board'),empty=byId('empty');`,
  `const search=byId('search'),scope=byId('scope'),attention=byId('attention');`,
  `const make=function(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.setAttribute('class',cls);return e;};`,
  `const clear=function(n){while(n.firstChild)n.removeChild(n.firstChild);};`,
  `const KIND={story:'Story',issue:'Issue',epic:'Epic',task:'Task'};`,
  `byId('refresh').addEventListener('click',function(){send({type:'refresh'});});`,
  `search.addEventListener('input',function(){send({type:'set-search',search:String(search.value)});});`,
  `attention.addEventListener('change',function(){send({type:'set-attention',on:attention.checked===true});});`,
  `scope.addEventListener('change',function(){const v=String(scope.value);`,
  `send({type:'set-scope',scope:v==='all'?{kind:'all'}:v==='standalone'?{kind:'standalone'}:{kind:'epic',epicItemId:v.slice(5)}});});`,
  // The scope options are rebuilt from each board; the reader's current choice is kept.
  `function renderScope(options){const current=String(scope.value||'all');clear(scope);`,
  `const add=function(value,text){const o=make('option',text);o.value=value;scope.appendChild(o);};`,
  `add('all','All work');add('standalone','Standalone');`,
  `for(const o of options)add('epic:'+o.epicItemId,o.title);`,
  // An epic the reader scoped to that a refresh removed stays selectable, so the reader sees why nothing matches.
  `if(current.indexOf('epic:')===0&&!options.some(function(o){return 'epic:'+o.epicItemId===current;}))add(current,'Epic no longer on the board');`,
  `scope.value=current;}`,
  `function renderCard(c){const li=make('li',undefined,'card');li.setAttribute('data-item-id',c.itemId);li.setAttribute('aria-label',c.accessibleLabel);`,
  `li.appendChild(make('div',KIND[c.kind]+' · '+c.title,'card-title'));`,
  `li.appendChild(make('div',c.standalone?'Standalone':c.epicTitle===null?'':'Epic: '+c.epicTitle,'card-epic'));`,
  `const badges=make('ul',undefined,'badges');`,
  `for(const b of c.badges){const t=make('li',b.label,'badge');t.setAttribute('data-tone',b.tone);t.setAttribute('data-kind',b.kind);badges.appendChild(t);}`,
  `li.appendChild(badges);return li;}`,
  // View tabs: each posts set-view; the shown view's tab is marked pressed.
  `const TABS={board:byId('tab-board'),epics:byId('tab-epics'),issues:byId('tab-issues')};`,
  `for(const v of ['board','epics','issues'])TABS[v].addEventListener('click',function(){send({type:'set-view',view:v});});`,
  `function markTab(view){for(const v of ['board','epics','issues'])TABS[v].setAttribute('aria-pressed',v===view?'true':'false');}`,
  `const EMPTY='Nothing on the board matches the search and filters.';`,
  `const plural=function(n,one,many){return n+' '+(n===1?one:many);};`,
  // A follow link: a button whose text names the item; clicking it posts select-item with the item's id.
  `function linkButton(l){const b=make('button',KIND[l.kind]+' \u00b7 '+l.title+(l.stageLabel===null?'':' \u00b7 '+l.stageLabel),'link');`,
  `b.setAttribute('type','button');b.setAttribute('data-item-id',l.itemId);b.addEventListener('click',function(){send({type:'select-item',itemId:l.itemId});});return b;}`,
  `function renderGroup(g){const sec=make('section',undefined,'epic-group');if(g.epicItemId!==null)sec.setAttribute('data-epic',g.epicItemId);`,
  `sec.appendChild(make('h2',g.title));`,
  `sec.appendChild(make('p',g.completionLabel+(g.issueCount>0?', '+plural(g.issueCount,'issue','issues'):''),'completion'));`,
  `for(const st of g.stages){sec.appendChild(make('h3',st.label+' ('+st.cards.length+')'));`,
  `const ul=make('ul');ul.setAttribute('aria-label',g.title+': '+st.label);for(const c of st.cards)ul.appendChild(renderCard(c));sec.appendChild(ul);}`,
  `return sec;}`,
  `function renderEpics(m){markTab('epics');clear(board);`,
  `totals.textContent=plural(m.totals.items,'item','items')+', '+m.totals.needsAttention+' needing attention';`,
  `for(const g of m.epics)board.appendChild(renderGroup(g));`,
  `if(m.notInEpic.total>0)board.appendChild(renderGroup(m.notInEpic));`,
  `empty.textContent=m.emptySelection?EMPTY:'';}`,
  `function renderIssue(e){const sec=make('section',undefined,'issue');sec.setAttribute('data-item-id',e.card.itemId);`,
  `const cards=make('ul');cards.appendChild(renderCard(e.card));sec.appendChild(cards);`,
  `sec.appendChild(make('p','Stage: '+e.stageLabel,'issue-stage'));`,
  `if(e.parent!==null){const p=make('p','Corrects: ','parent');p.appendChild(linkButton(e.parent));sec.appendChild(p);}`,
  `else if(e.parentNotice!==null)sec.appendChild(make('p',e.parentNotice,'parent-notice'));`,
  `sec.appendChild(make('h3','Fix stories'));`,
  `if(e.fixStories.length===0)sec.appendChild(make('p','No fix stories yet','no-fix'));`,
  `else{const ul=make('ul');ul.setAttribute('aria-label','Fix stories');for(const f of e.fixStories){const li=make('li');li.appendChild(linkButton(f));ul.appendChild(li);}sec.appendChild(ul);}`,
  `return sec;}`,
  `function renderIssues(m){markTab('issues');clear(board);`,
  `totals.textContent=plural(m.totals.issues,'issue','issues')+', '+m.totals.needsAttention+' needing attention';`,
  `for(const e of m.issues)board.appendChild(renderIssue(e));`,
  `empty.textContent=m.emptySelection?EMPTY:'';}`,
  `function renderBoard(m){markTab('board');renderScope(m.scopeOptions);clear(board);`,
  `totals.textContent=m.totals.items+' item'+(m.totals.items===1?'':'s')+', '+m.totals.needsAttention+' needing attention';`,
  `for(const col of m.columns){const sec=make('section',undefined,'column');sec.setAttribute('data-stage',col.stage);`,
  `sec.appendChild(make('h2',col.label+' ('+col.total+')'));`,
  `const ul=make('ul');ul.setAttribute('aria-label',col.label);for(const c of col.cards)ul.appendChild(renderCard(c));sec.appendChild(ul);`,
  `if(col.hiddenCount>0){const more=make('button','Show '+col.hiddenCount+' more');more.setAttribute('type','button');`,
  `more.addEventListener('click',function(){send({type:'show-more',stage:col.stage});});sec.appendChild(more);}`,
  `board.appendChild(sec);}`,
  `empty.textContent=m.emptySelection?EMPTY:'';}`,
  `window.addEventListener('message',function(e){`,
  `const m=e.data;if(!m||m.v!==1||!m.payload)return;const p=m.payload;`,
  `if(p.type==='status'){const s=p.status;`,
  `const parts=[];if(s.message)parts.push(s.message);else parts.push(s.state==='ready'?'Up to date.':s.state);`,
  `if(s.takenAt)parts.push('Snapshot taken at '+s.takenAt+(s.stale?' (stale).':'.'));`,
  `status.textContent=parts.join(' ');status.setAttribute('data-state',s.state);`,
  `notice.textContent=s.partialNotice||'';return;}`,
  `if(p.type==='board'){renderBoard(p.model);return;}`,
  `if(p.type==='epics'){renderEpics(p.model);return;}`,
  `if(p.type==='issues'){renderIssues(p.model);return;}`,
  `});`,
  `send({type:'ready'});`,
  `})();`,
].join('');

export function renderBoardDocument(nonce: string): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">` +
    `<title>${BOARD_TITLE}</title></head><body>` +
    `<header><h1>${BOARD_TITLE}</h1><button id="refresh" type="button">Refresh</button></header>` +
    `<p id="status" role="status" aria-live="polite"></p>` +
    `<p id="notice"></p>` +
    `<nav class="tabs" aria-label="Views">` +
    `<button id="tab-board" type="button" aria-pressed="true">Board</button>` +
    `<button id="tab-epics" type="button" aria-pressed="false">Epics</button>` +
    `<button id="tab-issues" type="button" aria-pressed="false">Issues</button>` +
    `</nav>` +
    `<div class="controls">` +
    `<input id="search" type="search" aria-label="Search work items" placeholder="Search">` +
    `<select id="scope" aria-label="Scope"><option value="all">All work</option></select>` +
    `<label><input id="attention" type="checkbox"> Needs attention</label>` +
    `</div>` +
    `<p id="totals"></p>` +
    `<p id="empty"></p>` +
    `<div id="board" class="board"></div>` +
    `<script nonce="${attr(nonce)}">${BOARD_WEBVIEW_SCRIPT}</script></body></html>`
  );
}

export function createDeliveryBoardHost(deps: DeliveryBoardHostDeps): DeliveryBoardHost {
  let channel: ChatPanelChannel | undefined;
  let state: BoardState = initialBoardState();
  /** The visible card limit per column; reset by a scope, search or attention change, kept across refreshes. */
  let paging: BoardPaging = {};
  let nextSeq = 0;
  /** Bumped on every dispose; an answer from an earlier panel generation is discarded. */
  let generation = 0;

  /**
   * Derive the messages first; the new state and paging are kept only when they render, so a bad snapshot or
   * selection never becomes the board's. A throw leaves both as they were and posts nothing.
   */
  function apply(next: BoardState, nextPaging: BoardPaging): void {
    const messages = boardDownMessages(next, DISPLAY_LABELS, nextPaging);
    state = next;
    paging = nextPaging;
    for (const m of messages) channel?.postMessage(m);
  }

  function dispatch(event: BoardEvent, nextPaging: BoardPaging = paging): void {
    apply(reduceBoardState(state, event), nextPaging);
  }

  function elapsedMs(since: string): number {
    const ms = Date.parse(deps.now()) - Date.parse(since);
    return Number.isFinite(ms) ? Math.max(0, ms) : 0;
  }

  async function refresh(): Promise<void> {
    const gen = generation;
    const seq = ++nextSeq;
    const started = deps.now();
    try {
      dispatch({ type: 'refresh-requested', seq });
    } catch (err) {
      // The loading state could not be shown; state is unchanged, so no request is made for it.
      deps.logger.error(`delivery board: refresh ${seq} could not start: ${errorText(err)}`);
      return;
    }
    // The client resolves every failure to a typed result; a throw is turned into one so the board never stays on 'loading'.
    let result: DeliveryResult<DeliverySnapshot>;
    try {
      result = await deps.client.snapshot();
    } catch (err) {
      result = { ok: false, failure: { kind: 'read-failed', message: errorText(err) } };
    }
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
    let applied = false;
    try {
      dispatch({ type: 'snapshot-arrived', seq, result, at });
      applied = true;
    } catch (err) {
      // A snapshot that slipped past the client's checks but cannot be rendered: state still holds the previous
      // board, so this shows a failed refresh over it rather than a frozen board.
      const message = errorText(err);
      deps.logger.error(`delivery board: refresh ${seq} could not be applied: ${message}`);
      try {
        dispatch({ type: 'snapshot-arrived', seq, result: { ok: false, failure: { kind: 'read-failed', message } }, at });
      } catch (again) {
        // Last resort: the board keeps whatever it last posted.
        deps.logger.error(`delivery board: refresh ${seq} failure could not be shown: ${errorText(again)}`);
      }
    }
    // Outside the try: a failure to log must never turn a board that rendered into a failed refresh.
    if (applied && result.ok) {
      try {
        logUnknownStages(seq, result.value);
      } catch (err) {
        deps.logger.error(`delivery board: refresh ${seq} unknown stages could not be listed: ${errorText(err)}`);
      }
    }
  }

  /** Once per applied refresh: the items left off the board because their stage is not one of the six. */
  function logUnknownStages(seq: number, snapshot: DeliverySnapshot): void {
    const unknown = unknownStages(snapshot);
    if (unknown.size === 0) return;
    const named = [...unknown].map(([stage, n]) => `${stage} (${n})`).join(', ');
    deps.logger.warn(`delivery board: refresh ${seq} left items with unknown stages off the board: ${named}`);
  }

  /** An epic scope must name an epic in the shown snapshot. */
  function knownScope(scope: BoardScope): boolean {
    if (scope.kind !== 'epic') return true;
    const shown = shownSnapshot(state.status);
    return shown !== null && shown.snapshot.items.some(i => i.kind === 'epic' && i.id === scope.epicItemId);
  }

  /** A followed link must name an item in the shown snapshot. */
  function onBoard(itemId: string): boolean {
    const shown = shownSnapshot(state.status);
    return shown !== null && shown.snapshot.items.some(i => i.id === itemId);
  }

  function select(selection: BoardSelection, nextPaging: BoardPaging = paging): void {
    dispatch({ type: 'selection-changed', selection }, nextPaging);
  }

  function handle(msg: BoardUpMessage): void {
    const sel = state.selection;
    switch (msg.type) {
      case 'ready': apply(state, paging); return;
      case 'refresh': void refresh(); return;
      case 'set-view': select({ ...sel, view: msg.view }); return;
      case 'set-scope':
        if (!knownScope(msg.scope)) {
          deps.logger.warn('delivery board: ignored a scope naming an epic that is not on the board');
          return;
        }
        select({ ...sel, scope: msg.scope }, {});
        return;
      case 'set-search': select({ ...sel, search: msg.search }, {}); return;
      case 'set-attention': select({ ...sel, needsAttentionOnly: msg.on }, {}); return;
      case 'select-item':
        if (!onBoard(msg.itemId)) {
          deps.logger.warn('delivery board: ignored a link to an item that is not on the board');
          return;
        }
        select({ ...sel, selectedItemId: msg.itemId });
        return;
      case 'close-details': select({ ...sel, selectedItemId: null }); return;
      case 'set-density': select({ ...sel, density: msg.density }); return;
      case 'show-more': apply(state, showMore(paging, msg.stage)); return;
      case 'open-evidence': return;   // opening evidence is s4's
    }
  }

  function reset(): void {
    generation++;
    channel = undefined;
    state = initialBoardState();
    paging = {};
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
        try {
          handle(msg);
        } catch (err) {
          // apply() keeps state and paging only when they render, so the board stays as it was.
          deps.logger.error(`delivery board: ${msg.type} could not be shown: ${errorText(err)}`);
        }
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
