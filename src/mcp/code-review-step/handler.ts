/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Top-level dispatcher for `insrc_code_review_step` (code-review S008) — the
 * controller-driven, multi-turn CODE-review surface. Mirrors
 * `mcp/review-step/handler.ts`.
 *
 * Loop: start → emit_judgements → judgements → done.
 *   - phase='start': resolve the sc1 subject in-process (decline → error) +
 *     fetch the sc2 grounding over the daemon IPC (unavailable → error), save
 *     the opaque state, and hand the controller the four per-dimension prompts +
 *     a DimensionResult[] schema + the grounding.
 *   - phase='judgements': load the state, VALIDATE the four controller-supplied
 *     DimensionResults (malformed → error, nothing written), scope-drop
 *     out-of-changedFiles findings (daemon-path parity), then drive the SAME
 *     sc5 `runCodeReview` with injected deps so the persisted record is
 *     byte-identical to the daemon-driven path.
 */

import { getLogger } from '../../shared/logger.js';
import type { LLMProvider } from '../../shared/types.js';
import { existsSync, readFileSync } from 'node:fs';
import { PATHS } from '../../shared/paths.js';
import { resolveCodeReviewSubject } from '../../workflow/code-review/subject.js';
import { fetchCodeReviewGrounding, fetchCodeReviewFreshness } from '../daemon-stream.js';
import { assembleDiffCodeReviewGrounding, DiffUnavailableError } from '../../workflow/code-review/grounding.js';
import { runCodeReview, type CodeReviewRunnerDeps } from '../../workflow/code-review/runner.js';
import { codeReviewArtifactPaths, writeAtomic } from '../../workflow/storage.js';
import { buildAdherencePrompt } from '../../workflow/code-review/dimensions/adherence.js';
import { buildConventionsPrompt } from '../../workflow/code-review/dimensions/conventions.js';
import { buildCoveragePrompt } from '../../workflow/code-review/dimensions/coverage.js';
import { buildQualityPrompt } from '../../workflow/code-review/dimensions/quality.js';
import type {
	CodeReviewGrounding,
	CodeReviewSubject,
	DimensionFinding,
	DimensionResult,
	ReviewDimension,
} from '../../workflow/code-review/types.js';
import { StateTokenNotFound, loadState, releaseState, saveState } from './state-store.js';
import type {
	CodeReviewStepError,
	CodeReviewStepInput,
	CodeReviewStepMcpEnvelope,
	CodeReviewStepOutput,
} from './types.js';

const log = getLogger('mcp:code-review-step:handler');

/** The four dimensions in fixed evaluation order — the same set the S006
 *  runner's DEFAULT_JUDGES uses; the judgements turn must cover exactly these. */
const DIMENSIONS: readonly ReviewDimension[] = ['adherence', 'conventions', 'coverage', 'quality'];

/** Injectable seams so the handler tests stub the daemon/graph/runner. The s9
 *  gate adds `fetchFreshness` (the daemon freshness IPC), plus `sleep`/`now`
 *  (deterministic block-and-poll under test) and `freshnessTimeoutMs` (the poll
 *  bound, from config). */
export interface CodeReviewStepDeps {
	readonly resolveSubject: typeof resolveCodeReviewSubject;
	readonly fetchGrounding: typeof fetchCodeReviewGrounding;
	readonly fetchFreshness: typeof fetchCodeReviewFreshness;
	/** s10: build the diff-only (degraded) grounding on the decline branch. */
	readonly assembleDiffGrounding: typeof assembleDiffCodeReviewGrounding;
	readonly runReview:      typeof runCodeReview;
	readonly write:          (absPath: string, content: string) => void;
	readonly sleep:          (ms: number) => Promise<void>;
	readonly now:            () => number;
	readonly freshnessTimeoutMs: () => number;
}

/** The fixed poll interval for the block-and-poll (an internal constant, NOT a
 *  config knob — only the overall wall-clock bound is configurable). */
const POLL_INTERVAL_MS = 1500;

/** Read `codeReview.freshnessTimeoutMs` from `~/.insrc/config.json`. Fail-safe:
 *  defaults to the catalog default (120000) when the file is absent, unparseable,
 *  or the key is missing/invalid, and NEVER throws. */
function readFreshnessTimeoutMs(): number {
	try {
		if (!existsSync(PATHS.config)) return 120000;
		const raw = JSON.parse(readFileSync(PATHS.config, 'utf8')) as { codeReview?: { freshnessTimeoutMs?: unknown } };
		const v = raw.codeReview?.freshnessTimeoutMs;
		return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 120000;
	} catch {
		return 120000;
	}
}

const DEFAULT_DEPS: CodeReviewStepDeps = {
	resolveSubject: resolveCodeReviewSubject,
	fetchGrounding: fetchCodeReviewGrounding,
	fetchFreshness: fetchCodeReviewFreshness,
	assembleDiffGrounding: assembleDiffCodeReviewGrounding,
	runReview:      runCodeReview,
	write:          writeAtomic,
	sleep:          (ms) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }),
	now:            () => Date.now(),
	freshnessTimeoutMs: readFreshnessTimeoutMs,
};

/** A read-only stand-in provider. On the controller path the injected judges
 *  return the supplied judgements without ever calling the provider, so it is
 *  never touched — it only satisfies runCodeReview's signature. */
const DUMMY_PROVIDER = { capabilities: { structuredOutput: true } } as unknown as LLMProvider;

/** The JSON Schema the controller's `{ judgements: DimensionResult[] }` must
 *  match — one DimensionResult per dimension; each finding pins its location to
 *  a `file:line` string (a malformed location is a bad-judgements error, never a
 *  silent drop). Handed back in the emit_judgements frame. */
const JUDGEMENTS_SCHEMA: Record<string, unknown> = {
	type: 'object',
	additionalProperties: false,
	required: ['judgements'],
	properties: {
		judgements: {
			type: 'array',
			minItems: 4,
			maxItems: 4,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['dimension', 'findings'],
				properties: {
					dimension: { type: 'string', enum: [...DIMENSIONS] },
					findings: {
						type: 'array',
						items: {
							type: 'object',
							additionalProperties: false,
							required: ['dimension', 'severity', 'location', 'message'],
							properties: {
								dimension:      { type: 'string', enum: [...DIMENSIONS] },
								severity:       { type: 'string', enum: ['HIGH', 'MED', 'LOW'] },
								location:       { type: 'string', description: '`file:line` inside the Story\'s changed set' },
								message:        { type: 'string' },
								expectationRef: { type: 'string' },
								counterpartRef: { type: 'string' },
								confidence:     { type: 'string', enum: ['observation', 'breach'] },
							},
						},
					},
				},
			},
		},
	},
};

export async function handleCodeReviewStep(
	input: unknown,
	deps:  CodeReviewStepDeps = DEFAULT_DEPS,
): Promise<CodeReviewStepMcpEnvelope> {
	const result = await dispatch(input, deps);
	return {
		content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
		...(result.next === 'error' ? { isError: true } : {}),
	};
}

async function dispatch(input: unknown, deps: CodeReviewStepDeps): Promise<CodeReviewStepOutput> {
	if (typeof input !== 'object' || input === null || !('phase' in input)) {
		return errorResult('bad-input', 'insrc_code_review_step: input must be an object with a `phase` field.', false);
	}
	const step = input as CodeReviewStepInput;
	try {
		switch (step.phase) {
			case 'start':      return await handleStart(step, deps);
			case 'judgements': return await handleJudgements(step, deps);
			default:
				return errorResult(
					'bad-phase',
					`insrc_code_review_step: unknown phase '${(step as { phase: string }).phase}'. Expected 'start' | 'judgements'.`,
					false,
				);
		}
	} catch (err) {
		if (err instanceof StateTokenNotFound) {
			return errorResult('state-not-found', err.message, false);
		}
		const msg = err instanceof Error ? err.message : String(err);
		log.warn({ phase: step.phase, err: msg }, 'insrc_code_review_step: uncaught error');
		return errorResult('internal', msg, false);
	}
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

async function handleStart(
	step: CodeReviewStepInput & { phase: 'start' },
	deps: CodeReviewStepDeps,
): Promise<CodeReviewStepOutput> {
	// A resume past a confirm_wait carries the opaque state token (which holds the
	// subject + identity). An initial start resolves the subject fresh.
	const resuming = typeof step.state === 'string' && step.state.length > 0;

	let repo:     string;
	let epicHash: string;
	let storyId:  string;
	let subject:  CodeReviewSubject;

	if (resuming) {
		const payload = loadState(step.state!);   // throws StateTokenNotFound → caught in dispatch
		repo = payload.repo; epicHash = payload.epicHash; storyId = payload.storyId;
		subject = payload.subject;

		// proceed:false is an explicit DECLINE. s10: instead of failing closed, fall
		// back to a DIFF-ONLY (degraded) review — review the changed-file diff hunks
		// directly rather than the graph. Freshness is NOT re-checked (the decline is
		// the user's explicit choice), so a decline never silently upgrades to a full
		// graph review.
		if (step.proceed !== true) {
			releaseState(step.state!);
			return await beginDiffOnlyReview(repo, epicHash, storyId, subject, deps);
		}
	} else {
		if (typeof step.epicHash !== 'string' || step.epicHash.length === 0) {
			return errorResult('bad-input', 'insrc_code_review_step: `epicHash` is required for phase=start.', false);
		}
		if (typeof step.storyId !== 'string' || step.storyId.length === 0) {
			return errorResult('bad-input', 'insrc_code_review_step: `storyId` is required for phase=start.', false);
		}
		const r = step.repo !== undefined && step.repo.length > 0 ? step.repo : process.env['INSRC_REPO'];
		if (r === undefined || r.length === 0) {
			return errorResult('no-repo', 'insrc_code_review_step: no repo (pass `repo` or set INSRC_REPO).', false);
		}
		repo = r; epicHash = step.epicHash; storyId = step.storyId;

		// 1. Resolve the fixed sc1 subject (file+git, in-process). A DECLINE is not
		//    a verdict — the review cannot start.
		const resolved = await deps.resolveSubject(repo, epicHash, storyId);
		if (!resolved.ok) {
			return errorResult('no-subject', `insrc_code_review_step: cannot review — ${resolved.reason}.`, false);
		}
		subject = resolved.subject;
	}

	// 1b. INDEXING-READINESS GATE (s9) — BEFORE grounding. Grounding must never be
	//     assembled against a stale graph (empty grounding.symbols = the S001
	//     hollow PASS). The combined signal is queue.isProcessing OR any changed
	//     file's watermark being behind its mtime.
	const freshParams = { repo, epicHash, storyId, changedFiles: subject.changedFiles };

	if (resuming) {
		// proceed:true → bounded block-and-poll until fresh or the timeout, then
		// re-prompt. Reuses the SAME state token across re-prompts (still valid
		// until fresh/aborted).
		const deadline = deps.now() + deps.freshnessTimeoutMs();
		for (;;) {
			const f = await deps.fetchFreshness(freshParams);
			if (!f.ok) {
				return errorResult('freshness-unavailable', `insrc_code_review_step: freshness check unavailable — ${f.reason}.`, true);
			}
			if (!f.isProcessing && f.staleFiles.length === 0) break;   // fresh → proceed to grounding
			if (deps.now() >= deadline) {
				// Index never freshened before the deadline. Rather than re-prompt
				// confirm_wait forever (a wedged index never resolves), auto-fall-back
				// to the DIFF-ONLY (degraded) review — the same escape the decline
				// branch takes. Release the confirm_wait token first (mirrors the
				// fresh-break path below) so the diff review saves a fresh state.
				releaseState(step.state!);
				return await beginDiffOnlyReview(repo, epicHash, storyId, subject, deps);
			}
			await deps.sleep(POLL_INTERVAL_MS);
		}
		// Fresh: consume the confirm_wait token; a fresh emit_judgements state is
		// saved below.
		releaseState(step.state!);
	} else {
		const f = await deps.fetchFreshness(freshParams);
		if (!f.ok) {
			return errorResult('freshness-unavailable', `insrc_code_review_step: freshness check unavailable — ${f.reason}.`, true);
		}
		if (f.isProcessing || f.staleFiles.length > 0) {
			const token = saveState({
				runId:       `cr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				startedAtMs: Date.now(),
				repo, epicHash, storyId, subject,
				// grounding intentionally omitted — not fetched until the index is fresh.
			});
			return confirmWaitResult(f.staleFiles, f.isProcessing, token);
		}
	}

	// 2. Fresh → fetch the sc2 grounding ONLY over the daemon IPC (k5/k6).
	const g = await deps.fetchGrounding({ repo, epicHash, storyId });
	if (!g.ok) {
		return errorResult('grounding-unavailable', `insrc_code_review_step: grounding unavailable — ${g.reason}.`, true);
	}
	// Fresh-but-hollow: the index reports fresh but the graph grounding carries no
	// changed-symbol summaries (the hollow-PASS). Emitting a full-mode review over
	// an empty symbol set produces a meaningless verdict, so auto-fall-back to the
	// DIFF-ONLY (degraded) review over the changed-file diff instead. Runs only on
	// a successful fetch (g.ok), so it never masks a real grounding failure.
	if (g.grounding.symbols.length === 0) {
		return await beginDiffOnlyReview(repo, epicHash, storyId, subject, deps);
	}
	const grounding = g.grounding;

	// 3. Save opaque state + hand the controller the four prompts + the schema.
	const token = saveState({
		runId:       `cr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		startedAtMs: Date.now(),
		repo, epicHash, storyId, subject, grounding,
	});

	return emitJudgementsResult(subject, grounding, token);
}

/**
 * s10 — the DIFF-ONLY (degraded) review path, reached from the decline branch.
 * Builds the diff-only grounding (working-tree diff, else the last commit), saves
 * a `groundingMode:'degraded'` emit_judgements state, and hands the controller the
 * SAME four charges over the diff hunks. The subject's `changedFiles` is REPLACED
 * with the diff-derived set so the record subject + the judgements scope-drop
 * reflect what was actually reviewed. A diff that cannot be read is a
 * `diff-unavailable` error, not a silent empty pass.
 */
async function beginDiffOnlyReview(
	repo:     string,
	epicHash: string,
	storyId:  string,
	subject:  CodeReviewSubject,
	deps:     CodeReviewStepDeps,
): Promise<CodeReviewStepOutput> {
	let grounding: CodeReviewGrounding;
	let changedFiles: readonly string[];
	try {
		const diff = await deps.assembleDiffGrounding(repo);
		grounding = diff.grounding;
		changedFiles = diff.changedFiles;
	} catch (err) {
		if (err instanceof DiffUnavailableError) {
			return errorResult('diff-unavailable', `insrc_code_review_step: could not read the changed-file diff — ${err.message}.`, true);
		}
		throw err;
	}

	// Re-key the subject to the diff-derived changed set (post-commit the s9
	// working-tree set is empty; the diff path recovers it from the last commit).
	const diffSubject: CodeReviewSubject = { ...subject, changedFiles };

	const token = saveState({
		runId:       `cr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		startedAtMs: Date.now(),
		repo, epicHash, storyId, subject: diffSubject, grounding,
		groundingMode: 'degraded',
	});

	return emitJudgementsResult(diffSubject, grounding, token);
}

/** Build the emit_judgements frame — the four per-dimension charges over the
 *  grounding + the judgements schema. Shared by the fresh graph path and the s10
 *  diff-only path (the four prompt builders consume grounding.symbols unchanged). */
function emitJudgementsResult(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	token:     string,
): CodeReviewStepOutput {
	return {
		next:     'emit_judgements',
		guidance: 'Judge each of the four dimensions (adherence, conventions, coverage, quality) over the grounding below, ' +
			'then call phase=\'judgements\' with judgements=<your JSON> + state. Emit one DimensionResult per dimension; each ' +
			'finding\'s location must be a `file:line` inside the Story\'s changed set.',
		prompts: [
			buildAdherencePrompt(subject, grounding, undefined),
			buildConventionsPrompt(subject, grounding, undefined),
			buildCoveragePrompt(subject, grounding, undefined),
			buildQualityPrompt(subject, grounding, undefined),
		],
		schema:    JUDGEMENTS_SCHEMA,
		grounding,
		state:     token,
	};
}

/** Build a `confirm_wait` result relaying the stale-file list + how to resume. */
function confirmWaitResult(
	staleFiles:   readonly string[],
	isProcessing: boolean,
	token:        string,
): CodeReviewStepOutput {
	const detail = staleFiles.length > 0
		? `${staleFiles.length} changed file(s) are not freshly indexed` +
			(staleFiles.length <= 10 ? `: ${staleFiles.join(', ')}` : `: ${staleFiles.slice(0, 10).join(', ')}, …`)
		: 'the index queue is still processing';
	return {
		next:     'confirm_wait',
		guidance: `The daemon graph is not fresh for this Story's changed code (${detail}). Reviewing now would ground against a ` +
			'stale/empty graph (a hollow PASS). Resume with { phase:\'start\', state, proceed:true } to wait for a fresh index, ' +
			'or { phase:\'start\', state, proceed:false } to abort the review.',
		staleFiles,
		isProcessing,
		state: token,
	};
}

// ---------------------------------------------------------------------------
// judgements
// ---------------------------------------------------------------------------

async function handleJudgements(
	step: CodeReviewStepInput & { phase: 'judgements' },
	deps: CodeReviewStepDeps,
): Promise<CodeReviewStepOutput> {
	if (typeof step.state !== 'string' || step.state.length === 0) {
		return errorResult('bad-input', 'insrc_code_review_step: `state` is required for phase=judgements.', false);
	}
	const payload = loadState(step.state);   // throws StateTokenNotFound → caught in dispatch

	// A judgements turn always resumes an emit_judgements state, which carries the
	// fetched grounding. A confirm_wait state (grounding not yet fetched) is not a
	// valid judgements resume — guard rather than deref undefined.
	if (payload.grounding === undefined) {
		return errorResult('bad-state', 'insrc_code_review_step: this state is awaiting a proceed/abort resume, not judgements.', false);
	}
	const grounding = payload.grounding;

	// Validate the controller's judgements BEFORE driving the runner. A fault
	// returns an error frame and writes nothing (ac5).
	const validated = validateJudgements(step.judgements?.judgements, payload.subject);
	if (!validated.ok) {
		return errorResult('bad-judgements', `insrc_code_review_step: ${validated.message}`, true);
	}
	const byDimension = validated.byDimension;

	// Drive the SAME sc5 runCodeReview with injected deps: each judge returns the
	// matching (already scope-dropped) DimensionResult; grounding is replayed from
	// state; write persists via writeAtomic. So the record is byte-identical to
	// the daemon-driven path (ac3/k2).
	const injected: CodeReviewRunnerDeps = {
		judges: DIMENSIONS.map((dimension) => ({
			dimension,
			// eslint-disable-next-line @typescript-eslint/require-await
			judge: async (): Promise<DimensionResult> => byDimension.get(dimension)!,
		})),
		assembleGrounding: async (): Promise<CodeReviewGrounding> => grounding,
		write: deps.write,
	};

	// s10: a degraded state (built from the diff on the decline branch) drives the
	// runner with groundingMode:'degraded' + capVerdictAtWarn:true, so the record is
	// marked degraded and a clean fold can never register a pass. The graph path
	// passes neither (⇒ 'full', uncapped) — byte-identical to s9.
	const degraded = payload.groundingMode === 'degraded';

	return await driveRunner(step.state, payload.subject, injected, deps, degraded);
}

async function driveRunner(
	token:    string,
	subject:  CodeReviewSubject,
	injected: CodeReviewRunnerDeps,
	deps:     CodeReviewStepDeps,
	degraded: boolean,
): Promise<CodeReviewStepOutput> {
	const runId = `cr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const outcome = await deps.runReview(
		subject,
		DUMMY_PROVIDER,
		degraded
			? { runId, modelLabel: 'client', groundingMode: 'degraded', capVerdictAtWarn: true }
			: { runId, modelLabel: 'client' },
		injected,
	);
	if (!outcome.ok) {
		return errorResult('fold-failed', `insrc_code_review_step: ${outcome.error}`, true);
	}
	releaseState(token);   // consumed — a resend of this token fails loadState (no double-write)
	const paths = codeReviewArtifactPaths(subject.repoPath, subject.epicHash, subject.storyId);
	return {
		next:     'done',
		verdict:  outcome.artifact.body.verdict,
		counts:   outcome.artifact.body.counts,
		path:     paths.md,
		jsonPath: paths.json,
	};
}

// ---------------------------------------------------------------------------
// Validation + scope-drop
// ---------------------------------------------------------------------------

type ValidateResult =
	| { readonly ok: true;  readonly byDimension: Map<ReviewDimension, DimensionResult> }
	| { readonly ok: false; readonly message: string };

/** Validate the controller's DimensionResult[] covers exactly the four
 *  dimensions with well-formed findings (severity enum + `file:line` location),
 *  then scope-drop each dimension's findings to the Story's changed set (the
 *  same drop the daemon-path judges apply). */
function validateJudgements(raw: readonly DimensionResult[] | undefined, subject: CodeReviewSubject): ValidateResult {
	if (raw === undefined || !Array.isArray(raw) || raw.length === 0) {
		return { ok: false, message: 'judgements is missing or empty; supply one DimensionResult per dimension.' };
	}
	const changed = new Set(subject.changedFiles);
	const seen = new Set<ReviewDimension>();
	const byDimension = new Map<ReviewDimension, DimensionResult>();

	for (const dr of raw) {
		if (typeof dr !== 'object' || dr === null || typeof dr.dimension !== 'string') {
			return { ok: false, message: 'each judgement must be a DimensionResult with a `dimension` + `findings`.' };
		}
		if (!DIMENSIONS.includes(dr.dimension as ReviewDimension)) {
			return { ok: false, message: `unknown dimension '${dr.dimension}'; expected one of ${DIMENSIONS.join(', ')}.` };
		}
		const dimension = dr.dimension as ReviewDimension;
		if (seen.has(dimension)) {
			return { ok: false, message: `duplicate dimension '${dimension}'.` };
		}
		seen.add(dimension);
		if (!Array.isArray(dr.findings)) {
			return { ok: false, message: `dimension '${dimension}' has no findings array.` };
		}
		const kept: DimensionFinding[] = [];
		for (const f of dr.findings) {
			const bad = validateFinding(f, dimension);
			if (bad !== null) return { ok: false, message: bad };
			// scope-drop: keep only findings whose file is in the changed set
			// (daemon-path parity). fileOf = the substring before the first ':'.
			if (changed.has(fileOf((f as DimensionFinding).location))) kept.push(f as DimensionFinding);
		}
		byDimension.set(dimension, { dimension, findings: kept });
	}

	const missing = DIMENSIONS.filter(d => !seen.has(d));
	if (missing.length > 0) {
		return { ok: false, message: `missing dimension(s): ${missing.join(', ')}.` };
	}
	return { ok: true, byDimension };
}

/** Returns an error message if the finding is malformed, else null. */
function validateFinding(f: unknown, dimension: ReviewDimension): string | null {
	if (typeof f !== 'object' || f === null) return `dimension '${dimension}' has a non-object finding.`;
	const o = f as Record<string, unknown>;
	if (o['severity'] !== 'HIGH' && o['severity'] !== 'MED' && o['severity'] !== 'LOW') {
		return `dimension '${dimension}' has a finding with severity '${String(o['severity'])}' (expected HIGH|MED|LOW).`;
	}
	if (typeof o['location'] !== 'string' || !o['location'].includes(':')) {
		return `dimension '${dimension}' has a finding whose location '${String(o['location'])}' is not a \`file:line\`.`;
	}
	if (typeof o['message'] !== 'string' || o['message'].length === 0) {
		return `dimension '${dimension}' has a finding with no message.`;
	}
	return null;
}

/** Extract the repo-relative file from a `file:line` location (mirrors the
 *  dimension modules' private `fileOf`). */
function fileOf(location: string): string {
	const i = location.indexOf(':');
	return i >= 0 ? location.slice(0, i) : location;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResult(code: string, message: string, retryable: boolean): CodeReviewStepError {
	return { next: 'error', error: { code, message, retryable } };
}
