/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The validate prompts are judge-only (ISSUE-f1bf0fb3, LLD-f1bf0fb3-s1, task t3):
 * the daemon runs the checks, so the prompts never ask for a command and carry
 * the daemon's results in an evidence section. The implement prompts keep the
 * implementer's definition of done.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	renderImplementPrompt,
	renderStandaloneImplementPrompt,
	renderStandaloneValidatePrompt,
	renderValidatePrompt,
	type ResolvedTask,
} from '../render.js';

const TASK: ResolvedTask = {
	level:      'task',
	epicHash:   'f1bf0fb3085c629c',
	epicSlug:   'insrc-build-step-validate-s-verdict',
	createdAt:  '2026-10-07T12:59:03.938Z',
	storyId:    's1',
	taskId:     't3',
	workflowId: 'E20261007f1bf0fb3:S001:T003',
	slug:       'E20261007f1bf0fb3-S001-T003',
	task: {
		id: 't3', title: 'Judge-only validate prompts', summary: 'Rewrite the validate prompts.',
		size: 'S', order: 3, dependsOn: [], derivedFrom: ['c3'],
		acceptanceChecks: ['Neither validate prompt instructs running a command.'],
		tests: [{ level: 'unit', name: "render.test.ts: 'x'" }],
	},
};

const SWEEP = "npx tsx --test 'src/**/__tests__/*.test.ts'";
const TYPECHECK = 'npx tsc --noEmit';

/** Phrases that would tell the judge to run something. */
const RUN_INSTRUCTION = /\b(run|execute)\b[^.\n]*(`|npx|tsc|tsx|test|git )/i;

function validatePrompts(evidence: string): string[] {
	return [
		renderValidatePrompt('/repo', TASK, evidence),
		renderStandaloneValidatePrompt({ storyId: 'S001', sizeClass: 'small', lldMdRel: 'docs/x/LLD.md', evidence }),
		renderStandaloneValidatePrompt({ storyId: 'S001', sizeClass: 'trivial', evidence }),
	];
}

test('the validate prompts no longer instruct running the repo-wide sweep or any shell command, and the implement prompt still cites it', () => {
	for (const prompt of validatePrompts('evidence')) {
		assert.equal(prompt.includes(SWEEP), false, 'no repo-wide sweep');
		assert.equal(prompt.includes(TYPECHECK), false, 'no typecheck command');
		assert.equal(prompt.includes('git show'), false, 'no git command');
		const runLines = prompt.split('\n').filter(l => RUN_INSTRUCTION.test(l) && !/cannot run|do not try to run|daemon has already run|run by the daemon/i.test(l));
		assert.deepEqual(runLines, [], 'no line instructs the judge to run a command');
		assert.match(prompt, /cannot run commands/i);
	}

	const implement = renderImplementPrompt('/repo', TASK, '');
	assert.ok(implement.includes(SWEEP));
	assert.ok(implement.includes(TYPECHECK));
	const standaloneImplement = renderStandaloneImplementPrompt({ storyId: 'S001', sizeClass: 'small', producesLld: true, focus: 'x', resolvedDecisions: '' });
	assert.ok(standaloneImplement.includes(SWEEP));
	assert.ok(standaloneImplement.includes(TYPECHECK));
});

test('both validate prompts place the given evidence text in an evidence section and ask for the judge verdict shape', () => {
	const evidence = '- typecheck: ok (exit 0)\n- tests: FAILED (exit 1) render.test.ts';
	for (const prompt of validatePrompts(evidence)) {
		const section = prompt.indexOf('## Check results (run by the daemon)');
		assert.ok(section >= 0, 'has an evidence section');
		const next = prompt.indexOf('\n## ', section + 1);
		assert.ok(prompt.slice(section, next).includes(evidence), 'the evidence sits inside that section');
		assert.match(prompt, /"passed": false/);
		assert.match(prompt, /"checks": \[/);
		assert.match(prompt, /"scopeRespected": false/);
		assert.match(prompt, /"reason":/);
		assert.equal(/"testsPassed"|"typecheckClean"/.test(prompt), false, 'the judge does not report test or typecheck results');
	}
	for (const prompt of validatePrompts('')) {
		assert.match(prompt, /No check results were supplied/);
	}
});
