/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t7: the four new git tools are registered, as marked withFailureNet copies of the
 * exported definitions.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-registration.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import { definitionOf } from '../../../provenance.js';
import { getTool } from '../../../registry.js';
import { gitConfigTool } from '../config.js';
import { gitToolDefinitions } from '../definitions.js';
import { gitLsRemoteTool } from '../ls-remote.js';
import { gitRmTool } from '../rm.js';
import { gitUpdateRefTool } from '../update-ref.js';
import { git, newRepo, registerForTests, toolDeps } from './_repo.js';

afterEach(() => { _setApprovalGateForTests(undefined); });

test('git-registration.test.ts: after registerGitTools, getTool finds the four new tools as marked withFailureNet copies and the exported definitions are unchanged', () => {
	registerForTests();
	for (const [id, def] of [['git_config', gitConfigTool], ['git_ls_remote', gitLsRemoteTool], ['git_update_ref', gitUpdateRefTool], ['git_rm', gitRmTool]] as const) {
		const registered = getTool(id);
		assert.ok(registered, `${id} is registered`);
		assert.notEqual(registered, def, 'the registered tool is a copy');
		assert.equal(definitionOf(registered), def, `${id}: marked as built from the exported definition`);
		assert.ok(gitToolDefinitions.includes(def as never), `${id} is in gitToolDefinitions`);
		assert.equal(def.id, id);
	}
});

test('git-registration.test.ts: executeTool runs each of the four through the registry', async () => {
	registerForTests();
	_setApprovalGateForTests(() => ({ async ask(r) { return { requestId: r.requestId, decision: 'approve' as const }; } }));
	const repo = newRepo();
	try {
		git(repo, 'commit', '-q', '--allow-empty', '-m', 'one');
		git(repo, 'update-ref', 'refs/heads/tmp', 'HEAD');
		git(repo, 'remote', 'add', 'self', repo);
		const deps = toolDeps(repo);
		assert.equal((await executeTool('git_config', { cwd: repo, key: 'user.email' }, deps)).success, true);
		assert.equal((await executeTool('git_ls_remote', { cwd: repo, remote: 'self', heads: true }, deps)).success, true);
		assert.equal((await executeTool('git_update_ref', { cwd: repo, ref: 'refs/heads/tmp', delete: true }, deps)).success, true);
		assert.equal((await executeTool('git_rm', { cwd: repo, paths: ['nothing.txt'] }, deps)).success, true);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
