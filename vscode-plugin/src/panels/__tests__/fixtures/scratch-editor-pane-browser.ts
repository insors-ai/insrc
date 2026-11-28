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
    const pane = new ScratchEditorPane(root, { paneSessionId: id, post: m => { sent.push(m); if (m.type === 'lock') void preference.remember(m.locked).then(() => pane.receive({type:'lock-state',paneSessionId:id,requestId:m.requestId,locked:m.locked,success:true,message:''})); } });
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
    const ownedImage = { count: image.root.querySelectorAll('.scratch-owned-image').length, rawInputs: image.root.querySelectorAll('.image-edit').length, resizeControls: image.root.querySelectorAll('.image-resize-handle').length };
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

    });
    for (let i = 0; !drafts(first.sent).some(d => d.apply) && i < 1000; i++) await new Promise(resolve => setTimeout(resolve, 10));
    first.pane['crepe']!.editor.action(ctx => { const view = ctx.get(editorViewCtx); view.dispatch(view.state.tr.insertText(' newer', 12)); });
    const before = first.pane['crepe']!.getMarkdown(), proposed = drafts(first.sent), old = proposed[0]!;
    if (!old) throw new Error(`No accepted proposal: ${first.root.textContent}`);
    await first.pane.receive({ type: 'apply-ack', paneSessionId: 'first', draftSeq: old.draftSeq, editId: old.editId, version: 2, digest: 'b'.repeat(64), markdown: old.markdown });
    for (let i = 0; drafts(first.sent).filter(d => d.apply).length < 2 && i < 1000; i++) await new Promise(resolve => setTimeout(resolve, 10));
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
    const code = await create('code', '```typescript\nconst value = 1;\n```\n');
    code.root.querySelector<HTMLButtonElement>('nav button')!.click(); await tick();
    const nested = code.root.querySelector('.milkdown-code-block-placeholder code') ?? code.root.querySelector('.milkdown-code-block')!;
    if (!nested) throw new Error('Actual code-block view is absent');
    let childKeys = 0; nested.addEventListener('keydown', () => { childKeys++; });
    for (const [key, shiftKey] of [['z', false], ['z', true], ['s', false]] as const) nested.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, shiftKey, bubbles: true, cancelable: true }));
    await tick();
    const shortcuts = { childKeys, actions: code.sent.filter(m => m.type === 'undo' || m.type === 'redo' || m.type === 'save').map(m => m.type), drafts: drafts(code.sent) };
    const lockedKeyStart = third.sent.length;
    const lockedTarget = third.root.querySelector('.ProseMirror')!;
    for (const key of ['z', 'y', 's']) lockedTarget.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true }));
    await tick();
    const lockedShortcuts = third.sent.slice(lockedKeyStart).map(m => m.type);
    const selectionChecks = [];
    for (const method of ['pointer', 'Enter', ' '] as const) {
      const current = await create(`selection_${method === ' ' ? 'Space' : method}`, 'First **bold** paragraph.\n\nSecond 😀 paragraph.\n');
      if (method !== 'pointer') { current.root.querySelector<HTMLButtonElement>('nav button')!.click(); await tick(); }
      const paragraphs = current.root.querySelectorAll('.ProseMirror p');
      const range = document.createRange(); range.setStart(paragraphs[0]!.firstChild!, 0); range.setEnd(paragraphs[1]!.firstChild!, paragraphs[1]!.firstChild!.textContent!.length);
      const domSelection = window.getSelection()!; domSelection.removeAllRanges(); domSelection.addRange(range);
      document.dispatchEvent(new Event('selectionchange')); await tick();
      const action = current.root.querySelector<HTMLButtonElement>('.scratch-selection-send')!;
      const before = [...current.sent];
      if (method === 'pointer') action.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      else current.root.querySelector('.ProseMirror')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      const focusedByTab = document.activeElement === action;
      action.focus(); domSelection.removeAllRanges(); document.dispatchEvent(new Event('selectionchange'));
      if (method === 'pointer') action.click(); else action.dispatchEvent(new KeyboardEvent('keydown', { key: method, bubbles: true, cancelable: true }));
      action.click(); // an in-flight double activation cannot send twice
      await tick();
      const sent = current.sent.filter(m => m.type === 'send-selection');
      const capture = sent[0]!;
      if (capture?.type !== 'send-selection') throw new Error(`Missing ${method} Send`);
      // Neither a late result for another request nor host markup may replace the capture.
      await current.pane.receive({ type: 'selection-result', paneSessionId: capture.paneSessionId, requestId: 'send_999', sent: true, message: 'wrong result' });
      const waiting = action.disabled;
      await current.pane.receive({ type: 'selection-result', paneSessionId: capture.paneSessionId, requestId: capture.requestId, sent: false, message: 'Source changed; reselect and retry.' });
      const retained = current.root.querySelector<HTMLTextAreaElement>('.scratch-retained-selection')!;
      selectionChecks.push({ method, before: before.filter(m => m.type !== 'lock' && m.type !== 'editor-initialized'), sent, focusedByTab, waiting, disabledAfterFailure: action.disabled, retained: retained.value, retainedVisible: !retained.hidden, status: current.root.querySelector('[role=alert]')?.textContent, drafts: drafts(current.sent) });
    }
    const deleting = await create('deletion');
    if (deleting.pane['crepe']!.readonly) deleting.root.querySelector<HTMLButtonElement>('nav button')!.click();
    const rememberedBeforeDelete = preference.initial(), deleteMessages = deleting.sent.length;
    await deleting.pane.receive({ type: 'delete-prepare', paneSessionId: 'deletion', requestId: 'delete_request' });
    const frozen = deleting.pane['crepe']!.readonly;
    await deleting.pane.receive({ type: 'delete-release', paneSessionId: 'deletion', requestId: 'wrong_request' });
    const wrongRelease = deleting.pane['crepe']!.readonly;
    await deleting.pane.receive({ type: 'delete-release', paneSessionId: 'deletion', requestId: 'delete_request' });
    const deleteHandshake = { frozen, wrongRelease, released: deleting.pane['crepe']!.readonly, rememberedBeforeDelete, rememberedAfterDelete: preference.initial(), messages: deleting.sent.slice(deleteMessages) };
    return { deleteHandshake, initial, selected, clicked, lockedControls, ownedImage, remembered, siblings, lateAck, host, unsupported, fallback, limit, shortcuts, lockedShortcuts, selectionChecks };
  } finally { for (const { pane } of all) await pane.dispose(); }
}
void run().then(result => { const pre = document.createElement('pre'); pre.id = 'scratch-result'; pre.textContent = JSON.stringify(result); document.body.append(pre); })
.catch(error => { const pre = document.createElement('pre'); pre.id = 'scratch-error'; pre.textContent = `${error}\n${error?.stack ?? ''}`; document.body.append(pre); });
