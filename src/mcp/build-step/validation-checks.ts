/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The checks build validate runs ITSELF (ISSUE-f1bf0fb3, LLD-f1bf0fb3-s1, task t2).
 *
 * Validate no longer asks a model to run the tests: the daemon runs the
 * typecheck and the Task's own test files, each in its own process group
 * under its own time limit, and their exit codes become the verdict's
 * testsPassed / typecheckClean. This module resolves which test files a Task
 * names, builds the check plan for each build route, and runs it.
 */

import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { runInProcessGroup, type ProcessGroupOpts, type ProcessGroupResult } from '../../shared/process-group.js';

const log = getLogger('build-validate-checks');

/** The repo's typecheck (CLAUDE.md). */
export const TYPECHECK_ARGV: readonly string[] = ['npx', 'tsc', '--noEmit'];
/** The repo's test runner, forced to exit once its tests finish (a test file
 *  whose process would otherwise stay alive still ends: ISSUE-b544025d). */
export const TEST_RUNNER_ARGV: readonly string[] = ['npx', 'tsx', '--test', '--test-force-exit'];

export const TYPECHECK_TIMEOUT_MS = 300_000;
export const TEST_TIMEOUT_MS      = 600_000;

/** How much of a command's combined output is kept as evidence. */
const OUTPUT_TAIL_CHARS = 4_000;

export interface ValidationCheckPlan {
	/** argv of the typecheck. */
	readonly typecheck:          readonly string[];
	/** argv prefix of the test runner; the test files are appended. */
	readonly testCommand:        readonly string[];
	/** Repo-relative test files to run. */
	readonly testFiles:          readonly string[];
	/** Test names that could not be mapped to a file; any one fails the tests check. */
	readonly unresolvedTests:    readonly string[];
	/** When there are no test files: why, and whether that is acceptable for the route. */
	readonly noTests?:           { readonly ok: boolean; readonly note: string } | undefined;
	readonly typecheckTimeoutMs: number;
	readonly testTimeoutMs:      number;
}

export interface CheckResult {
	readonly ok:         boolean;
	/** The command line that ran ('' when nothing ran). */
	readonly command:    string;
	readonly exitCode:   number | null;
	readonly timedOut:   boolean;
	readonly durationMs: number;
	readonly outputTail: string;
	readonly note?:      string | undefined;
}

export interface ValidationCheckResults {
	readonly typecheck: CheckResult;
	readonly tests:     CheckResult;
}

export interface CheckRunnerDeps {
	readonly run: (command: string, args: readonly string[], opts: ProcessGroupOpts) => Promise<ProcessGroupResult>;
}

// ---------------------------------------------------------------------------
// Test-file resolution
// ---------------------------------------------------------------------------

/** A leading '<base>.test.ts:' prefix — the convention plans use for test names. */
const LEADING_TEST_FILE = /^\s*([A-Za-z0-9_.-]+\.test\.ts)\s*:/;

function trackedFiles(repoPath: string): string[] {
	try {
		return execFileSync('git', ['ls-files'], { cwd: repoPath, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
			.split('\n').filter(f => f.length > 0);
	} catch (err) {
		log.warn({ repoPath, err: err instanceof Error ? err.message : String(err) }, 'validate: git ls-files failed; no test files can be resolved');
		return [];
	}
}

/**
 * Map test names to repo-relative test files. Only a LEADING '<base>.test.ts:'
 * prefix names a file; a '*.test.ts' token elsewhere in a name is not the file
 * under test. Every tracked file with that base name under a __tests__
 * directory is returned. Names that map to nothing are listed in `unresolved`.
 */
export function resolveTaskTestFiles(
	repoPath: string,
	testNames: readonly string[],
): { readonly files: readonly string[]; readonly unresolved: readonly string[] } {
	const byBase = new Map<string, string[]>();
	for (const f of trackedFiles(repoPath)) {
		if (!f.split('/').includes('__tests__')) continue;
		const b = basename(f);
		const list = byBase.get(b);
		if (list === undefined) byBase.set(b, [f]);
		else list.push(f);
	}
	const files = new Set<string>();
	const unresolved: string[] = [];
	for (const name of testNames) {
		const m = LEADING_TEST_FILE.exec(name);
		const matches = m?.[1] === undefined ? undefined : byBase.get(m[1]);
		if (matches === undefined || matches.length === 0) {
			unresolved.push(name);
			continue;
		}
		for (const f of matches) files.add(f);
	}
	return { files: [...files].sort(), unresolved };
}

// ---------------------------------------------------------------------------
// Per-route plans
// ---------------------------------------------------------------------------

function basePlan(): Pick<ValidationCheckPlan, 'typecheck' | 'testCommand' | 'typecheckTimeoutMs' | 'testTimeoutMs'> {
	return { typecheck: TYPECHECK_ARGV, testCommand: TEST_RUNNER_ARGV, typecheckTimeoutMs: TYPECHECK_TIMEOUT_MS, testTimeoutMs: TEST_TIMEOUT_MS };
}

/** Plan-driven build: the Task's named tests. */
export function planTaskCheckPlan(repoPath: string, task: { readonly tests: readonly { readonly name: string }[] }): ValidationCheckPlan {
	const names = task.tests.map(t => t.name);
	const { files, unresolved } = resolveTaskTestFiles(repoPath, names);
	return {
		...basePlan(), testFiles: files, unresolvedTests: unresolved,
		...(names.length === 0 ? { noTests: { ok: false, note: 'the plan task names no tests' } } : {}),
	};
}

/** Small standalone build: the test names in its LLD's test strategy. */
export function smallStandaloneCheckPlan(
	repoPath: string,
	testStrategy: { readonly testLevels: readonly { readonly subjects: readonly string[] }[] } | undefined,
): ValidationCheckPlan {
	const names = (testStrategy?.testLevels ?? []).flatMap(l => l.subjects);
	const named = names.filter(n => LEADING_TEST_FILE.test(n));
	if (named.length === 0) {
		return { ...basePlan(), testFiles: [], unresolvedTests: [], noTests: { ok: false, note: 'the LLD names no test file' } };
	}
	const { files, unresolved } = resolveTaskTestFiles(repoPath, named);
	return { ...basePlan(), testFiles: files, unresolvedTests: unresolved };
}

/** Trivial standalone build (no LLD): the test files the build commit touched, possibly none. */
export function trivialCheckPlan(repoPath: string): ValidationCheckPlan {
	let touched: string[] = [];
	try {
		// --diff-filter=d leaves out files the commit deleted: they no longer exist to run.
		touched = execFileSync('git', ['show', '--name-only', '--diff-filter=d', '--format=', 'HEAD'], { cwd: repoPath, encoding: 'utf8' })
			.split('\n').filter(f => f.endsWith('.test.ts') && f.split('/').includes('__tests__'));
	} catch (err) {
		log.warn({ repoPath, err: err instanceof Error ? err.message : String(err) }, 'validate: could not list the HEAD commit\'s files');
	}
	const testFiles = [...new Set(touched)].sort();
	return {
		...basePlan(), testFiles, unresolvedTests: [],
		...(testFiles.length === 0 ? { noTests: { ok: true, note: 'no tests named for a trivial build' } } : {}),
	};
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

function tail(s: string): string {
	return s.length <= OUTPUT_TAIL_CHARS ? s : s.slice(-OUTPUT_TAIL_CHARS);
}

async function runOne(repoPath: string, argv: readonly string[], timeoutMs: number, deps: CheckRunnerDeps): Promise<CheckResult> {
	const [command, ...args] = argv;
	const line = argv.join(' ');
	if (command === undefined) {
		return { ok: false, command: line, exitCode: null, timedOut: false, durationMs: 0, outputTail: '', note: 'empty command' };
	}
	const r = await deps.run(command, args, { cwd: repoPath, timeoutMs });
	const output = tail(`${r.stdout}${r.stderr.length > 0 ? `\n${r.stderr}` : ''}`);
	if (r.spawnError !== undefined) {
		return { ok: false, command: line, exitCode: null, timedOut: false, durationMs: r.durationMs, outputTail: output, note: `could not start: ${r.spawnError}` };
	}
	if (r.timedOut) {
		return { ok: false, command: line, exitCode: null, timedOut: true, durationMs: r.durationMs, outputTail: output, note: `timed out after ${Math.round(timeoutMs / 1000)} s` };
	}
	return { ok: r.exitCode === 0, command: line, exitCode: r.exitCode, timedOut: false, durationMs: r.durationMs, outputTail: output };
}

/**
 * Run the typecheck, then the tests, serially, each in its own process group
 * under its own limit. Never throws: a spawn failure or timeout is a failed
 * CheckResult with a note.
 */
export async function runValidationChecks(
	repoPath: string,
	plan: ValidationCheckPlan,
	deps: CheckRunnerDeps = { run: runInProcessGroup },
): Promise<ValidationCheckResults> {
	const typecheck = await runOne(repoPath, plan.typecheck, plan.typecheckTimeoutMs, deps);

	let tests: CheckResult;
	if (plan.testFiles.length === 0) {
		const note = plan.unresolvedTests.length > 0
			? `named tests matched no test file: ${plan.unresolvedTests.join('; ')}`
			: plan.noTests?.note ?? 'no test files to run';
		const ok = plan.unresolvedTests.length === 0 && (plan.noTests?.ok ?? false);
		tests = { ok, command: '', exitCode: null, timedOut: false, durationMs: 0, outputTail: '', note };
	} else {
		const ran = await runOne(repoPath, [...plan.testCommand, ...plan.testFiles], plan.testTimeoutMs, deps);
		tests = plan.unresolvedTests.length === 0 ? ran : {
			...ran,
			ok: false,
			note: [ran.note, `named tests matched no test file: ${plan.unresolvedTests.join('; ')}`].filter(n => n !== undefined).join('; '),
		};
	}
	return { typecheck, tests };
}
