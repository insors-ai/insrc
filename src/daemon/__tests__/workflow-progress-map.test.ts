/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * t5/t6 — the workflow.run producer adapters: WorkflowProgress → StageProgressEvent
 * and the token-string stream → batched TokenProgressEvent.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeTokenAccumulator, workflowProgressToStage } from '../workflow-rpc.js';

test('workflowProgressToStage maps phase→stageId and folds runner/attempt/detail into stageLabel', () => {
	const ev = workflowProgressToStage(
		{ phase: 'synthesize-retry', runner: 'design.story', attempt: 2, detail: 'schema mismatch' }, 3,
	);
	assert.equal(ev.kind, 'stage');
	assert.equal(ev.operation, 'workflow.run');
	assert.equal(ev.stageId, 'synthesize-retry');
	assert.equal(ev.stageLabel, 'design.story · attempt 2 · schema mismatch');
	assert.equal(ev.index, 3);
	assert.equal(ev.total, null);
});

test('workflowProgressToStage falls back to phase as the label when no extra fields', () => {
	const ev = workflowProgressToStage({ phase: 'done' }, 7);
	assert.equal(ev.stageLabel, 'done');
	assert.equal(ev.stageId, 'done');
	assert.equal(ev.index, 7);
});

test('makeTokenAccumulator batches tokens and flushes the tail', () => {
	const acc = makeTokenAccumulator();
	// first 15 tokens accumulate silently (batch size 16)
	for (let i = 0; i < 15; i++) assert.equal(acc.push('synthesize', 't'), null);
	// the 16th emits a delta covering the whole batch
	const first = acc.push('synthesize', 't');
	assert.ok(first);
	assert.equal(first.kind, 'token');
	assert.equal(first.operation, 'workflow.run');
	assert.equal(first.stageId, 'synthesize');
	assert.equal(first.tokensDelta, 16);
	assert.equal(first.tokensTotal, 16);
	// three more accumulate, then flush emits the tail with cumulative total
	acc.push('synthesize', 't'); acc.push('synthesize', 't'); acc.push('synthesize', 't');
	const tail = acc.flush();
	assert.ok(tail);
	assert.equal(tail.tokensDelta, 3);
	assert.equal(tail.tokensTotal, 19);
	// a second flush with nothing pending yields null
	assert.equal(acc.flush(), null);
});

test('makeTokenAccumulator keeps tokensTotal monotonic and stageId from the latest step', () => {
	const acc = makeTokenAccumulator();
	for (let i = 0; i < 16; i++) acc.push('plan', 't');   // one full batch fires (total 16), delta→0
	// five more under a different stage: below the batch threshold, so no frame yet
	for (let i = 0; i < 5; i++) assert.equal(acc.push('synthesize', 't'), null);
	const tail = acc.flush();
	assert.ok(tail);
	assert.equal(tail.tokensDelta, 5);
	assert.equal(tail.tokensTotal, 21);          // monotonic: 16 + 5
	assert.equal(tail.stageId, 'synthesize');    // latest step wins
});
