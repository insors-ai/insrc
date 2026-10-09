/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_build_step` phase='validate'.
 *
 * The daemon runs the validation ITSELF (ISSUE-f1bf0fb3): it runs the typecheck
 * and the Task's own test files as its own commands, then asks a read-only
 * reviewer session to judge the acceptance checks and scope against the
 * repository and those results. testsPassed and typecheckClean are the
 * daemon's exit-code facts, and `passed` requires them both and the judge's
 * pass — it is never a controller or model self-report.
 */

import { CliProvider, ReviewSessionTimeoutError, type ReviewSessionOpts } from '../../../agent/providers/cli-provider.js';
import { createRoleRouter } from '../../../analyze/context/role-router.js';
import { runWithRoutingContext, currentRoutingContext } from '../../../analyze/context/shaper-provider.js';
import { loadAnalyzeConfig } from '../../../config/analyze.js';
import { relative } from 'node:path';

import { getLogger } from '../../../shared/logger.js';
import type { StructuredSchema } from '../../../shared/types.js';
import { mergeInProgressError, renderValidatePrompt, renderStandaloneValidatePrompt, resolveRepoPath, resolveTaskRef } from '../render.js';
import { storyWorkflowFiles } from '../../../workflow/runners/build/own-files.js';
import { headShortSha, persistBuildRecord, standaloneEpicHashFromFocus } from '../../../workflow/runners/build/standalone-record.js';
import { resolveStoryRangeBase } from '../../../workflow/runners/build/range-base.js';
import {
	persistTestRecordTask, readTestRecord, storedMappingFor, testRecordPaths, testRecordState,
	type TestRecordFile, type TestRecordTask,
} from '../../../workflow/runners/build/test-record.js';
import { collectBuildChangeLog } from '../../../workflow/runners/build/changed-files.js';
import { mergeInProgress } from '../../../workflow/runners/build/story-commits.js';
import { readLldArtifact } from '../../../workflow/gates.js';
import { inheritedStoryStandalone, lldMdRel, readEpicDefinitionCore, workItemAnchorCreatedAt, workItemKindOf } from '../../../workflow/storage.js';
import { checkTestMapping, oneLine, usableStoredMapping, type NamedTest, type TestMappingEntry } from '../test-mapping.js';
import type { BuildStandaloneContext, BuildStepDone, BuildStepError, BuildStepInputValidate } from '../types.js';
import {
	planTaskCheckPlan,
	runValidationChecks,
	smallStandaloneCheckPlan,
	trackedFiles,
	trivialCheckPlan,
	type CheckResult,
	type ValidationCheckPlan,
	type ValidationCheckResults,
} from '../validation-checks.js';

const log = getLogger('mcp:build-step:validate');

/** The provider surface validate drives: ONE read-only reviewer session (read,
 *  search and the insrc analyze tools; no edits, no shell) that judges the change
 *  and returns a structured verdict. */
export interface ValidateProvider {
	runReviewSession<T>(prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts): Promise<T>;
}

/** Test seam: inject a fake provider whose `runReviewSession` returns a canned
 *  verdict, so the handler is exercised without spawning the live CLI. */
let providerOverride: ValidateProvider | undefined;
export function _setBuildValidateProviderForTests(p: ValidateProvider | undefined): void {
	providerOverride = p;
}

type CheckRunner = (repoPath: string, plan: ValidationCheckPlan) => Promise<ValidationCheckResults>;

/** Test seam: inject a fake check runner so no test spawns a real typecheck or
 *  test runner; it receives the plan validate built for its route. */
let checkRunnerOverride: CheckRunner | undefined;
export function _setBuildValidateCheckRunnerForTests(runner: CheckRunner | undefined): void {
	checkRunnerOverride = runner;
}

/** Test seam: the clock of a validate turn (the one time both records take). */
let clockOverride: (() => string) | undefined;
export function _setBuildValidateClockForTests(clock: (() => string) | undefined): void {
	clockOverride = clock;
}

/** Test seam: the writer of the Story's test record, to make a write fail. */
let testRecordWriterOverride: typeof persistTestRecordTask | undefined;
export function _setBuildValidateTestRecordWriterForTests(writer: typeof persistTestRecordTask | undefined): void {
	testRecordWriterOverride = writer;
}

/** Time the judge session may take, its one retry included. */
const JUDGE_DEADLINE_MS = 300_000;

/** What the judge returns. testsPassed / typecheckClean are NOT asked of it:
 *  the daemon supplies both from its own check results. */
const JUDGE_VERDICT_SCHEMA: StructuredSchema = {
	type: 'object',
	required: ['taskId', 'passed', 'checks', 'scopeRespected', 'reason'],
	properties: {
		taskId:         { type: 'string' },
		passed:         { type: 'boolean' },
		checks: {
			type: 'array',
			items: {
				type: 'object',
				required: ['check', 'satisfied', 'evidence'],
				properties: { check: { type: 'string' }, satisfied: { type: 'boolean' }, evidence: { type: 'string' } },
			},
		},
		scopeRespected: { type: 'boolean' },
		reason:         { type: 'string' },
	},
};

interface JudgeVerdict {
	readonly taskId:         string;
	readonly passed:         boolean;
	readonly checks:         readonly { readonly check: string; readonly satisfied: boolean; readonly evidence: string }[];
	readonly scopeRespected: boolean;
	readonly reason:         string;
}

/** The judge object's shape, checked here because runReviewSession does not. Returns the failing field, or undefined. */
function judgeShapeError(v: unknown): string | undefined {
	if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'the verdict is not an object';
	const o = v as Record<string, unknown>;
	if (typeof o['passed'] !== 'boolean') return '`passed` is missing or not a boolean';
	if (!Array.isArray(o['checks'])) return '`checks` is missing or not an array';
	if (typeof o['scopeRespected'] !== 'boolean') return '`scopeRespected` is missing or not a boolean';
	if (typeof o['reason'] !== 'string') return '`reason` is missing or not a string';
	return undefined;
}

function describeCheck(label: string, r: CheckResult): string {
	const status = r.ok ? 'PASSED' : r.timedOut ? 'TIMED OUT' : 'FAILED';
	const lines = [`### ${label}: ${status}`];
	if (r.command.length > 0) lines.push(`- command: \`${r.command}\``, `- exit code: ${r.exitCode ?? 'none'} · ${Math.round(r.durationMs / 100) / 10} s`);
	if (r.note !== undefined) lines.push(`- note: ${r.note}`);
	if (r.outputTail.trim().length > 0) lines.push('- output (tail):', '```', r.outputTail.trimEnd(), '```');
	return lines.join('\n');
}

/** The named tests of a run, case by case, for the judge: what the gate ran for
 *  each test the plan names, what the builder reported instead of a run, and
 *  what failed in the files outside the named cases. Empty when no test is named. */
function describeNamedTests(r: CheckResult): string {
	const named = r.namedTests ?? [];
	if (named.length === 0) return '';
	const lines: string[] = ['#### Named tests'];
	const fileResult = (file: string): string => {
		const run = (r.files ?? []).find(f => f.file === file);
		if (run === undefined) return 'not run';
		return run.timedOut ? 'timed out' : run.exitCode === 0 ? 'pass' : 'fail';
	};
	for (const t of named) {
		lines.push(`- ${t.level !== undefined ? `${oneLine(t.level)}: ` : ''}${oneLine(t.name)}`);
		for (const c of t.cases) lines.push(`  - ${c.result}: '${oneLine(c.title)}' in \`${oneLine(c.file)}\``);
		if (t.source === 'prefix' || t.source === 'touched') {
			for (const f of t.files) lines.push(`  - ${fileResult(f)} (by file, no cases named): \`${f}\``);
		}
		if (t.reported !== undefined) lines.push(`  - REPORTED BY THE BUILDER, not run by the gate: ${oneLine(String(t.reported.result))}. Evidence: ${oneLine(t.reported.evidence)}`);
		if (t.cases.length === 0 && t.reported === undefined && t.source !== 'prefix' && t.source !== 'touched') lines.push('  - nothing was run for this test: no test case was named for it');
	}
	const namedCases = new Set(named.flatMap(t => t.cases.map(c => `${c.file}\u0000${c.title}`)));
	const others = (r.files ?? []).flatMap(f => f.titles
		.filter(t => t.result === 'fail' && !namedCases.has(`${f.file}\u0000${t.title}`))
		.map(t => `- '${oneLine(t.title)}' in \`${f.file}\``));
	if (others.length > 0) lines.push('', '#### Failures in the files outside the named cases', ...new Set(others));
	const outputs = (r.files ?? []).filter(f => f.outputPath !== undefined).map(f => `- \`${f.file}\`: ${f.outputPath}`);
	if (outputs.length > 0) lines.push('', '#### Whole output of each file\'s run', ...outputs);
	return lines.join('\n');
}

/** The check-results section the validate prompts carry. */
export function renderCheckEvidence(results: ValidationCheckResults): string {
	const named = describeNamedTests(results.tests);
	return [describeCheck('Typecheck', results.typecheck), describeCheck('Tests', results.tests), ...(named.length > 0 ? [named] : [])].join('\n\n');
}

/** Resolve the edit-session provider for build validation. Validation is a
 *  critical (`build`) role → resolves the HIGH (core) tier via the RoleRouter
 *  (default: claude opus; codex `gpt-5.5` for a Codex install, or whatever the
 *  operator pinned core to). Edit sessions require a CLI (`runEditSession`), so a
 *  non-CLI resolution (an operator who pinned core→ollama) falls back to claude. */
function resolveValidateProvider(repoPath: string): ValidateProvider {
	// Reuse the ambient sc6 router when a routing seam is established (handleValidate
	// sets one), else construct one — either way the 'build' tier decides the model.
	const router = currentRoutingContext()?.router ?? createRoleRouter({});
	const { resolution } = router.resolveProviderForRole('build', loadAnalyzeConfig(), repoPath);
	if (resolution.runner === 'cli-claude' || resolution.runner === 'cli-codex') {
		const kind = resolution.runner === 'cli-codex' ? 'codex' : 'claude';
		return new CliProvider({ kind, ...(resolution.model !== '' ? { model: resolution.model } : {}) });
	}
	log.warn({ runner: resolution.runner }, "build-step[validate]: 'build' tier resolved to a non-CLI runner; edit sessions require a CLI — falling back to claude");
	return new CliProvider({ kind: 'claude' });
}

export async function handleValidate(input: BuildStepInputValidate): Promise<BuildStepDone | BuildStepError> {
	const repoPath = await resolveRepoPath(input.repo);
	if (repoPath === undefined) {
		return err('no-repo', `insrc_build_step[validate]: no repo. Pass \`repo\` or set INSRC_REPO.`);
	}
	// A merge must be committed on its own before the next round of Story work
	// (ISSUE-f9ced66a): refuse before doing anything else while one is open.
	if (mergeInProgress(repoPath)) return mergeInProgressError('validate');

	// S002: standalone (no-plan) validate — a triage-routed Small story. Resolve the
	// story identity from the standalone context (mirroring handleStandaloneImplement)
	// instead of the plan-driven resolveTaskRef, so a small standalone story reaches
	// the SAME verdict session + persist-on-verdict path and lands a BUILD record for
	// the completion gate to approve. The plan-driven path below is untouched.
	if (input.standalone !== undefined) {
		return handleStandaloneValidate(repoPath, input.standalone, input.summary, input.tests);
	}

	const resolved = resolveTaskRef(repoPath, input.target, input.epicHash);
	if (!resolved.ok) return err('unresolved-target', resolved.message);

	const ref = resolved.ref;
	const mapping = resolveMapping(repoPath, input.tests, ref.task.tests, { epicHash: ref.epicHash, storyId: ref.storyId, taskId: ref.taskId });
	if (!mapping.ok) return mapping.error;
	return runValidateSession(repoPath, evidence => renderValidatePrompt(repoPath, ref, evidence), {
		epicHash: ref.epicHash,
		storyId:  ref.storyId,
		taskId:   ref.taskId,
	}, planTaskCheckPlan(repoPath, ref.task, mapping.entries), input.summary, mapping.note);
}

/**
 * The mapping a validate turn works with: the one supplied on this turn, else
 * the one stored for the Task by an earlier turn, else none.
 *
 * A SUPPLIED mapping is checked before any check runs, and a wrong one refuses
 * the turn with every fault listed: nothing is run, judged or written. A STORED
 * mapping is not checked for refusal, since the builder supplied nothing wrong
 * on this turn: a case whose file is gone is run as it is and comes back
 * `not found`. Entries for names the Task no longer has are dropped.
 */
function resolveMapping(
	repoPath: string,
	supplied: readonly TestMappingEntry[] | undefined,
	named:    readonly NamedTest[],
	ident:    { readonly epicHash: string; readonly storyId: string; readonly taskId: string },
): { readonly ok: true; readonly entries: readonly TestMappingEntry[] | undefined; readonly note?: string | undefined } | { readonly ok: false; readonly error: BuildStepError } {
	if (supplied !== undefined) {
		const faults = checkTestMapping(supplied, named, trackedFiles(repoPath));
		if (faults.length > 0) {
			return { ok: false, error: err('invalid-test-mapping',
				`insrc_build_step[validate]: the \`tests\` mapping is wrong, so nothing was run: ${faults.join('; ')}.`) };
		}
		return { ok: true, entries: supplied };
	}
	if (ident.epicHash.length === 0 || ident.storyId.length === 0) return { ok: true, entries: undefined };
	// A record that is there and cannot be used is said so in the verdict: the
	// turn then has no stored mapping, and its own write replaces the file.
	const state = testRecordState(repoPath, ident.epicHash, ident.storyId);
	if (state.kind === 'unreadable') {
		return { ok: true, entries: undefined, note: `the stored test record could not be read (${oneLine(state.reason)}), so no stored mapping was used; this turn's record replaces it` };
	}
	const stored = usableStoredMapping(storedMappingFor(repoPath, ident.epicHash, ident.storyId, ident.taskId) ?? [], named);
	return { ok: true, entries: stored.length > 0 ? stored : undefined };
}

/** One Task's entry of the Story's test record, from the gate's results. */
function toTestRecordTask(repoPath: string, taskId: string, ranAt: string, tests: CheckResult): TestRecordTask {
	const named = tests.namedTests ?? [];
	const namedCases = new Set(named.flatMap(t => t.cases.map(c => `${c.file}\u0000${c.title}`)));
	const files = (tests.files ?? []).map((f): TestRecordFile => ({
		file:       f.file,
		exitCode:   f.exitCode,
		timedOut:   f.timedOut,
		durationMs: f.durationMs,
		titles:     f.titles.map(t => ({ title: t.title, result: t.result })),
		otherFailures: [...new Set(f.titles.filter(t => t.result === 'fail' && !namedCases.has(`${f.file}\u0000${t.title}`)).map(t => t.title))],
		...(f.note !== undefined ? { note: f.note } : {}),
	}));
	const commit = headShortSha(repoPath);
	return {
		taskId,
		...(commit !== undefined ? { commit } : {}),
		ranAt,
		testsPassed: tests.ok,
		tests: named,
		files,
		...(tests.note !== undefined && tests.note.length > 0 ? { note: tests.note } : {}),
	};
}

/**
 * The route flag for a Story's records, resolved ONCE per validate turn for the
 * test record and the build record alike. It is the Story's inherited flag;
 * the caller's standalone declaration counts ONLY when the work item has no
 * definition head at all (a head that exists and does not say `standalone` is
 * an answer, and a declaration must not relabel it). Never the raw declaration.
 */
function resolveRouteFlag(repoPath: string, ident: { readonly epicHash: string; readonly storyId: string; readonly standalone?: unknown }): boolean | undefined {
	const noHead = Object.keys((routeReaderOverride ?? readEpicDefinitionCore)(repoPath, ident.epicHash)).length === 0;
	return inheritedStoryStandalone(repoPath, ident.epicHash, ident.storyId, ident.standalone !== undefined && noHead ? true : undefined);
}

/** Test seam: the reader of the work item's definition head, to make the route unresolvable. */
let routeReaderOverride: typeof readEpicDefinitionCore | undefined;
export function _setBuildValidateRouteReaderForTests(reader: typeof readEpicDefinitionCore | undefined): void {
	routeReaderOverride = reader;
}

/** S002: the standalone (no-plan) validate branch. Resolves the Story identity
 *  from the standalone context (mirroring handleStandaloneImplement), reads the
 *  standalone LLD (best-effort) for the verdict prompt, then runs the SAME verdict
 *  session + persist path as the plan-driven branch. */
async function handleStandaloneValidate(
	repoPath: string,
	ctx:      BuildStandaloneContext,
	summary?: string,
	suppliedTests?: readonly TestMappingEntry[],
): Promise<BuildStepDone | BuildStepError> {
	const sizeClass = ctx.sizeClass ?? 'small';
	const producesLld = sizeClass !== 'trivial';
	const epicHash = ctx.epicHash ?? (producesLld ? undefined : standaloneEpicHashFromFocus(ctx.focus ?? ''));
	if (epicHash === undefined) {
		return err('no-identity', `insrc_build_step[validate]: a standalone Small validate requires \`standalone.epicHash\` + \`storyId\` (the approved LLD identity).`);
	}
	const storyId = ctx.storyId ?? 'S001';

	// Point the verdict gate at the standalone LLD when one exists (Small), and take
	// its test strategy as the tests to run. A missing / unreadable LLD omits the
	// reference, and its check plan then names no test file, which fails the tests.
	let lldMdRelPath: string | undefined;
	let testStrategy: Parameters<typeof smallStandaloneCheckPlan>[1];
	if (producesLld) {
		try {
			const lld = readLldArtifact(repoPath, epicHash, storyId);
			lldMdRelPath = lldMdRel(epicHash, workItemAnchorCreatedAt(lld.meta), workItemKindOf(lld.meta), lld.meta.epicSlug ?? epicHash, storyId);
			testStrategy = lld.body.testStrategy;
		} catch (e) {
			log.info({ storyId, err: e instanceof Error ? e.message : String(e) }, 'insrc_build_step[validate]: standalone LLD unreadable for the verdict prompt');
		}
	}
	let checks: ValidationCheckPlan;
	let mappingNote: string | undefined;
	if (producesLld) {
		// The subjects of the design's test strategy are this route's test names.
		const named: NamedTest[] = (testStrategy?.testLevels ?? []).flatMap(l => l.subjects.map(name => ({ name, ...(l.level !== undefined ? { level: l.level } : {}) })));
		const mapping = resolveMapping(repoPath, suppliedTests, named, { epicHash, storyId, taskId: storyId });
		if (!mapping.ok) return mapping.error;
		checks = smallStandaloneCheckPlan(repoPath, testStrategy, mapping.entries);
		mappingNote = mapping.note;
	} else {
		// A trivial build names no tests: `tests` is ignored, and the test files
		// the commit touched are run.
		checks = trivialCheckPlan(repoPath);
	}
	const prompt = (evidence: string): string => renderStandaloneValidatePrompt({ storyId, sizeClass, lldMdRel: lldMdRelPath, evidence });
	// Carry the route the caller declared into the persist. This branch KNOWS it is
	// serving a standalone story; discarding that here left the shared persist to
	// re-derive it from a definition head a Small story does not have (ISSUE-0855311b).
	// Only what the caller actually supplied is carried: the `sizeClass` DEFAULT above
	// selects a prompt and must not be stamped on a record as if it had been declared.
	return runValidateSession(repoPath, prompt, {
		epicHash, storyId, taskId: storyId,
		standalone: {
			...(ctx.sizeClass !== undefined && ctx.sizeClass.length > 0 ? { sizeClass: ctx.sizeClass } : {}),
			...(ctx.triageRationale !== undefined && ctx.triageRationale.length > 0 ? { triageRationale: ctx.triageRationale } : {}),
		},
	}, checks, summary, mappingNote);
}

/** Shared: run the daemon's checks, then the read-only judge session under the sc6
 *  routing seam, combine the two into the verdict, and persist the BUILD ledger
 *  record as a fail-open SIDE EFFECT. Used by BOTH the plan-driven and the
 *  standalone (S002) branches so the verdict + persist behaviour is identical. */
async function runValidateSession(
	repoPath: string,
	prompt:   (evidence: string) => string,
	ident:    {
		readonly epicHash: string; readonly storyId: string; readonly taskId: string;
		/** Present ONLY on the standalone branch: the route the caller declared. */
		readonly standalone?: { readonly sizeClass?: string; readonly triageRationale?: string } | undefined;
	},
	/** The typecheck and test files the daemon runs before the judge. */
	checks:   ValidationCheckPlan,
	/** The implementer's narrative, if supplied — see BuildStepInputValidate.summary. */
	summary?: string,
	/** Something the verdict must say about the stored mapping (it could not be read). */
	mappingNote?: string,
): Promise<BuildStepDone | BuildStepError> {
	// The daemon's own checks come first: their exit codes are facts the judge reads
	// and cannot override.
	log.info({ taskId: ident.taskId, storyId: ident.storyId, testFiles: checks.testFiles.length }, 'insrc_build_step[validate]: running checks');
	const results = await (checkRunnerOverride ?? runValidationChecks)(repoPath, checks);

	// ONE time and ONE resolved route flag for both of the Story's records.
	const now = (clockOverride ?? (() => new Date().toISOString()))();
	const identified = ident.epicHash.length > 0 && ident.storyId.length > 0;
	// A route that cannot be resolved writes NEITHER record on this turn: a record
	// written with no flag could be filed under the wrong top-level folder, and a
	// test record keeps its first write's flag. (Before the test record existed,
	// the same failure skipped the build record's write; it still does.)
	let routeFlag: boolean | undefined;
	let routeError: Error | undefined;
	if (identified) {
		try {
			routeFlag = resolveRouteFlag(repoPath, ident);
		} catch (e) {
			routeError = e instanceof Error ? e : new Error(String(e));
			log.warn({ storyId: ident.storyId, err: routeError.message }, 'insrc_build_step[validate]: the route of the Story could not be resolved; no record is written on this turn');
		}
	}

	// The test record is written HERE, straight after the checks and before the
	// judge: what the run did is a fact whatever the judge then says, and whether
	// or not the judge session ends in an error. A write failure never changes
	// the verdict; it is noted in the verdict's evidence.
	let testRecordNote: string | undefined = routeError !== undefined
		? `the test record was not written (the route of the Story could not be resolved: ${routeError.message}); the record on disk, if there is one, still shows this Task's earlier run, with that run's commit and time`
		: undefined;
	if (identified && routeError === undefined) {
		try {
			(testRecordWriterOverride ?? persistTestRecordTask)(
				repoPath,
				{ epicHash: ident.epicHash, storyId: ident.storyId, now, ...(routeFlag === true ? { standalone: true } : {}) },
				toTestRecordTask(repoPath, ident.taskId, now, results.tests),
			);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			log.warn({ storyId: ident.storyId, taskId: ident.taskId, err: message }, 'insrc_build_step[validate]: the test record was not written; the verdict is unchanged');
			testRecordNote = `the test record was not written (${message}); the record on disk, if there is one, still shows this Task's earlier run, with that run's commit and time`;
		}
	}
	/** The Story's TESTS.md, repo-relative, when a test record is on disk. */
	const testRecordMd = (): string | undefined => {
		if (!identified || readTestRecord(repoPath, ident.epicHash, ident.storyId) === null) return undefined;
		try {
			return relative(repoPath, testRecordPaths(repoPath, ident.epicHash, ident.storyId, { now, standalone: routeFlag }).md);
		} catch {
			return undefined;
		}
	};

	// Establish the sc6 routing seam so the judge provider resolves through the same
	// choke point as the workflow runner (the 'build' tier).
	const router = createRoleRouter({});
	return runWithRoutingContext({ router, repoPath }, async () => {
		const provider: ValidateProvider = providerOverride ?? resolveValidateProvider(repoPath);

		log.info({ taskId: ident.taskId, storyId: ident.storyId }, 'insrc_build_step[validate]: running judge session');
		let judged: unknown;
		try {
			judged = await provider.runReviewSession<unknown>(prompt(renderCheckEvidence(results)), JUDGE_VERDICT_SCHEMA, { cwd: repoPath, deadlineMs: JUDGE_DEADLINE_MS });
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			if (e instanceof ReviewSessionTimeoutError) {
				return err('verdict-session-timeout', `insrc_build_step[validate]: the judge session passed its ${Math.round(JUDGE_DEADLINE_MS / 1000)} s deadline; no verdict was recorded.`);
			}
			if (/structured_output|JSON|parse/i.test(message)) {
				return err('unparseable-verdict', `insrc_build_step[validate]: the judge session returned no usable verdict: ${message.slice(0, 600)}`);
			}
			return err('verdict-session-failed', `insrc_build_step[validate]: the judge session failed: ${message.slice(0, 600)}`);
		}
		const shapeError = judgeShapeError(judged);
		if (shapeError !== undefined) {
			return err('unparseable-verdict', `insrc_build_step[validate]: the judge's verdict is unusable: ${shapeError}.`);
		}
		const judge = judged as JudgeVerdict;
		const testsPassed = results.tests.ok;
		const typecheckClean = results.typecheck.ok;
		const passed = judge.passed && testsPassed && typecheckClean;
		const verdict = {
			...judge,
			taskId: ident.taskId,
			passed,
			testsPassed,
			typecheckClean,
			...(passed || judge.passed === false ? {} : {
				reason: `${judge.reason} — but the daemon's checks failed: ${[typecheckClean ? undefined : 'typecheck', testsPassed ? undefined : 'tests'].filter(x => x !== undefined).join(' and ')}.`,
			}),
			evidence: {
				...results,
				...(testRecordMd() !== undefined ? { testRecord: testRecordMd() } : {}),
				...(testRecordNote !== undefined ? { testRecordNote } : {}),
				...(mappingNote !== undefined ? { storedMappingNote: mappingNote } : {}),
			},
		};

		// Persist the BUILD ledger record as a SIDE EFFECT of the verdict, so story
		// completion has a real BUILD-<epicHash>-<storyId> record to approve without a
		// hand-back-fill. Gated on a resolvable epic+story identity (never write a
		// BUILD-undefined path); a persistence failure is swallowed so it can never
		// convert a real verdict into an error (k5, fail-open).
		const { epicHash, storyId, taskId } = ident;
		if (epicHash.length > 0 && storyId.length > 0) {
			try {
				// Collect the file-level change-log of the build's changed set. A git
				// failure is swallowed inside collectBuildChangeLog (→ []), and an empty
				// change-log is omitted from the body (omit-slot) so a no-change build
				// stays byte-identical (k4).
				// Empty / whitespace-only is treated as omitted: storing '' would render
				// an empty `## Summary` section, which is worse than no section.
				const narrative = summary?.trim();
				// READ the route from the work item instead of abstaining from it.
				//
				// This persist is shared by the plan-driven and standalone branches, so
				// it cannot know from its own arguments which one it is serving. The
				// original response was to omit the `standalone` key entirely and let
				// mergeWithPrior carry a prior value forward. That held for a SECOND
				// write, but a FIRST write has no prior, so the absent key read as false
				// (every reader tests `=== true`), `workItemKindOf` returned 'epic', and
				// a standalone Story's record was filed under docs/epics/ while its own
				// ISSUE/LLD/PLAN sat under docs/standalone/ — observed on two separate
				// Stories (1f7ade1a and 93081bff).
				//
				// The route does not have to be guessed: it is READABLE from the work
				// item's definition head, which is where every other writer gets it.
				// `completion-record.ts` already resolved it exactly this way, so the
				// validate writer was the lone outlier and the two could disagree about
				// the same Story.
				//
				// The original prohibition still stands, and the `=== true` guard is what
				// honours it: only an explicit TRUE is ever written, never a false. An
				// unreadable definition artifact still omits the key, so mergeWithPrior
				// keeps carrying a prior true forward and the relocation bug it was
				// guarding against cannot return.
				//
				// ISSUE-0855311b — and where the head is SILENT. A triage-routed Small
				// story has no definition head (its only upstream is a standalone LLD),
				// so the head-only read above found nothing and the record was filed
				// under docs/epics/ with a raw-hash name. The read now falls back to the
				// Story's LLD, and then to the route the standalone branch declared.
				//
				// The declaration counts ONLY when there is no definition head at all. A
				// head that exists and does not say `standalone` is an answer, not a
				// silence: that is an epic-parented Story, and a caller's declaration
				// must not relabel it. The plan-driven branch passes no declaration, so
				// it still never asserts a route it cannot know.
				// (Resolved once, above, for the test record and this record alike. A
				// route that could not be resolved skips this write, as it always has.)
				if (routeError !== undefined) throw routeError;
				const standaloneFlag = routeFlag;
				// The declared size class and rationale ride with the route: they are
				// stamped only on a record that IS standalone, so an epic-parented
				// record is never titled as a standalone one.
				const declared = standaloneFlag === true ? ident.standalone : undefined;
				const rec = {
					meta: {
						workflow: 'build' as const, epicHash, storyId, createdAt: now, updatedAt: now,
						// The build step is the controller's: the MCP client wrote the code.
						authoredBy: 'controller' as const,
						...(standaloneFlag === true ? { standalone: true } : {}),
						...(declared?.sizeClass !== undefined ? { sizeClass: declared.sizeClass } : {}),
						...(declared?.triageRationale !== undefined ? { triageRationale: declared.triageRationale } : {}),
					},
					body: {
						tasks: [{ id: taskId, passed }],
						...(narrative !== undefined && narrative.length > 0 ? { summary: narrative } : {}),
						// A LINK only, and only when a test record is on disk: the
						// results are in the test record, each with its own run's commit.
						...(testRecordMd() !== undefined ? { testRecord: { md: testRecordMd()! } } : {}),
					},
				};
				// EXCLUDE the workflow's own files for this Story from the change set:
				// this record's json and md, the test record's, and the build-start
				// file. Without this the only dirty paths when the collector runs are
				// usually these, so the record would report that the Story changed its
				// own ledger entries. The list is the one the completion record uses.
				const exclude = storyWorkflowFiles(repoPath, rec);
				// The Story's COMMITTED range base. Consulted by the derivation only
				// when the working tree is clean — which is the normal case here,
				// because the implement prompt commits before validation runs.
				// `undefined` means no base could be established, which yields an
				// empty change set rather than a substituted (wrong) range.
				const base = resolveStoryRangeBase(repoPath, epicHash, storyId);
				const changeLog = await collectBuildChangeLog(repoPath, {
					author: 'insrc-build', timestamp: now, exclude,
					...(base !== undefined ? { base } : {}),
				});
				persistBuildRecord(repoPath, {
					...rec,
					body: { ...rec.body, ...(changeLog.length > 0 ? { changeLog } : {}) },
				});
			} catch (err) {
				log.warn(
					{ storyId, taskId, err: err instanceof Error ? err.message : String(err) },
					'insrc_build_step[validate]: BUILD ledger persist failed; returning the verdict unchanged',
				);
			}
		}
		return { next: 'done', verdict, passed };
	});
}

function err(code: string, message: string): BuildStepError {
	return { next: 'error', error: { code, message, retryable: false } };
}
