import { createScratchCrepe } from '../../scratch-editor-webview.js';
import { checkScratchMarkdown, checkScratchMarkdownEdit, prepareScratchMarkdownTransaction } from '../../scratch-markdown.js';
import { scratchMilkdownCodec } from '../../scratch-markdown-milkdown.js';
import { editorViewCtx } from '@milkdown/kit/core';
import { Fragment } from '@milkdown/kit/prose/model';
import { EditorState } from '@milkdown/kit/prose/state';
import { supportedScratchMarkdown, unsupportedScratchMarkdown } from './scratch-markdown-corpus.js';

async function examine(source: string): Promise<unknown> {
  const root = document.createElement('div'); document.body.appendChild(root);
  const editor = createScratchCrepe({ root, defaultValue: source });
  await editor.create();
  try {
    const opening = editor.editor.action(ctx => prepareScratchMarkdownTransaction(source, scratchMilkdownCodec(ctx), {
      origin: 'initialization', docChanged: true, document: ctx.get(editorViewCtx).state.doc,
    }));
    editor.setReadonly(true); editor.setReadonly(false); editor.setReadonly(true);
    const selection = window.getSelection(); selection?.selectAllChildren(root); selection?.removeAllRanges();
    return editor.editor.action(ctx => {
      const codec = scratchMilkdownCodec(ctx);
      const document = codec.parse(source);
      const expected = document.copy(document.content.append(Fragment.from(document.type.schema.node('paragraph', null, document.type.schema.text('Added text.')))));
      const draft = codec.serialize(expected);
      const idle = prepareScratchMarkdownTransaction(source, codec, { origin: 'user', docChanged: false, document: ctx.get(editorViewCtx).state.doc });
      const lock = prepareScratchMarkdownTransaction(source, codec, { origin: 'host', docChanged: true, document: ctx.get(editorViewCtx).state.doc });
      const codeSource = '```ts\nconst value = 1;\n```\n';
      const codeDocument = codec.parse(codeSource);
      const position = codeDocument.textContent.indexOf('1') + 1;
      const codeEdit = EditorState.create({ doc: codeDocument, schema: codeDocument.type.schema }).tr.insertText('2', position, position + 1);
      const protectedSource = 'Before\n\n```mermaid\ngraph TD\nA --> B\n```\n\n[literal target](insrc://scratchpads/note.md#section)\n';
      const protectedDocument = codec.parse(protectedSource);
      const intended = protectedDocument.copy(protectedDocument.content.append(Fragment.from(protectedDocument.type.schema.node('paragraph', null, protectedDocument.type.schema.text('Added text.')))));
      return {
        source, opening, idle, lock,
        result: checkScratchMarkdown(source, codec),
        edit: checkScratchMarkdownEdit(source, draft, codec, expected),
        intentionalCodeEdit: checkScratchMarkdownEdit(codeSource, codec.serialize(codeEdit.doc), codec, codeEdit.doc),
        lostCode: checkScratchMarkdownEdit(protectedSource, 'Before\n\n[literal target](insrc://scratchpads/note.md#section)\n\nAdded text.\n', codec, intended),
        lostLink: checkScratchMarkdownEdit(protectedSource, 'Before\n\n```mermaid\ngraph TD\nA --> B\n```\n\nAdded text.\n', codec, intended),
      };
    });
  } finally { await editor.destroy(); root.remove(); }
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
