/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-5f9d4ab4c90c0b4c s1/t3 unit tests: pushPrompt/pushVerifyPrompt branch
 * on the context's headKind. headKind 'issue' yields the single-issue ISSUE
 * block (ONE issue, body = prerendered epicBodyMd verbatim, labels epicLabel +
 * epic:<slug>, adoption without --force via singular --add-label, no
 * 'error unless' / task-list / backRef / sub-issue text); headKind 'def'
 * (or absent) is byte-identical to the pre-change DEF prompt.
 *
 * Run: npx tsx --test src/workflow/runners/tracker/__tests__/push-prompt-issue.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pushPrompt, pushVerifyPrompt } from '../index.js';
import type { PushContext } from '../schemas.js';

const GH = { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' };

function defContext(): PushContext {
	return {
		kind: 'push', epicHash: 'aaaa1111bbbb2222', epicSlug: 'def-item',
		gh: GH,
		epicTitle: 'DEF title.',
		epicBodyMd: '## Problem\n\nx',
		stories: [{ id: 's1', title: 'Story', bodyMd: '## User value\n\nuv' }],
		force: false,
	};
}

function issueContext(): PushContext {
	return {
		kind: 'push', epicHash: '5f9d4ab4c90c0b4c', epicSlug: 'issue-item', headKind: 'issue',
		gh: GH,
		epicTitle: 'ISSUE title verbatim',
		epicBodyMd: '# ISSUE title verbatim\n\n## Reproduction\n\nsteps',
		stories: [{ id: 's1', title: 'ISSUE title verbatim', bodyMd: '## User value\n\nISSUE title verbatim\n' }],
		force: false,
	};
}

test('src/workflow/runners/tracker/index.ts pushPrompt/pushVerifyPrompt — headKind \'issue\' contains ISSUE block, NOT \'error unless\'/task-list/backRef/sub-issue; headKind \'def\' byte-identical to baseline', () => {
	// DEF prompt: byte-identical to the pre-change baseline (captured shape:
	// the exact pre-t3 string; asserted via full equality against a locally
	// reconstructed baseline AND via the absence of any ISSUE-only text).
	const def = pushPrompt(defContext());
	const defVerify = pushVerifyPrompt(defContext());
	assert.ok(!def.includes('ISSUE-anchored'), 'DEF prompt has no ISSUE block');
	assert.ok(!def.includes('PRERENDERED ISSUE BODY'), 'DEF prompt has no prerendered ISSUE body block');
	assert.ok(def.includes('treat as an error unless the user re-runs with --force'), 'DEF keeps the existing-refs error rule');
	assert.ok(def.includes('## Stories` task list'), 'DEF keeps the task-list step');
	assert.ok(defVerify.includes('storyLabelled'), 'DEF verify keeps storyLabelled');
	assert.ok(defVerify.includes('taskList'), 'DEF verify keeps taskList');
	assert.ok(defVerify.includes('backRef'), 'DEF verify keeps backRef');

	// ISSUE prompt: single issue, authoritative prerendered body, adoption
	// without --force, and NONE of the DEF-only instructions.
	const iss = pushPrompt(issueContext());
	assert.ok(iss.includes('ISSUE-anchored work item'));
	assert.ok(iss.includes('SINGLE issue'), iss.slice(0, 400));
	assert.ok(iss.includes('PRERENDERED ISSUE BODY (use verbatim):'));
	assert.ok(iss.includes('# ISSUE title verbatim\n\n## Reproduction\n\nsteps'), 'body embedded verbatim');
	assert.ok(iss.includes('`insrc:epic`, `epic:issue-item`'), 'labels are epicLabel + epic:<slug> only');
	// the ORDER OF OPERATIONS label step must not include the story label
	const orderBlock = iss.slice(iss.indexOf('ORDER OF OPERATIONS'), iss.indexOf('PRERENDERED ISSUE BODY'));
	assert.ok(!orderBlock.includes('insrc:story'), `label step has no story label: ${orderBlock}`);
	// the NOT-USED list names the DEF-only pieces
	assert.ok(iss.includes('Story sub-issues, story labels'), 'names story labels as not used');
	assert.ok(!orderBlock.includes('Create ONE Story issue'), 'no story sub-issue creation step');
	assert.ok(!orderBlock.includes('task list'), `no task-list rewrite in ORDER OF OPERATIONS: ${orderBlock}`);
	// the NOT-USED list is allowed to NAME the DEF-only concepts; the OPERATIONS must not instruct them
	assert.ok(!orderBlock.includes('**Epic:**'), 'no back-reference in operations');
	assert.ok(iss.includes('`**Epic:**` back-references'), 'back-reference named as not used');
	assert.ok(!iss.includes('error unless'), 'the existing-refs error rule does NOT apply');
	assert.ok(!def.includes('ADOPT the existing issue'));
	// adoption variant: existing epicRef present -> adopt without --force
	const issAdopt = pushPrompt({ ...issueContext(), existingRefs: { epicRef: 'acme/demo#42', storyRefs: { s1: 'acme/demo#42' } }, force: false });
	assert.ok(issAdopt.includes('ADOPT the existing issue acme/demo#42'), issAdopt);
	assert.ok(issAdopt.includes('--add-label "insrc:epic,epic:issue-item"'), 'singular --add-label on adoption');
	assert.ok(issAdopt.includes('do NOT create a duplicate'));
	assert.ok(!issAdopt.includes('error unless'), 'adoption is not an error without --force');

	// ISSUE verify: exactly issueLabelled + bodyMatches + singleIssue (+ milestone note)
	const issVerify = pushVerifyPrompt(issueContext());
	assert.ok(issVerify.includes('issueLabelled'));
	assert.ok(issVerify.includes('bodyMatches'));
	assert.ok(issVerify.includes('singleIssue'));
	for (const banned of ['storyLabelled', 'taskList', 'backRef', 'taskLabelled', 'subIssue', 'taskCoverage']) {
		assert.ok(!issVerify.includes(banned), `ISSUE verify must not grade DEF-only '${banned}'`);
	}
	// DEF prompts are unchanged when headKind is absent (byte-identical above)
	// and when explicitly 'def':
	assert.equal(pushPrompt({ ...defContext(), headKind: 'def' }), def, 'headKind def === absent (byte-identical)');
	assert.equal(pushVerifyPrompt({ ...defContext(), headKind: 'def' }), defVerify);
});
