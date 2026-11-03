import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoryError } from '../errors.js';
import type { Json } from '../types.js';
import { makeRow, namespaceKey, STORE_LIMITS } from '../store/codec.js';
import { loadProtections } from '../store/barriers.js';
import { canonical, evidenceId, subjectKeyHash } from '../store/plan.js';
import type { CurrentPayload, ForgetSelector } from '../store/types.js';
import { nativeTest } from './fixtures/node22.js';
import { finalCommand, forgetPlan, framePlan, integrationFixture } from './fixtures/store-integration.js';
import { epoch, profile, scope } from './fixtures/store-rows.js';
import { planFixture } from './fixtures/store-plans.js';

const denied = (code: string) => (e: unknown) => e instanceof MemoryError && e.code === code;
const broadTargets: ForgetSelector[] = [{ kind: 'project' }, { kind: 'session', sessionId: 'source-session' }, { kind: 'conversation', producerId: 'codex', sessionId: 'source-session' }];
const projectScope = { projectId: scope.projectId };
const sameReceipt = (a: unknown, b: unknown) => assert.equal(canonical(a), canonical(b));

nativeTest(import.meta.url, 'store-barriers-unseen-pending-plans-terminalize-without-effects-after-broad-forget', async () => {
  for (const selector of broadTargets) {
    const f = await integrationFixture();
    try {
      const command = finalCommand('old-' + selector.kind, { scope: { ...scope, sessionId: 'visibility-session' } });
      const a = await f.append(command), planned = framePlan(a, '0', 100, 'unseen-until-after-forget');
      assert.equal((await f.store.validateFrameEligibility(a)).eligible, true);
      assert.equal((await f.rows()).some(row => row.rowKind === 'current'), false);
      const b = await f.append(finalCommand('forget-' + selector.kind, { scope: projectScope, kind: 'forget', input: { target: selector as unknown as Json } }));
      f.clock(200); await f.store.commit(forgetPlan(b, '0', 200, selector));
      const before = canonical(await f.rows()), protection = await f.store.validateFrameEligibility(a);
      assert.equal(protection.eligible, false); assert.equal(protection.rejectedByTombstoneIds.length, 1);
      assert.equal(canonical(await f.rows()), before, 'pre-inference guard is read-only');
      let modelCalls = 0;
      if (protection.eligible) modelCalls++; // Future-worker ordering harness only.
      assert.equal(modelCalls, 0);
      // This plan was computed before the forget and has stale generation/brand-new
      // domain IDs. The in-lane barrier wins without consulting a current-ID scan.
      f.clock(300); const receipt = await f.store.commit(planned);
      assert.equal(receipt.state, 'failed'); assert.equal(receipt.errorCode, 'POLICY_DENIED'); assert.equal(receipt.generation, '2');
      const rows = await f.rows();
      assert.equal(rows.filter(row => ['current', 'revision', 'source', 'evidence'].includes(row.rowKind)).length, 0);
      const proof = rows.find(row => row.rowKind === 'receipt' && row.operationId === a.operationId)!;
      if (proof.rowKind !== 'receipt') throw Error('proof');
      assert.deepEqual(proof.payload.rejectedByTombstoneIds, protection.rejectedByTombstoneIds);
      assert.equal(proof.payload.affectedRevisions.length, 0); assert.equal(proof.payload.sourceIds.length, 0);
      const marker = rows.find(row => row.rowKind === 'tombstone')!;
      if (marker.rowKind !== 'tombstone') throw Error('marker');
      assert.equal(marker.payload.cutoffSequence, b.sequence); assert.equal(marker.payload.queueId, a.queueId); assert.equal(marker.payload.mode, 'closed-lifecycle');
      assert.equal(JSON.stringify(rows).includes('Keep tests deterministic.'), false);
      await f.queue.markResolved(a.operationId, receipt.generation!); await f.queue.markResolved(b.operationId, '1');
      await f.queue.recycleResolvedSegments(); assert.equal(f.queue.index.size, 0);
      await f.reopen();
      assert.equal((await f.store.validateFrameEligibility(a)).eligible, false);
      const generation = (await f.store.readRoot()).generation;
      sameReceipt(await f.store.commit(planned), receipt); sameReceipt(await f.admission.append(command), receipt);
      assert.equal((await f.store.readRoot()).generation, generation, 'exact old proof never reactivates effects');
    } finally { await f.close(); }
  }
});
nativeTest(import.meta.url, 'store-barriers-selectors-distinguish-source-lifecycle-visibility-producer-and-project', async () => {
  for (const selector of broadTargets) {
    const f = await integrationFixture();
    try {
      const b = await f.append(finalCommand('close-' + selector.kind, { scope: projectScope, kind: 'forget', input: { target: selector as unknown as Json } }));
      await f.store.commit(forgetPlan(b, '0', 100, selector));
      const codex = await f.append(finalCommand('codex', { scope: { ...scope, sessionId: 'different-visibility' } }));
      assert.equal((await f.store.validateFrameEligibility(codex)).eligible, false);
      const claude = await f.append(finalCommand('claude', { producerId: 'claude' }));
      assert.equal((await f.store.validateFrameEligibility(claude)).eligible, selector.kind === 'conversation');
      const otherProject = await f.append(finalCommand('other-project', { scope: { projectId: 'other-project', branch: 'main' } }));
      assert.equal((await f.store.validateFrameEligibility(otherProject)).eligible, true);
      const unrelatedSession = await f.append(finalCommand('not-visibility', { kind: 'forget', scope: projectScope, input: { target: { kind: 'session', sessionId: 'visibility-only-name' } } }));
      await f.store.commit(forgetPlan(unrelatedSession, '1', 100, { kind: 'session', sessionId: 'visibility-only-name' }));
      const visibility = await f.append(finalCommand('visibility-only', { producerId: 'claude', scope: { ...scope, sessionId: 'visibility-only-name' } }));
      assert.equal((await f.store.validateFrameEligibility(visibility)).eligible, selector.kind === 'conversation', 'Scope.sessionId is not SourceIdentity.sessionId');
    } finally { await f.close(); }
  }
});
nativeTest(import.meta.url, 'store-barriers-higher-sequence-stays-closed-and-only-host-registered-new-lifecycle-resumes', async () => {
  for (const selector of broadTargets) {
    const f = await integrationFixture();
    try {
      const b = await f.append(finalCommand('close', { scope: projectScope, kind: 'forget', input: { target: selector as unknown as Json } }));
      await f.store.commit(forgetPlan(b, '0', 100, selector));
      const lateCommand = finalCommand('larger-sequence'), late = await f.append(lateCommand);
      assert.ok(BigInt(late.sequence) > BigInt(b.sequence)); assert.equal((await f.store.validateFrameEligibility(late)).eligible, false);
      f.clock(200); const latePlan = framePlan(late, '1', 200, 'late-new-id'), failed = await f.store.commit(latePlan);
      assert.equal(failed.errorCode, 'POLICY_DENIED');
      const before = canonical(f.queue.writer.current);
      await assert.rejects(f.admission.append(finalCommand('forged-new-session', { sessionId: 'unregistered' })), denied('POLICY_DENIED'));
      await assert.rejects(f.admission.append(finalCommand('forged-producer', { producerId: 'unregistered' })), denied('POLICY_DENIED'));
      assert.equal(canonical(f.queue.writer.current), before);
      if (selector.kind === 'project') f.epoch(scope.projectId, 'explicit-new-epoch');
      else f.register('codex', 'explicit-new-session');
      const freshCommand = finalCommand('explicit-new-event', { sessionId: selector.kind === 'project' ? 'source-session' : 'explicit-new-session' });
      const fresh = await f.append(freshCommand); assert.equal((await f.store.validateFrameEligibility(fresh)).eligible, true);
      if (selector.kind === 'project') assert.notEqual(fresh.scopeEpoch, late.scopeEpoch);
      else assert.notEqual(fresh.command.source.sessionId, late.command.source.sessionId);
      f.clock(300); assert.equal((await f.store.commit(framePlan(fresh, '2', 300, 'new-lifecycle'))).state, 'committed');
      const rows = await f.rows(); assert.equal(rows.filter(row => row.rowKind === 'tombstone').length, 1);
      assert.equal(rows.filter(row => row.rowKind === 'current').length, 1);
      assert.equal((await f.store.validateFrameEligibility(late)).eligible, false);
      sameReceipt(await f.store.commit(latePlan), failed);
      if (selector.kind === 'project') await assert.rejects(f.admission.append(lateCommand), denied('REVISION_CONFLICT'));
      else sameReceipt(await f.admission.append(lateCommand), failed);
      await f.reopen(); assert.equal((await f.store.validateFrameEligibility(late)).eligible, false);
    } finally { await f.close(); }
  }
});
nativeTest(import.meta.url, 'store-barriers-new-frame-cannot-carry-evidence-from-a-closed-source-lifecycle', async () => {
  const f = await integrationFixture();
  try {
    const a = await f.append(finalCommand('original')), original = framePlan(a, '0', 100, 'shared-rule');
    const originalReceipt = await f.store.commit(original);
    const oldCurrent = original.rows.find(row => row.rowKind === 'current')!, oldSource = original.rows.find(row => row.rowKind === 'source')!;
    if (oldCurrent.rowKind !== 'current' || oldSource.rowKind !== 'source') throw Error('fixtures');
    const selector: ForgetSelector = { kind: 'session', sessionId: a.command.source.sessionId };
    const b = await f.append(finalCommand('forget-original-session', { scope: projectScope, kind: 'forget', input: { target: selector as unknown as Json } }));
    f.clock(200); await f.store.commit(forgetPlan(b, '1', 200, selector));
    f.register('codex', 'fresh-source');
    const c = await f.append(finalCommand('new-authorized', { sessionId: 'fresh-source' }));
    assert.equal((await f.store.validateFrameEligibility(c)).eligible, true);
    f.clock(300); const candidate = framePlan(c, '2', 300, 'shared-rule');
    const newCurrent = candidate.rows.find(row => row.rowKind === 'current')!;
    if (newCurrent.rowKind !== 'current') throw Error('fixture');
    const current: CurrentPayload = { ...newCurrent.payload, createdAt: oldCurrent.payload.createdAt, sourceIds: [...oldCurrent.payload.sourceIds, ...newCurrent.payload.sourceIds], authority: { ...newCurrent.payload.authority, sourceIds: [...oldCurrent.payload.authority.sourceIds, ...newCurrent.payload.authority.sourceIds] } };
    const rows = candidate.rows.map(row => row.rowKind === 'current' ? makeRow('current', scope, epoch, current, profile, [1, 0], '3') : row.rowKind === 'revision' ? makeRow('revision', scope, epoch, { ...row.payload, predecessorRevisionId: oldCurrent.payload.revisionId, mutationReason: { code: 'evidence-added', explanation: 'Carry old evidence.' }, snapshot: current }, profile) : row);
    const ns = namespaceKey(scope, epoch);
    rows.push(makeRow('evidence', scope, epoch, { schemaVersion: 1, evidenceId: evidenceId(ns, current.revisionId, oldSource.payload.sourceId, 'supports'), memoryId: current.memoryId, revisionId: current.revisionId, sourceId: oldSource.payload.sourceId, sourceContentHash: oldSource.payload.contentHash, relation: 'supports', createdByOperationId: c.operationId }, profile));
    const plan = { ...candidate, expectedRevisions: { [current.memoryId]: oldCurrent.payload.revisionId }, rows };
    const failed = await f.store.commit(plan); assert.equal(failed.state, 'failed'); assert.equal(failed.errorCode, 'POLICY_DENIED');
    const after = await f.rows(); assert.equal(after.filter(row => row.rowKind === 'source').length, 1);
    assert.equal(after.filter(row => row.rowKind === 'revision').length, 1);
    assert.equal(canonical(after.find(row => row.rowKind === 'current')), canonical(oldCurrent));
    sameReceipt(await f.store.commit(original), originalReceipt);
  } finally { await f.close(); }
});
nativeTest(import.meta.url, 'store-barriers-control-syntax-scope-and-frame-authority-fail-before-mutation', async () => {
  const f = await integrationFixture();
  try {
    const selector: ForgetSelector = { kind: 'session', sessionId: 'source-session' };
    const narrow = await f.append(finalCommand('narrow-broad-forget', { kind: 'forget', input: { target: selector as unknown as Json } }));
    await assert.rejects(f.store.commit(forgetPlan(narrow, '0', 100, selector)), denied('POLICY_DENIED'));
    assert.equal((await f.store.readRoot()).generation, '0');
    const malformed = await f.append(finalCommand('malformed-selector', { scope: projectScope, kind: 'forget', input: { target: { kind: 'session', sessionId: 'source-session', extra: true } } }));
    await assert.rejects(f.store.validateFrameEligibility(malformed), denied('STORE_UNAVAILABLE'));
    await assert.rejects(f.store.commit(forgetPlan(malformed, '0', 100, selector)), denied('INVALID_REQUEST'));
    await assert.rejects(f.store.validateFrameEligibility({ ...narrow, checksum: '0'.repeat(64) }), denied('STORE_UNAVAILABLE'));
    assert.equal((await f.rows()).length, 1);
  } finally { await f.close(); }
});
nativeTest(import.meta.url, 'store-barriers-exact-memory-source-subject-protect-qualified-lineage-without-broadening', async () => {
  for (const kind of ['memory', 'source', 'subject'] as const) {
    const f = await integrationFixture();
    try {
      const a = await f.append(finalCommand('original')), original = framePlan(a, '0', 100, 'exact-rule');
      const initialReceipt = await f.store.commit(original);
      const old = original.rows.find(row => row.rowKind === 'current')!, source = original.rows.find(row => row.rowKind === 'source')!;
      if (old.rowKind !== 'current' || source.rowKind !== 'source') throw Error('fixture');
      const selector: ForgetSelector = kind === 'memory' ? { kind, memoryId: old.payload.memoryId } : kind === 'source' ? { kind, sourceId: source.payload.sourceId } : { kind, subjectKeyHash: subjectKeyHash(old.payload.assertion.subject, old.payload.assertion.category) };
      const b = await f.append(finalCommand('forget-exact', { kind: 'forget', input: { target: selector as unknown as Json } }));
      f.clock(200); await f.store.commit(forgetPlan(b, '1', 200, selector));
      const c = await f.append(finalCommand('later-correction', { kind: 'correct' }));
      f.clock(300); const candidate = framePlan(c, '2', 300, 'exact-rule');
      const replacement = candidate.rows.find(row => row.rowKind === 'current')!;
      if (replacement.rowKind !== 'current') throw Error('fixture');
      const current: CurrentPayload = { ...replacement.payload, createdAt: old.payload.createdAt, sourceIds: [...old.payload.sourceIds, ...replacement.payload.sourceIds], authority: { ...replacement.payload.authority, sourceIds: [...old.payload.authority.sourceIds, ...replacement.payload.authority.sourceIds] } };
      const rows = candidate.rows.map(row => row.rowKind === 'current' ? makeRow('current', scope, epoch, current, profile, [1, 0], '3') : row.rowKind === 'revision' ? makeRow('revision', scope, epoch, { ...row.payload, predecessorRevisionId: old.payload.revisionId, mutationReason: { code: 'evidence-added', explanation: 'Carried source.' }, snapshot: current }, profile) : row);
      rows.push(makeRow('evidence', scope, epoch, { schemaVersion: 1, evidenceId: evidenceId(namespaceKey(scope, epoch), current.revisionId, source.payload.sourceId, 'supports'), memoryId: current.memoryId, revisionId: current.revisionId, sourceId: source.payload.sourceId, sourceContentHash: source.payload.contentHash, relation: 'supports', createdByOperationId: c.operationId }, profile));
      const before = canonical(await f.rows());
      await assert.rejects(f.store.commit({ ...candidate, rows, expectedRevisions: { [current.memoryId]: old.payload.revisionId } }), denied('REVISION_CONFLICT'));
      assert.equal(canonical(await f.rows()), before);
      sameReceipt(await f.store.commit(original), initialReceipt);
      const otherBranch = await f.append(finalCommand('unrelated-branch', { scope: { ...scope, branch: 'other' } }));
      assert.equal((await f.store.commit(framePlan(otherBranch, '2', 300, 'other-rule'))).state, 'committed');
      await f.reopen(); assert.equal((await f.rows()).filter(row => row.rowKind === 'tombstone').length, 1);
    } finally { await f.close(); }
  }
});
test('store-barriers-protection-overflow-is-explicit-before-partial-matching', async () => {
  const f = planFixture();
  await assert.rejects(loadProtections(f.plan.frame, f.root, profile, { async get() { return null; }, async tombstones() { return Array(STORE_LIMITS.maxReferences + 1).fill(null); } }), denied('CONTEXT_OVERFLOW'));
});
