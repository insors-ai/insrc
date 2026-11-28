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
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { imageBlockSchema } from '@milkdown/kit/component/image-block';
import { uploadConfig } from '@milkdown/kit/plugin/upload';
import { history } from '@milkdown/kit/plugin/history';
import { parseScratchEditorMessage, parseScratchHostMessage, type ScratchEditorToHost, type ScratchSelectionSend } from './scratch-editor-protocol.js';
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
  private readonly retainedSelection: HTMLTextAreaElement;
  private crepe: Crepe | undefined;
  private state: ScratchRendererState | undefined;
  private observer: Awaited<ReturnType<typeof observeScratchMarkdown>> | undefined;
  private locked = true;
  private failed = false;
  private disposed = false;
  private initialization: Promise<void> | undefined;
  private selected: { readonly text: string; readonly doc: ProseNode } | undefined;
  private captured: ScratchSelectionSend | undefined;
  private pendingSelection: ScratchSelectionSend | undefined;
  private sendSequence = 0;
  private selectionTimer: ReturnType<typeof setTimeout> | undefined;
  private assetSequence = 0;
  private displayQueue: Promise<unknown> = Promise.resolve();
  private readonly displayedImages = new Map<string, Promise<string>>();
  private readonly assetRequests = new Map<string, { resolve: (value: { href: string; displayUrl: string }) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
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
    for (const [label, glyph, action] of [['Insert workspace link', 'Link', 'pick-link'], ['Insert workspace image', 'Image', 'pick-image']] as const) {
      const button = this.button(label, glyph, () => { void this.pickAsset(action).catch(e => this.assetError(e)); });
      button.className = 'scratch-author-action'; this.toolbar.append(button);
    }
    this.fallback = this.button('Open this file in the text editor', 'Open in text editor', () => this.post({ type: 'open-text', paneSessionId: options.paneSessionId }));
    this.fallback.hidden = true; this.toolbar.append(this.fallback);
    this.status = document.createElement('p'); this.status.className = 'scratch-status'; this.status.setAttribute('role', 'status');
    this.editorRoot = document.createElement('section'); this.editorRoot.className = 'scratch-content';
    this.retainedSelection = document.createElement('textarea');
    this.retainedSelection.readOnly = true; this.retainedSelection.hidden = true;
    this.retainedSelection.className = 'scratch-retained-selection';
    this.retainedSelection.setAttribute('aria-label', 'Captured selection retained after failed Send');
    this.send = this.button('Send selection to chat', '➤ Send', () => {
      if (this.pendingSelection) return;
      const captured = this.captured ?? this.captureSelection(); this.captured = undefined;
      if (!captured) return;
      this.pendingSelection = captured; this.send.disabled = true;
      this.retainedSelection.value = captured.selectedText; this.retainedSelection.hidden = true;
      this.status.textContent = 'Preparing selection for chat…';
      this.selectionTimer = setTimeout(() => {
        if (this.pendingSelection !== captured || this.disposed) return;
        this.retainedSelection.hidden = false;
        this.status.textContent = 'Send confirmation was not received. Your selection is retained below; check the composer before closing this pane.';
        this.status.setAttribute('role', 'alert');
      }, 30_000);
      this.post(captured); this.hideSend();
    });
    this.send.className = 'scratch-selection-send'; this.send.hidden = true;
    this.send.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.send.click();
    });
    this.send.addEventListener('pointerdown', e => {
      e.preventDefault(); // capture before pointer focus can collapse the selection
      this.captured = this.captureSelection();
    });
    root.append(this.toolbar, this.status, this.retainedSelection, this.editorRoot, this.send);
    document.addEventListener('selectionchange', this.selectionChanged);
    root.addEventListener('keydown', this.keydown, true);
    root.addEventListener('scroll', this.hideSend, true);
    root.addEventListener('paste', this.pasteUrl, true);
    this.toggle.disabled = true;
  }
  private button(label: string, text: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    button.title = label; button.setAttribute('aria-label', label); button.addEventListener('click', action); return button;
  }
  private post(message: ScratchEditorToHost): void {
    if (this.disposed || !parseScratchEditorMessage(message)) return;
    try { this.options.post(message); } catch { if (this.pendingSelection) this.retainedSelection.hidden = false; this.fail('Message delivery failed. Keep this pane open; the local draft may not be stored.'); }
  }
  private fail(message: string): void {
    clearTimeout(this.selectionTimer);
    if (this.pendingSelection) this.retainedSelection.hidden = false;
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
    for (const control of this.toolbar.querySelectorAll<HTMLButtonElement>('.scratch-author-action')) { control.hidden = value || this.failed; control.disabled = value || this.failed; }
  }
  /** Host messages are ordered even while asynchronous Crepe creation is pending. */
  async receive(value: unknown): Promise<void> {
    try { await this.receiveInternal(value); }
    catch { this.fail('Document synchronization failed. Original source and local editor text are retained.'); }
  }
  private async receiveInternal(value: unknown): Promise<void> {
    const msg = parseScratchHostMessage(value);
    if (!msg || msg.paneSessionId !== this.options.paneSessionId || this.disposed) return;
    if (msg.type === 'asset-result' || msg.type === 'action-error' && this.assetRequests.has(msg.requestId)) {
      const pending = this.assetRequests.get(msg.requestId);
      if (pending) { clearTimeout(pending.timer); this.assetRequests.delete(msg.requestId); if (msg.type === 'asset-result') pending.resolve(msg); else pending.reject(new Error(msg.message)); }
      return;
    }
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
    if (msg.type === 'focus-request') {
      if (!this.failed && this.crepe) this.crepe.editor.action(ctx => ctx.get(editorViewCtx).focus());
      // VS Code 1.146's preload relays webview focus on a 250 ms poll. Wait
      // through that bookkeeping interval before acknowledging focus; an
      // inner-frame focus event alone can leave another native editor active.
      // A timer also works when an occluded view does not paint frames.
      await new Promise(resolve => setTimeout(resolve, 350));
      const focused = !this.failed && !this.disposed && !this.state.hasPending && !this.state.conflicted &&
        this.state.snapshot.version === msg.docVersion && this.state.draftSeq === msg.draftSeq &&
        document.hasFocus() && this.editorRoot.contains(document.activeElement);
      this.post({ type: 'focus-ready', paneSessionId: this.options.paneSessionId, requestId: msg.requestId, docVersion: msg.docVersion, draftSeq: msg.draftSeq, focused });
      return;
    }
    if (msg.type === 'selection-result') {
      if (msg.requestId !== this.pendingSelection?.requestId) return;
      clearTimeout(this.selectionTimer);
      this.retainedSelection.hidden = msg.sent;
      this.status.textContent = msg.message;
      this.status.setAttribute('role', msg.sent ? 'status' : 'alert');
      this.pendingSelection = undefined; this.send.disabled = false; return;
    }
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
      this.crepe = createScratchCrepe({ root: this.editorRoot, defaultValue: markdown, features: { [CrepeFeature.TopBar]: false }, featureConfigs: {
        [CrepeFeature.ImageBlock]: { onUpload: file => this.uploadImage(file), inlineOnUpload: file => this.uploadImage(file), blockOnUpload: file => this.uploadImage(file), proxyDomURL: href => this.imageDisplay(href) },
      } });
      // Crepe serializes alt text as a numeric resize ratio by default. Keep
      // standard Markdown alt/title independently from presentation-only size.
      this.crepe.editor.config(ctx => ctx.update(imageBlockSchema.key, original => context => {
        const schema = original(context);
        return { ...schema, attrs: { ...schema.attrs, alt: { default: '', validate: 'string' } },
          parseMarkdown: { ...schema.parseMarkdown, runner: (state, node, type) => { state.addNode(type, { src: node.url as string, alt: (node.alt as string | null) ?? '', caption: (node.title as string | null) ?? '', ratio: 1 }); } },
          toMarkdown: { ...schema.toMarkdown, runner: (state, node) => { state.openNode('paragraph'); state.addNode('image', undefined, undefined, { url: node.attrs['src'], alt: node.attrs['alt'], title: node.attrs['caption'] || null }); state.closeNode(); } },
        };
      }));
      // Override Crepe's parallel/default uploader: every image goes through the
      // same bounded host-backed callbacks, with no blob/base64 source fallback.
      this.crepe.editor.config(ctx => ctx.update(uploadConfig.key, previous => ({ ...previous, uploader: async (files, schema) => {
        const nodes = [], type = schema.nodes['image-block'] ?? schema.nodes['image'];
        if (!type || this.locked || this.failed) return [];
        try { for (const file of Array.from(files)) { if (!file.type.startsWith('image/')) continue; const src = await this.uploadImage(file); const node = type.createAndFill({ src }); if (node) nodes.push(node); } return nodes; }
        catch (error) { this.assetError(error); return []; }
      } })));
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
  private assetError(error: unknown): void {
    this.status.textContent = error instanceof Error ? error.message : 'Image or link could not be inserted.';
    this.status.setAttribute('role', 'alert');
  }
  private assetRequest(action: 'pick-link' | 'pick-image' | 'resolve-image', href?: string): Promise<{ href: string; displayUrl: string }> {
    return this.requestAsset({ type: 'asset-request', paneSessionId: this.options.paneSessionId, requestId: `asset_${++this.assetSequence}`, action, ...(action === 'resolve-image' ? { href: href ?? '' } : {}) } as ScratchEditorToHost);
  }
  private requestAsset(message: ScratchEditorToHost): Promise<{ href: string; displayUrl: string }> {
    if (message.type !== 'asset-request' || this.disposed || this.assetRequests.size >= 8 || !parseScratchEditorMessage(message)) return Promise.reject(new Error('Image action is unavailable or exceeds its limits.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.assetRequests.delete(message.requestId); reject(new Error('Image action timed out; no reference was inserted.')); }, 30_000);
      this.assetRequests.set(message.requestId, { resolve, reject, timer });
      try { this.options.post(message); } catch { clearTimeout(timer); this.assetRequests.delete(message.requestId); reject(new Error('Image request could not be delivered.')); }
    });
  }
  private async imageDisplay(href: string): Promise<string> {
    if (/^data:image\/(png|jpeg|gif|webp);base64,/.test(href)) return href;
    if (!href) return '';
    const existing = this.displayedImages.get(href); if (existing) return existing;
    const loading = this.displayQueue.then(async () => {
      try { return (await this.assetRequest('resolve-image', href)).displayUrl; }
      catch (error) { this.displayedImages.delete(href); this.assetError(error); return ''; }
    });
    this.displayQueue = loading;
    if (this.displayedImages.size >= 128) this.displayedImages.delete(this.displayedImages.keys().next().value!);
    this.displayedImages.set(href, loading); return loading;
  }
  private async uploadImage(file: File): Promise<string> {
    if (this.locked || this.failed || !this.state || !this.crepe || file.size < 1 || file.size > 10_485_760 || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, GIF or WebP image of at most 10 MiB while editing.');
    const doc = this.crepe.editor.action(ctx => ctx.get(editorViewCtx).state.doc), sequence = this.state.draftSeq;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = ''; for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
      const result = await this.requestAsset({ type: 'asset-request', paneSessionId: this.options.paneSessionId, requestId: `asset_${++this.assetSequence}`, action: 'upload-image', name: file.name || 'pasted-image', mediaType: file.type as 'image/png', dataBase64: btoa(binary) });
      if (!result.href || this.disposed || this.locked || this.failed || this.state.conflicted || this.state.draftSeq !== sequence || this.crepe.editor.action(ctx => ctx.get(editorViewCtx).state.doc !== doc)) throw new Error('Scratchpad changed while uploading; retry inserting the image.');
      return result.href;
    } catch (error) { this.assetError(error); throw error; }
  }
  private async pickAsset(action: 'pick-link' | 'pick-image'): Promise<void> {
    if (!this.crepe || this.locked || this.failed || !this.state) return;
    const view = this.crepe.editor.action(ctx => ctx.get(editorViewCtx)), doc = view.state.doc, selection = view.state.selection;
    const result = await this.assetRequest(action);
    if (!result.href) return; // user cancelled
    if (this.disposed || this.locked || this.failed || this.state.conflicted || view.state.doc !== doc) throw new Error('Scratchpad changed while choosing a file; retry.');
    const tr = view.state.tr.setSelection(selection);
    if (action === 'pick-image') {
      const type = view.state.schema.nodes['image-block'] ?? view.state.schema.nodes['image'];
      if (!type) throw new Error('Image authoring is unavailable.');
      view.dispatch(tr.replaceSelectionWith(type.create({ src: result.href })).scrollIntoView());
    } else {
      const link = view.state.schema.marks['link']; if (!link) throw new Error('Link authoring is unavailable.');
      const label = doc.textBetween(selection.from, selection.to, '\n\n') || result.href;
      view.dispatch(tr.replaceSelectionWith(view.state.schema.text(label, [link.create({ href: result.href })]), false).scrollIntoView());
    }
  }
  private readonly pasteUrl = (event: ClipboardEvent): void => {
    if (!this.crepe || this.locked || this.failed || event.clipboardData?.files.length) return;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!/^https?:\/\/[^\s]+$/i.test(text)) return;
    const view = this.crepe.editor.action(ctx => ctx.get(editorViewCtx));
    if (view.state.selection.$from.parent.type.spec.code || (event.target instanceof Element && event.target.closest('.cm-editor'))) return;
    try {
      const url = new URL(text); if (!['http:', 'https:'].includes(url.protocol)) return;
      const link = view.state.schema.marks['link']; if (!link) return;
      event.preventDefault(); event.stopPropagation();
      const selection = view.state.selection, label = view.state.doc.textBetween(selection.from, selection.to, '\n\n') || text;
      view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.text(label, [link.create({ href: text })]), false).scrollIntoView());
    } catch (error) { this.assetError(error); }
  };
  private captureSelection(): ScratchSelectionSend | undefined {
    const selected = this.selected, state = this.state;
    if (!selected || !state || !this.crepe || this.failed || this.pendingSelection) return;
    const sameDocument = this.crepe.editor.action(ctx => ctx.get(editorViewCtx).state.doc === selected.doc);
    if (!sameDocument || state.conflicted) {
      this.retainedSelection.value = selected.text; this.retainedSelection.hidden = false;
      this.status.textContent = 'Selection source changed; reselect and retry Send.'; this.hideSend(); return;
    }
    return Object.freeze({ type: 'send-selection', requestId: `send_${++this.sendSequence}`, paneSessionId: this.options.paneSessionId,
      draftSeq: state.draftSeq, docVersion: state.snapshot.version, selectedText: selected.text });
  }
  private readonly hideSend = (): void => { this.selected = undefined; this.captured = undefined; this.send.hidden = true; };
  private readonly selectionChanged = (): void => {
    // Keyboard navigation to the action may collapse the DOM selection. Keep
    // the already captured snapshot; document-changing transactions invalidate it.
    const current = window.getSelection();
    if (document.activeElement === this.send && this.selected && (!current || current.isCollapsed)) return;
    if (!this.crepe || !this.state || this.failed || this.state.conflicted || this.pendingSelection) { this.hideSend(); return; }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode ||
      !this.editorRoot.contains(selection.anchorNode) || !this.editorRoot.contains(selection.focusNode)) { this.hideSend(); return; }
    let selected: { readonly text: string; readonly doc: ProseNode };
    try {
      selected = this.crepe.editor.action(ctx => {
        const view = ctx.get(editorViewCtx), range = selection.getRangeAt(0);
        const anchorElement = selection.anchorNode!.nodeType === Node.ELEMENT_NODE ? selection.anchorNode as Element : selection.anchorNode!.parentElement;
        const focusElement = selection.focusNode!.nodeType === Node.ELEMENT_NODE ? selection.focusNode as Element : selection.focusNode!.parentElement;
        const code = anchorElement?.closest('.cm-editor'), endCode = focusElement?.closest('.cm-editor');
        if ((code || endCode) && code !== endCode) throw new Error('Mixed code selection is not synchronized.');
        // Crepe forwards CodeMirror's selection to the outer ProseMirror state.
        // Its opaque node view cannot be mapped through posAtDOM.
        const from = code && code === focusElement?.closest('.cm-editor') ? view.state.selection.from : view.posAtDOM(range.startContainer, range.startOffset);
        const to = code && code === focusElement?.closest('.cm-editor') ? view.state.selection.to : view.posAtDOM(range.endContainer, range.endOffset);
        const text = view.state.doc.textBetween(from, to, '\n\n', node => node.type.name === 'hardbreak' ? '\n' : typeof node.attrs['alt'] === 'string' ? node.attrs['alt'] : '');
        if (code && text !== selection.toString()) throw new Error('Code selection is not synchronized.');
        return { text, doc: view.state.doc };
      });
    } catch { this.hideSend(); return; }
    if (!selected.text || !parseScratchEditorMessage({ type: 'send-selection', requestId: 'send_1', paneSessionId: this.options.paneSessionId, draftSeq: this.state.draftSeq, docVersion: this.state.snapshot.version, selectedText: selected.text })) { this.hideSend(); return; }
    this.selected = selected;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    this.send.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 120))}px`;
    this.send.style.top = `${Math.max(4, Math.min(rect.bottom + 4, window.innerHeight - 40))}px`;
    this.send.hidden = false;
  };
  private readonly keydown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !this.send.hidden && document.activeElement !== this.send) {
      this.captured = this.captureSelection();
      if (this.captured) { event.preventDefault(); event.stopPropagation(); this.send.focus(); }
      return;
    }
    if (event.key === 'Escape') { this.hideSend(); return; }
    if (!(event.ctrlKey || event.metaKey) || event.altKey || !this.state || this.failed) return;
    const key = event.key.toLowerCase();
    const action = key === 's' ? 'save' : key === 'z' ? event.shiftKey ? 'redo' : 'undo' : key === 'y' ? 'redo' : undefined;
    if (!action) return;
    event.preventDefault(); event.stopPropagation();
    this.post({ type: action, paneSessionId: this.options.paneSessionId, draftSeq: this.state.draftSeq, docVersion: this.state.snapshot.version });
  };
  async dispose(): Promise<void> {
    this.disposed = true; clearTimeout(this.selectionTimer); document.removeEventListener('selectionchange', this.selectionChanged);
    for (const pending of this.assetRequests.values()) { clearTimeout(pending.timer); pending.reject(new Error('Scratchpad pane closed.')); } this.assetRequests.clear();
    this.root.removeEventListener('paste', this.pasteUrl, true);
    this.root.removeEventListener('keydown', this.keydown, true); this.root.removeEventListener('scroll', this.hideSend, true);
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
