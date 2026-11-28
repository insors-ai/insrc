import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScratchMarkdownVerifier, scratchSourceCodec, checkScratchMarkdownEdit } from '../scratch-markdown.js';
import { ScratchDocumentController, scratchDigest, type ScratchTextEdit } from '../scratch-editor-provider.js';
import { ScratchRendererState } from '../scratch-editor-state.js';
import type { ScratchDraftProposal, ScratchHostToEditor } from '../scratch-editor-protocol.js';
import { createScratchHostValidator } from '../scratch-validation-host.js';
import { scratchHostWorkerBytes } from './fixtures/scratch-host-worker-bundle.js';
import { supportedScratchMarkdown, unsupportedScratchMarkdown } from './fixtures/scratch-markdown-corpus.js';

const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve!: (value: {allowed: boolean}) => void; let reject!: (error: Error) => void; const promise = new Promise<{allowed: boolean}>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
async function until(check: () => boolean): Promise<void> { for (let i = 0; !check() && i < 100; i++) await tick(); assert.ok(check(), 'host validation checkpoint'); }

test('Independent background host admission verified-base cache and stale apply recheck', async () => {
  const source = '# Before\n', draft = '# After\n', parse = scratchSourceCodec.parse;
  const calls = new Map<string, number>();
  scratchSourceCodec.parse = text => { calls.set(text, (calls.get(text) ?? 0) + 1); return parse(text); };
  try {
    const verifier = new ScratchMarkdownVerifier(scratchSourceCodec), key = `1:${scratchDigest(source)}`;
    const check = (base: string, next: string, identity: string) => {
      const job = verifier.job(base, identity), expected = job.validation.parse(next);
      const result = job.validation.edit(base, next, expected); job.retainBase(); return result;
    };
    assert.equal(check(source, draft, key).allowed, true);
    assert.ok([...calls.values()].every(count => count === 1), 'Each distinct input is parsed once, shared by all assertions');
    calls.clear(); assert.equal(check(source, '# Latest\n', key).allowed, true); assert.equal(calls.has(source), false, 'Exact verified immutable base is reused');
    calls.clear(); assert.equal(check(source, draft, `2:${scratchDigest(source)}`).allowed, true); assert.equal(calls.get(source), 1, 'Version changes invalidate even equal bytes');
    calls.clear(); verifier.invalidate(); assert.equal(check(source, draft, key).allowed, true); assert.equal(calls.get(source), 1, 'External invalidation clears the cache');
    calls.clear(); assert.equal(check('# Different\n', draft, key).allowed, true); assert.equal(calls.get('# Different\n'), 1, 'Matching identity never substitutes for exact source bytes');
    const invalid = '---\ntitle: preserve\n---\n';
    assert.equal(check(invalid, draft, '3:invalid').allowed, false);
    calls.clear(); assert.equal(check(invalid, draft, '3:invalid').allowed, false); assert.equal(calls.get(invalid), 1, 'Refused bases never enter cache');
    const stale = verifier.job(source, key); stale.validation.check(source); verifier.invalidate(); stale.retainBase();
    calls.clear(); assert.equal(check(source, draft, key).allowed, true); assert.equal(calls.get(source), 1, 'An invalidated in-progress job cannot repopulate cache');
    calls.clear(); const replacement = new ScratchMarkdownVerifier(scratchSourceCodec).job(source, key); replacement.validation.check(source); assert.equal(calls.get(source), 1, 'Executor replacement has no transferred cache');
    calls.clear(); const configuredCalls = new Map<string, number>();
    const configured = { ...scratchSourceCodec, parse: (text: string) => { configuredCalls.set(text, (configuredCalls.get(text) ?? 0) + 1); return parse(text); } };
    const separate = new ScratchMarkdownVerifier(configured).job(source, key);
    assert.equal(separate.validation.edit(source, draft, separate.validation.parse(draft)).allowed, true); separate.retainBase();
    assert.ok([...configuredCalls.values()].every(count => count === 1));
    assert.ok(calls.size > 0 && [...calls.values()].every(count => count === 1), 'Configured and independent parsers each parse unique bytes once');

  } finally { scratchSourceCodec.parse = parse; }

  for (const outcome of ['external', 'superseded', 'superseded-error', 'failure', 'locked', 'closed'] as const) {
    let document = { version: 1, markdown: source }, cleared = 0;
    const admission = deferred(), edits: ScratchTextEdit[] = [], received: Promise<void>[] = [], sent: ScratchHostToEditor[] = [];
    const retained: ScratchDraftProposal[] = [];
    let starts = 0;
    const controller = new ScratchDocumentController({
      read: () => document, admit: () => { starts++; return starts === 1 ? admission.promise : Promise.resolve({allowed: true}); },
      applyEdit: async edit => { edits.push(edit); document = { version: document.version + 1, markdown: document.markdown.slice(0, edit.start) + edit.text + document.markdown.slice(edit.end) }; controller.documentChanged(); return true; },
      retainDraft: async value => { retained.push(value); }, draftApplied: async () => { cleared++; }, warn: () => {},
    });
    const state = new ScratchRendererState('host', controller.snapshot, value => { const p = controller.receive('host', value); received.push(p); void p.catch(() => {}); });
    controller.addPane('host', message => { sent.push(message); state.receive(message); }, false);
    const seq = state.stage(draft); state.authorize(seq, state.snapshot.version, state.snapshot.digest);
    await until(() => starts === 1);
    const waiter = controller.waitForSequence('host', 1, 1000).then(() => 'resolved', () => 'rejected');
    if (outcome === 'external') { document = { version: 2, markdown: '# External\n' }; controller.documentChanged(); }
    if (outcome.startsWith('superseded')) state.stage('# Latest\n');
    if (outcome === 'locked') controller.setLocked('host', true);
    if (outcome === 'closed') controller.removePane('host');
    if (outcome === 'failure' || outcome === 'superseded-error') admission.reject(new Error('worker failed'));
    else admission.resolve({ allowed: true });
    await controller.flush();
    assert.equal(edits.length, 0, outcome); assert.equal(cleared, 0, outcome); assert.ok(retained.length >= 1);
    if (outcome.startsWith('superseded')) {
      assert.equal(state.conflicted, false); assert.match(state.markdown, /Latest/);
      const cancelled = sent.find(m => m.type === 'admission-superseded'); assert.ok(cancelled);
      assert.equal(state.phase, 'waiting-idle');
      const base = state.snapshot;
      assert.equal(state.validating(state.draftSeq, base.version, base.digest), true);
      assert.equal(state.authorize(state.draftSeq, base.version, base.digest), true, 'Exact cancelled own-parent identity may be freshly authorized');
      await Promise.all(received); await controller.flush();
      assert.equal(edits.length, 1); assert.equal(document.markdown, '# Latest\n'); assert.equal(state.hasPending, false);
      assert.equal(await waiter, 'resolved');
    } else assert.equal(await waiter, 'rejected', outcome);
    await controller.dispose();
  }
});

test('Host executor fidelity corpus parity and failure recovery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scratch-host-worker-'));
  const file = join(dir, 'worker.cjs'); await writeFile(file, await scratchHostWorkerBytes());
  const executor = createScratchHostValidator(file);
  try {
    await executor.client.ready;
    let version = 0;
    for (const source of [...supportedScratchMarkdown, ...unsupportedScratchMarkdown]) {
      const draft = source + (source.includes('\r\n') ? '\r\nAdded text.\r\n' : '\nAdded text.\n');
      const expected = checkScratchMarkdownEdit(source, draft, scratchSourceCodec, scratchSourceCodec.parse(draft));
      const result = await executor.client.run({ source, draft, baseKey: `${++version}:${scratchDigest(source)}` });
      assert.equal(result.allowed, expected.allowed, source);
      if (!expected.allowed) assert.equal(result.reason, expected.reason);
    }
    executor.client.invalidateBase();
    const before = performance.now();
    const huge = '# Full\n\n' + 'Word '.repeat(180000) + '\n';
    const active = executor.client.run({ source: huge, draft: huge.replace('Word', 'Next'), baseKey: `100:${scratchDigest(huge)}` });
    // Event loop remains responsive while the real independent parser works.
    await tick(); assert.ok(performance.now() - before < 150);
    const pending = assert.rejects(active, /disposed/);
    await executor.dispose(); await pending;
    await assert.rejects(executor.client.run({source:'# A\n',draft:'# B\n',baseKey:'101:closed'}), /unavailable/);
    const broken = createScratchHostValidator(join(dir, 'missing.cjs'));
    await assert.rejects(broken.client.ready, /failed/); await broken.dispose();
    const replacement = createScratchHostValidator(file);
    try { await replacement.client.ready; assert.equal((await replacement.client.run({ source: '# A\n', draft: '# B\n', baseKey: '1:fresh' })).allowed, true); }
    finally { await replacement.dispose(); }
  } finally { await executor.dispose(); await rm(dir, {recursive:true,force:true}); }
});


test('scratch host cancellation cannot reopen a current or mismatched authorization', () => {
  const state = new ScratchRendererState('cancel', {version: 1, digest: 'a'.repeat(64), markdown: '# Base\n'}, () => {});
  const first = state.stage('# First\n'); state.authorize(first, 1, 'a'.repeat(64));
  const cancelled = {type: 'admission-superseded', paneSessionId: 'cancel', draftSeq: 1, editId: 'edit_1', baseVersion: 1, baseDigest: 'a'.repeat(64)};
  assert.deepEqual(state.receive(cancelled), {}); assert.equal(state.phase, 'authorized', 'No newer generation exists');
  state.stage('# Latest\n');
  for (const wrong of [{...cancelled, paneSessionId:'other'}, {...cancelled, editId:'edit_2'}, {...cancelled, baseVersion:2}, {...cancelled, baseDigest:'b'.repeat(64)}]) assert.deepEqual(state.receive(wrong), {});
  assert.equal(state.authorize(2, 1, 'a'.repeat(64)), false, 'Mismatched cancellation cannot release apply lane');
  assert.deepEqual(state.receive(cancelled), {revalidate:true});
  assert.deepEqual(state.receive(cancelled), {});
  assert.equal(state.authorize(2, 1, 'a'.repeat(64)), true);
  assert.deepEqual(state.receive(cancelled), {}); assert.equal(state.phase, 'authorized');
  state.receive({type:'apply-ack',paneSessionId:'cancel',draftSeq:2,editId:'edit_2',version:2,digest:'b'.repeat(64),markdown:'# Latest\n'});
  assert.equal(state.hasPending, false); assert.deepEqual(state.receive({...cancelled,draftSeq:2,editId:'edit_2',baseVersion:2,baseDigest:'b'.repeat(64)}), {});
});
