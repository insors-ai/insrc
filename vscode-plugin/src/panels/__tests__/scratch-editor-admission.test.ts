import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ScratchRendererState } from '../scratch-editor-state.js';
import { ScratchDocumentController, scratchDigest } from '../scratch-editor-provider.js';
import { ScratchRecoveryStore } from '../scratch-editor-recovery.js';
import { checkScratchMarkdownEdit, scratchSourceCodec } from '../scratch-markdown.js';
import { SCRATCH_NOTE_BYTES, type ScratchDraftProposal, type ScratchHostToEditor } from '../scratch-editor-protocol.js';

const original = 'Before\n';
const base = { version: 1, markdown: original, digest: scratchDigest(original) };

test('scratch pending drafts require exact current-generation authorization and explicit refusal', () => {
  const sent: ScratchDraftProposal[] = [];
  const state = new ScratchRendererState('pane', base, draft => sent.push(draft));
  const first = state.stage('First\n'); assert.equal(state.phase, 'waiting-idle'); assert.equal(state.conflicted, false);
  assert.equal(sent.length, 1); assert.equal(sent[0]?.apply, false);
  assert.equal(state.authorize(first, 9, base.digest), false); assert.equal(sent.length, 1);
  assert.equal(state.validating(first, base.version, base.digest), true); assert.equal(state.phase, 'validating');
  assert.equal(state.authorize(first, base.version, base.digest), true); assert.equal(state.phase, 'authorized');
  const second = state.stage('Newest\n'); assert.equal(state.phase, 'waiting-idle'); assert.equal(state.conflicted, false);
  const beforeAck = sent.length;
  const update = state.receive({ type: 'apply-ack', paneSessionId: 'pane', draftSeq: first, editId: `edit_${first}`, version: 2, markdown: 'First\n', digest: scratchDigest('First\n') });
  assert.deepEqual(update, { revalidate: true }); assert.equal(sent.length, beforeAck); assert.equal(state.markdown, 'Newest\n');
  assert.equal(state.authorize(second, base.version, base.digest), false, 'old-base proof cannot authorize the newer draft');
  assert.equal(state.authorize(first, state.snapshot.version, state.snapshot.digest), false, 'old-generation proof cannot authorize the newer draft');
  state.refuse(first, 'obsolete refusal'); assert.equal(state.conflicted, false);
  assert.equal(state.validating(second, state.snapshot.version, state.snapshot.digest), true);
  state.refuse(second, 'fidelity failed'); assert.equal(state.phase, 'conflict'); assert.equal(state.conflicted, true);
  assert.equal(state.authorize(second, state.snapshot.version, state.snapshot.digest), false); assert.equal(sent.length, beforeAck);
  assert.equal(state.markdown, 'Newest\n');
  const bounded = new ScratchRendererState('bounded', base, () => assert.fail('Oversized draft must not post'));
  assert.throws(() => bounded.stage('x'.repeat(SCRATCH_NOTE_BYTES + 1)), /limits/); assert.equal(bounded.conflicted, true);
});

test('scratch durable staged drafts do not apply until exact explicit admission and clear only after delivered ack', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'insrc-staged-admission-'));
  const uri = pathToFileURL(join(directory, 'note.md')).href;
  try {
    for (const droppedAck of [false, true]) {
      const store = new ScratchRecoveryStore(join(directory, droppedAck ? 'dropped' : 'delivered'));
      let document = { version: base.version, markdown: base.markdown }, admissionCount = 0, applyCount = 0;
      const frames: ScratchHostToEditor[] = [];
      const controller = new ScratchDocumentController({
        read: () => document,
        retainDraft: draft => store.retain(uri, draft), draftApplied: async draft => { await store.clearApplied(uri, draft); },
        admit: (source, draft) => { admissionCount++; return checkScratchMarkdownEdit(source, draft, scratchSourceCodec, scratchSourceCodec.parse(draft)); },
        applyEdit: async edit => {
          assert.equal(edit.baseVersion, document.version); applyCount++;
          document = { version: document.version + 1, markdown: document.markdown.slice(0, edit.start) + edit.text + document.markdown.slice(edit.end) };
          controller.documentChanged(); return true;
        }, warn: () => {},
      });
      controller.addPane('pane', frame => { frames.push(frame); return !(droppedAck && frame.type === 'apply-ack'); }, false);
      const staged: ScratchDraftProposal = { type: 'draft', paneSessionId: 'pane', draftSeq: 1, editId: 'edit_1', baseVersion: base.version, baseDigest: base.digest, markdown: 'After\n', apply: false };
      await controller.receive('pane', staged); await controller.flush();
      assert.equal(controller.hasPending, true); assert.equal(admissionCount, 0); assert.equal(applyCount, 0); assert.equal(document.markdown, original);
      assert.equal(frames.filter(frame => frame.type === 'receipt').length, 1); assert.equal((await store.list(uri))[0]?.draft.apply, false);
      await assert.rejects(controller.receive('pane', { ...staged, apply: true, baseVersion: 99 }), /promotion/);
      await assert.rejects(controller.receive('pane', { ...staged, apply: true, markdown: 'Different\n' }), /duplicate/);
      await controller.receive('pane', { ...staged, apply: true }); await controller.flush();
      assert.equal(applyCount, 1); assert.equal(admissionCount, 1); assert.equal(document.markdown, 'After\n');
      const recovered = await store.list(uri);
      assert.equal(recovered.length, droppedAck ? 1 : 0);
      if (droppedAck) assert.equal(recovered[0]?.draft.markdown, 'After\n');
      await controller.dispose();
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('scratch historical drafts without apply remain recoverable and never implicitly authorize native edits', async () => {
  let applies = 0, retains = 0;
  const controller = new ScratchDocumentController({ read: () => base, applyEdit: async () => { applies++; return true; }, retainDraft: async () => { retains++; }, draftApplied: async () => {}, admit: () => assert.fail('Historical recovery is not an admission request'), warn: () => {} });
  controller.addPane('pane', () => {}, false);
  await controller.receive('pane', { type: 'draft', paneSessionId: 'pane', draftSeq: 1, editId: 'edit_1', baseVersion: base.version, baseDigest: base.digest, markdown: 'Historical\n' });
  await controller.flush(); assert.equal(retains, 1); assert.equal(applies, 0); assert.equal(controller.hasPending, true);
  await controller.dispose(); assert.equal(applies, 0);
});
