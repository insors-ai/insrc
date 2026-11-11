/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './publication-fixture.js';
import { validateSavedAttribution } from '../attribution-binding.js';
import { CheckpointSchema, decodeReview } from '../contracts.js';
import type { ReviewAttempt } from '../contracts.js';

test('the attempt header schema accepts only the v2 identity format', async () => {
 const f = await fixture(); try {
  const withFormat = (value: unknown) => { const state = f.checkpoint(); (state.attempts[0]!.header as Record<string, unknown>).taskIdentityFormat = value; return state; };
  assert.equal(decodeReview(CheckpointSchema, withFormat('final-task-v2')).attempts[0]!.header.taskIdentityFormat, 'final-task-v2');
  assert.equal(decodeReview(CheckpointSchema, f.checkpoint()).attempts[0]!.header.taskIdentityFormat, undefined);
  for (const value of ['final-task-v1', 'final-task-v3', '', 2]) assert.throws(() => decodeReview(CheckpointSchema, withFormat(value)), /taskIdentityFormat/);
 } finally { f.cleanup(); }
});

test('an identity format on an unaccepted attempt is refused', async () => {
 const f = await fixture(); try {
  const accepted = f.checkpoint().attempts[0]!;
  assert.equal(accepted.header.attributionState, 'accepted');
  validateSavedAttribution(accepted);
  validateSavedAttribution({ ...accepted, header: { ...accepted.header, taskIdentityFormat: 'final-task-v2' } });
  const unaccepted = (state: 'pending' | 'failed'): ReviewAttempt => {
   const a = structuredClone(accepted), h = a.header;
   delete h.acceptedAttribution; delete h.taskScopeIdentities; delete h.attributionIdentity; h.attributionState = state;
   return a;
  };
  const pending = unaccepted('pending'); validateSavedAttribution(pending);
  pending.header.taskIdentityFormat = 'final-task-v2';
  assert.throws(() => validateSavedAttribution(pending), /Unmapped phase cannot carry accepted task bindings/);
  const failed = unaccepted('failed'); failed.header.taskIdentityFormat = 'final-task-v2';
  assert.throws(() => validateSavedAttribution(failed), /Unmapped phase cannot carry accepted task bindings/);
  const unpinned = structuredClone(accepted), h = unpinned.header;
  delete (unpinned.submitted as { reviewRevision?: string }).reviewRevision;
  delete h.finalScopeIdentity; delete h.attributionState; delete h.acceptedAttribution; delete h.taskScopeIdentities; delete h.attributionIdentity;
  validateSavedAttribution(unpinned);
  h.taskIdentityFormat = 'final-task-v2';
  assert.throws(() => validateSavedAttribution(unpinned), /Unpinned history cannot carry final-scope authority/);
 } finally { f.cleanup(); }
});
