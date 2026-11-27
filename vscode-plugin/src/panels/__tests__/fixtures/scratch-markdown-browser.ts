import { createScratchCrepe } from '../../scratch-editor-webview.js';
import { checkScratchMarkdown, checkScratchMarkdownEdit } from '../../scratch-markdown.js';
import { scratchMilkdownCodec } from '../../scratch-markdown-milkdown.js';
import { supportedScratchMarkdown, unsupportedScratchMarkdown } from './scratch-markdown-corpus.js';

async function run(): Promise<unknown> {
  const root = document.createElement('div'); document.body.appendChild(root);
  const editor = createScratchCrepe({ root, defaultValue: '# Initial\n' });
  await editor.create();
  try {
    const results = editor.editor.action(ctx => {
      const codec = scratchMilkdownCodec(ctx);
      return {
        supported: supportedScratchMarkdown.map(source => ({ source, result: checkScratchMarkdown(source, codec), edit: checkScratchMarkdownEdit(source, source + '\nAdded text.\n', codec) })),
        unsupported: unsupportedScratchMarkdown.map(source => ({ source, result: checkScratchMarkdown(source, codec), edit: checkScratchMarkdownEdit(source, '# Lost metadata\n', codec) })),
        intentionalCodeEdit: checkScratchMarkdownEdit('```ts\nconst value = 1;\n```\n', '```ts\nconst value = 2;\n```\n', codec),
      };
    });
    const before = editor.getMarkdown();
    editor.setReadonly(true); editor.setReadonly(false); editor.setReadonly(true);
    const selection = window.getSelection(); selection?.selectAllChildren(root); selection?.removeAllRanges();
    return { ...results, before, after: editor.getMarkdown() };
  } finally { await editor.destroy(); }
}

void run().then(result => {
  const pre = document.createElement('pre'); pre.id = 'scratch-result'; pre.textContent = JSON.stringify(result); document.body.appendChild(pre);
}).catch(error => {
  const pre = document.createElement('pre'); pre.id = 'scratch-error'; pre.textContent = String(error); document.body.appendChild(pre);
});
