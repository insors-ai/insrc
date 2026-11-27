import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScratchDocumentController, minimalScratchEdit, scratchDigest, type ScratchTextEdit } from '../scratch-editor-provider.js';
import { ScratchRendererState } from '../scratch-editor-state.js';
import type { ScratchDraftProposal, ScratchHostToEditor } from '../scratch-editor-protocol.js';

const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));
async function until(predicate: () => boolean): Promise<void> { for (let i = 0; i < 100 && !predicate(); i++) await tick(); assert.ok(predicate(), 'expected asynchronous checkpoint'); }
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };

function harness() {
  let document = { version: 1, markdown: '# Before\n' };
  const edits: ScratchTextEdit[] = [], retained: ScratchDraftProposal[] = [], applied: ScratchDraftProposal[] = [];
  const recovery = new Map<string, ScratchDraftProposal>(), messages = new Map<string, ScratchHostToEditor[]>();
  const receives: Promise<void>[] = [], clients = new Map<string, ScratchRendererState>();
  let gate: ReturnType<typeof deferred> | undefined, failApply = false, failRetain = false, active = 0, maxActive = 0;
  const controller = new ScratchDocumentController({
    read: () => document,
    applyEdit: async edit => {
      edits.push(edit); active++; maxActive = Math.max(maxActive, active);
      try {
        const wait = gate; gate = undefined; if (wait) await wait.promise;
        if (failApply || document.version !== edit.baseVersion) return false;
        document = { version: document.version + 1, markdown: document.markdown.slice(0, edit.start) + edit.text + document.markdown.slice(edit.end) };
        controller.documentChanged(); return true;
      } finally { active--; }
    },
    retainDraft: async draft => { if (failRetain) throw new Error('disk full'); retained.push(draft); recovery.set(draft.paneSessionId, draft); },
    draftApplied: async draft => { applied.push(draft); if (recovery.get(draft.paneSessionId)?.editId === draft.editId) recovery.delete(draft.paneSessionId); },
    admit: () => ({ allowed: true }), warn: () => {},
  });
  const bind = (id: string, asyncAcks = false): ScratchRendererState => {
    const client = new ScratchRendererState(id, controller.snapshot, draft => { const result = controller.receive(id, draft); receives.push(result); void result.catch(() => {}); });
    clients.set(id, client); messages.set(id, []);
    controller.addPane(id, msg => { messages.get(id)!.push(msg); if (asyncAcks && msg.type === 'apply-ack') setImmediate(() => client.receive(msg)); else client.receive(msg); }, false);
    return client;
  };
  const draft = (seq: number, markdown: string, parentEditId?: string): ScratchDraftProposal => ({ type: 'draft', paneSessionId: 'a', draftSeq: seq, editId: `edit_${seq}`, baseVersion: 1, baseDigest: scratchDigest('# Before\n'), markdown, ...(parentEditId ? { parentEditId } : {}) });
  return { controller, edits, retained, applied, recovery, messages, bind, draft,
    get document() { return document; }, get maxActive() { return maxActive; },
    block: () => { gate = deferred(); return gate; },
    external: (markdown: string) => { document = { version: document.version + 1, markdown }; controller.documentChanged(); },
    failApply: () => { failApply = true; }, failRetain: () => { failRetain = true; },
    settle: async () => { for (let i = 0; i < 20; i++) { const batch = receives.splice(0); await Promise.allSettled(batch); await controller.flush(); await tick(); if (!receives.length) return; } throw new Error('queue did not drain'); },
  };
}

test('scratch queue serializes minimal edits and coalesces acknowledged descendants', async () => {
  const h = harness(); h.controller.addPane('a', () => {}, false);
  const gate = h.block();
  await h.controller.receive('a', h.draft(1, '# First\n')); await until(() => h.edits.length === 1);
  await h.controller.receive('a', h.draft(2, '# Second\n', 'edit_1'));
  await h.controller.receive('a', h.draft(3, '# Latest\n', 'edit_1'));
  assert.equal(h.edits.length, 1); assert.equal(h.retained.at(-1)?.draftSeq, 3);
  gate.resolve(); await h.controller.flush();
  assert.equal(h.document.markdown, '# Latest\n'); assert.equal(h.edits.length, 2); assert.equal(h.maxActive, 1);
  assert.equal(h.controller.appliedSequence('a'), 3);
  assert.deepEqual(h.edits[0], { baseVersion: 1, start: 2, end: 8, text: 'First' });
  for (const [before, after] of [['same', 'same'], ['a🙂z', 'a😀z'], ['𐀀', '𐐀'], ['begin end', 'begin middle end']]) {
    const edit = minimalScratchEdit(before!, after!, 1);
    assert.equal(before!.slice(0, edit.start) + edit.text + before!.slice(edit.end), after);
    assert.ok(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(edit.text));
  }
});

test('scratch queue retains every newer draft while an old ack promotes only the latest snapshot', async () => {
  const h = harness(), a = h.bind('a'), b = h.bind('b'), gate = h.block();
  a.edit('# First\n'); await until(() => h.edits.length === 1);
  a.edit('# Second\n'); a.edit('# Latest\n');
  await until(() => h.retained.length === 3);
  assert.equal(h.retained[1]?.apply, false); assert.equal(h.retained[2]?.apply, false);
  assert.equal(a.markdown, '# Latest\n'); assert.equal(h.recovery.get('a')?.markdown, '# Latest\n');
  gate.resolve(); await h.settle();
  assert.equal(a.markdown, '# Latest\n'); assert.equal(b.markdown, '# Latest\n');
  assert.equal(a.hasPending, false); assert.equal(a.conflicted, false); assert.equal(h.edits.length, 2);
  assert.equal(h.retained.at(-1)?.draftSeq, 3); assert.equal(h.retained.at(-1)?.apply, true);
  assert.equal(h.recovery.size, 0); assert.equal(h.maxActive, 1);
  const oldAck = h.messages.get('a')!.find(msg => msg.type === 'apply-ack')!;
  a.receive(oldAck); assert.equal(a.markdown, '# Latest\n'); assert.equal(h.edits.length, 2);
  assert.equal(h.messages.get('a')!.filter(msg => msg.type === 'document-state').length, 1, 'no self-echo snapshot');
});

test('scratch queue rejects stale, cross-session and conflicting duplicate input without reapplying', async () => {
  const h = harness(); h.controller.addPane('a', () => {}, false);
  const original = h.draft(1, '# First\n'); await h.controller.receive('a', original); await h.controller.flush();
  await h.controller.receive('a', original); assert.equal(h.edits.length, 1);
  await assert.rejects(h.controller.receive('a', { ...original, markdown: '# Changed duplicate\n' }));
  await assert.rejects(h.controller.receive('a', { ...original, paneSessionId: 'other' }));
  await assert.rejects(h.controller.receive('a', { ...original, draftSeq: 2 }));
  await assert.rejects(h.controller.receive('a', { ...original, draftSeq: 0 }));
  await h.controller.receive('a', h.draft(2, '# Stale base\n')); await h.controller.flush();
  assert.equal(h.document.markdown, '# First\n'); assert.equal(h.edits.length, 1);
  assert.equal(h.recovery.get('a')?.markdown, '# Stale base\n');
});

test('scratch queue external changes freeze pending edits and preserve both canonical and competing drafts', async () => {
  const h = harness(), a = h.bind('a'), b = h.bind('b'), gate = h.block();
  a.edit('# First\n'); await until(() => h.edits.length === 1); a.edit('# Competing draft\n');
  await until(() => h.retained.length === 2);
  h.external('# External\n'); gate.resolve(); await h.settle();
  assert.equal(h.document.markdown, '# External\n'); assert.equal(a.markdown, '# Competing draft\n');
  assert.equal(b.markdown, '# External\n'); assert.equal(h.recovery.get('a')?.markdown, '# Competing draft\n');
  assert.equal(h.controller.conflicted, true); assert.equal(a.conflicted, true);
  assert.equal(h.applied.length, 0); assert.throws(() => a.edit('# More\n'));
});

test('scratch queue does not apply without persisted receipt and lets accepted work finish after pane disposal', async () => {
  const failed = harness(); failed.controller.addPane('a', () => {}, false); failed.failRetain();
  await assert.rejects(failed.controller.receive('a', failed.draft(1, '# Draft\n'))); await failed.controller.flush();
  assert.equal(failed.edits.length, 0); assert.equal(failed.document.markdown, '# Before\n');
  const h = harness(); h.controller.addPane('a', () => {}, false); const gate = h.block();
  await h.controller.receive('a', h.draft(1, '# Accepted\n')); await until(() => h.edits.length === 1);
  h.controller.removePane('a'); gate.resolve(); await h.controller.dispose();
  assert.equal(h.document.markdown, '# Accepted\n'); assert.equal(h.recovery.size, 0);
});

test('scratch queue captured-sequence barrier waits across asynchronous ack and promotion delivery', async () => {
  const h = harness(), a = h.bind('a', true), gate = h.block();
  a.edit('# First\n'); await until(() => h.edits.length === 1);
  a.edit('# Pending two\n'); a.edit('# Latest three\n'); await until(() => h.retained.length === 3);
  let completed = false;
  const barrier = h.controller.waitForSequence('a', 3).then(snapshot => { completed = true; return snapshot; });
  gate.resolve(); await h.controller.flush(); assert.equal(completed, false);
  assert.equal((await barrier).markdown, '# Latest three\n'); await h.settle();
  assert.equal(a.hasPending, false); assert.equal(h.edits.length, 2);
  await assert.rejects(h.controller.waitForSequence('a', 99));
});

test('scratch queue shares one apply lane across competing panes without overwriting either draft', async () => {
  const h = harness(), a = h.bind('a'), b = h.bind('b'), gate = h.block();
  a.edit('# Pane A\n'); await until(() => h.edits.length === 1);
  b.edit('# Pane B\n'); await until(() => h.retained.length === 2);
  gate.resolve(); await h.settle();
  assert.equal(h.document.markdown, '# Pane A\n'); assert.equal(h.edits.length, 1); assert.equal(h.maxActive, 1);
  assert.equal(a.markdown, '# Pane A\n'); assert.equal(b.markdown, '# Pane B\n');
  assert.equal(b.conflicted, true); assert.equal(h.recovery.get('b')?.markdown, '# Pane B\n');
});

test('scratch queue reports an oversized external document without sending an oversized snapshot or writing', async () => {
  const h = harness(), a = h.bind('a');
  h.external('x'.repeat(1_048_577));
  assert.equal(h.controller.conflicted, true); assert.equal(a.conflicted, true);
  assert.equal(a.markdown, '# Before\n'); assert.equal(h.document.markdown.length, 1_048_577);
  assert.equal(h.edits.length, 0);
  assert.equal(h.messages.get('a')!.filter(msg => msg.type === 'document-state').length, 1);
});
