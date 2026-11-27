import { createScratchCrepe } from '../../scratch-editor-webview.js';
import { observeScratchMarkdown } from '../../scratch-markdown-milkdown.js';
import { ScratchRendererState } from '../../scratch-editor-state.js';
import type { ScratchDraftProposal } from '../../scratch-editor-protocol.js';
import { editorViewCtx } from '@milkdown/kit/core';

async function run(): Promise<unknown> {
  const source = '# Base\n', sent: ScratchDraftProposal[] = [];
  const state = new ScratchRendererState('pane', { version: 1, digest: 'a'.repeat(64), markdown: source }, draft => sent.push(draft));
  const root = document.createElement('main'); document.body.appendChild(root);
  const editor = createScratchCrepe({ root, defaultValue: source });
  const observer = await observeScratchMarkdown(editor.editor, () => state.snapshot.markdown, result => {
    if (result.kind === 'proposal') state.edit(result.draft);
    else throw new Error('Browser transaction did not qualify');
  });
  await editor.create(); observer.activate();
  try {
    editor.editor.action(ctx => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.insert(view.state.doc.content.size, view.state.schema.node('paragraph', null, view.state.schema.text('First edit'))));
      view.dispatch(view.state.tr.insertText(' and newer typing', view.state.doc.content.size - 1));
    });
    const first = sent[0]!;
    const beforeAck = { state: state.markdown, view: editor.getMarkdown(), drafts: sent.map(draft => ({ ...draft })) };
    const ack = { type: 'apply-ack', paneSessionId: 'pane', draftSeq: first.draftSeq, editId: first.editId, version: 2, digest: 'b'.repeat(64), markdown: first.markdown };
    const action = state.receive(ack);
    const afterAck = { state: state.markdown, view: editor.getMarkdown(), drafts: sent.map(draft => ({ ...draft })), action };
    state.receive(ack);
    return { beforeAck, afterAck, afterDuplicate: state.markdown, pending: state.hasPending, frozen: state.conflicted };
  } finally { observer.deactivate(); await editor.destroy(); }
}
void run().then(result => { const pre = document.createElement('pre'); pre.id = 'scratch-result'; pre.textContent = JSON.stringify(result); document.body.appendChild(pre); })
  .catch(error => { const pre = document.createElement('pre'); pre.id = 'scratch-error'; pre.textContent = String(error); document.body.appendChild(pre); });
