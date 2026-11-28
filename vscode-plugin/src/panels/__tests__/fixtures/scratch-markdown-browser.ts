import { createScratchBrowserValidator } from '../../scratch-validation-client.js';
import { createScratchCrepe } from '../../scratch-editor-webview.js';
import { checkScratchMarkdown, checkScratchMarkdownEdit, prepareScratchMarkdownTransaction } from '../../scratch-markdown.js';
import { observeScratchMarkdown, scratchMilkdownCodec, type ScratchObservedDraft } from '../../scratch-markdown-milkdown.js';
import { editorViewCtx } from '@milkdown/kit/core';
import { Fragment } from '@milkdown/kit/prose/model';
import { EditorState, Selection } from '@milkdown/kit/prose/state';
import { supportedScratchMarkdown, unsupportedScratchMarkdown } from './scratch-markdown-corpus.js';

async function examine(source: string): Promise<unknown> {
  const root = document.createElement('div'); document.body.appendChild(root);
  const editor = createScratchCrepe({ root, defaultValue: source });
  const observed: ScratchObservedDraft[] = [];
  const validator = createScratchBrowserValidator(JSON.parse(document.head.querySelector('#scratch-validator-source')!.textContent!));
  await validator.ready;
  let sequence = 0;
  const observer = await observeScratchMarkdown(editor.editor, { source: () => ({ version: 1, digest: 'a'.repeat(64), markdown: source }), stage: () => ++sequence, eligible: seq => seq === sequence, validator, failed: message => { throw new Error(message); } }, draft => observed.push(draft));
  await editor.create();
  try {
    const openingEvents = [...observed];
    observer.activate();
    editor.setReadonly(true); editor.setReadonly(false); editor.setReadonly(true);
    const selection = window.getSelection(); selection?.selectAllChildren(root); selection?.removeAllRanges();
    editor.editor.action(ctx => { const view = ctx.get(editorViewCtx); view.dispatch(view.state.tr.setSelection(Selection.atStart(view.state.doc))); });
    await new Promise(resolve => setTimeout(resolve, 50));
    const quietEvents = [...observed];
    editor.setReadonly(false);
    editor.editor.action(ctx => {
      const view = ctx.get(editorViewCtx);
      const paragraph = view.state.schema.node('paragraph', null, view.state.schema.text('Added text.'));
      view.dispatch(view.state.tr.insert(view.state.doc.content.size, paragraph));
    });
    for (let i = 0; !observed.length && i < 1000; i++) await new Promise(resolve => setTimeout(resolve, 10));
    if (!observed.length) throw new Error('Idle corpus validation did not settle');
    return editor.editor.action(ctx => {
      const codec = scratchMilkdownCodec(ctx);
      const document = codec.parse(source);
      const expected = document.copy(document.content.append(Fragment.from(document.type.schema.node('paragraph', null, document.type.schema.text('Added text.')))));
      const prepared = prepareScratchMarkdownTransaction(source, codec, { origin: 'user', docChanged: true, document: expected });
      const draft = prepared.kind === 'unchanged' ? source : prepared.draft;
      const codeSource = '```ts\nconst value = 1;\n```\n';
      const codeDocument = codec.parse(codeSource);
      const position = codeDocument.textContent.indexOf('1') + 1;
      const codeEdit = EditorState.create({ doc: codeDocument, schema: codeDocument.type.schema }).tr.insertText('2', position, position + 1);
      const protectedSource = 'Before\n\n```mermaid\ngraph TD\nA --> B\n```\n\n[literal target](insrc://scratchpads/note.md#section)\n';
      const protectedDocument = codec.parse(protectedSource);
      const intended = protectedDocument.copy(protectedDocument.content.append(Fragment.from(protectedDocument.type.schema.node('paragraph', null, protectedDocument.type.schema.text('Added text.')))));
      return {
        source, openingEvents, quietEvents, userEvents: [...observed], retainedSource: source,
        result: checkScratchMarkdown(source, codec),
        edit: checkScratchMarkdownEdit(source, draft, codec, expected),
        intentionalCodeEdit: checkScratchMarkdownEdit(codeSource, codec.serialize(codeEdit.doc), codec, codeEdit.doc),
        lostCode: checkScratchMarkdownEdit(protectedSource, 'Before\n\n[literal target](insrc://scratchpads/note.md#section)\n\nAdded text.\n', codec, intended),
        lostLink: checkScratchMarkdownEdit(protectedSource, 'Before\n\n```mermaid\ngraph TD\nA --> B\n```\n\nAdded text.\n', codec, intended),
      };
    });
  } finally { observer.deactivate(); await editor.destroy(); root.remove(); }
}

async function run(): Promise<unknown> {
  const supported: unknown[] = [], unsupported: unknown[] = [];
  for (const source of supportedScratchMarkdown) supported.push(await examine(source));
  for (const source of unsupportedScratchMarkdown) unsupported.push(await examine(source));
  return { supported, unsupported };
}
void run().then(result => {
  const pre = document.createElement('pre'); pre.id = 'scratch-result'; pre.textContent = JSON.stringify(result); document.body.appendChild(pre);
}).catch(error => {
  const pre = document.createElement('pre'); pre.id = 'scratch-error'; pre.textContent = String(error); document.body.appendChild(pre);
});
