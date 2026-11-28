/** Scratchpad browse UI and UTF-8 composer cap. Document lifecycle belongs to
 * the native custom editor; this module never keeps or saves note content. */
import { makeNonce } from './html.js';
import { shellHtml } from './shell.js';
import type { PanelFactory, PanelHandle } from './types.js';
import type { ScratchEntry, ScratchStore } from '../chat/scratch-store.js';

export const SCRATCHPADS_VIEW_TYPE = 'insrc.scratchpads';
export type ScratchPanelHandle = PanelHandle;
export interface ScratchPanelsDeps {
  readonly panels: PanelFactory;
  readonly store: ScratchStore;
  /** Native service owns exact-URI operations and shared post-delete refresh. */
  readonly editor: { openDocument(id: string): Promise<void>; deleteDocument(id: string): Promise<'deleted' | 'cancelled'> };
  readonly logger?: { warn(message: string): void } | undefined;
  readonly genNonce?: (() => string) | undefined;
}
export interface ScratchPanels {
  openBrowse(): Promise<ScratchPanelHandle | undefined>;
  openDocument(id: string): Promise<void>;
  deleteDocument(id: string): Promise<'deleted' | 'cancelled'>;
  refreshBrowse(): Promise<void>;
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

export function createScratchPanels(deps: ScratchPanelsDeps): ScratchPanels {
  const log = deps.logger ?? { warn: () => {} };
  let browse: ScratchPanelHandle | undefined, disposed = false, browseRevision = 0;
  async function render(handle: ScratchPanelHandle, forceError?: string): Promise<void> {
    const revision = ++browseRevision; let entries: readonly ScratchEntry[] = [], error = forceError;
    try { entries = await deps.store.listScratches(); } catch (failure) { error = `scratchpads unavailable: ${String(failure)}`; }
    if (disposed || browse !== handle || revision !== browseRevision) return;
    handle.setHtml(shellHtml('insrc scratchpads', browseHtml(entries, error) + `<style>${BROWSE_STYLE}</style>`, deps.genNonce?.() ?? makeNonce(), browseBootstrap()));
  }
  async function openDocument(id: string): Promise<void> {
    if (disposed) throw new Error('Scratchpad controller is disposed.');
    await deps.editor.openDocument(id);
  }
  async function deleteDocument(id: string): Promise<'deleted' | 'cancelled'> {
    if (disposed) throw new Error('Scratchpad controller is disposed.');
    try { return await deps.editor.deleteDocument(id); }
    catch (failure) {
      if (browse) { try { await render(browse, `delete failed: ${String(failure)}`); } catch { log.warn('Scratchpad deletion error could not be displayed.'); } }
      throw failure;
    }
  }
  return {
    openDocument, deleteDocument,
    openBrowse: async () => {
      if (disposed) return undefined;
      if (!browse) {
        try {
          const panel = deps.panels({ viewType: SCRATCHPADS_VIEW_TYPE, title: 'insrc scratchpads' }); browse = panel;
          panel.onDidDispose(() => { if (browse === panel) { browse = undefined; browseRevision++; } });
          panel.onMessage(value => {
            const envelope = value as { v?: unknown; payload?: { type?: unknown; id?: unknown } } | null;
            if (!envelope || envelope.v !== 1 || !envelope.payload || typeof envelope.payload !== 'object') return;
            const message = envelope.payload;
            if (message.type === 'scratch-open' && typeof message.id === 'string') void openDocument(message.id).catch(failure => log.warn(`Scratchpad open failed: ${String(failure)}`));
            if (message.type === 'scratch-delete' && typeof message.id === 'string') void deleteDocument(message.id).catch(failure => log.warn(`Scratchpad deletion failed: ${String(failure)}`));
          });
        } catch (failure) { log.warn(`Scratchpad browse could not open: ${String(failure)}`); return undefined; }
      }
      const handle = browse; handle.reveal(true); await render(handle); return handle;
    },
    refreshBrowse: async () => { if (browse && !disposed) await render(browse); },
    dispose: () => { disposed = true; browseRevision++; browse = undefined; },
  };
}
