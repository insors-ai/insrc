/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Value } from '@sinclair/typebox/value';
import { AcceptedDecisionSchema, AttributionStateSchema, FinalScopeSnapshotSchema } from '../final-scope-contracts.js';

const identity = 'a'.repeat(64);
const row = { taskId: 't1', changeIndexes: [0], testIndexes: [], decision: { action: 'initial' } };
test('accepted attribution decision unions retain only permitted fields', () => {
 for (const decision of [{ action: 'initial' }, { action: 'reassess', reason: 'Changed' }, { action: 'reuse', reason: 'Same inputs', sourceAttempt: 1 }]) assert.ok(Value.Check(AcceptedDecisionSchema, decision));
 for (const decision of [{ action: 'initial', reason: 'Unexpected' }, { action: 'reassess', reason: 'Changed', sourceAttempt: 1 }, { action: 'reuse', reason: 'Missing source' }, { action: 'reuse', reason: 'Bad source', sourceAttempt: 0 }]) assert.equal(Value.Check(AcceptedDecisionSchema, decision), false);
 const pending = { attributionState: 'pending', finalScopeIdentity: identity };
 assert.ok(Value.Check(AttributionStateSchema, pending));
 assert.equal(Value.Check(AttributionStateSchema, { ...pending, acceptedAttribution: [row] }), false);
 const accepted = { ...pending, attributionState: 'accepted', acceptedAttribution: [row], taskScopeIdentities: [{ taskId: 't1', identity }], attributionIdentity: identity };
 assert.ok(Value.Check(AttributionStateSchema, accepted));
 const { taskScopeIdentities: _bindings, ...missing } = accepted;
 assert.equal(Value.Check(AttributionStateSchema, missing), false);
 assert.equal(Value.Check(AttributionStateSchema, { ...accepted, attributionFailure: { code: 'failure', summary: 'No mapping' } }), false);
 assert.ok(Value.Check(AttributionStateSchema, { ...pending, attributionState: 'failed', attributionIdentity: identity, attributionFailure: { code: 'failure', summary: 'No mapping' } }));
});

test('permanent snapshot branches cannot fabricate accepted rows for unmapped failure', () => {
 const base = { revision: 'b'.repeat(40), identity, entries: [{ originChangeIndex: 0, path: 'source.ts', blobOid: 'c'.repeat(40), findingScope: 'none', segments: [] }], dispositions: [], selectedTaskIds: ['t1'], testCount: 0, attributionIdentity: identity };
 const failed = { ...base, attributionState: 'unmapped_failure', tasks: [], attributionFailure: { code: 'attribution', summary: 'Unavailable' } };
 assert.ok(Value.Check(FinalScopeSnapshotSchema, failed));
 assert.equal(Value.Check(FinalScopeSnapshotSchema, { ...failed, tasks: [{ ...row, identity }] }), false);
 const { attributionFailure: _failure, ...missing } = failed;
 assert.equal(Value.Check(FinalScopeSnapshotSchema, missing), false);
 const accepted = { ...base, attributionState: 'accepted', tasks: [{ ...row, identity }] };
 assert.ok(Value.Check(FinalScopeSnapshotSchema, accepted));
 assert.equal(Value.Check(FinalScopeSnapshotSchema, { ...accepted, tasks: [] }), false);
 assert.equal(Value.Check(FinalScopeSnapshotSchema, { ...accepted, entries: [{ ...base.entries[0], segments: [{ after: [1, 1] }] }] }), false);
});
