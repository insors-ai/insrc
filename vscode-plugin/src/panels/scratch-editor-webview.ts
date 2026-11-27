/** Local-only Milkdown pane and document bridge. No note opens on import. */
import { Crepe, CrepeFeature, type CrepeConfig } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/classic.css';
import './scratch-editor.css';

/** Do not expose library AI, even if another caller passes feature overrides.
 * Construction alone never creates an editor or starts a network operation. */
export function createScratchCrepe(config: CrepeConfig): Crepe {
  return new Crepe({ ...config, features: { ...config.features, [CrepeFeature.AI]: false } });
}

import { editorViewCtx } from '@milkdown/kit/core';
import { history } from '@milkdown/kit/plugin/history';
import { parseScratchEditorMessage, parseScratchHostMessage, type ScratchEditorToHost } from './scratch-editor-protocol.js';
import { ScratchRendererState } from './scratch-editor-state.js';
import { checkScratchMarkdown } from './scratch-markdown.js';
import { observeScratchMarkdown, scratchMilkdownCodec, SCRATCH_HOST_TRANSACTION } from './scratch-markdown-milkdown.js';

export interface ScratchPaneOptions {
  readonly paneSessionId: string;
  readonly post: (message: ScratchEditorToHost) => void;
}
/** One rich pane. Native document/persistence/composer operations stay in the
 * host. This adapter never writes a file and never submits a chat message. */
export class ScratchEditorPane {
  private readonly toolbar: HTMLElement;
  private readonly editorRoot: HTMLElement;
  private readonly status: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly fallback: HTMLButtonElement;
  private readonly send: HTMLButtonElement;
  private crepe: Crepe | undefined;
  private state: ScratchRendererState | undefined;
  private observer: Awaited<ReturnType<typeof observeScratchMarkdown>> | undefined;
  private locked = true;
  private failed = false;
  private disposed = false;
  private initialization: Promise<void> | undefined;
  private selected: { text: string; draftSeq: number; version: number } | undefined;
  private readonly inbound: unknown[] = [];

  constructor(private readonly root: HTMLElement, private readonly options: ScratchPaneOptions) {
    if (!parseScratchEditorMessage({ type: 'editor-ready', paneSessionId: options.paneSessionId })) throw new Error('Invalid editor session');
    root.classList.add('scratch-pane'); root.replaceChildren();
    this.toolbar = document.createElement('nav'); this.toolbar.setAttribute('aria-label', 'Scratchpad controls');
    this.toggle = this.button('Edit scratchpad', '✎', () => {
      if (this.failed || !this.state) return;
      this.setLocked(!this.locked);
      this.post({ type: 'lock', paneSessionId: options.paneSessionId, locked: this.locked });
    });
    this.toolbar.append(this.toggle);
    this.fallback = this.button('Open this file in the text editor', 'Open in text editor', () => this.post({ type: 'open-text', paneSessionId: options.paneSessionId }));
    this.fallback.hidden = true; this.toolbar.append(this.fallback);
    this.status = document.createElement('p'); this.status.className = 'scratch-status'; this.status.setAttribute('role', 'status');
    this.editorRoot = document.createElement('section'); this.editorRoot.className = 'scratch-content';
    this.send = this.button('Send selection to chat', '➤ Send', () => {
      const selected = this.selected, state = this.state;
      const current = window.getSelection();
      if (!selected || !state || !current?.anchorNode || !current.focusNode ||
        !this.editorRoot.contains(current.anchorNode) || !this.editorRoot.contains(current.focusNode) || current.toString() !== selected.text ||
        state.conflicted || state.draftSeq !== selected.draftSeq || state.snapshot.version !== selected.version) { this.hideSend(); return; }
      this.post({ type: 'send-selection', paneSessionId: options.paneSessionId, draftSeq: selected.draftSeq, docVersion: selected.version, selectedText: selected.text });
      this.hideSend();
    });
    this.send.className = 'scratch-selection-send'; this.send.hidden = true;
    this.send.addEventListener('pointerdown', e => e.preventDefault()); // retain native selection until explicit click
    root.append(this.toolbar, this.status, this.editorRoot, this.send);
    document.addEventListener('selectionchange', this.selectionChanged);
    root.addEventListener('keydown', this.keydown);
    root.addEventListener('scroll', this.hideSend, true);
    this.toggle.disabled = true;
  }
  private button(label: string, text: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    button.title = label; button.setAttribute('aria-label', label); button.addEventListener('click', action); return button;
  }
  private post(message: ScratchEditorToHost): void {
    if (this.disposed || !parseScratchEditorMessage(message)) return;
    try { this.options.post(message); } catch { this.fail('Message delivery failed. Keep this pane open; the local draft may not be stored.'); }
  }
  private fail(message: string): void {
    this.failed = true; this.fallback.hidden = false; this.toggle.disabled = true;
    this.status.textContent = message; this.status.setAttribute('role', 'alert'); this.setLocked(this.locked); this.hideSend();
  }
  private setLocked(value: boolean): void {
    this.locked = value;
    this.root.dataset['locked'] = String(value || this.failed);
    this.crepe?.setReadonly(value || this.failed);
    this.toggle.textContent = value ? '✎' : '🔒';
    const label = value ? 'Edit scratchpad' : 'Lock scratchpad'; this.toggle.title = label; this.toggle.setAttribute('aria-label', label);
    this.toggle.setAttribute('aria-pressed', String(!value));
  }
  /** Host messages are ordered even while asynchronous Crepe creation is pending. */
  async receive(value: unknown): Promise<void> {
    try { await this.receiveInternal(value); }
    catch { this.fail('Document synchronization failed. Original source and local editor text are retained.'); }
  }
  private async receiveInternal(value: unknown): Promise<void> {
    const msg = parseScratchHostMessage(value);
    if (!msg || msg.paneSessionId !== this.options.paneSessionId || this.disposed) return;
    if (this.initialization) {
      if (this.inbound.length >= 32) { this.fail('Too many updates while opening. Original source is retained; reopen the pane.'); return; }
      this.inbound.push(msg); return this.initialization;
    }
    if (!this.state) {
      if (msg.type !== 'document-state') { if (msg.type === 'conflict') this.fail(msg.message); return; }
      this.state = new ScratchRendererState(this.options.paneSessionId, msg, draft => this.post(draft));
      this.setLocked(msg.locked);
      this.initialization = this.initialize(msg.markdown);
      await this.initialization; this.initialization = undefined;
      for (const pending of this.inbound.splice(0)) await this.receive(pending);
      return;
    }
    const result = this.state.receive(msg);
    if (result.conflict) { this.fail(result.conflict); return; }
    if (msg.type === 'document-state') this.setLocked(msg.locked);
    if (msg.type === 'action-error') { this.status.textContent = msg.message; return; }
    if (msg.type === 'recovery') {
      // No automatic replay. Host will offer explicit recovery choices (t7).
      this.status.textContent = 'A pending draft is available for recovery. Original file is unchanged.'; this.fallback.hidden = false; return;
    }
    if (result.replace !== undefined && this.crepe) {
      this.hideSend();
      const checked = this.crepe.editor.action(ctx => checkScratchMarkdown(result.replace!, scratchMilkdownCodec(ctx)));
      if (!checked.allowed) { this.fail(checked.reason ?? 'Source cannot be safely edited. Open this file in the text editor.'); return; }
      this.crepe.editor.action(ctx => {
        const view = ctx.get(editorViewCtx), parsed = scratchMilkdownCodec(ctx).parse(result.replace!);
        view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, parsed.content).setMeta(SCRATCH_HOST_TRANSACTION, true));
      });
    }
    if (msg.type === 'receipt') this.status.textContent = 'Draft retained; waiting for document update.';
    if (msg.type === 'apply-ack' && !this.state.hasPending) this.status.textContent = ''; // applied is not saved
  }
  private async initialize(markdown: string): Promise<void> {
    try {
      this.crepe = createScratchCrepe({ root: this.editorRoot, defaultValue: markdown, features: { [CrepeFeature.TopBar]: false } });
      this.crepe.setReadonly(true); // no editable interval while create() awaits plugins
      await this.crepe.editor.remove(history); // native TextDocument is the sole undo authority
      this.observer = await observeScratchMarkdown(this.crepe.editor, () => this.state!.snapshot.markdown, result => {
        if (result.kind === 'unchanged' || this.disposed || this.failed) return;
        this.hideSend();
        try {
          if (result.kind === 'proposal' && !this.locked) { this.state!.edit(result.draft); this.status.textContent = 'Updating document…'; }
          else {
            // A serializable refused proposal is recovery-only, including after
            // an older acknowledgement; it can never become an apply request.
            if (result.draft) this.state!.edit(result.draft, false);
            this.fail(result.reason ?? 'Draft cannot be safely applied. Source and local editor text are retained.');
          }
        } catch { this.fail('Draft could not be sent. Keep this pane open and preserve your text before closing.'); }
      });
      await this.crepe.create();
      if (this.disposed) { await this.crepe.destroy(); this.crepe = undefined; return; }
      const checked = this.crepe.editor.action(ctx => checkScratchMarkdown(markdown, scratchMilkdownCodec(ctx)));
      this.setLocked(this.locked);
      if (!checked.allowed) { this.fail(checked.reason ?? 'Markdown cannot be safely edited. Open this file in the text editor.'); return; }
      if (!this.failed) { this.observer.activate(); this.toggle.disabled = false; }
    } catch { this.fail('Scratchpad could not be initialized. Original source is unchanged. Open this file in the text editor.'); }
  }
  private readonly hideSend = (): void => { this.selected = undefined; this.send.hidden = true; };
  private readonly selectionChanged = (): void => {
    if (!this.crepe || !this.state || this.failed || this.state.conflicted) { this.hideSend(); return; }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode ||
      !this.editorRoot.contains(selection.anchorNode) || !this.editorRoot.contains(selection.focusNode)) { this.hideSend(); return; }
    const text = selection.toString();
    if (!text || !parseScratchEditorMessage({ type: 'send-selection', paneSessionId: this.options.paneSessionId, draftSeq: this.state.draftSeq, docVersion: this.state.snapshot.version, selectedText: text })) { this.hideSend(); return; }
    this.selected = { text, draftSeq: this.state.draftSeq, version: this.state.snapshot.version };
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    this.send.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 120))}px`;
    this.send.style.top = `${Math.max(4, Math.min(rect.bottom + 4, window.innerHeight - 40))}px`;
    this.send.hidden = false;
  };
  private readonly keydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') { this.hideSend(); return; }
    if (!(event.ctrlKey || event.metaKey) || event.altKey || !this.state || this.failed) return;
    const key = event.key.toLowerCase();
    const action = key === 's' ? 'save' : key === 'z' ? event.shiftKey ? 'redo' : 'undo' : key === 'y' ? 'redo' : undefined;
    if (!action) return;
    event.preventDefault(); event.stopPropagation();
    this.post({ type: action, paneSessionId: this.options.paneSessionId, draftSeq: this.state.draftSeq, docVersion: this.state.snapshot.version });
  };
  async dispose(): Promise<void> {
    this.disposed = true; document.removeEventListener('selectionchange', this.selectionChanged);
    this.root.removeEventListener('keydown', this.keydown); this.root.removeEventListener('scroll', this.hideSend, true);
    await this.initialization; this.observer?.deactivate(); if (this.crepe) await this.crepe.destroy();
    this.root.replaceChildren();
  }
}

// The host supplies only a validated opaque session token. No note content is
// interpolated into HTML. Browser fixtures import this module without booting.
declare const acquireVsCodeApi: undefined | (() => { postMessage(message: unknown): void });
const bootstrapRoot = typeof document === 'undefined' ? null : document.getElementById('scratch-editor');
const bootstrapSession = bootstrapRoot?.dataset['paneSession'];
if (bootstrapRoot && bootstrapSession && typeof acquireVsCodeApi === 'function') {
  const api = acquireVsCodeApi(), pane = new ScratchEditorPane(bootstrapRoot, { paneSessionId: bootstrapSession, post: m => api.postMessage(m) });
  window.addEventListener('message', event => { void pane.receive(event.data).catch(() => { /* receive exposes initialization failures inside the pane */ }); });
  window.addEventListener('pagehide', () => { void pane.dispose(); }, { once: true });
  api.postMessage({ type: 'editor-ready', paneSessionId: bootstrapSession });
}
