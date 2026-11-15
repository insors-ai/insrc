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

/**
 * The DOCUMENT-channel protocol (Story 01ac1e4b6a6c9c2f/s1 t2). The document
 * webview's messages live here, in scratch-panels.ts — the chat channel's
 * protocol.ts unions/arrays stay untouched (direction isolation per channel).
 * Both messages carry `gen` so the save round-trip is generation-guarded end
 * to end: the webview posts the gen of the page load it edited in, and the
 * host answers with the same gen so a stale reply can be ignored.
 */
export type ScratchDocWebviewToHost =
  | { readonly type: 'scratch-save'; readonly id: string; readonly gen: number; readonly text: string }
  | { readonly type: 'scratch-dirty'; readonly id: string; readonly gen: number; readonly dirty: boolean };

/** Host -> document webview. */
export type ScratchDocHostToWebview =
  | { readonly type: 'scratch-saved'; readonly id: string; readonly gen: number; readonly ok: boolean; readonly error?: string | undefined };

export const SCRATCH_DOC_WEBVIEW_TO_HOST_TYPES = [
  'scratch-save',
  'scratch-dirty',
] as const;

export const SCRATCH_DOC_HOST_TO_WEBVIEW_TYPES = [
  'scratch-saved',
] as const;

export type ScratchDocWebviewToHostType = (typeof SCRATCH_DOC_WEBVIEW_TO_HOST_TYPES)[number];
export type ScratchDocHostToWebviewType = (typeof SCRATCH_DOC_HOST_TO_WEBVIEW_TYPES)[number];

type _AssertTrue<T extends true> = T;
/** Compile-time union/array equality, mirroring protocol.ts: each const array
 * contains exactly its union's discriminants, in its own direction. */
type _DocWebviewArrayEqualsUnion = _AssertTrue<
  ScratchDocWebviewToHostType extends ScratchDocWebviewToHost['type']
    ? ScratchDocWebviewToHost['type'] extends ScratchDocWebviewToHostType
      ? true
      : false
    : false
>;
type _DocHostArrayEqualsUnion = _AssertTrue<
  ScratchDocHostToWebviewType extends ScratchDocHostToWebview['type']
    ? ScratchDocHostToWebview['type'] extends ScratchDocHostToWebviewType
      ? true
      : false
    : false
>;

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
  /** Save a document view's edit (document-channel 'scratch-save' {id, gen, text}). */
  readonly onScratchSave?: ((id: string, gen: number, text: string) => void) | undefined;
  /** The document view became dirty/clean (document-channel 'scratch-dirty' {id, gen, dirty}). */
  readonly onScratchDirty?: ((id: string, gen: number, dirty: boolean) => void) | undefined;
}

export interface ScratchPanels {
  /** Browse-all: an UNBOUNDED list rendered as a table; create-or-reveal singleton. */
  openBrowse(): Promise<ScratchPanelHandle | undefined>;
  /** Document view: open (or switch to) scratchpad `id`; create-or-reveal singleton. */
  openDocument(id: string): Promise<ScratchPanelHandle | undefined>;
  /** Re-render the browse table if it is open (e.g. after a create/delete). */
  refreshBrowse(): Promise<void>;
  /** Post a document-channel 'scratch-saved' reply to the LIVE document generation only. */
  replySaved(gen: number, msg: ScratchDocHostToWebview): void;
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

/** The document view's static body. Content arrives via a host push and is set
 * with the textarea's .value only (CSP-safe — never innerHTML/textContent). */
export function documentBodyHtml(): string {
  return `<div class="scratch-doc-wrap">` +
    `<textarea id="insrc-scratchdoc" class="scratch-doc" spellcheck="false"></textarea>` +
    `<button type="button" id="insrc-savescratch" class="scratch-save" title="Save (Ctrl/Cmd+S)" aria-label="Save" hidden><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M2.5 2.5h8l3 3V13a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 2.5 13V3a.5.5 0 0 1 .5-.5Z"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M5 2.5V6h5.5V2.5M5 11.5h6"/></svg></button>` +
    `<button type="button" id="insrc-sendtochat" class="scratch-send" title="Send to chat" aria-label="Send to chat" hidden>${SEND_ICON}</button>` +
    `</div>`;
}

const DOC_STYLE =
  `.scratch-doc-wrap{position:relative;display:flex;flex-direction:column;height:100%;}` +
  `.scratch-doc{flex:1;width:100%;box-sizing:border-box;resize:none;white-space:pre-wrap;word-break:break-word;font-family:var(--vscode-editor-font-family,monospace);background:var(--vscode-editor-background,transparent);color:var(--vscode-editor-foreground,inherit);border:1px solid var(--vscode-panel-border,#666);border-radius:4px;padding:8px;}` +
  `.scratch-save{position:fixed;top:8px;right:8px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);border:none;border-radius:6px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);}` +
  `.scratch-save[hidden]{display:none;}` +
  `.scratch-save svg{width:15px;height:15px;}` +
  `.scratch-save[disabled]{opacity:.6;cursor:default;}` +
  `.scratch-doc-wrap .scratch-doc-error{color:var(--vscode-errorForeground,#f48771);font-size:11px;padding:2px 8px;}` +
  `.scratch-send{position:fixed;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);border:none;border-radius:6px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);}` +
  `.scratch-send[hidden]{display:none;}` +
  `.scratch-send svg{width:15px;height:15px;}`;

/** The document view's nonce'd bootstrap: selection latches the textarea's own
 * selection API (selectionStart/selectionEnd over doc.value), the button posts it.
 * `gen` is the page load's generation, `id` the scratchpad displayed; input marks
 * the document dirty (save button visible), Ctrl/Cmd+S or the save button posts
 * document-channel 'scratch-save' {id, gen, text: doc.value}, and a 'scratch-saved'
 * reply is honored only when its gen equals this page's gen. A 'scratch-saved' ok
 * clears the dirty flag only when the document still holds the exact text that was
 * saved — edits typed while the save was in flight keep the document dirty so the
 * newer text is not silently reported as saved.
 * The ready handshake is generation-tagged: the host embeds the current docGeneration in the
 * page, the webview echoes it back, so a stale ready from a previous page load can never mark
 * the live generation ready. */
export function documentBootstrap(gen: number, id: string): string {
  const genLiteral = Number.isFinite(gen) && gen >= 0 ? Math.floor(gen) : 0;
  const idLiteral = JSON.stringify(id);
  return `const vs=acquireVsCodeApi();` +
    `const doc=document.getElementById('insrc-scratchdoc');` +
    `const sendBtn=document.getElementById('insrc-sendtochat');` +
    `const saveBtn=document.getElementById('insrc-savescratch');` +
    `const wrap=document.querySelector('.scratch-doc-wrap');` +
    `var gen=${genLiteral};var docId=${idLiteral};` +
    `var dirty=false;var saving=false;var errEl=null;` +
    // Set the moment the user types anything. Once set, host `scratch-content` pushes
    // must NOT overwrite the textarea or clear dirty: openDocument installs the
    // editable textarea before awaiting readScratch, so a read that resolves after
    // the user started typing would otherwise clobber their edits (r28 CR-MED).
    `var userEdited=false;` +
    // The text snapshot of the in-flight save: a 'scratch-saved' ok clears dirty only if
    // the document still holds that snapshot — edits typed while the save was in flight
    // must keep the document dirty (the save persisted an older text).
    `var savedText=null;` +
    // Webview-ready handshake: the host replays any content posted before the bootstrap
    // installed its listener, so an early read completion can never be lost. The echoed
    // generation tag lets the host ignore a ready from a superseded page load.
    `var pending=null;` +
    `function showErr(msg){if(!errEl&&wrap){errEl=document.createElement('div');errEl.className='scratch-doc-error';errEl.setAttribute('role','alert');wrap.appendChild(errEl);}if(errEl)errEl.textContent=msg;}` +
    `function setDirty(d){dirty=d;if(saveBtn)saveBtn.hidden=!d;vs.postMessage({v:1,payload:{type:'scratch-dirty',id:docId,gen:gen,dirty:d}});}` +
    `window.addEventListener('message',function(e){var m=e.data&&e.data.payload;if(!m)return;` +
    `if(m.type==='scratch-content'&&typeof m.text==='string'){if(doc){if(!userEdited){doc.value=m.text;setDirty(false);if(errEl)errEl.textContent='';}}else pending=m.text;}` +
    `else if(m.type==='scratch-saved'&&m.gen===gen&&m.id===docId){` +
    `saving=false;if(saveBtn)saveBtn.disabled=false;` +
    `if(m.ok){if(savedText!==null&&doc&&doc.value!==savedText){setDirty(true);showErr('saved — but the document changed while saving; save again to keep the latest text');}else{setDirty(false);}}else{setDirty(true);showErr('save failed: '+(typeof m.error==='string'?m.error:'unknown error'));}}` +
    `});` +
    `vs.postMessage({v:1,payload:{type:'scratch-ready',gen:gen}});` +
    `function postSave(){if(!doc||saving)return;saving=true;if(saveBtn)saveBtn.disabled=true;savedText=doc.value;` +
    `vs.postMessage({v:1,payload:{type:'scratch-save',id:docId,gen:gen,text:doc.value}});}` +
    `if(doc){doc.addEventListener('input',function(){userEdited=true;setDirty(true);if(errEl)errEl.textContent='';});` +
    `doc.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&(e.key==='s'||e.key==='S')){e.preventDefault();postSave();}});` +
    // The selection is read from the TEXTAREA's own selection API (select/keyup/mouseup),
    // never from window.getSelection (which does not track textarea selections).
    `var captured='';` +
    `function readSelection(){if(!doc)return '';var s=doc.selectionStart,e=doc.selectionEnd;` +
    `if(typeof s!=='number'||typeof e!=='number'||e<=s)return '';return doc.value.substring(s,e);}` +
    `function onSel(){var t=readSelection();if(t!==''){captured=t;if(sendBtn)sendBtn.hidden=false;}` +
    `else if(sendBtn&&!(sendBtn.contains&&sendBtn.contains(document.activeElement))&&document.activeElement!==sendBtn)sendBtn.hidden=true;}` +
    `doc.addEventListener('select',onSel);doc.addEventListener('keyup',onSel);doc.addEventListener('mouseup',onSel);}` +
    `if(saveBtn)saveBtn.addEventListener('click',function(){postSave();});` +
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
    // Same guard as the live handler: never clobber text the user already typed.
    `if(pending!==null&&doc){if(!userEdited){doc.value=pending;setDirty(false);}pending=null;}`;
}

export function createScratchPanels(deps: ScratchPanelsDeps): ScratchPanels {
  const log = deps.logger ?? { warn: () => {} };
  const nonce = (): string => deps.genNonce?.() ?? 'scratch';
  const sendToChat = deps.onSendToChat ?? (() => {});
  const onScratchSave = deps.onScratchSave ?? (() => {});
  const onScratchDirty = deps.onScratchDirty ?? (() => {});
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
    reveal: (preserveFocus?: boolean | undefined) => panel.reveal(preserveFocus),
    onDidDispose: (l) => panel.onDidDispose(l),
    onMessage: (l) => panel.onMessage(l),
    // ISSUE-3183af2a: surface a dropped post instead of swallowing it. The factory
    // adapter already logs false/rejection via panelLog; the controller logs through its
    // own injected logger so the drop is visible whichever boundary drops it. Best-effort:
    // a logging failure must never break the caller's post.
    postMessage: (m) => {
      try {
        return Promise.resolve(panel.postMessage(m)).then(
          (delivered) => {
            if (delivered === false) log.warn('insrc: a scratchpad webview postMessage was not delivered (webview not ready or disposed) — the message was dropped');
            return delivered;
          },
          () => {
            log.warn('insrc: a scratchpad webview postMessage rejected (panel disposed) — the message was dropped');
            return false;
          },
        );
      } catch (err) {
        log.warn(`insrc: a scratchpad webview postMessage threw synchronously — the message was dropped — ${String(err)}`);
        return Promise.resolve(false);
      }
    },
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
      // Reveal with focus preserved: the singleton is created for a user action
      // (e.g. scratch-new from the chat popup), and stealing focus to the new tab
      // makes the action look like a no-op in the panel the user is interacting with.
      panel.reveal(true);
      setCurrent(panel);
      return panel;
    } catch (err) {
      log.warn(`insrc: could not open the ${title} panel — ${String(err)}`);
      return undefined;
    }
  };

  const renderBrowse = async (handle: ScratchPanelHandle, forceError?: string | undefined): Promise<void> => {
    let entries: readonly ScratchEntry[] = [];
    let error: string | undefined = forceError;
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
    let deleteError: string | undefined;
    try {
      await deps.store.deleteScratch(id);
    } catch (err) {
      // A failed delete must surface in the re-rendered table, not just the log —
      // otherwise the row stays visible with no indication the deletion failed.
      deleteError = `delete failed: ${String(err)}`;
      log.warn(`[scratches] delete failed for ${id}: ${String(err)}`);
    }
    // Invalidate the id's read epoch ONLY after a successful delete: a failed delete
    // leaves the scratchpad file in place, so invalidating up front would drop an
    // in-flight read of a still-existing document. Close the open document ONLY after
    // a successful delete too — on failure the document must stay open.
    if (deleteError === undefined) {
      invalidateId(id);
      closeDocumentIfShowing(id);
    }
    if (browseHandle !== undefined) await renderBrowse(browseHandle, deleteError);
  };

  const invalidateId = (id: string): void => {
    epochs.set(id, (epochs.get(id) ?? 0) + 1);
  };

  /** Retire every retained generation: after a dispose/close no replay can ever be
   * consumed (the webview is gone), so neither map may keep content for the controller's
   * lifetime. Called on every docGeneration++ outside openDocument. */
  const retireAllGenerations = (): void => {
    readyGenerations.clear();
    pendingContent.clear();
  };

  const closeDocumentIfShowing = (id: string): void => {
    if (docHandle !== undefined && showingId === id) {
      try { docHandle.dispose(); } catch { /* best-effort */ }
      docHandle = undefined;
      showingId = undefined;
      docGeneration++;
      retireAllGenerations();
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
      () => { docHandle = undefined; showingId = undefined; docGeneration++; retireAllGenerations(); },
      (panel) => {
        panel.onDidDispose(() => retireAllGenerations());
        panel.onMessage((m) => {
          const env = m as { v?: unknown; payload?: unknown } | null;
          if (env === null || env.v !== 1 || typeof env.payload !== 'object' || env.payload === null) return;
          const msg = env.payload as { type?: unknown; text?: unknown; gen?: unknown; id?: unknown; dirty?: unknown };
          if (msg.type === 'send-to-chat' && typeof msg.text === 'string') sendToChat(capUtf8(msg.text));
          else if (msg.type === 'scratch-dirty' && typeof msg.id === 'string' && typeof msg.dirty === 'boolean' && typeof msg.gen === 'number' && Number.isFinite(msg.gen)) {
            // Dirty-state rides the panel title ('•' suffix), set here on the host:
            // only the id currently displayed, in the generation that reported, may
            // change the live title — a stale page load's dirty flag is dropped.
            if (!disposed && docGeneration === Math.floor(msg.gen) && showingId === msg.id) {
              try { panel.setTitle(msg.dirty ? `${msg.id} •` : msg.id); } catch { /* best-effort */ }
              onScratchDirty(msg.id, Math.floor(msg.gen), msg.dirty);
            } else log.warn(`insrc: a scratch-dirty for ${msg.id} gen ${msg.gen} was dropped (not the live document generation)`);
          }
          else if (msg.type === 'scratch-save' && typeof msg.id === 'string' && typeof msg.text === 'string' && typeof msg.gen === 'number' && Number.isFinite(msg.gen)) {
            // The save seam is validated against the live document: only the id
            // currently displayed, in the generation that posted, may be saved —
            // a stale page load's save is dropped, never applied to another doc.
            if (!disposed && docGeneration === Math.floor(msg.gen) && showingId === msg.id) {
              onScratchSave(msg.id, Math.floor(msg.gen), msg.text);
            } else log.warn(`insrc: a scratch-save for ${msg.id} gen ${msg.gen} was dropped (not the live document generation)`);
          }
          else if (msg.type === 'scratch-ready') {
            // Bind readiness to the GENERATION THAT SENT the ready, compared against the
            // LIVE docGeneration: a stale ready from a superseded webview load (delivered
            // after an A->B switch) carries the old tag and is ignored — otherwise it could
            // mark the new generation ready before its own bootstrap installed its
            // listener, and a then-arriving read would post without retaining a replay copy.
            // (The listener may outlive the open that registered it — the panel singleton is
            // reused across opens — so the closure-captured `generation` must NOT be used here.)
            const msgGen = typeof msg.gen === 'number' && Number.isFinite(msg.gen) ? Math.floor(msg.gen) : undefined;
            if (msgGen === undefined || msgGen !== docGeneration) return;
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
      handle.setHtml(shellHtml(id, documentBodyHtml() + `<style>${DOC_STYLE}</style>`, nonce(), documentBootstrap(generation, id)));
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

  /** Post a 'scratch-saved' reply to the document panel, but ONLY when `gen` is
   * the live document generation and the panel is still showing — a reply for a
   * superseded generation (A->B switch, dispose) is dropped, mirroring the
   * scratch-ready gen guard on the inbound side. */
  const replySaved = (gen: number, msg: ScratchDocHostToWebview): void => {
    if (disposed || docHandle === undefined || docGeneration !== gen) return;
    try {
      docHandle.postMessage({ v: 1, payload: msg });
    } catch { /* best-effort */ }
  };

  return {
    openBrowse,
    openDocument,
    refreshBrowse,
    replySaved,
    closeDocumentIfShowing,
    invalidateId,
    get showingId() { return showingId; },
    dispose: () => { disposed = true; docGeneration++; retireAllGenerations(); },
  };
}
