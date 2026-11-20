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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { SMALLEST_CHANGE_RULE } from '../../../../workflow/runners/scope-prompts.js';

import { defaultCommandProfile } from '../validation-checks.js';
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

/** A repository root of a project of the given type: only its marker file. */
function markerDir(marker: string | undefined): string {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-render-'));
	if (marker !== undefined) writeFileSync(join(dir, marker), '');
	cleanup.push(dir);
	return dir;
}
const cleanup: string[] = [];
after(() => { for (const d of cleanup) rmSync(d, { recursive: true, force: true }); });
/** A Node project: the gate's default commands apply. */
const NODE_REPO = markerDir('package.json');

const SWEEP = "npx tsx --test 'src/**/__tests__/*.test.ts'";
const TYPECHECK = 'npx tsc --noEmit';

/** Phrases that would tell the judge to run something. */
const RUN_INSTRUCTION = /\b(run|execute)\b[^.\n]*(`|npx|tsc|tsx|test|git )/i;

function validatePrompts(evidence: string): string[] {
	return [
		renderValidatePrompt(NODE_REPO, TASK, evidence),
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
		// A codex judge reads only through commands, so read-only ones are allowed (ISSUE-ae2d83c6).
		assert.doesNotMatch(prompt, /cannot run commands/i);
		assert.match(prompt, /read-only\s+commands/i);
		assert.match(prompt, /do not try to run the typecheck or the tests/i);
	}

	const implement = renderImplementPrompt(NODE_REPO, TASK, '');
	assert.ok(implement.includes(SWEEP));
	assert.ok(implement.includes(TYPECHECK));
	const standaloneImplement = renderStandaloneImplementPrompt({ epicHash: 'f1bf0fb3085c629c', storyId: 'S001', sizeClass: 'small', producesLld: true, focus: 'x', resolvedDecisions: '' });
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
		renderImplementPrompt(NODE_REPO, TASK, ''),
		renderStandaloneImplementPrompt({ epicHash: 'f1bf0fb3085c629c', storyId: 'S001', sizeClass: 'small', producesLld: true, focus: 'x', resolvedDecisions: '' }),
		renderStandaloneImplementPrompt({ epicHash: 'f1bf0fb3085c629c', storyId: 'S001', sizeClass: 'trivial', producesLld: false, focus: 'x', resolvedDecisions: '' }),
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
	const implement = renderImplementPrompt(NODE_REPO, TASK, '');
	const listed = implement.indexOf("- unit: render.test.ts: 'x'");
	const rule = implement.indexOf('**Say which test cases carry each test.**');
	assert.ok(listed !== -1 && rule > listed, 'the mapping rule follows the listed tests');
	for (const phrase of ['pass `tests` to the validate turn', "`name` the test's text exactly as listed", '`file`', '`title`', '`TESTS.md` beside', 'is skipped, or is not found', '`live` or `smoke`', '`reported`', 'not run by the gate']) {
		assert.ok(implement.includes(phrase), `implement prompt lacks: ${phrase}`);
	}
	assert.match(implement, /with the `tests` mapping described above\.\s*$/);
	// A standalone build WITH a design is told the same, by subject; a trivial one (no design, no named tests) is not.
	const small = renderStandaloneImplementPrompt({ epicHash: 'f1bf0fb3085c629c', storyId: 'S001', sizeClass: 'small', producesLld: true, focus: 'f', lldMdRel: 'docs/x/LLD.md', resolvedDecisions: '' });
	assert.ok(small.includes('## Submitting the tests') && small.includes("`name` the subject's text exactly as the design states it") && small.includes('`reported`'));
	assert.ok(!renderStandaloneImplementPrompt({ epicHash: 'f1bf0fb3085c629c', storyId: 'S001', sizeClass: 'trivial', producesLld: false, focus: 'f', resolvedDecisions: '' }).includes('## Submitting the tests'));

	// The judge is told what to check about the named tests and the reported results, on both routes.
	for (const prompt of [renderValidatePrompt(NODE_REPO, TASK, 'E'), renderStandaloneValidatePrompt({ storyId: 'S001', sizeClass: 'small', lldMdRel: 'docs/x/LLD.md', evidence: 'E' })]) {
		assert.ok(prompt.includes('do exercise what its name says'), 'the judge checks the cases against the name');
		assert.ok(prompt.includes('**REPORTED BY THE BUILDER**') && prompt.includes('check that the evidence it points to exists'));
		assert.ok(!prompt.includes('{{'), 'no placeholder is left unfilled');
	}

	// The guide's build section says the same, and the guide tool's reader returns it.
	const { readWorkflowGuide } = await import('../../../guide-sections.js');
	const { readSteeringBlock } = await import('../../../steering-inject.js');
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

// ---------------------------------------------------------------------------
// The smallest complete change (Story E2026101614851595:S001)
// ---------------------------------------------------------------------------

const implementPrompts = (): string[] => [
	renderImplementPrompt(NODE_REPO, TASK, ''),
	renderStandaloneImplementPrompt({ epicHash: 'f1bf0fb3085c629c', storyId: 'S001', sizeClass: 'small', producesLld: true, focus: 'x', lldMdRel: 'docs/x/LLD.md', resolvedDecisions: '' }),
	renderStandaloneImplementPrompt({ epicHash: 'f1bf0fb3085c629c', storyId: 'S001', sizeClass: 'trivial', producesLld: false, focus: 'x', resolvedDecisions: '' }),
];

test('every implement prompt, plan-driven and standalone Small and Trivial, carries the smallest-complete-change section with the rule filled in and no placeholder left', () => {
	for (const prompt of implementPrompts()) {
		const start = prompt.indexOf('## The smallest complete change');
		assert.ok(start >= 0, 'has the section');
		const found = prompt.indexOf('\n## ', start + 1);
		const section = prompt.slice(start, found < 0 ? undefined : found);
		assert.ok(section.includes(SMALLEST_CHANGE_RULE), 'the shared rule sits inside the section');
		assert.equal(prompt.includes('{{'), false, 'no placeholder is left');
		assert.equal(prompt.includes('smallestChangeRule'), false);
	}
});

test('the build rule names each step of the ladder and the analyzer check, and the limits: the Task or LLD is the spec, the named tests stay required, and validation, error handling, security and accessibility are never cut', () => {
	// The ladder, in order.
	const steps = ['Does it need to exist at all?', 'already in this codebase', 'standard library or a platform feature', 'installed dependency', 'Can it be one line', 'minimum code that works'];
	let at = -1;
	for (const step of steps) {
		const found = SMALLEST_CHANGE_RULE.indexOf(step);
		assert.ok(found > at, `"${step}" comes in order`);
		at = found;
	}
	assert.match(SMALLEST_CHANGE_RULE, /first option that fully works/);
	// The analyzer rung, with its fall-back.
	assert.match(SMALLEST_CHANGE_RULE, /`insrc_analyze_step`/);
	assert.match(SMALLEST_CHANGE_RULE, /search and read the code yourself/);
	// The limits.
	assert.match(SMALLEST_CHANGE_RULE, /the Task \(or the LLD\) is the spec/);
	assert.match(SMALLEST_CHANGE_RULE, /tests it names are still required/);
	assert.match(SMALLEST_CHANGE_RULE, /validation at trust boundaries/);
	assert.match(SMALLEST_CHANGE_RULE, /error handling that prevents data loss/);
	assert.match(SMALLEST_CHANGE_RULE, /security or accessibility/);
	assert.match(SMALLEST_CHANGE_RULE, /never about the change/);
});

test('the implement prompts keep every section and rule they had before the new section was added', () => {
	for (const prompt of implementPrompts()) {
		assert.ok(prompt.includes('## Merging upstream'));
		assert.match(prompt, /git merge --no-ff/);
		assert.ok(prompt.includes(SWEEP));
		assert.ok(prompt.includes(TYPECHECK));
	}
	const [plan, small, trivial] = implementPrompts() as [string, string, string];
	assert.match(plan, /Implement exactly\s+this Task/);
	assert.ok(plan.includes('## Process') && plan.includes('## Guardrails'));
	assert.ok(plan.indexOf('## The smallest complete change') < plan.indexOf('## Process'), 'before the process steps');
	assert.ok(small.includes('## Definition of done') && small.includes('## Submitting the tests'));
	assert.ok(small.indexOf('## The smallest complete change') < small.indexOf('## Definition of done'));
	assert.ok(!trivial.includes('## Submitting the tests'), 'a Trivial build still has no tests section');
	assert.match(trivial, /make the smallest correct edit/);
	// The validate prompts are untouched: no smallest-change section.
	for (const prompt of validatePrompts('evidence')) assert.equal(prompt.includes('The smallest complete change'), false);
});

test('a trivial standalone validate prompt carries the build\'s stated scope; a small one points at its LLD instead', () => {
	const trivial = renderStandaloneValidatePrompt({ storyId: 'S001', sizeClass: 'trivial', scope: 'Send codex the strict schema.', evidence: 'E' });
	assert.match(trivial, /## Stated scope\n\nSend codex the strict schema\.\n/);
	assert.equal(renderStandaloneValidatePrompt({ storyId: 'S001', sizeClass: 'trivial', evidence: 'E' }).includes('## Stated scope'), false, 'no empty section');
	const small = renderStandaloneValidatePrompt({ storyId: 'S001', sizeClass: 'small', lldMdRel: 'docs/x/LLD.md', scope: 'ignored', evidence: 'E' });
	assert.equal(small.includes('## Stated scope'), false);
	assert.ok(small.includes('docs/x/LLD.md'));
});

// ---------------------------------------------------------------------------
// The prompts name the commands of the project's type (LLD-787434000fa22691-s1, t4)
// ---------------------------------------------------------------------------

test("the prompt of a Node project still names npx tsc --noEmit and the Node test command", () => {
	const implement = renderImplementPrompt(NODE_REPO, TASK, '');
	assert.ok(implement.includes(`\`${TYPECHECK}\` and \`${SWEEP}\``), 'the process step names both commands');
	const standalone = renderStandaloneImplementPrompt({ epicHash: 'f1bf0fb3085c629c', storyId: 'S001', sizeClass: 'small', producesLld: true, focus: 'x', resolvedDecisions: '' });
	assert.ok(standalone.includes(`- \`${TYPECHECK}\` is clean.`) && standalone.includes(`- \`${SWEEP}\` passes`));
	for (const prompt of [renderValidatePrompt(NODE_REPO, TASK, 'E'), renderStandaloneValidatePrompt({ storyId: 'S001', sizeClass: 'small', evidence: 'E' })]) {
		assert.match(prompt, /the daemon\s+has already run them and reports the results below/);
	}
});

test("the implement-task prompt and the Definition of done for a Python, Go, Rust and JVM project name that type's commands and no npx tsc or npx tsx", () => {
	const cases: ReadonlyArray<readonly [string, 'python' | 'go' | 'rust' | 'jvm', string, string]> = [
		['pyproject.toml', 'python', 'mypy .', 'pytest'],
		['go.mod', 'go', 'go vet ./...', 'go test ./...'],
		['Cargo.toml', 'rust', 'cargo check', 'cargo test'],
		['pom.xml', 'jvm', 'mvn -q compile', 'mvn -q test'],
	];
	for (const [marker, type, typecheck, tests] of cases) {
		const repo = markerDir(marker);
		const implement = renderImplementPrompt(repo, TASK, '');
		const standalone = renderStandaloneImplementPrompt({
			epicHash: 'f1bf0fb3085c629c', storyId: 'S001', sizeClass: 'small', producesLld: true, focus: 'x', resolvedDecisions: '',
			profile: defaultCommandProfile(type),
		});
		for (const prompt of [implement, standalone]) {
			assert.ok(prompt.includes(typecheck) && prompt.includes(tests), `${type}: names its commands`);
			assert.equal(/npx tsc|npx tsx/.test(prompt), false, `${type}: no Node command`);
		}
	}
	// A project of no known type is told to find its own commands.
	const unknown = renderImplementPrompt(markerDir(undefined), TASK, '');
	assert.match(unknown, /project's own typecheck or compile command and the project's own test command, found in its build files/);
	assert.equal(/npx tsc|npx tsx/.test(unknown), false);
});

test("the 'daemon already ran' text is absent when commandsSource is none", () => {
	const go = markerDir('go.mod');
	for (const prompt of [
		renderValidatePrompt(go, TASK, 'E'),
		renderStandaloneValidatePrompt({ storyId: 'S001', sizeClass: 'small', evidence: 'E', profile: defaultCommandProfile('go') }),
	]) {
		assert.equal(/already run them/.test(prompt), false);
		assert.match(prompt, /The daemon ran no typecheck or tests/);
		assert.match(prompt, /Do not change anything/);
	}
});

// ---------------------------------------------------------------------------
// The mapping instructions follow the profile (the builder's `tests` mapping)
// ---------------------------------------------------------------------------

test("the mapping instructions follow the project's profile: native test files and file-level checking for a configured non-Node project, per-case checking in .test.ts files for Node", () => {
	const repo = markerDir('pyproject.toml');
	const py = (resultFormat: 'exit-code' | 'tap') => ({ ...defaultCommandProfile('python'), typecheck: ['mypy', '.'], testCommand: ['pytest'], resultFormat, commandsSource: 'repo-setting' as const });
	const standalone = (profile: ReturnType<typeof py> | ReturnType<typeof defaultCommandProfile>) => renderStandaloneImplementPrompt({
		epicHash: 'f1bf0fb3085c629c', storyId: 'S001', sizeClass: 'small', producesLld: true, focus: 'x', lldMdRel: 'docs/x/LLD.md', resolvedDecisions: '', profile,
	});

	// Node, no setting: as before: `.test.ts` files, each case checked on its own.
	for (const prompt of [renderImplementPrompt(NODE_REPO, TASK, ''), standalone(defaultCommandProfile('node'))]) {
		assert.ok(prompt.includes('repo-relative path of the `.test.ts` file'));
		assert.ok(prompt.includes('is skipped, or is not found'));
		assert.equal(prompt.includes('NOT checked one by one'), false);
	}
	// A configured Python project, exit-code: its own test files are accepted, and the instructions say the cases are not checked one by one.
	for (const prompt of [renderImplementPrompt(repo, TASK, '', py('exit-code')), standalone(py('exit-code'))]) {
		assert.ok(prompt.includes('tests/test_example.py') && prompt.includes('not only a `.test.ts` file'), 'native files are accepted');
		assert.ok(prompt.includes('NOT checked one by one') && prompt.includes('exit code'), 'file-level checking is stated');
		assert.equal(prompt.includes('is skipped, or is not found'), false, 'no per-case promise');
		assert.equal(prompt.includes('repo-relative path of the `.test.ts` file)'), false);
	}
	// A configured Python project reading TAP: native files, and each case is checked.
	for (const prompt of [renderImplementPrompt(repo, TASK, '', py('tap')), standalone(py('tap'))]) {
		assert.ok(prompt.includes('tests/test_example.py') && prompt.includes('is skipped, or is not found'));
		assert.equal(prompt.includes('NOT checked one by one'), false);
	}
	// A Node project with commands of its own keeps the `.test.ts` rule, checked by file when its format is exit-code.
	const nodeOwn = { ...defaultCommandProfile('node'), typecheck: ['tsc'], testCommand: ['npm', 'test'], resultFormat: 'exit-code' as const, commandsSource: 'repo-setting' as const };
	const nodeOwnPrompt = standalone(nodeOwn);
	assert.ok(nodeOwnPrompt.includes('repo-relative path of the `.test.ts` file') && nodeOwnPrompt.includes('NOT checked one by one'));
	// A project the gate has no command for: nothing is run, and the instructions say so.
	const none = renderImplementPrompt(repo, TASK, '', defaultCommandProfile('python'));
	assert.ok(none.includes('so it runs nothing') && none.includes('repo.settings.set'));
	assert.equal(none.includes('is skipped, or is not found'), false);
	for (const prompt of [renderImplementPrompt(repo, TASK, '', py('tap')), standalone(py('exit-code'))]) assert.equal(prompt.includes('{{'), false, 'no placeholder is left unfilled');
});
