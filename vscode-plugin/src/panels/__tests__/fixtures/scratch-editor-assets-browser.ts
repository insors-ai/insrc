import { ScratchEditorPane } from '../../scratch-editor-webview.js';
import { editorViewCtx } from '@milkdown/kit/core';
import { imageBlockConfig } from '@milkdown/kit/component/image-block';
import { inlineImageConfig } from '@milkdown/kit/component/image-inline';
import { uploadConfig } from '@milkdown/kit/plugin/upload';
import type { ScratchEditorToHost } from '../../scratch-editor-protocol.js';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const tick = () => new Promise<void>(r => setTimeout(r, 0));
async function run() {
  const root = document.createElement('main'); document.body.append(root);
  const sent: ScratchEditorToHost[] = []; let fail = false, cancel = false, uploads = 0;
  const pane = new ScratchEditorPane(root, { paneSessionId: 'assets', post: message => {
    sent.push(message);
    if (message.type !== 'asset-request') return;
    queueMicrotask(() => { void pane.receive(fail ? { type: 'action-error', paneSessionId: 'assets', requestId: message.requestId, message: 'Storage unavailable; no reference inserted.' } : {
      type: 'asset-result', paneSessionId: 'assets', requestId: message.requestId,
      href: cancel ? '' : message.action === 'pick-link' ? '../workspace/space%20name.md' : message.action === 'resolve-image' ? message.href : `assets/image_${++uploads}.png`,
      displayUrl: `data:image/png;base64,${png}`,
    }); });
  } });
  try {
    await pane.receive({ type: 'document-state', paneSessionId: 'assets', version: 1, digest: 'a'.repeat(64), markdown: '# Image test\n\n![Existing](assets/existing.png)\n', locked: true });
    await tick(); await tick();
    const initial = { drafts: sent.filter(m => m.type === 'draft'), source: pane['crepe']!.getMarkdown(), resolved: sent.filter(m => m.type === 'asset-request' && m.action === 'resolve-image') };
    root.querySelector<HTMLButtonElement>('nav button')!.click();
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
    for (let turn = 0; turn < 20; turn++) await tick();
    const mixedSource = crepe.getMarkdown();
    const drop = new DragEvent('drop', { dataTransfer: mixed, clientX: 20, clientY: 100, bubbles: true, cancelable: true }); root.querySelector('.ProseMirror')!.dispatchEvent(drop);
    for (let turn = 0; turn < 20; turn++) await tick();
    const droppedSource = crepe.getMarkdown();
    fail = true;
    const failedMixed = new ClipboardEvent('paste', { clipboardData: mixed, bubbles: true, cancelable: true }); root.querySelector('.ProseMirror')!.dispatchEvent(failedMixed);
    for (let turn = 0; turn < 20; turn++) await tick();
    const failedMixedSource = crepe.getMarkdown(); fail = false; const linkHrefs: string[] = [];
    crepe.editor.action(ctx => ctx.get(editorViewCtx).state.doc.descendants(node => { for (const mark of node.marks) if (mark.type.name === 'link') linkHrefs.push(mark.attrs['href']); }));
    return { initial, inline, block, display, uploadedNodes: uploadedNodes.map(node => node.attrs.src), beforeFailure, failure, afterFailure, afterCancel, pickedImage, pickedLink, pastedUrl, mixedSource, droppedSource, dropPrevented: drop.defaultPrevented, failedMixedSource, mixedPrevented: mixedPaste.defaultPrevented, linkHrefs, pastePrevented: paste.defaultPrevented, sent: sent.filter(m => m.type !== 'draft'), drafts: sent.filter(m => m.type === 'draft') };
  } finally { await pane.dispose(); }
}
void run().then(result => { const pre = document.createElement('pre'); pre.id = 'scratch-result'; pre.textContent = JSON.stringify(result); document.body.append(pre); }).catch(error => { const pre = document.createElement('pre'); pre.id = 'scratch-error'; pre.textContent = `${error}\n${error?.stack ?? ''}`; document.body.append(pre); });
