/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the insrc_workflow_approve tool normalizer (handleWorkflowApprove):
 * the exactly-one-of {artifactPath | epicHash} gate that short-circuits BEFORE
 * any daemon IPC. The daemon round-trip + approval logic is covered by
 * approve-workflow-target.test.ts and verified live.
 *
 * Run: npx tsx --test src/mcp/__tests__/workflow-approve-dispatch.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleWorkflowApprove } from '../server.js';

const text = (env: { content: { type: 'text'; text: string }[] }): string => env.content[0]!.text;

test('handleWorkflowApprove: NEITHER artifactPath nor epicHash → InvalidTarget error, no IPC', async () => {
	const out = await handleWorkflowApprove({});
	assert.equal(out.isError, true);
	assert.match(text(out), /exactly one of `artifactPath` or `epicHash`/);
});

test('handleWorkflowApprove: BOTH artifactPath and epicHash → InvalidTarget error, no IPC', async () => {
	const out = await handleWorkflowApprove({ artifactPath: '/x/HLD.md', epicHash: 'deadbeef' });
	assert.equal(out.isError, true);
	assert.match(text(out), /exactly one of `artifactPath` or `epicHash`/);
});

test('handleWorkflowApprove: empty-string target fields count as absent (neither) → error', async () => {
	const out = await handleWorkflowApprove({ artifactPath: '', epicHash: '' });
	assert.equal(out.isError, true);
	assert.match(text(out), /exactly one of/);
});
