import { ScratchEditorPane } from '../../scratch-editor-webview.js';
import { editorViewCtx } from '@milkdown/kit/core';
import { imageBlockConfig } from '@milkdown/kit/component/image-block';
import { inlineImageConfig } from '@milkdown/kit/component/image-inline';
import { uploadConfig } from '@milkdown/kit/plugin/upload';
import type { ScratchEditorToHost } from '../../scratch-editor-protocol.js';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const tick = () => new Promise<void>(r => setTimeout(r, 0));
async function until(predicate: () => boolean, label: string) { for (let i = 0; i < 300 && !predicate(); i++) await tick(); if (!predicate()) throw new Error(`Asset checkpoint: ${label}`); }
async function run() {
  const root = document.createElement('main'); document.body.append(root);
  const sent: ScratchEditorToHost[] = []; let fail = false, cancel = false, uploads = 0;
  const pane = new ScratchEditorPane(root, { paneSessionId: 'assets', post: message => {
    sent.push(message);
    if (message.type === 'lock') queueMicrotask(() => {void pane.receive({type:'lock-state',paneSessionId:'assets',requestId:message.requestId,locked:message.locked,success:true,message:''});});
    if (message.type !== 'asset-request') return;
    queueMicrotask(() => { void pane.receive(fail ? { type: 'action-error', paneSessionId: 'assets', requestId: message.requestId, message: 'Storage unavailable; no reference inserted.' } : {
      type: 'asset-result', paneSessionId: 'assets', requestId: message.requestId,
      href: cancel ? '' : message.action === 'pick-link' ? '../workspace/space%20name.md' : message.action === 'resolve-image' ? message.href : `assets/image_${++uploads}.png`,
      displayUrl: `data:image/png;base64,${png}`,
    }); });
  } });
  try {
    await pane.receive({ type: 'document-state', paneSessionId: 'assets', version: 1, digest: 'a'.repeat(64), markdown: '# Image test\n\n![Existing](assets/existing.png)\n\nInline ![Inline](assets/inline.png) image.\n', locked: true });
    await tick(); await tick();
    const ownedViews = { rawImageInputs: root.querySelectorAll('.image-edit input').length, images: [...root.querySelectorAll<HTMLImageElement>('.scratch-owned-image img')].map(image => ({ src: image.getAttribute('src'), alt: image.alt })) };
    const initial = { ownedViews, drafts: sent.filter(m => m.type === 'draft'), source: pane['crepe']!.getMarkdown(), resolved: sent.filter(m => m.type === 'asset-request' && m.action === 'resolve-image') };
    root.querySelector<HTMLButtonElement>('nav button')!.click(); await tick();
    const crepe = pane['crepe']!;
    const file = new File([Uint8Array.from(atob(png), ch => ch.charCodeAt(0))], 'paste.png', { type: 'image/png' });
    const inline = await crepe.editor.action(ctx => ctx.get(inlineImageConfig.key).onUpload(file));
    const block = await crepe.editor.action(ctx => ctx.get(imageBlockConfig.key).onUpload(file));
    const display = await crepe.editor.action(ctx => ctx.get(imageBlockConfig.key).proxyDomURL!(block));
    const transfer = new DataTransfer(); transfer.items.add(file);
    const uploadedNodes = await crepe.editor.action(ctx => ctx.get(uploadConfig.key).uploader(transfer.files, ctx.get(editorViewCtx).state.schema, ctx, 0));
    const beforeFailure = crepe.getMarkdown(); fail = true;
    let failure = ''; try { await crepe.editor.action(ctx => ctx.get(inlineImageConfig.key).onUpload(file)); } catch (e) { failure = String(e); }
    const afterFailure = crepe.getMarkdown(); fail = false; cancel = true;
    root.querySelector<HTMLButtonElement>('[aria-label="Insert workspace image"]')!.click(); await tick(); await tick();
    const afterCancel = crepe.getMarkdown(); cancel = false;
    root.querySelector<HTMLButtonElement>('[aria-label="Insert workspace image"]')!.click(); await tick(); await tick();
    const pickedImage = crepe.getMarkdown();
    root.querySelector<HTMLButtonElement>('[aria-label="Insert workspace link"]')!.click(); await tick(); await tick();
    const pickedLink = crepe.getMarkdown();
    const data = new DataTransfer(); data.setData('text/plain', 'https://example.test/page');
    const paste = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }); root.querySelector('.ProseMirror')!.dispatchEvent(paste);
    const pastedUrl = crepe.getMarkdown();
    const mixed = new DataTransfer(); mixed.items.add(file); mixed.setData('text/html', '<img src="blob:clipboard-bypass">');
    const mixedPaste = new ClipboardEvent('paste', { clipboardData: mixed, bubbles: true, cancelable: true }); root.querySelector('.ProseMirror')!.dispatchEvent(mixedPaste);
    await until(() => crepe.getMarkdown().includes('assets/image_5.png') || pane['failed'], 'mixed paste applied');
    const mixedSource = crepe.getMarkdown(), mixedStatus = root.querySelector('.scratch-status')!.textContent, failedAfterMixed = pane['failed'];
    const drop = new DragEvent('drop', { dataTransfer: mixed, clientX: 20, clientY: 100, bubbles: true, cancelable: true }); root.querySelector('.ProseMirror')!.dispatchEvent(drop);
    await until(() => crepe.getMarkdown().includes('assets/image_6.png') || pane['failed'], 'drop applied');
    const droppedSource = crepe.getMarkdown(), dropStatus = root.querySelector('.scratch-status')!.textContent;
    fail = true;
    const failedMixed = new ClipboardEvent('paste', { clipboardData: mixed, bubbles: true, cancelable: true }); root.querySelector('.ProseMirror')!.dispatchEvent(failedMixed);
    await until(() => root.querySelector('.scratch-status')!.textContent!.includes('Storage unavailable'), 'failed mixed paste refused');
    const failedMixedSource = crepe.getMarkdown(); fail = false; const linkHrefs: string[] = [];
    crepe.editor.action(ctx => ctx.get(editorViewCtx).state.doc.descendants(node => { for (const mark of node.marks) if (mark.type.name === 'link') linkHrefs.push(mark.attrs['href']); }));
    const pendingRoot = document.createElement('main'); document.body.append(pendingRoot);
    const pendingMessages: ScratchEditorToHost[] = [];
    const pendingPane = new ScratchEditorPane(pendingRoot, { paneSessionId: 'pending_asset', post: message => { pendingMessages.push(message); } });
    let finishRead!: (bytes: ArrayBuffer) => void;
    try {
      await pendingPane.receive({ type: 'document-state', paneSessionId: 'pending_asset', version: 1, digest: 'b'.repeat(64), markdown: '# Pending image\n', locked: false });
      const delayedFile = new File([file], 'delayed.png', { type: 'image/png' });
      Object.defineProperty(delayedFile, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>(resolve => { finishRead = resolve; }) });
      const delayedData = new DataTransfer(); delayedData.items.add(delayedFile);
      pendingRoot.querySelector('.ProseMirror')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: delayedData, bubbles: true, cancelable: true }));
      await pendingPane.receive({ type: 'delete-prepare', paneSessionId: 'pending_asset', requestId: 'delete_pending_asset' });
      const pendingDelete = pendingMessages.find(message => message.type === 'delete-ready');
      await pendingPane.receive({ type: 'delete-release', paneSessionId: 'pending_asset', requestId: 'delete_pending_asset' });
      // Finish the owned browser read before disposal; no actor remains live.
      finishRead(await file.arrayBuffer()); await tick();
      const request = pendingMessages.find(message => message.type === 'asset-request');
      if (request?.type === 'asset-request') await pendingPane.receive({ type: 'action-error', paneSessionId: 'pending_asset', requestId: request.requestId, message: 'fixture cancellation' });
      return { pendingDelete, initial, inline, block, display, uploadedNodes: uploadedNodes.map(node => node.attrs.src), beforeFailure, failure, afterFailure, afterCancel, pickedImage, pickedLink, pastedUrl, mixedSource, mixedStatus, failedAfterMixed, droppedSource, dropStatus, dropPrevented: drop.defaultPrevented, failedMixedSource, mixedPrevented: mixedPaste.defaultPrevented, linkHrefs, pastePrevented: paste.defaultPrevented, sent: sent.filter(m => m.type !== 'draft'), drafts: sent.filter(m => m.type === 'draft') };
    } finally { await pendingPane.dispose(); }
  } finally { await pane.dispose(); }
}
void run().then(result => { const pre = document.createElement('pre'); pre.id = 'scratch-result'; pre.textContent = JSON.stringify(result); document.body.append(pre); }).catch(error => { const pre = document.createElement('pre'); pre.id = 'scratch-error'; pre.textContent = `${error}\n${error?.stack ?? ''}`; document.body.append(pre); });
