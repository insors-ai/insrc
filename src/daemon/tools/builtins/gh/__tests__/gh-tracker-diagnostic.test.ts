/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t9: the typed-issue op keeps the API's rejection text in failure.original, capped by the
 * seam itself; every other gh failure is unchanged.
 * Run: npx tsx --test src/daemon/tools/builtins/gh/__tests__/gh-tracker-diagnostic.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup } from '../../../__tests__/_proc.js';
import { installStandInBin } from '../../../__tests__/_bin.js';
import type { StandInBin } from '../../../__tests__/_bin.js';
import { ORIGINAL_MAX_CHARS, executeTool } from '../../../executor.js';
import { _resetRegistryForTests } from '../../../registry.js';
import type { ToolDeps } from '../../../types.js';
import { FAILURE_ORIGINAL_MAX_CHARS } from '../helpers.js';
import { registerGhTools } from '../index.js';

let bin: StandInBin | undefined;
afterEach(() => { bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined; _resetRegistryForTests(); });
const deps: ToolDeps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0, approvalMode: 'auto' };
const CREATE = { op: 'issue_create_typed', owner: 'o', repo: 'r', title: 'T', body: 'B', type: 'Epic' };
const R422 = 'gh: Validation Failed: the issue type is not enabled for this organization (HTTP 422)';

test('gh-tracker-diagnostic.test.ts: issue_create_typed on an HTTP 422 that names issue types returns a rejected failure whose failure.original is the exact trimmed API text', async () => {
	registerGhTools();
	bin = installStandInBin('gh', `echo '  ${R422}  ' 1>&2; exit 1`);
	const r = await executeTool('gh_tracker', CREATE, deps);
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'rejected');
	assert.equal(r.failure?.original, R422, 'exactly what the s10 typed-issue fallback reads');
	assert.match(r.failure?.message ?? '', /HTTP 422/);
});

test('gh-tracker-diagnostic.test.ts: a diagnostic text of 5000 characters is cut to 4000 in failure.original by the seam and failure.message is unchanged', async () => {
	registerGhTools();
	bin = installStandInBin('gh', "printf '%05000d' 0 1>&2; exit 1");
	const r = await executeTool('gh_tracker', CREATE, deps);
	assert.equal(r.failure?.original?.length, 4000);
	assert.ok((r.failure?.message.length ?? 0) >= 5000, 'the message keeps all 5000 characters');
	assert.equal(FAILURE_ORIGINAL_MAX_CHARS, ORIGINAL_MAX_CHARS);
	assert.equal(FAILURE_ORIGINAL_MAX_CHARS, 4000);
});

test('gh-tracker-diagnostic.test.ts: the same 422 from an existing gh tool still has no failure.original, and a spawn error from the same op and from an existing tool still has failure.original equal to the trimmed stderr', async () => {
	registerGhTools();
	bin = installStandInBin('gh', `echo '${R422}' 1>&2; exit 1`);
	const existing = await executeTool('gh_issue_create', { title: 'T' }, deps);
	assert.equal(existing.success, false);
	assert.equal(existing.failure?.original, undefined, 'an existing tool does not opt in');
	const sameOp = await executeTool('gh_tracker', { op: 'comments_list', owner: 'o', repo: 'r', number: 5 }, deps);
	assert.equal(sameOp.failure?.original, undefined, 'a tracker op that does not opt in keeps today\'s failure');
	bin.restore(); cleanup(bin.dir); bin = undefined;
	const saved = process.env['PATH']; process.env['PATH'] = '/nonexistent';
	try {
		const a = await executeTool('gh_tracker', CREATE, deps);
		const b = await executeTool('gh_issue_create', { title: 'T' }, deps);
		for (const r of [a, b]) {
			assert.equal(r.failure?.kind, 'missing-tool');
			assert.equal(r.failure?.original, (r.failure?.original ?? '').trim());
			assert.ok((r.failure?.original ?? '').length > 0, 'the spawn error keeps its stderr as original');
		}
	} finally { process.env['PATH'] = saved; }
});
