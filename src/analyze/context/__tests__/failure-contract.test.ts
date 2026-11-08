/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The contracts the failure fields extend (LLD-b9d5c5c40df5a574-s3, task t2):
 * RunFailure and its code are unchanged, and the fields added to
 * TaskExecutionRecord, LookupFailedError and ShaperAnswerStepFailedError are
 * optional and JSON-safe. Type checks run at compile time (tsc).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { RunErrorCode, RunFailure } from '../../orchestrator/types.js';
import type { TaskExecutionRecord } from '../../executor/types.js';
import { LookupFailedError } from '../../explore/lookup-failed.js';
import { ShaperAnswerStepFailedError } from '../driver.js';
import { failureData } from '../failure-data.js';

test('RunFailure shape and code \'executor-aggregator-failed\' unchanged; TaskExecutionRecord, LookupFailedError and ShaperAnswerStepFailedError gain only optional JSON-safe fields', () => {
	// RunFailure: code, message, optional data -- and nothing else.
	const code: RunErrorCode = 'executor-aggregator-failed';
	const failure: RunFailure = { code, message: 'm' };
	const withData: RunFailure = { code, message: 'm', data: { kind: 'error' } };
	assert.deepEqual(Object.keys(failure).sort(), ['code', 'message']);
	assert.equal(withData.data?.['kind'], 'error');

	// The record needs none of the added field.
	const record: TaskExecutionRecord = { taskId: 't1', template: 'x', kind: 'leaf', produces: [], status: 'failed', error: 'e' };
	assert.equal(record.data, undefined);
	const kept: TaskExecutionRecord = { ...record, data: failureData(new Error('e')) };
	assert.deepEqual(JSON.parse(JSON.stringify(kept)), kept);

	// A lookup failure built as before carries no new field.
	const lookup = new LookupFailedError('m', [], { cause: new Error('c') });
	assert.equal(lookup.handling, undefined);
	assert.equal(lookup.answerStepReason, undefined);
	assert.equal((lookup.cause as Error).message, 'c');
	const typed = new LookupFailedError('m', [], { answerStepReason: 'model-failed' });
	assert.equal(typed.answerStepReason, 'model-failed');

	// The answer-step error built with three arguments, as every caller does today.
	const found = { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } };
	const err = new ShaperAnswerStepFailedError('invalid-answer', 'd', found);
	assert.equal(err.upstream, undefined);
	assert.equal(err.partFailures, undefined);
	assert.deepEqual(JSON.parse(JSON.stringify(failureData(err))), failureData(err));
});
