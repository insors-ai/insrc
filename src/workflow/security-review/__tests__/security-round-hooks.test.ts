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
	// repoPath/targets name files that do not exist anywhere on disk; if ground
	// ever touched the filesystem (or anything else needing repoPath/targets to
	// be real), this would throw ENOENT or hang rather than resolve to [].
	const bogusRepoPath = '/does/not/exist/' + Math.random().toString(36).slice(2);
	const targets = { entries: [{ path: 'this-file-does-not-exist.ts' }] };
	let captured: unknown;
	_setRunSecurityCodePassForTests(async (repoPath, calledTargets, calledModelSelection, round, reviewId) => {
		captured = { repoPath, calledTargets, calledModelSelection, round, reviewId };
		return [];
	});
	try {
		const hooks = buildSecurityRoundHooks(bogusRepoPath, targets, modelSelection, 'review-1');
		assert.equal(hooks.reviewKind, 'code');
		assert.equal(hooks.checkpointGranularity, 'round');

		const groundResult = await hooks.ground(targets, 1);
		assert.deepEqual(groundResult, []);

		assert.ok(hooks.security);
		await hooks.security(targets, 2);
		assert.deepEqual(captured, { repoPath: bogusRepoPath, calledTargets: targets, calledModelSelection: modelSelection, round: 2, reviewId: 'review-1' });
	} finally {
		_setRunSecurityCodePassForTests();
	}
});
