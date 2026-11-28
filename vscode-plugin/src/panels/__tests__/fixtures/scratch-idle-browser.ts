import { createScratchCrepe } from '../../scratch-editor-webview.js';
import { observeScratchMarkdown, SCRATCH_HOST_TRANSACTION } from '../../scratch-markdown-milkdown.js';
import { createScratchBrowserValidator } from '../../scratch-validation-client.js';
import { ScratchRendererState } from '../../scratch-editor-state.js';
import { SCRATCH_NOTE_BYTES, type ScratchDraftProposal } from '../../scratch-editor-protocol.js';
import { editorViewCtx, parserCtx, serializerCtx } from '@milkdown/kit/core';

async function run(): Promise<unknown> {
  const header = '# Performance\n\n', unit = 'Readable scratchpad text with words and spaces. ';
  const source = header + unit.repeat(Math.ceil(SCRATCH_NOTE_BYTES / unit.length)).slice(0, SCRATCH_NOTE_BYTES - header.length - 2) + 'Z\n';
  const sent: ScratchDraftProposal[] = [], state = new ScratchRendererState('idle', { version: 1, digest: 'a'.repeat(64), markdown: source }, draft => sent.push(draft));
  const root = document.createElement('main'); document.body.append(root);
  const crepe = createScratchCrepe({ root, defaultValue: source });
  let busy!: () => void;
  const workerBusy = new Promise<void>(resolve => { busy = resolve; });
  const NativeWorker = globalThis.Worker;
  globalThis.Worker = class extends NativeWorker {
    constructor(url: string | URL, options?: WorkerOptions) { super(url, options); this.addEventListener('message', event => { if (event.data?.type === 'qualification-busy') busy(); }); }
  };
  const trusted = JSON.parse(document.head.querySelector('#scratch-validator-source')!.textContent!) as string;
  // Test-only delay executes in the REAL production worker, followed by its
  // actual configured codec. No fake admission response is manufactured.
  const validator = createScratchBrowserValidator(trusted + `\n{const original=globalThis.onmessage;let first=true;globalThis.onmessage=event=>{if(first&&event.data?.type==='validate'){first=false;postMessage({type:'qualification-busy'});const end=Date.now()+3000;while(Date.now()<end){}}return original(event);};}`);
  await validator.ready;
  const timings: Array<{ phase: string; ms: number }> = [];
  let failure = '', parserCalls = 0, serializerCalls = 0;
  const observer = await observeScratchMarkdown(crepe.editor, {
    source: () => state.snapshot, stage: draft => state.stage(draft), validator,
    eligible: (seq, base) => state.hasPending && state.validating(seq, base.version, base.digest),
    failed: message => { failure = message; }, timing: (phase, ms) => timings.push({ phase, ms }),
  }, result => { if (result.kind === 'proposal') state.authorize(result.draftSeq, result.baseVersion, result.baseDigest); else failure = result.reason ?? 'Refused'; });
  await crepe.create(); observer.activate();
  try {
    crepe.editor.action(ctx => {
      const parse = ctx.get(parserCtx), serialize = ctx.get(serializerCtx);
      ctx.set(parserCtx, markdown => { parserCalls++; return parse(markdown); });
      ctx.set(serializerCtx, doc => { serializerCalls++; return serialize(doc); });
      const view = ctx.get(editorViewCtx);
      // Host initialization and selection changes must not serialize/stage.
      view.dispatch(view.state.tr.setMeta(SCRATCH_HOST_TRANSACTION, true));
    });
    const render: number[] = [];
    const edit = async (value: string): Promise<void> => {
      const before = performance.now();
      crepe.editor.action(ctx => { const view = ctx.get(editorViewCtx); view.dispatch(view.state.tr.insertText(value, view.state.doc.firstChild!.nodeSize + 1, view.state.doc.firstChild!.nodeSize + 2)); });
      await new Promise<void>(resolve => requestAnimationFrame(() => { render.push(performance.now() - before); resolve(); }));
    };
    await edit('x');
    await Promise.race([workerBusy, new Promise((_, reject) => setTimeout(() => reject(new Error('Worker did not enter real delayed validation: ' + failure + ' seq=' + state.draftSeq)), 15000))]);
    const resumedAt = performance.now();
    for (let i = 0; i < 20; i++) await edit(i % 2 ? 'x' : 'y');
    const resumedMs = performance.now() - resumedAt;
    const afterTyping = { sequence: state.draftSeq, authorized: sent.filter(d => d.apply).map(d => d.draftSeq), parserCalls, serializerCalls, rendered: root.querySelector('.ProseMirror')!.textContent!.length, firstCharacter: root.querySelector('.ProseMirror p')!.textContent![0] };
    for (let i = 0; !sent.some(d => d.apply) && !failure && i < 2000; i++) await new Promise(resolve => setTimeout(resolve, 10));
    const sorted = render.slice(1).sort((a, b) => a - b), medianRenderMs = (sorted[9]! + sorted[10]!) / 2;
    return { bytes: source.length, render, medianRenderMs, resumedMs, afterTyping, failure, authorized: sent.filter(d => d.apply).map(d => d.draftSeq), timings, parserCalls, serializerCalls };
  } finally { observer.deactivate(); await crepe.destroy(); globalThis.Worker = NativeWorker; }
}
void run().then(result => { const pre = document.createElement('pre'); pre.id = 'scratch-result'; pre.textContent = JSON.stringify(result); document.body.append(pre); })
  .catch(error => { const pre = document.createElement('pre'); pre.id = 'scratch-error'; pre.textContent = String(error); document.body.append(pre); });
