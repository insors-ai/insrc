/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s8/t3: git_text sends the content of the call on standard input; empty content is delivered as
 * empty input, content over the budget is refused before git starts and a failed delivery is a failure with no answer.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-text.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup } from '../../../__tests__/_proc.js';
import { executeTool } from '../../../executor.js';
import { MAX_STDIN_BYTES } from '../op-table.js';
import { registerForTests, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
afterEach(() => { standIn?.restore(); if (standIn) { cleanup(standIn.dir); } standIn = undefined; });

const run = (input: Record<string, unknown>) => executeTool('git_text', { cwd: '/tmp', ...input }, toolDeps('/tmp'));

test('git-text.test.ts: empty content, over-budget content and a failed delivery', async () => {
	registerForTests();
	const empty = await run({ op: 'stripspace', content: '' });
	assert.equal(empty.success, true, empty.output);
	assert.deepEqual(empty.data, { op: 'stripspace', text: '' }, 'empty content is delivered as empty input and the command answers');

	standIn = installStandInGit('exit 0');
	const big = await run({ op: 'stripspace', content: 'x'.repeat(MAX_STDIN_BYTES + 1) });
	assert.equal(big.success, false);
	assert.equal(big.failure?.kind, 'rejected');
	assert.match(big.error ?? '', /larger than the/);
	assert.deepEqual(standIn.calls(), [], 'git did not start for content over the budget');

	// git exits at once without reading its input: the write fails and no answer is parsed
	const lost = await run({ op: 'stripspace', content: 'x'.repeat(MAX_STDIN_BYTES) });
	assert.equal(lost.success, false);
	assert.equal(lost.failure?.kind, 'rejected');
	assert.match(lost.failure?.message ?? '', /could not deliver content to git/);
	assert.equal(lost.data, undefined);
});
