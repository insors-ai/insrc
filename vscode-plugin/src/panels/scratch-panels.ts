/**
 * Story E202611134642d49a:S001 / t5+t6 — the scratchpad panels controller.
 *
 * A vscode-free controller wrapping the injected PanelFactory with its own
 * create-or-reveal singleton cache per viewType (mirroring openSingleton in
 * webview-host.ts). Two viewTypes:
 *
 *  - `insrc.scratchpads` — the browse-all tabular editor pane: columns Name and
 *    Modified, per-row icon-only Open/Delete buttons (title hover text, data-id)
 *    posting scratch-open {id} / scratch-delete {id}, an empty hint row and an
 *    error row. Table data comes from an UNBOUNDED listScratches().
 *  - `insrc.scratchpad`  — the single-document view: content rendered via
 *    textContent only (CSP-safe), a floating icon-only "Send to chat" button on
 *    selectionchange posting send-to-chat {text}, and the generation/epoch
 *    guards below.
 *
 * Both render through the shared CSP+nonce shell from panels/shell.ts. The
 * controller's handle adds `setTitle` (an injected op with a production adapter
 * to the underlying WebviewPanel title — the stock PanelHandle has none).
 *
 * Generation/epoch contract (t6, FIRST-CLASS):
 *  - opening B while A is displayed calls setTitle(B) + setHtml on the SAME
 *    cached panel and bumps the per-open generation counter, so a late-resolving
 *    read of A is dropped;
 *  - deleteScratch(id) bumps that id's epoch (invalidateId), invalidating every
 *    pending open of it; ScratchNotFound closes the panel only if it currently
 *    displays that failing id, a stale ScratchNotFound for another id is ignored;
 *  - dispose invalidates the generation check.
 */

import { shellHtml } from './shell.js';
import type { PanelFactory, PanelHandle } from './types.js';
import { ScratchNotFound, type ScratchEntry, type ScratchStore } from '../chat/scratch-store.js';

/** The browse-all view type (tabular editor pane). */
export const SCRATCHPADS_VIEW_TYPE = 'insrc.scratchpads';
/** The single-document view type. */
export const SCRATCHPAD_VIEW_TYPE = 'insrc.scratchpad';

/** The controller's handle: the stock PanelHandle plus setTitle. */
export interface ScratchPanelHandle extends PanelHandle {
  setTitle(title: string): void;
}

export interface ScratchPanelsDeps {
  readonly panels: PanelFactory;
  readonly store: ScratchStore;
  readonly logger?: { warn(msg: string): void } | undefined;
  readonly genNonce?: () => string | undefined;
  /** Production adapter: set the underlying WebviewPanel's title. Injected. */
  readonly setPanelTitle?: ((panel: PanelHandle, title: string) => void) | undefined;
  /** Route a document view's send-to-chat text to the chat panel (extension host). */
  readonly onSendToChat?: ((text: string) => void) | undefined;
}

export interface ScratchPanels {
  /** Browse-all: an UNBOUNDED list rendered as a table; create-or-reveal singleton. */
  openBrowse(): Promise<ScratchPanelHandle | undefined>;
  /** Document view: open (or switch to) scratchpad `id`; create-or-reveal singleton. */
  openDocument(id: string): Promise<ScratchPanelHandle | undefined>;
  /** Re-render the browse table if it is open (e.g. after a create/delete). */
  refreshBrowse(): Promise<void>;
  /** Close the document panel if it currently displays `id`. */
  closeDocumentIfShowing(id: string): void;
  /** Invalidate every pending open of `id` (called after deleteScratch). */
  invalidateId(id: string): void;
  /** The id the document singleton currently displays (undefined when closed). */
  readonly showingId: string | undefined;
  dispose(): void;
}

const escapeAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmtDate = (mtime: number): string => {
  const d = new Date(mtime);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const OPEN_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M4 1.5h6l3 3V14a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M10 1.5V5h3.5"/></svg>';
const DELETE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M3 4h10M6.5 4V2.8A.8.8 0 0 1 7.3 2h1.4a.8.8 0 0 1 .8.8V4M5 4l.6 9.2A.8.8 0 0 0 6.4 14h3.2a.8.8 0 0 0 .8-.8L11 4"/></svg>';
const SEND_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M14 2 7 9M14 2 9.5 14l-2.5-5L2 6.5 14 2Z"/></svg>';

export const SEND_TO_CHAT_CAP = 65_536;
const ELLIPSIS = '…';

/**
 * Multibyte-safe UTF-8 cap for send-to-chat text: the FINAL string, trailing
 * ellipsis included, stays within SEND_TO_CHAT_CAP bytes. A multibyte char
 * straddling the cut is dropped whole.
 */
export function capUtf8(s: string, cap: number = SEND_TO_CHAT_CAP): string {
  const bytes = Buffer.byteLength(s, 'utf8');
  if (bytes <= cap) return s;
  const ellipsisBytes = Buffer.byteLength(ELLIPSIS, 'utf8');
  let budget = cap - ellipsisBytes;
  let out = '';
  for (const ch of s) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (b > budget) break;
    out += ch;
    budget -= b;
  }
  return out + ELLIPSIS;
}

/** The browse table body (content only — the shell wraps it). */
export function browseHtml(entries: readonly ScratchEntry[], error?: string): string {
  const head = `<table class="scratch-table"><thead><tr><th>Name</th><th>Modified</th><th></th></tr></thead><tbody>`;
  const tail = `</tbody></table>`;
  if (error !== undefined) {
    return head + `<tr class="scratch-error-row"><td colspan="3" class="error" role="alert">${escapeAttr(error)}</td></tr>` + tail;
  }
  if (entries.length === 0) {
    return head + `<tr class="scratch-empty-row"><td colspan="3" class="placeholder">No scratchpads yet — create one from the chat panel's scratchpad menu.</td></tr>` + tail;
  }
  const rows = entries.map((e) => {
    const name = escapeAttr(e.name);
    return `<tr data-id="${escapeAttr(e.id)}">` +
      `<td class="scratch-name">${name}</td>` +
      `<td class="scratch-mtime">${escapeAttr(fmtDate(e.mtime))}</td>` +
      `<td class="scratch-actions">` +
      `<button type="button" class="scratch-open" data-id="${escapeAttr(e.id)}" title="open" aria-label="open ${name}">${OPEN_ICON}</button>` +
      `<button type="button" class="scratch-delete" data-id="${escapeAttr(e.id)}" title="delete" aria-label="delete ${name}">${DELETE_ICON}</button>` +
      `</td></tr>`;
  }).join('');
  return head + rows + tail;
}

const BROWSE_STYLE =
  `.scratch-table{border-collapse:collapse;width:100%;}` +
  `.scratch-table th,.scratch-table td{padding:6px 10px;border-bottom:1px solid var(--vscode-panel-border,#666);text-align:left;}` +
  `.scratch-table thead th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.75;}` +
  `.scratch-actions{white-space:nowrap;text-align:right;}` +
  `.scratch-open,.scratch-delete{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;margin-left:4px;background:transparent;border:1px solid transparent;border-radius:4px;color:var(--vscode-descriptionForeground,#aaa);cursor:pointer;}` +
  `.scratch-open:hover,.scratch-delete:hover,.scratch-open:focus-visible,.scratch-delete:focus-visible{color:var(--vscode-textLink-foreground,#08f);border-color:var(--vscode-panel-border,#666);outline:none;}` +
  `.scratch-open svg,.scratch-delete svg{width:14px;height:14px;}`;

const browseBootstrap = (): string =>
  `const vs=acquireVsCodeApi();` +
  `document.querySelectorAll('.scratch-open').forEach(function(b){b.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'scratch-open',id:b.getAttribute('data-id')||''}});});});` +
  `document.querySelectorAll('.scratch-delete').forEach(function(b){b.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'scratch-delete',id:b.getAttribute('data-id')||''}});});});`;

/** The document view's static body. Content arrives via a host push and is set with textContent only. */
export function documentBodyHtml(): string {
  return `<div class="scratch-doc-wrap">` +
    `<pre id="insrc-scratchdoc" class="scratch-doc"></pre>` +
    `<button type="button" id="insrc-sendtochat" class="scratch-send" title="Send to chat" aria-label="Send to chat" hidden>${SEND_ICON}</button>` +
    `</div>`;
}

const DOC_STYLE =
  `.scratch-doc-wrap{position:relative;}` +
  `.scratch-doc{white-space:pre-wrap;word-break:break-word;font-family:var(--vscode-editor-font-family,monospace);}` +
  `.scratch-send{position:fixed;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);border:none;border-radius:6px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);}` +
  `.scratch-send[hidden]{display:none;}` +
  `.scratch-send svg{width:15px;height:15px;}`;

/** The document view's nonce'd bootstrap: selectionchange latches the text, the button posts it. */
export function documentBootstrap(): string {
  return `const vs=acquireVsCodeApi();` +
    `const doc=document.getElementById('insrc-scratchdoc');` +
    `const sendBtn=document.getElementById('insrc-sendtochat');` +
    // Webview-ready handshake: the host replays any content posted before the bootstrap
    // installed its listener, so an early read completion can never be lost.
    `var pending=null;` +
    `window.addEventListener('message',function(e){var m=e.data&&e.data.payload;if(!m)return;` +
    `if(m.type==='scratch-content'&&typeof m.text==='string'){if(doc)doc.textContent=m.text;else pending=m.text;}});` +
    `vs.postMessage({v:1,payload:{type:'scratch-ready'}});` +
    // The captured selection text, latched at selectionchange so a later focus (the
    // button click) or selectionchange cannot lose it before the click handler reads it.
    `var captured='';` +
    `document.addEventListener('selectionchange',function(){` +
    `var s=window.getSelection?window.getSelection():null;` +
    `var t=s&&s.toString?s.toString():'';` +
    `if(t!==''){captured=t;if(sendBtn){sendBtn.hidden=false;` +
    // Anchor the floating button at the selection's caret rect (viewport-relative,
    // matching position:fixed — no scroll offsets).
    `var r=s.getRangeAt?s.getRangeAt(0).getBoundingClientRect():null;` +
    `if(r){sendBtn.style.left=Math.max(4,Math.floor(r.right-28))+'px';sendBtn.style.top=Math.max(4,Math.floor(r.bottom+6))+'px';}` +
    `}}` +
    // A collapsed selection hides the button but does NOT clear the latch — the click
    // reads `captured`, so the text is never lost. The button stays visible while it
    // itself holds focus (the click in flight); otherwise it hides.
    `else if(s&&s.isCollapsed){if(sendBtn&&!(sendBtn.contains&&sendBtn.contains(document.activeElement))&&document.activeElement!==sendBtn)sendBtn.hidden=true;}` +
    `});` +
    `if(sendBtn)sendBtn.addEventListener('click',function(){` +
    // Webview-side cap, same rule as the host-side capUtf8: the posted string, ellipsis
    // included, stays within 65,536 UTF-8 bytes. Iterate with codePointAt so a 4-byte
    // char (surrogate pair) is charged and emitted as ONE unit — never split.
    `var out=captured;` +
    `var cb=0;for(var ci=0;ci<captured.length;){var cp=captured.codePointAt(ci);cb+=cp<0x80?1:cp<0x800?2:cp<0x10000?3:4;ci+=cp>0xFFFF?2:1;}` +
    `if(cb>65536){var budget=65533;out='';for(var cj=0;cj<captured.length;){var cp2=captured.codePointAt(cj);var b=cp2<0x80?1:cp2<0x800?2:cp2<0x10000?3:4;if(b>budget)break;out+=String.fromCodePoint(cp2);budget-=b;cj+=cp2>0xFFFF?2:1;}out+='\\u2026';}` +
    `if(out!=='')vs.postMessage({v:1,payload:{type:'send-to-chat',text:out}});` +
    `captured='';sendBtn.hidden=true;` +
    `});` +
    // If content arrived before the doc element was reachable, apply the replay now.
    `if(pending!==null&&doc){doc.textContent=pending;pending=null;}`;
}

export function createScratchPanels(deps: ScratchPanelsDeps): ScratchPanels {
  const log = deps.logger ?? { warn: () => {} };
  const nonce = (): string => deps.genNonce?.() ?? 'scratch';
  const sendToChat = deps.onSendToChat ?? (() => {});
  let browseHandle: ScratchPanelHandle | undefined;
  let docHandle: ScratchPanelHandle | undefined;
  let docGeneration = 0;
  let showingId: string | undefined;
  /** Per-id epoch: bumped on delete; a pending open of a stale epoch is dropped. */
  const epochs = new Map<string, number>();
  /** Generations whose webview already signalled scratch-ready. */
  const readyGenerations = new Set<number>();
  /** Content read before the webview was ready, keyed by generation, replayed on scratch-ready. */
  const pendingContent = new Map<number, { id: string; content: string }>();
  let disposed = false;

  const wrap = (panel: PanelHandle): ScratchPanelHandle => ({
    setHtml: (h) => panel.setHtml(h),
    reveal: () => panel.reveal(),
    onDidDispose: (l) => panel.onDidDispose(l),
    onMessage: (l) => panel.onMessage(l),
    postMessage: (m) => panel.postMessage(m),
    dispose: () => panel.dispose(),
    setTitle: (title) => (deps.setPanelTitle ?? (() => {}))(panel, title),
  });

  /** Create-or-reveal singleton for a viewType; creation failure -> undefined + warn, next click retries. */
  const openSingleton = (
    viewType: string,
    title: string,
    onDispose: () => void,
    onCreate: (panel: ScratchPanelHandle) => void,
    getCurrent: () => ScratchPanelHandle | undefined,
    setCurrent: (p: ScratchPanelHandle) => void,
  ): ScratchPanelHandle | undefined => {
    if (disposed) return undefined;
    try {
      const current = getCurrent();
      if (current !== undefined) {
        current.reveal();
        return current;
      }
      const panel = wrap(deps.panels({ viewType, title }));
      panel.onDidDispose(onDispose);
      onCreate(panel);
      panel.reveal();
      setCurrent(panel);
      return panel;
    } catch (err) {
      log.warn(`insrc: could not open the ${title} panel — ${String(err)}`);
      return undefined;
    }
  };

  const renderBrowse = async (handle: ScratchPanelHandle): Promise<void> => {
    let entries: readonly ScratchEntry[] = [];
    let error: string | undefined;
    try {
      entries = await deps.store.listScratches(); // UNBOUNDED — browse-all never uses the capped menu list
    } catch (err) {
      error = `scratchpads unavailable: ${String(err)}`;
    }
    try {
      handle.setHtml(shellHtml('insrc scratchpads', browseHtml(entries, error) + `<style>${BROWSE_STYLE}</style>`, nonce(), browseBootstrap()));
    } catch (err) {
      log.warn(`insrc: could not render the scratchpads panel — ${String(err)}`);
    }
  };

  const deleteAndRefresh = async (id: string): Promise<void> => {
    invalidateId(id);
    try {
      await deps.store.deleteScratch(id);
    } catch (err) {
      log.warn(`[scratches] delete failed for ${id}: ${String(err)}`);
    }
    closeDocumentIfShowing(id);
    if (browseHandle !== undefined) await renderBrowse(browseHandle);
  };

  const invalidateId = (id: string): void => {
    epochs.set(id, (epochs.get(id) ?? 0) + 1);
  };

  const closeDocumentIfShowing = (id: string): void => {
    if (docHandle !== undefined && showingId === id) {
      try { docHandle.dispose(); } catch { /* best-effort */ }
      docHandle = undefined;
      showingId = undefined;
      docGeneration++;
    }
  };

  const openBrowse = async (): Promise<ScratchPanelHandle | undefined> => {
    const handle = openSingleton(
      SCRATCHPADS_VIEW_TYPE,
      'insrc scratchpads',
      () => { browseHandle = undefined; },
      (panel) => {
        panel.onMessage((m) => {
          const env = m as { v?: unknown; payload?: unknown } | null;
          if (env === null || env.v !== 1 || typeof env.payload !== 'object' || env.payload === null) return;
          const msg = env.payload as { type?: unknown; id?: unknown };
          if (msg.type === 'scratch-open' && typeof msg.id === 'string') void openDocument(msg.id);
          else if (msg.type === 'scratch-delete' && typeof msg.id === 'string') void deleteAndRefresh(msg.id);
        });
      },
      () => browseHandle,
      (p) => { browseHandle = p; },
    );
    if (handle === undefined) return undefined;
    await renderBrowse(handle);
    return handle;
  };

  const openDocument = async (id: string): Promise<ScratchPanelHandle | undefined> => {
    const generation = ++docGeneration;
    // Retire the previous generation's bookkeeping: this open's setHtml replaces the
    // old webview (or the panel was disposed/closed, which also bumps the counter),
    // so a stored replay copy for it can never be consumed — drop it so neither map
    // grows without bound across opens.
    if (generation > 1) {
      readyGenerations.delete(generation - 1);
      pendingContent.delete(generation - 1);
    }
    const epoch = epochs.get(id) ?? 0;
    const handle = openSingleton(
      SCRATCHPAD_VIEW_TYPE,
      id,
      () => { docHandle = undefined; showingId = undefined; docGeneration++; },
      (panel) => {
        panel.onMessage((m) => {
          const env = m as { v?: unknown; payload?: unknown } | null;
          if (env === null || env.v !== 1 || typeof env.payload !== 'object' || env.payload === null) return;
          const msg = env.payload as { type?: unknown; text?: unknown };
          if (msg.type === 'send-to-chat' && typeof msg.text === 'string') sendToChat(capUtf8(msg.text));
          else if (msg.type === 'scratch-ready') {
            // The webview finished installing its listeners: replay the current
            // generation's content so a read that completed before readiness is not lost.
            // The ready flag STAYS for this generation (retired when the next open bumps
            // the counter) so a read completing AFTER ready is not retained either —
            // only a not-yet-ready generation may hold a replay copy.
            readyGenerations.add(docGeneration);
            const pending = pendingContent.get(docGeneration);
            if (pending !== undefined && !disposed && showingId === pending.id) {
              pendingContent.delete(docGeneration);
              try { docHandle?.postMessage({ v: 1, payload: { type: 'scratch-content', text: pending.content } }); } catch { /* best-effort */ }
            }
          }
        });
      },
      () => docHandle,
      (p) => { docHandle = p; },
    );
    if (handle === undefined) return undefined;
    // FIRST-CLASS A->B switch: setTitle(id) + setHtml on the SAME cached panel instance.
    // showingId is claimed only once the handle exists — a failed creation of a new panel
    // must not clobber the id another open is displaying.
    showingId = id;
    try {
      handle.setTitle(id);
    } catch (err) {
      log.warn(`insrc: could not set the scratchpad panel title — ${String(err)}`);
    }
    try {
      handle.setHtml(shellHtml(id, documentBodyHtml() + `<style>${DOC_STYLE}</style>`, nonce(), documentBootstrap()));
    } catch (err) {
      log.warn(`insrc: could not render the scratchpad document — ${String(err)}`);
      return handle;
    }
    try {
      const { content } = await deps.store.readScratch(id);
      // Generation guard: a late read of A is dropped when B was opened meanwhile; a stale
      // epoch (the id was deleted) drops it too; dispose bumps the generation as well.
      if (disposed || docGeneration !== generation || (epochs.get(id) ?? 0) !== epoch || showingId !== id) return handle;
      // Replay-safe: post immediately, and hold a replay copy keyed by generation ONLY
      // while the webview has not yet signalled scratch-ready for this generation (the
      // handshake fires after setHtml installs listeners, so it can recover content
      // posted before it was listening). Once the generation is ready the content is
      // already delivered — retaining it would leak, since no later scratch-ready can
      // consume it.
      if (!readyGenerations.has(generation)) pendingContent.set(generation, { id, content });
      handle.postMessage({ v: 1, payload: { type: 'scratch-content', text: content } });
    } catch (err) {
      if (err instanceof ScratchNotFound) {
        // Close the panel only if it currently displays that failing id; a stale
        // ScratchNotFound for another id is ignored.
        if (!disposed && docGeneration === generation && showingId === id) {
          try { docHandle?.dispose(); } catch { /* best-effort */ }
          if (docHandle === handle) { docHandle = undefined; showingId = undefined; }
        }
        return handle;
      }
      log.warn(`[scratches] open failed for ${id}: ${String(err)}`);
    }
    return handle;
  };

  const refreshBrowse = async (): Promise<void> => {
    if (browseHandle !== undefined) await renderBrowse(browseHandle);
  };

  return {
    openBrowse,
    openDocument,
    refreshBrowse,
    closeDocumentIfShowing,
    invalidateId,
    get showingId() { return showingId; },
    dispose: () => { disposed = true; docGeneration++; },
  };
}
