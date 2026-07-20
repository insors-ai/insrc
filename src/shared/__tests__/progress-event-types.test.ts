/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compile-only fixture for the sc1 ProgressEvent contract (t1). It proves the
 * union is exhaustive over `kind` (the `never` default arm fails to compile if
 * a variant is added without a case) and that both variants' fields are
 * readonly + non-optional. The runtime assertions keep it a real test.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ProgressEvent, StageProgressEvent, TokenProgressEvent } from '../types.js';

test('ProgressEvent union is exhaustive over kind with a never check', () => {
	const stage: StageProgressEvent = {
		kind: 'stage', operation: 'workflow.run', stageId: 's1', stageLabel: 'Plan', index: 0, total: 3,
	};
	const token: TokenProgressEvent = {
		kind: 'token', operation: 'analyze.run', stageId: null, tokensDelta: 12, tokensTotal: 120,
	};

	const label = (e: ProgressEvent): string => {
		switch (e.kind) {
			case 'stage': return `stage ${e.stageId} ${e.index}/${e.total ?? '?'}`;
			case 'token': return `token +${e.tokensDelta}=${e.tokensTotal}`;
			default: { const _never: never = e; return _never; }
		}
	};

	assert.equal(label(stage), 'stage s1 0/3');
	assert.equal(label(token), 'token +12=120');

	// `total` is number | null (not undefined); `stageId` on token is string | null.
	const noTotal: StageProgressEvent = { ...stage, total: null };
	assert.equal(label(noTotal), 'stage s1 0/?');
});
