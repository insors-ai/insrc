/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { open, mkdir, rename, unlink, writeFile, readFile } from 'node:fs/promises';
import { fixture, hash } from './publication-fixture.js';
import { provider } from './controller-fixture.js';
import { checkpointPath, saveCheckpoint, loadCheckpoint, CheckpointSaveError } from '../checkpoint.js';
import type { CheckpointIO } from '../checkpoint.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { historyFixture } from './history-fixture.js';

test('checkpoint writer classifies pre-replacement, visible replacement and uncertain acknowledgement failures', async () => {
 const f = await fixture(); try {
  for (const stage of ['mkdir', 'file-open', 'write', 'file-sync', 'file-close', 'rename-before', 'rename-after', 'directory-open', 'directory-sync', 'directory-close', 'cleanup']) {
   const path = checkpointPath(f.repo, `io-${stage}`), prior = f.checkpoint(`io-${stage}`), candidate = structuredClone(prior);
   candidate.attempts[0]!['review-response'].summary = 'Candidate replacement'; await saveCheckpoint(path, prior);
   const fault = new Error(`Injected ${stage}`);
   const io: CheckpointIO = { mkdir: async (...args) => { if (stage === 'mkdir') throw fault; return mkdir(...args); },
    open: async (...args) => {
     const directory = args[1] === 'r'; if (stage === (directory ? 'directory-open' : 'file-open')) throw fault;
     const handle = await open(...args);
     return new Proxy(handle, { get(target, property) {
      if (property === 'writeFile' && stage === 'write') return async () => { throw fault; };
      if (property === 'sync' && stage === (directory ? 'directory-sync' : 'file-sync')) return async () => { throw fault; };
      if (property === 'close' && stage === (directory ? 'directory-close' : 'file-close')) return async () => { await target.close(); throw fault; };
      const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value;
     } });
    }, rename: async (...args) => { if (stage === 'rename-before') throw fault; await rename(...args); if (stage === 'rename-after') throw fault; },
    unlink: async (...args) => { if (stage === 'cleanup') throw fault; return unlink(...args); } };
   const expected = stage.startsWith('rename-') ? 'uncertain' : stage.startsWith('directory-') || stage === 'cleanup' ? 'replaced' : 'not_replaced';
   await assert.rejects(saveCheckpoint(path, candidate, io), error => error instanceof CheckpointSaveError && error.outcome === expected && error.cause === fault, stage);
   assert.deepEqual(await loadCheckpoint(path), ['rename-after', 'directory-open', 'directory-sync', 'directory-close', 'cleanup'].includes(stage) ? candidate : prior);
  }
 } finally { f.cleanup(); }
});

test('unsupported directory sync retains successful-save policy and cleanup never removes an unowned collision', async () => {
 const f = await fixture(); try {
  for (const code of ['EINVAL', 'ENOTSUP', 'EISDIR']) {
   const state = f.checkpoint(`sync-${code}`), path = checkpointPath(f.repo, state.reviewId);
   const io: CheckpointIO = { mkdir, rename, unlink, open: async (...args) => {
    const handle = await open(...args);
    if (args[1] !== 'r') return handle;
    return new Proxy(handle, { get(target, property) { if (property === 'sync') return async () => { throw Object.assign(new Error(code), { code }); }; const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value; } });
   } };
   await saveCheckpoint(path, state, io); assert.deepEqual(await loadCheckpoint(path), state);
  }
  let collision = '';
  const io: CheckpointIO = { mkdir, rename, unlink, open: async (...args) => { collision = String(args[0]); await writeFile(collision, 'unowned collision'); throw Object.assign(new Error('exists'), { code: 'EEXIST' }); } };
  await assert.rejects(saveCheckpoint(checkpointPath(f.repo, 'collision'), f.checkpoint('collision'), io), error => error instanceof CheckpointSaveError && error.outcome === 'not_replaced');
  assert.equal(await readFile(collision, 'utf8'), 'unowned collision');
 } finally { f.cleanup(); }
});

test('both routes fence failed acceptance, reconcile exact visible state and require successful explicit re-acknowledgement', async () => {
 for (const party of ['daemon', 'controller'] as const) for (const outcome of ['not_replaced', 'replaced', 'uncertain'] as const) {
  const f = await fixture(); let assessments = 0, attempts = 0, observed: CheckpointSaveError | undefined;
  const path = checkpointPath(f.repo, 'accept-failure');
  const save: typeof saveCheckpoint = async (file, state) => {
   if (state.reviewId === 'accept-failure' && state.attempts[0]!.header.attributionState === 'accepted') {
    attempts++; if (outcome !== 'not_replaced') await saveCheckpoint(file, state);
    observed = new CheckpointSaveError(outcome, new Error('Acceptance storage fault')); throw observed;
   }
   await saveCheckpoint(file, state);
  };
  const coordinator = new TaskReviewCoordinator({ sources: f.deps.sources, save, provider: () => provider(async () => { assessments++; return f.result; }) });
  try {
   if (party === 'daemon') { await coordinator.start(f.repo, 'accept-failure', 1, f.packet); await coordinator.settled(f.repo, 'accept-failure'); }
   else await assert.rejects(coordinator.startController(f.repo, 'accept-failure', 1, f.packet, { id: 'controller', signal: new AbortController().signal }), CheckpointSaveError);
   assert.equal(attempts, 1); assert.equal(assessments, 0); assert.equal(coordinator.isActive(f.repo, 'accept-failure'), false);
   assert.equal(observed!.visibleState, outcome === 'not_replaced' ? 'prior' : 'candidate');
   const visible = (await loadCheckpoint(path))!, header = visible.attempts[0]!.header;
   assert.equal(header.attributionState, outcome === 'not_replaced' ? 'pending' : 'accepted');
   assert.deepEqual(visible.attempts[0]!['review-response'].tasks, []); assert.equal(header.attributionRepair, undefined);
   const bytes = await readFile(path, 'utf8');
   const failAgain = new TaskReviewCoordinator({ sources: f.deps.sources, save: async () => { throw new CheckpointSaveError('not_replaced', new Error('Explicit re-ack failed')); }, provider: () => provider(async () => { assessments++; return f.result; }) });
   if (party === 'daemon') await assert.rejects(failAgain.start(f.repo, 'accept-failure', 1, undefined, { operation: 'resume' }), CheckpointSaveError);
   else await assert.rejects(failAgain.startController(f.repo, 'accept-failure', 1, undefined, { id: 'next', signal: new AbortController().signal }, hash, 'resume'), CheckpointSaveError);
   assert.equal(await readFile(path, 'utf8'), bytes); assert.equal(assessments, 0);
   let acknowledged = false;
   const recovered = new TaskReviewCoordinator({ sources: f.deps.sources, save: async (file, state) => { await saveCheckpoint(file, state); acknowledged = true; }, provider: () => provider(async () => { assert.equal(acknowledged, true); assessments++; return f.result; }) });
   if (party === 'daemon') { await recovered.start(f.repo, 'accept-failure', 1, undefined, { operation: 'resume' }); await recovered.settled(f.repo, 'accept-failure'); }
   else {
    const owner = { id: 'recovered', signal: new AbortController().signal }, task = await recovered.startController(f.repo, 'accept-failure', 1, undefined, owner, hash, 'resume'); assert.equal(acknowledged, true);
    await recovered.controllerResult(f.repo, 'accept-failure', 1, f.result, owner, { taskId: task.taskId, executionId: task.executionId, sequence: task.nextSequence });
   }
   const done = (await loadCheckpoint(path))!.attempts[0]!;
   if (header.attributionState === 'accepted') { assert.deepEqual(done.header.acceptedAttribution, header.acceptedAttribution); assert.equal(done.header.attributionIdentity, header.attributionIdentity); }
   assert.equal(done['review-response'].tasks[0]!.status, 'passed');
  } finally { f.cleanup(); }
 }
});

test('unreadable or conflicting acceptance readback stays fenced without overwrite or model work', async () => {
 for (const party of ['daemon', 'controller'] as const) for (const conflict of [false, true]) {
  const f = await fixture(); let calls = 0, error: CheckpointSaveError | undefined;
  const coordinator = new TaskReviewCoordinator({ sources: f.deps.sources,
   save: async (path, state) => {
    if (state.reviewId === 'readback' && state.attempts[0]!.header.attributionState === 'accepted') {
     if (conflict) await writeFile(path, '{broken checkpoint'); else await saveCheckpoint(path, state);
     error = new CheckpointSaveError('uncertain', new Error('Uncertain acceptance')); throw error;
    }
    await saveCheckpoint(path, state);
   }, ...(!conflict ? { read: async () => { throw new Error('Read failed'); } } : {}), provider: () => provider(async () => { calls++; return f.result; }) });
  try {
   if (party === 'daemon') { await coordinator.start(f.repo, 'readback', 1, f.packet); await coordinator.settled(f.repo, 'readback'); }
   else await assert.rejects(coordinator.startController(f.repo, 'readback', 1, f.packet, { id: 'owner', signal: new AbortController().signal }), CheckpointSaveError);
   assert.equal(error!.visibleState, 'unverifiable'); assert.equal(calls, 0); assert.equal(coordinator.isActive(f.repo, 'readback'), false);
   const path = checkpointPath(f.repo, 'readback'), bytes = await readFile(path, 'utf8');
   await Promise.resolve(); assert.equal(await readFile(path, 'utf8'), bytes);
   if (conflict) await assert.rejects(new TaskReviewCoordinator({ sources: f.deps.sources, provider: () => { calls++; throw new Error('Must not run'); } }).start(f.repo, 'readback', 1, undefined, { operation: 'resume' }));
   assert.equal(calls, 0);
  } finally { f.cleanup(); }
 }
});

test('failed mixed-plan acceptance dispatches neither an immediate reuse nor a fresh assessment', async () => {
 for (const party of ['daemon', 'controller'] as const) {
  const f = await historyFixture(party); let assessments = 0, saves = 0;
  const scope = f.scope(); for (const row of scope.tasks) row.changeIndexes = row.changeIndexes.filter(i => i !== 3);
  const coordinator = new TaskReviewCoordinator({ sources: f.deps.sources, save: async (path, state) => {
   if (state.attempts.at(-1)!.header.attempt === 2 && state.attempts.at(-1)!.header.attributionState === 'accepted') {
    saves++; await saveCheckpoint(path, state); throw new CheckpointSaveError('replaced', new Error('Lost acceptance durability acknowledgement'));
   }
   await saveCheckpoint(path, state);
  }, provider: () => provider(async prompt => { if (prompt.startsWith('Derive task attribution')) return scope; assessments++; throw new Error('Fresh task must not run'); }) });
  try {
   if (party === 'daemon') { await coordinator.start(f.repo, 'history', 2, f.unchangedPacket); await coordinator.settled(f.repo, 'history'); }
   else {
    const owner = { id: 'controller', signal: new AbortController().signal }, frame = await coordinator.startController(f.repo, 'history', 2, f.unchangedPacket, owner);
    await assert.rejects(coordinator.controllerScope(f.repo, 'history', 2, scope, owner, { taskId: frame.taskId, executionId: frame.executionId, sequence: frame.nextSequence }), CheckpointSaveError);
   }
   const saved = (await loadCheckpoint(checkpointPath(f.repo, 'history')))!;
   assert.equal(saves, 1); assert.equal(assessments, 0); assert.deepEqual(saved.attempts[0], f.original);
   assert.equal(saved.attempts[1]!.header.attributionState, 'accepted');
   assert.equal(saved.attempts[1]!.header.acceptedAttribution![0]!.decision.action, 'reuse');
   assert.equal(saved.attempts[1]!['review-response'].origins, undefined); assert.deepEqual(saved.attempts[1]!['review-response'].tasks, []);
  } finally { f.cleanup(); }
 }
});
