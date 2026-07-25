/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration test for the S003 RoleRouter seam on prepareWorkflowRun: the sole
 * run-wide workflow seam now exposes `router` for per-step, per-role resolution
 * (ac1) while keeping the scalar provider/modelLabel back-compat and the
 * unchanged no-repo throw.
 *
 * Run: npx tsx --test src/daemon/__tests__/workflow-rpc-router.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prepareWorkflowRun } from '../workflow-rpc.js';

const REPO = '/tmp/insrc-router-test-repo';

test('prepareWorkflowRun exposes a router + cfg + repoPath alongside the back-compat scalar provider', () => {
	const prep = prepareWorkflowRun({ repo: REPO, workflow: 'stub', focus: 'demo' });
	assert.ok(prep.router, 'router is exposed');
	assert.ok(prep.cfg, 'cfg is exposed for the router');
	assert.equal(prep.repoPath, REPO);
	// Back-compat: the scalar provider + modelLabel stay populated (driver role).
	assert.ok(prep.provider, 'scalar provider retained');
	assert.equal(typeof prep.modelLabel, 'string');
});

test('prep.router resolves a provider per role (distinct roles → distinct resolutions)', () => {
	const prep = prepareWorkflowRun({ repo: REPO, workflow: 'stub', focus: 'demo' });
	const synth = prep.router.resolveProviderForRole('synthesize', prep.cfg, prep.repoPath);
	const design = prep.router.resolveProviderForRole('design.contract.detail', prep.cfg, prep.repoPath);
	assert.equal(synth.resolution.role, 'synthesize');
	assert.equal(design.resolution.role, 'design.contract.detail');
	// Repeated resolution is memoized (same instance).
	assert.equal(prep.router.resolveProviderForRole('synthesize', prep.cfg, prep.repoPath), synth);
});

test('prepareWorkflowRun still throws "no repo" before any router is built', () => {
	const savedRepo = process.env['INSRC_REPO'];
	delete process.env['INSRC_REPO'];
	try {
		assert.throws(() => prepareWorkflowRun({ workflow: 'stub', focus: 'x' }), /no repo/);
	} finally {
		if (savedRepo !== undefined) process.env['INSRC_REPO'] = savedRepo;
	}
});
