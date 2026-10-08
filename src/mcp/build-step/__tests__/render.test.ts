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

test('the implement prompts tell the implementer to merge upstream with --no-ff and commit the merge on its own', () => {
	const prompts = [
		renderImplementPrompt('/repo', TASK, ''),
		renderStandaloneImplementPrompt({ storyId: 'S001', sizeClass: 'small', producesLld: true, focus: 'x', resolvedDecisions: '' }),
		renderStandaloneImplementPrompt({ storyId: 'S001', sizeClass: 'trivial', producesLld: false, focus: 'x', resolvedDecisions: '' }),
	];
	for (const prompt of prompts) {
		assert.ok(prompt.includes('## Merging upstream'), 'has the merge section');
		assert.match(prompt, /git merge --no-ff/);
		assert.match(prompt, /commit the merge on its own, before any further\s+Story change/);
		assert.match(prompt, /Never squash-merge or fast-forward upstream/);
		assert.equal(prompt.includes('{{mergeRule}}'), false, 'the placeholder is filled');
	}
});

// ---------------------------------------------------------------------------
// The judge's evidence lists the named tests (LLD-9b4a74dc-S001, task t7)
// ---------------------------------------------------------------------------

test("the judge's evidence lists each named test with its cases and results; with no named tests the evidence reads as before", async () => {
	const { renderCheckEvidence } = await import('../phases/validate.js');
	const typecheck = { ok: true, command: 'npx tsc --noEmit', exitCode: 0, timedOut: false, durationMs: 1200, outputTail: '' };
	const base = { ok: false, command: 'node --test a.test.ts', exitCode: 1, timedOut: false, durationMs: 300, outputTail: '# fail 1', note: 'a note' };

	// No named tests: exactly the two sections there were, with or without the empty new fields.
	const before = renderCheckEvidence({ typecheck, tests: base });
	assert.equal(before, [
		'### Typecheck: PASSED\n- command: `npx tsc --noEmit`\n- exit code: 0 · 1.2 s',
		'### Tests: FAILED\n- command: `node --test a.test.ts`\n- exit code: 1 · 0.3 s\n- note: a note\n- output (tail):\n```\n# fail 1\n```',
	].join('\n\n'));
	assert.equal(renderCheckEvidence({ typecheck, tests: { ...base, files: [], namedTests: [] } }), before);

	const A = 'src/a/__tests__/a.test.ts';
	const evidence = renderCheckEvidence({ typecheck, tests: { ...base,
		files: [{ file: A, command: 'c', exitCode: 1, timedOut: false, durationMs: 300, outputPath: '/tmp/out/a.tap', titles: [
			{ title: 'adds', depth: 0, result: 'pass' }, { title: 'subtracts', depth: 0, result: 'fail' }, { title: 'an unrelated one', depth: 0, result: 'fail' },
		] }],
		namedTests: [
			{ name: 'the arithmetic works', level: 'unit', source: 'mapping', files: [], cases: [{ file: A, title: 'adds', result: 'pass' }, { file: A, title: 'subtracts', result: 'fail' }, { file: A, title: 'divides', result: 'not found' }] },
			{ name: 'a.test.ts: by file', level: 'unit', source: 'prefix', cases: [], files: [A] },
			{ name: 'runs against the real daemon', level: 'live', source: 'mapping', cases: [], files: [], reported: { result: 'pass', evidence: 'run 12' } },
			{ name: 'prose nobody mapped', level: 'integration', source: 'none', cases: [], files: [] },
		],
	} });
	assert.ok(evidence.startsWith(before), 'the two sections are unchanged and come first');
	assert.equal(evidence.slice(before.length), '\n\n' + [
		'#### Named tests',
		'- unit: the arithmetic works',
		`  - pass: 'adds' in \`${A}\``,
		`  - fail: 'subtracts' in \`${A}\``,
		`  - not found: 'divides' in \`${A}\``,
		'- unit: a.test.ts: by file',
		`  - fail (by file, no cases named): \`${A}\``,
		'- live: runs against the real daemon',
		'  - REPORTED BY THE BUILDER, not run by the gate: pass. Evidence: run 12',
		'- integration: prose nobody mapped',
		'  - nothing was run for this test: no test case was named for it',
		'',
		'#### Failures in the files outside the named cases',
		`- 'an unrelated one' in \`${A}\``,
		'',
		"#### Whole output of each file's run",
		`- \`${A}\`: /tmp/out/a.tap`,
	].join('\n'));
});

test("the implement prompt tells the builder to pass the cases for each listed test at the validate turn, and the judge's evidence lists each named test with its cases and results; with no named tests the evidence reads as before", async () => {
	// The plan-driven implement prompt: the rule sits under the Task's listed tests.
	const implement = renderImplementPrompt('/repo', TASK, '');
	const listed = implement.indexOf("- unit: render.test.ts: 'x'");
	const rule = implement.indexOf('**Say which test cases carry each test.**');
	assert.ok(listed !== -1 && rule > listed, 'the mapping rule follows the listed tests');
	for (const phrase of ['pass `tests` to the validate turn', "`name` the test's text exactly as listed", '`file`', '`title`', '`TESTS.md` beside', 'is skipped, or is not found', '`live` or `smoke`', '`reported`', 'not run by the gate']) {
		assert.ok(implement.includes(phrase), `implement prompt lacks: ${phrase}`);
	}
	assert.match(implement, /with the `tests` mapping described above\.\s*$/);
	// A standalone build WITH a design is told the same, by subject; a trivial one (no design, no named tests) is not.
	const small = renderStandaloneImplementPrompt({ storyId: 'S001', sizeClass: 'small', producesLld: true, focus: 'f', lldMdRel: 'docs/x/LLD.md', resolvedDecisions: '' });
	assert.ok(small.includes('## Submitting the tests') && small.includes("`name` the subject's text exactly as the design states it") && small.includes('`reported`'));
	assert.ok(!renderStandaloneImplementPrompt({ storyId: 'S001', sizeClass: 'trivial', producesLld: false, focus: 'f', resolvedDecisions: '' }).includes('## Submitting the tests'));

	// The judge is told what to check about the named tests and the reported results, on both routes.
	for (const prompt of [renderValidatePrompt('/repo', TASK, 'E'), renderStandaloneValidatePrompt({ storyId: 'S001', sizeClass: 'small', lldMdRel: 'docs/x/LLD.md', evidence: 'E' })]) {
		assert.ok(prompt.includes('do exercise what its name says'), 'the judge checks the cases against the name');
		assert.ok(prompt.includes('**REPORTED BY THE BUILDER**') && prompt.includes('check that the evidence it points to exists'));
		assert.ok(!prompt.includes('{{'), 'no placeholder is left unfilled');
	}

	// The guide's build section says the same, and the guide tool's reader returns it.
	const { readWorkflowGuide } = await import('../../../daemon/guide-sections.js');
	const { readSteeringBlock } = await import('../../../daemon/steering-inject.js');
	const guide = readWorkflowGuide(readSteeringBlock(), 'build');
	assert.ok(typeof guide === 'string' && guide.length > 0);
	for (const phrase of ["At `phase:'validate'`", 'pass `tests`', '`TESTS.md` beside `BUILD.md`', '`invalid-test-mapping`', 'it is never approved', '`reported: { result, evidence }`']) {
		assert.ok((guide as string).includes(phrase), `the build guide lacks: ${phrase}`);
	}

	// The evidence half: named tests listed case by case; nothing added when none is named.
	const { renderCheckEvidence } = await import('../phases/validate.js');
	const typecheck = { ok: true, command: 't', exitCode: 0, timedOut: false, durationMs: 1, outputTail: '' };
	const tests = { ok: true, command: 'c', exitCode: 0, timedOut: false, durationMs: 1, outputTail: '' };
	assert.ok(!renderCheckEvidence({ typecheck, tests }).includes('Named tests'));
	const withNamed = renderCheckEvidence({ typecheck, tests: { ...tests, files: [], namedTests: [{ name: 'n', level: 'unit', source: 'mapping', files: [], cases: [{ file: 'a.test.ts', title: 't', result: 'pass' }] }] } });
	assert.ok(withNamed.includes("#### Named tests\n- unit: n\n  - pass: 't' in `a.test.ts`"));
});
