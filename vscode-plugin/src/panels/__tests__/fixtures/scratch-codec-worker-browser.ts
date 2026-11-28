import { editorViewCtx } from '@milkdown/kit/core';
import { createScratchCrepe } from '../../scratch-editor-webview.js';
import { scratchMilkdownCodec, SCRATCH_HOST_TRANSACTION } from '../../scratch-markdown-milkdown.js';
import { scratchCodecProof, scratchIntentDigest } from '../../scratch-markdown-codec.js';
import { createScratchBrowserValidator } from '../../scratch-validation-client.js';
import { checkScratchMarkdownEdit } from '../../scratch-markdown.js';
import { supportedScratchMarkdown, unsupportedScratchMarkdown } from './scratch-markdown-corpus.js';
const workerErrors: string[] = [];
const lifecycle = { created: 0, terminated: 0, urlsCreated: 0, urlsRevoked: 0 };
const RealWorker = Worker;
globalThis.Worker = class extends RealWorker {
  constructor(url: string | URL, options?: WorkerOptions) { super(url, options); lifecycle.created++; this.addEventListener('error', event => workerErrors.push(`${event.message} at ${event.lineno}:${event.colno} ${String(event.error?.stack ?? '')}`)); }
  override terminate(): void { lifecycle.terminated++; super.terminate(); }
};
const createUrl = URL.createObjectURL.bind(URL), revokeUrl = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = value => { lifecycle.urlsCreated++; return createUrl(value); };
URL.revokeObjectURL = value => { lifecycle.urlsRevoked++; revokeUrl(value); };

async function run(): Promise<unknown> {
  const violations: string[] = [];
  document.addEventListener('securitypolicyviolation', event => violations.push(event.violatedDirective));
  const bytes = JSON.parse(document.getElementById('scratch-validator-source')!.textContent!);
  const worker = createScratchBrowserValidator(bytes);
  const root = document.createElement('div'); document.body.append(root);
  const editor = createScratchCrepe({ root }); await editor.create();
  let result: unknown;
  try {
    const live = editor.editor.action(scratchMilkdownCodec);
    const view = editor.editor.action(ctx => ctx.get(editorViewCtx));
    const rows = [];
    for (const source of [...supportedScratchMarkdown, ...unsupportedScratchMarkdown, '![Exact alt](assets/image.png "caption")\n', '$x$\n\n$$\ny = 2\n$$\n', 'Entities: &copy; &NotEqualTilde; &notit; &semi; &#x1F600;\n']) {
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, live.parse(source).content).setMeta(SCRATCH_HOST_TRANSACTION, true));
      const paragraph = view.state.schema.node('paragraph', null, view.state.schema.text('Actual user transaction 😀.'));
      view.dispatch(view.state.tr.insert(view.state.doc.content.size, paragraph));
      const actual = view.state.doc;
      const draft = live.serialize(actual);
      const expectedIntent = await scratchIntentDigest(actual);
      const result = await worker.run({ source, draft, expectedIntent, baseKey: '1:' + 'a'.repeat(64), qualification: true });
      const proof = await scratchCodecProof(live, source, actual);
      const expected = checkScratchMarkdownEdit(source, draft, live, actual);
      rows.push({ schema: result.proof?.schema === proof.schema,
        serializer: result.proof?.sourceSerialized === proof.sourceSerialized && result.proof?.draftSerialized === proof.draftSerialized,
        intent: result.proof?.sourceIntent === proof.sourceIntent && result.proof?.draftIntent === proof.draftIntent,
        admission: result.allowed === expected.allowed });
    }
    const wrongIntent = await worker.run({ source: 'Safe\n', draft: 'Safe\n', expectedIntent: '0'.repeat(64), baseKey: '1:' + 'a'.repeat(64) });
    result = { rows, wrongIntent: wrongIntent.allowed, violations, lifecycle };
  } finally { worker.dispose(); await editor.destroy(); }
  let rejectedAfterDispose = false;
  try { await worker.run({ source: 'Safe\n', draft: 'Safe\n', expectedIntent: '0'.repeat(64), baseKey: '1:a' }); } catch { rejectedAfterDispose = true; }
  return { ...(result as object), rejectedAfterDispose };
}
void run().then(result => location.assign('/result?data=' + encodeURIComponent(JSON.stringify(result))),
  error => location.assign('/result?data=' + encodeURIComponent(JSON.stringify({ error: String(error), workerErrors }))));
