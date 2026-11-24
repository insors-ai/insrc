/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s3/t2: buildSecurityRoundHooks.
 * Run: npx tsx --test src/workflow/security-review/__tests__/security-round-hooks.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSecurityRoundHooks, _setRunSecurityCodePassForTests } from '../security-round-hooks.js';
import type { SecurityModelSelection } from '../../../config/analyze.js';

const modelSelection: SecurityModelSelection & { status: 'configured' } = { status: 'configured', modelId: 'test-model', provider: 'claude' };

test("buildSecurityRoundHooks: hooks.ground always resolves to [] without I/O; hooks.security delegates to the injected code-pass function", async () => {
	const targets = { entries: [{ path: 'app.ts' }] };
	let captured: unknown;
	_setRunSecurityCodePassForTests(async (repoPath, calledTargets, calledModelSelection, round) => {
		captured = { repoPath, calledTargets, calledModelSelection, round };
		return [];
	});
	try {
		const hooks = buildSecurityRoundHooks('/repo', targets, modelSelection, 'review-1');
		assert.equal(hooks.reviewKind, 'code');
		assert.equal(hooks.checkpointGranularity, 'round');

		const groundResult = await hooks.ground(targets, 1);
		assert.deepEqual(groundResult, []);

		assert.ok(hooks.security);
		await hooks.security(targets, 2);
		assert.deepEqual(captured, { repoPath: '/repo', calledTargets: targets, calledModelSelection: modelSelection, round: 2 });
	} finally {
		_setRunSecurityCodePassForTests();
	}
});
