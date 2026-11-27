import { ScratchEditorPane } from '../../scratch-editor-webview.js';
import { ScratchLockPreference } from '../../scratch-editor-lock.js';
import type { ScratchEditorToHost, ScratchDraftProposal } from '../../scratch-editor-protocol.js';
import { editorViewCtx } from '@milkdown/kit/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));
async function run(): Promise<unknown> {
  const storage = new Map<string, unknown>();
  const preference = new ScratchLockPreference({ get: <T>(k: string) => storage.get(k) as T | undefined, update: async (k, v) => { storage.set(k, v); } });
  const all: { pane: ScratchEditorPane; root: HTMLElement; sent: ScratchEditorToHost[] }[] = [];
  const create = async (id: string, source = '# Base\n\nSelectable text.\n') => {
    const root = document.createElement('main'); document.body.append(root); const sent: ScratchEditorToHost[] = [];
    const pane = new ScratchEditorPane(root, { paneSessionId: id, post: m => { sent.push(m); if (m.type === 'lock') void preference.remember(m.locked); } });
    all.push({ pane, root, sent });
    await pane.receive({ type: 'document-state', paneSessionId: id, version: 1, digest: 'a'.repeat(64), markdown: source, locked: preference.initial() });
    return { pane, root, sent };
  };
  const select = async (root: HTMLElement) => {
    const target = root.querySelector('.ProseMirror p')!.firstChild!;
    const range = document.createRange(); range.selectNodeContents(target);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange')); await tick();
  };
  const drafts = (sent: ScratchEditorToHost[]) => sent.filter((m): m is ScratchDraftProposal => m.type === 'draft');
  try {
    const first = await create('first');
    const initial = { readonly: first.pane['crepe']!.readonly, editable: first.root.querySelector('.ProseMirror')!.getAttribute('contenteditable'), messages: [...first.sent] };
    await select(first.root);
    const send = first.root.querySelector<HTMLButtonElement>('.scratch-selection-send')!;
    const selected = { visible: !send.hidden, sends: first.sent.filter(m => m.type === 'send-selection').length, drafts: drafts(first.sent).length, label: send.getAttribute('aria-label') };
    const lockedControls = ['.milkdown-toolbar', '.milkdown-link-preview', '.milkdown-link-edit', '.milkdown-latex-inline-edit'].map(selector => {
      const element = first.root.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Actual Crepe control not found: ${selector}`);
      element.dataset['show'] = 'true';
      return { selector, display: getComputedStyle(element).display };
    });
    const image = await create('image', '![](data:image/png;base64,iVBORw0KGgo=)\n');
    await tick();
    const actualResizeHandle = image.root.querySelector<HTMLElement>('.image-resize-handle');
    if (!actualResizeHandle) throw new Error('Actual Crepe image resize handle not rendered');
    lockedControls.push({ selector: '.image-resize-handle', display: getComputedStyle(actualResizeHandle).display });
    send.focus(); send.click(); await tick();
    const clicked = first.sent.filter(m => m.type === 'send-selection');
    first.root.querySelector<HTMLButtonElement>('nav button')!.click(); await tick();
    const second = await create('second');
    const remembered = { first: first.pane['crepe']!.readonly, second: second.pane['crepe']!.readonly, stored: preference.initial() };
    second.root.querySelector<HTMLButtonElement>('nav button')!.click(); await tick();
    const third = await create('third');
    const siblings = { first: first.pane['crepe']!.readonly, second: second.pane['crepe']!.readonly, third: third.pane['crepe']!.readonly };
    first.pane['crepe']!.editor.action(ctx => {
      const view = ctx.get(editorViewCtx); view.dispatch(view.state.tr.insertText(' first', 6));
      view.dispatch(view.state.tr.insertText(' newer', 12));
    });
    const before = first.pane['crepe']!.getMarkdown(), proposed = drafts(first.sent), old = proposed[0]!;
    if (!old) throw new Error(`No accepted proposal: ${first.root.textContent}`);
    await first.pane.receive({ type: 'apply-ack', paneSessionId: 'first', draftSeq: old.draftSeq, editId: old.editId, version: 2, digest: 'b'.repeat(64), markdown: old.markdown });
    const lateAck = { before, after: first.pane['crepe']!.getMarkdown(), drafts: drafts(first.sent) };
    await third.pane.receive({ type: 'document-state', paneSessionId: 'third', version: 2, digest: 'c'.repeat(64), markdown: '# Host change\n', locked: true });
    const host = { markdown: third.pane['crepe']!.getMarkdown(), drafts: drafts(third.sent) };
    const bad = await create('unsupported', '---\ntitle: keep this\n---\n\n# Original\n');
    const unsupported = { alert: bad.root.querySelector('[role=alert]')?.textContent, fallback: !bad.root.querySelector<HTMLButtonElement>('nav button:last-child')!.hidden, drafts: drafts(bad.sent), readonly: bad.pane['crepe']?.readonly };
    bad.root.querySelector<HTMLButtonElement>('nav button:last-child')!.click();
    const fallback = bad.sent.at(-1);
    const oversized = await create('oversized');
    await oversized.pane.receive({ type: 'conflict', paneSessionId: 'oversized', draftSeq: 0, message: 'Document exceeds rich editor transport limits; original source is retained. Use the text editor.' });
    const limit = { readonly: oversized.pane['crepe']!.readonly, alert: oversized.root.querySelector('[role=alert]')?.textContent, drafts: drafts(oversized.sent) };
    return { initial, selected, clicked, lockedControls, remembered, siblings, lateAck, host, unsupported, fallback, limit };
  } finally { for (const { pane } of all) await pane.dispose(); }
}
void run().then(result => { const pre = document.createElement('pre'); pre.id = 'scratch-result'; pre.textContent = JSON.stringify(result); document.body.append(pre); })
.catch(error => { const pre = document.createElement('pre'); pre.id = 'scratch-error'; pre.textContent = `${error}\n${error?.stack ?? ''}`; document.body.append(pre); });
