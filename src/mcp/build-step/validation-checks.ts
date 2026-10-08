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
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { runInProcessGroup, type ProcessGroupOpts, type ProcessGroupResult } from '../../shared/process-group.js';
import type { NamedTestSource, TestCaseResult, TestRecordNamedTest, TestRecordReported } from '../../workflow/runners/build/test-record.js';

import { parseTapRun, resultOfTitle, type TapTitle } from './tap-results.js';
import type { NamedTest, TestCaseRef, TestMappingEntry } from './test-mapping.js';

const log = getLogger('build-validate-checks');

/** The repo's typecheck (CLAUDE.md). */
export const TYPECHECK_ARGV: readonly string[] = ['npx', 'tsc', '--noEmit'];
/** The repo's test runner, forced to exit once its tests finish (a test file
 *  whose process would otherwise stay alive still ends: ISSUE-b544025d). */
export const TEST_RUNNER_ARGV: readonly string[] = ['npx', 'tsx', '--test', '--test-force-exit'];

export const TYPECHECK_TIMEOUT_MS = 300_000;
export const TEST_TIMEOUT_MS      = 600_000;

/** How much of a command's combined output is kept as evidence in the verdict
 *  and the judge's prompt. The WHOLE output of each test file's run is written
 *  to a file whose path is returned beside it; nothing is lost to this cut. */
const OUTPUT_TAIL_CHARS = 4_000;

/** Added to the test runner's command so each file's run can be read title by title. */
export const TAP_REPORTER_ARG = '--test-reporter=tap';

/** One test the plan (or the design) names, and where its files come from. */
export interface NamedTestPlan {
	readonly name:      string;
	readonly level?:    string | undefined;
	readonly source:    NamedTestSource;
	/** 'mapping': the cases the builder named. */
	readonly cases:     readonly TestCaseRef[];
	/** The files to run for it: the cases' files, the prefix's, or the touched one. */
	readonly files:     readonly string[];
	readonly reported?: TestRecordReported | undefined;
}

/** One test file's own run. */
export interface TestFileRun {
	readonly file:        string;
	readonly command:     string;
	readonly exitCode:    number | null;
	readonly timedOut:    boolean;
	readonly durationMs:  number;
	/** Every result line the file's run printed. */
	readonly titles:      readonly TapTitle[];
	/** A file holding the run's WHOLE output (stdout then stderr); absent when it could not be written. */
	readonly outputPath?: string | undefined;
	readonly note?:       string | undefined;
}

export interface ValidationCheckPlan {
	/** argv of the typecheck. */
	readonly typecheck:          readonly string[];
	/** argv prefix of the test runner; the test files are appended. */
	readonly testCommand:        readonly string[];
	/** Repo-relative test files to run. */
	readonly testFiles:          readonly string[];
	/** Test names that could not be mapped to a file; any one fails the tests check. */
	readonly unresolvedTests:    readonly string[];
	/** Per named test: where its files come from and which cases it expects. */
	readonly namedTests:         readonly NamedTestPlan[];
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
	/** Tests check only: one entry per test file run. */
	readonly files?:      readonly TestFileRun[] | undefined;
	/** Tests check only: per named test, its cases with a result each. */
	readonly namedTests?: readonly TestRecordNamedTest[] | undefined;
}

export interface ValidationCheckResults {
	readonly typecheck: CheckResult;
	readonly tests:     CheckResult;
}

export interface CheckRunnerDeps {
	readonly run: (command: string, args: readonly string[], opts: ProcessGroupOpts) => Promise<ProcessGroupResult>;
	/** Writes one test file's whole output and returns the path. Defaults to a
	 *  file under the system's temporary directory; tests supply a stand-in. */
	readonly writeOutput?: ((file: string, output: string) => string) | undefined;
	/** The clock, for the one time limit all test files share. */
	readonly now?: (() => number) | undefined;
}

// ---------------------------------------------------------------------------
// Test-file resolution
// ---------------------------------------------------------------------------

/** A leading '<base>.test.ts:' prefix — the convention plans use for test names. */
const LEADING_TEST_FILE = /^\s*([A-Za-z0-9_.-]+\.test\.ts)\s*:/;

export function trackedFiles(repoPath: string): string[] {
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

/** The files the builder's cases name for one entry, once each, in order. */
function filesOfCases(cases: readonly TestCaseRef[]): string[] {
	return [...new Set(cases.map(c => c.file))];
}

/**
 * One named test's plan: the mapping's entry when it has one, else the files
 * its own leading file name resolves to, else nothing. The mapping WINS over a
 * prefix: a mapped name's prefix is not used.
 */
function planNamedTest(repoPath: string, test: NamedTest, entry: TestMappingEntry | undefined): NamedTestPlan {
	const level = test.level !== undefined ? { level: test.level } : {};
	if (entry !== undefined) {
		const cases = (entry.cases ?? []).map(c => ({ file: c.file, title: c.title }));
		return {
			name: test.name, ...level, source: 'mapping', cases, files: filesOfCases(cases),
			...(entry.reported !== undefined ? { reported: { result: entry.reported.result, evidence: entry.reported.evidence } } : {}),
		};
	}
	const { files } = resolveTaskTestFiles(repoPath, [test.name]);
	return { name: test.name, ...level, source: files.length > 0 ? 'prefix' : 'none', cases: [], files };
}

function sortedUnion(named: readonly NamedTestPlan[]): string[] {
	return [...new Set(named.flatMap(n => n.files))].sort();
}

/** Plan-driven build: the Task's named tests, with the builder's mapping when there is one. */
export function planTaskCheckPlan(
	repoPath: string,
	task:     { readonly tests: readonly { readonly level?: string | undefined; readonly name: string }[] },
	mapping?: readonly TestMappingEntry[],
): ValidationCheckPlan {
	const byName = new Map((mapping ?? []).map(e => [e.name, e]));
	const namedTests = task.tests.map(t => planNamedTest(repoPath, t, byName.get(t.name)));
	return {
		...basePlan(), testFiles: sortedUnion(namedTests),
		unresolvedTests: namedTests.filter(n => n.source === 'none').map(n => n.name),
		namedTests,
		...(task.tests.length === 0 ? { noTests: { ok: false, note: 'the plan task names no tests' } } : {}),
	};
}

/** Small standalone build: the test names in its LLD's test strategy. A subject
 *  the builder mapped is run through its cases; one that begins with a file name
 *  is run by that file; a prose subject with neither is listed as not mapped
 *  and, as before, does not fail the check. */
export function smallStandaloneCheckPlan(
	repoPath: string,
	testStrategy: { readonly testLevels: readonly { readonly level?: string | undefined; readonly subjects: readonly string[] }[] } | undefined,
	mapping?: readonly TestMappingEntry[],
): ValidationCheckPlan {
	const byName = new Map((mapping ?? []).map(e => [e.name, e]));
	const subjects: NamedTest[] = (testStrategy?.testLevels ?? []).flatMap(l => l.subjects.map(name => ({ name, ...(l.level !== undefined ? { level: l.level } : {}) })));
	const namedTests = subjects.map(t => planNamedTest(repoPath, t, byName.get(t.name)));
	const runnable = namedTests.filter(n => n.source === 'mapping' || LEADING_TEST_FILE.test(n.name));
	if (runnable.length === 0) {
		return { ...basePlan(), testFiles: [], unresolvedTests: [], namedTests, noTests: { ok: false, note: 'the LLD names no test file' } };
	}
	return {
		...basePlan(), testFiles: sortedUnion(namedTests),
		// Only a subject that NAMES a file and resolves to none is unresolved.
		unresolvedTests: namedTests.filter(n => n.source === 'none' && LEADING_TEST_FILE.test(n.name)).map(n => n.name),
		namedTests,
	};
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
		namedTests: testFiles.map(file => ({ name: file, source: 'touched' as const, cases: [], files: [file] })),
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

/** The default writer of one test file's whole output. */
let outputDir: string | undefined;
function writeOutputFile(file: string, output: string): string {
	outputDir ??= mkdtempSync(join(tmpdir(), 'insrc-validate-output-'));
	const path = join(outputDir, `${file.replace(/[^A-Za-z0-9._-]+/g, '_')}.${Date.now()}.tap`);
	writeFileSync(path, output, { mode: 0o600 });
	return path;
}

const NOTE_ALL_REPORTED = 'the gate ran no test: every named test of this Task was reported by the builder';
const NOTE_LIMIT_USED_UP = 'not run: the time limit was used up';
const NOTE_NOT_UNDERSTOOD = 'the output of the run was not understood as TAP';

function unresolvedNote(names: readonly string[]): string {
	return `named tests matched no test file: ${names.join('; ')} (pass a \`tests\` mapping at the validate turn: for each named test, the file and title of the test cases that carry it)`;
}

/**
 * The environment of a test file's run: this process's, without the marker the
 * node test runner sets on its own children.
 *
 * With `NODE_TEST_CONTEXT` inherited, `node --test` decides it is being called
 * from inside a test file, runs NO file, prints nothing and exits with 0. That
 * is what a run of the gate looks like when the gate itself is under a test
 * runner (its own tests; a test file the gate runs that drives the gate). A run
 * that ran nothing must not read as a pass, so the marker is never passed on.
 */
function testRunEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env['NODE_TEST_CONTEXT'];
	return env;
}

/** Run one test file on its own, under what is left of the shared limit. */
async function runTestFile(
	repoPath: string, plan: ValidationCheckPlan, file: string, remainingMs: number, deps: CheckRunnerDeps,
): Promise<{ readonly run: TestFileRun; readonly output: string }> {
	const argv = [...plan.testCommand, TAP_REPORTER_ARG, file];
	const command = argv.join(' ');
	if (remainingMs <= 0) {
		return { run: { file, command, exitCode: null, timedOut: true, durationMs: 0, titles: [], note: NOTE_LIMIT_USED_UP }, output: '' };
	}
	const [cmd, ...args] = argv;
	if (cmd === undefined) {
		return { run: { file, command, exitCode: null, timedOut: false, durationMs: 0, titles: [], note: 'empty command' }, output: '' };
	}
	const r = await deps.run(cmd, args, { cwd: repoPath, timeoutMs: remainingMs, env: testRunEnv() });
	const output = `${r.stdout}${r.stderr.length > 0 ? `\n${r.stderr}` : ''}`;
	const notes: string[] = [];
	if (r.spawnError !== undefined) notes.push(`could not start: ${r.spawnError}`);
	if (r.timedOut) notes.push(`timed out after ${Math.round(remainingMs / 1000)} s`);
	const tap = parseTapRun(output);
	if (r.spawnError === undefined && !tap.understood) notes.push(NOTE_NOT_UNDERSTOOD);
	let outputPath: string | undefined;
	try {
		outputPath = (deps.writeOutput ?? writeOutputFile)(file, output);
	} catch (err) {
		notes.push(`the whole output could not be written to a file: ${err instanceof Error ? err.message : String(err)}`);
	}
	return {
		run: {
			file, command,
			exitCode:   r.spawnError !== undefined || r.timedOut ? null : r.exitCode,
			timedOut:   r.timedOut,
			durationMs: r.durationMs,
			titles:     tap.titles,
			...(outputPath !== undefined ? { outputPath } : {}),
			...(notes.length > 0 ? { note: notes.join('; ') } : {}),
		},
		output,
	};
}

/** Each named test with a result on each of its cases. A case whose file was
 *  not run, or whose title did not run in it, is `not found`. */
function namedResults(named: readonly NamedTestPlan[], runs: readonly TestFileRun[]): TestRecordNamedTest[] {
	const byFile = new Map(runs.map(r => [r.file, r]));
	return named.map((n): TestRecordNamedTest => ({
		name: n.name,
		...(n.level !== undefined ? { level: n.level } : {}),
		source: n.source,
		cases: n.cases.map(c => {
			const run = byFile.get(c.file);
			const result: TestCaseResult = run === undefined ? 'not found' : resultOfTitle({ understood: true, titles: run.titles }, c.title);
			return { file: c.file, title: c.title, result };
		}),
		files: n.source === 'mapping' ? [] : [...n.files],
		...(n.reported !== undefined ? { reported: n.reported } : {}),
	}));
}

/**
 * Run the typecheck, then the tests, serially, each in its own process group
 * under its own limit. Never throws: a spawn failure or timeout is a failed
 * CheckResult with a note.
 *
 * Each test file is run ON ITS OWN, one after another, with the TAP reporter:
 * the runner's output for several files is one flat list that does not say
 * which file a test came from, so a result can be tied to a file only this
 * way. The plan's time limit covers all the files together.
 *
 * The tests check passes only when every file exited with 0, none timed out,
 * no name is unresolved, every case of every named test passed (a skipped case
 * does not satisfy its test), and no result the builder reported is 'fail'.
 */
export async function runValidationChecks(
	repoPath: string,
	plan: ValidationCheckPlan,
	deps: CheckRunnerDeps = { run: runInProcessGroup },
): Promise<ValidationCheckResults> {
	const typecheck = await runOne(repoPath, plan.typecheck, plan.typecheckTimeoutMs, deps);

	const named = plan.namedTests;
	const reportedFail = named.filter(n => n.reported?.result === 'fail').map(n => n.name);
	const reportedFailNote = reportedFail.length > 0 ? `reported as failed by the builder: ${reportedFail.join('; ')}` : undefined;

	let tests: CheckResult;
	if (plan.testFiles.length === 0) {
		const allReported = named.length > 0 && named.every(n => n.cases.length === 0 && n.reported?.result === 'pass');
		const note = plan.unresolvedTests.length > 0
			? unresolvedNote(plan.unresolvedTests)
			: allReported ? NOTE_ALL_REPORTED : plan.noTests?.note ?? 'no test files to run';
		const ok = plan.unresolvedTests.length === 0 && reportedFail.length === 0 && (allReported || (plan.noTests?.ok ?? false));
		tests = {
			ok, command: '', exitCode: null, timedOut: false, durationMs: 0, outputTail: '',
			note: [note, reportedFailNote].filter(n => n !== undefined).join('; '),
			files: [], namedTests: namedResults(named, []),
		};
	} else {
		const now = deps.now ?? Date.now;
		const deadline = now() + plan.testTimeoutMs;
		const runs: TestFileRun[] = [];
		let lastOutput = '';
		for (const file of plan.testFiles) {
			const { run, output } = await runTestFile(repoPath, plan, file, deadline - now(), deps);
			runs.push(run);
			if (output.length > 0) lastOutput = output;
		}
		const results = namedResults(named, runs);
		const badCases = results.flatMap(n => n.cases.filter(c => c.result !== 'pass').map(c => `${c.result}: '${c.title}' in ${c.file}`));
		const failedFiles = runs.filter(r => r.exitCode !== 0 || r.timedOut);
		const notes = [
			...runs.filter(r => r.note !== undefined).map(r => `${r.file}: ${r.note}`),
			...(badCases.length > 0 ? [`named test cases that did not pass: ${badCases.join('; ')}`] : []),
			...(plan.unresolvedTests.length > 0 ? [unresolvedNote(plan.unresolvedTests)] : []),
			...(reportedFailNote !== undefined ? [reportedFailNote] : []),
		];
		tests = {
			ok: failedFiles.length === 0 && badCases.length === 0 && plan.unresolvedTests.length === 0 && reportedFail.length === 0,
			command:    runs.map(r => r.command).join('\n'),
			exitCode:   failedFiles.length === 0 ? 0 : failedFiles[0]!.exitCode,
			timedOut:   runs.some(r => r.timedOut),
			durationMs: runs.reduce((sum, r) => sum + r.durationMs, 0),
			outputTail: tail(lastOutput),
			...(notes.length > 0 ? { note: notes.join('; ') } : {}),
			files: runs, namedTests: results,
		};
	}
	return { typecheck, tests };
}
