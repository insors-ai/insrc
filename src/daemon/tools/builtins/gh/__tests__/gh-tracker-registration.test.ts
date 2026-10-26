/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t9: gh_tracker is registered by registerGhTools and callable through the registry and callTool.
 * Run: npx tsx --test src/daemon/tools/builtins/gh/__tests__/gh-tracker-registration.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { callTool } from '../../../call-tool.js';
import { executeTool } from '../../../executor.js';
import { _resetRegistryForTests, getTool } from '../../../registry.js';
import type { ToolDeps } from '../../../types.js';
import { registerGhTools } from '../index.js';
import { ghTrackerTool } from '../tracker.js';
import { installFakeGh } from './_fakegh.js';

afterEach(() => { _resetRegistryForTests(); });
const deps: ToolDeps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0, approvalMode: 'auto' };

test('gh-tracker-registration.test.ts: after registerGhTools, getTool finds gh_tracker and executeTool runs one op of it through the registry', async () => {
	_resetRegistryForTests();
	assert.equal(getTool('gh_tracker'), undefined);
	registerGhTools();
	assert.equal(getTool('gh_tracker'), ghTrackerTool, 'the exported family is the registered object');
	const gh = installFakeGh('ok', '{"login":"me"}');
	try {
		const r = await executeTool('gh_tracker', { op: 'current_login' }, deps);
		assert.equal(r.success, true, r.output);
		assert.deepEqual(r.data, { op: 'current_login', login: 'me' });
		assert.deepEqual(gh.calls(), ['api user']);
	} finally { gh.restore(); }
});

test('gh-tracker-registration.test.ts: callTool of the exported gh_tracker object runs', async () => {
	_resetRegistryForTests();
	registerGhTools();
	const gh = installFakeGh('ok', '{"number":3}');
	try {
		const r = await callTool(ghTrackerTool, { op: 'milestone_create', owner: 'o', repo: 'r', title: 'M' } as never, deps);
		assert.equal(r.success, true, r.output);
		assert.deepEqual(gh.calls(), ['api -X POST repos/o/r/milestones -f title=M']);
	} finally { gh.restore(); }
});
