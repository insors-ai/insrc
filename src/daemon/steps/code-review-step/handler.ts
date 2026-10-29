/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Top-level dispatcher for `insrc_code_review_step` (code-review S008) — the
 * multi-turn CODE-review surface. Mirrors `daemon/steps/review-step/handler.ts`.
 *
 * The party that did not write the code reviews it. `start` reads the author
 * from the Story's BUILD record at the point a review would begin: code the
 * controller wrote, or of unknown author, is sent to the daemon
 * (`codeReview.run`) and its verdict returned as `done`; code the daemon wrote
 * is reviewed by the controller through the loop below.
 *
 * The controller's loop: start → emit_judgements → judgements → done.
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

import { prepareControllerPipeline, advanceControllerPipeline, applyControllerResult, controllerCallFrame, parseControllerCallResult, controllerAnswerDigest } from './controller-pipeline.js';
import type { ControllerExecutionCapability, ControllerPipelineState } from './controller-pipeline.js';
import { ReviewCallFailedError, MaterialChangedError } from '../../../workflow/review-pipeline/job.js';
import { AtomTooLargeError } from '../../../workflow/review-pipeline/pack-into-batches.js';
import { assertReviewTime } from '../../../workflow/review-pipeline/timing.js';
import { captureReviewInputFingerprint } from '../../../workflow/code-review/input-fingerprint.js';
import { assertReviewFingerprintCurrent, claimReviewPublication } from '../../../workflow/code-review/publication.js';
import type { ReviewInputFingerprint } from '../../../workflow/code-review/types.js';
import { getLogger } from '../../../shared/logger.js';
import type { LLMProvider } from '../../../shared/types.js';
import { existsSync, readFileSync } from 'node:fs';
import { PATHS } from '../../../shared/paths.js';
import { resolveCodeReviewSubject } from '../../../workflow/code-review/subject.js';
import { codeReviewControlResult, CEILING_TIMEOUT, IDLE_TIMEOUT, ReviewStreamError } from '../../../shared/review-stream.js';
import type { CodeReviewControlParams, CodeReviewControlResult, CodeReviewStreamParams, CodeReviewStreamResult, ReviewStreamOpts } from '../../../shared/review-stream.js';
import { canonicalReviewRepository, codeReviewOperations } from '../../code-review-operations.js';
import type { CodeReviewOperationRegistry } from '../../code-review-operations.js';
import { stepDaemonClient } from '../daemon-client.js';
import type { StepDaemonClient } from '../daemon-client.js';
import { buildAuthorParty } from '../../../workflow/code-review/author.js';
import { SamePartyReviewError } from '../../../workflow/review/party.js';
import type { PartyOrUnknown } from '../../../workflow/review/party.js';
import { assembleDiffCodeReviewGrounding, DiffUnavailableError } from '../../../workflow/code-review/grounding.js';
import { runCodeReview, type CodeReviewRunnerDeps } from '../../../workflow/code-review/runner.js';
import { codeReviewArtifactPaths, writeAtomic } from '../../../workflow/storage.js';
import { codeReviewSubjectPathArgs } from '../../../workflow/code-review/subject-paths.js';
import { LEDGER_EXCLUDE_GLOBS } from '../../../workflow/runners/build/changed-files.js';
import { resolveStoryRangeBase } from '../../../workflow/runners/build/range-base.js';
import { buildAdherencePrompt } from '../../../workflow/code-review/dimensions/adherence.js';
import { buildConventionsPrompt } from '../../../workflow/code-review/dimensions/conventions.js';
import { buildCoveragePrompt, normalizeCoverageFindings, prepareCoverageGrounding } from '../../../workflow/code-review/dimensions/coverage.js';
import { buildQualityPrompt } from '../../../workflow/code-review/dimensions/quality.js';
import { buildFunctionalCoveragePrompt } from '../../../workflow/code-review/dimensions/functional-coverage.js';
import { buildDiagramPrompt } from '../../../workflow/code-review/dimensions/diagram/index.js';
import { buildUxPrompt } from '../../../workflow/code-review/dimensions/ux/index.js';
import { computeExpectedDimensions } from '../../../workflow/code-review/expected-dimensions.js';
import type {
	CodeReviewFallbackReason,
	CodeReviewGrounding,
	CodeReviewSubject,
	DimensionFinding,
	DimensionResult,
	ReviewDimension,
} from '../../../workflow/code-review/types.js';
import { currentStepContext, stepClient, stepEnvRepo, type StepClient } from '../../../shared/step-context.js';
import { StateTransitionBusyError, StateTokenNotFound, loadState, releaseState, saveState, savePendingState, saveControllerState, replaceControllerState, withControllerStateLock } from './state-store.js';
import type {
	CodeReviewPendingState,
	CodeReviewStepError,
	CodeReviewStepInput,
	CodeReviewStepMcpEnvelope,
	CodeReviewStepOutput,
} from './types.js';

const log = getLogger('mcp:code-review-step:handler');

/** The dimensions the judgements turn must cover for THIS subject: the base four,
 *  plus each conditional dimension (functional-coverage / diagram / ux) gated by its
 *  content predicate AND the body's recorded adherence selection unioned in (ac3).
 *  Delegates to the SINGLE computeExpectedDimensions the runner's effectiveJudges
 *  also uses, so the handler + runner lock-step lists can never drift. */
export function expectedDimensions(subject: CodeReviewSubject): readonly ReviewDimension[] {
	return computeExpectedDimensions(subject);
}

/** Injectable seams so the handler tests stub the daemon/graph/runner. The s9
 *  gate adds `fetchFreshness` (the daemon freshness IPC), plus `sleep`/`now`
 *  (deterministic block-and-poll under test) and `freshnessTimeoutMs` (the poll
 *  bound, from config). */
export interface CodeReviewStepDeps {
 /** Internal verified-helper admission, never read from raw controllerInput JSON. */
 readonly controllerExecution?: ControllerExecutionCapability | undefined;
 readonly controllerRequest?: import('./types.js').ControllerInputRequest | undefined;
 readonly reviewControl?: ((params: CodeReviewControlParams, opts: ReviewStreamOpts) => Promise<CodeReviewControlResult>) | undefined;
 readonly operations?: CodeReviewOperationRegistry | undefined;
 readonly captureInput?: ((subject: CodeReviewSubject) => ReviewInputFingerprint) | undefined;
	readonly resolveSubject: typeof resolveCodeReviewSubject;
	readonly fetchGrounding: StepDaemonClient['fetchCodeReviewGrounding'];
	readonly fetchFreshness: StepDaemonClient['fetchCodeReviewFreshness'];
	/** s10: build the diff-only (degraded) grounding on the decline branch. */
	readonly assembleDiffGrounding: typeof assembleDiffCodeReviewGrounding;
	readonly runReview:      typeof runCodeReview;
	readonly write:          (absPath: string, content: string) => void;
	readonly sleep:          (ms: number) => Promise<void>;
	readonly now:            () => number;
	readonly freshnessTimeoutMs: () => number;
	/** The party that wrote the Story's code, from its BUILD record. Defaults to
	 *  reading the record from the artifact store. */
	readonly readBuildAuthor?: ((repo: string, epicHash: string, storyId: string) => PartyOrUnknown) | undefined;
	/** Ask the daemon to review the Story's code (`codeReview.run`). */
	readonly reviewByDaemon?: ((params: CodeReviewStreamParams, opts: ReviewStreamOpts) => Promise<CodeReviewStreamResult>) | undefined;
	/** The invoking MCP client, so the daemon can fall back to that CLI. */
	readonly client?: StepClient | undefined;
	/** Aborts the daemon code-review wait, and with it the review run. */
	readonly signal?: AbortSignal | undefined;
	/** The step tool's progress callback: each frame of the daemon review is relayed to it. */
	readonly progress?: ((data: unknown) => void) | undefined;
	/** The daemon code-review wait limits. Default: codeReviewWaitLimits() from config. */
	readonly waitLimits?: (() => CodeReviewWaitLimits) | undefined;
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

export const DEFAULT_DEPS: CodeReviewStepDeps = {
 reviewControl: (params, opts) => stepDaemonClient().codeReviewControl(params, opts),
 captureInput: captureReviewInputFingerprint,
	resolveSubject: resolveCodeReviewSubject,
	fetchGrounding: (params) => stepDaemonClient().fetchCodeReviewGrounding(params),
	fetchFreshness: (params) => stepDaemonClient().fetchCodeReviewFreshness(params),
	assembleDiffGrounding: assembleDiffCodeReviewGrounding,
	runReview:      runCodeReview,
	write:          writeAtomic,
	sleep:          (ms) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }),
	now:            () => Date.now(),
	freshnessTimeoutMs: readFreshnessTimeoutMs,
};

/** `deps` with the step context's client, as it is ('claude' | 'codex' | 'vibe');
 *  `deps` unchanged outside a step call or when the caller's client is unknown. */
export function withStepClient(deps: CodeReviewStepDeps): CodeReviewStepDeps {
	const client = stepClient();
 const controllerExecution = currentStepContext()?.controllerReview;
 if (controllerExecution !== undefined) deps = { ...deps, controllerExecution };
	return client !== undefined ? { ...deps, client } : deps;
}

/** A read-only stand-in provider. On the controller path the injected judges
 *  return the supplied judgements without ever calling the provider, so it is
 *  never touched — it only satisfies runCodeReview's signature. */
const DUMMY_PROVIDER = { capabilities: { structuredOutput: true } } as unknown as LLMProvider;

/** The JSON Schema the controller's `{ judgements: DimensionResult[] }` must
 *  match — one DimensionResult per dimension; each finding pins its location to
 *  a `file:line` string (a malformed location is a bad-judgements error, never a
 *  silent drop). Handed back in the emit_judgements frame. */
export function buildJudgementsSchema(dims: readonly ReviewDimension[]): Record<string, unknown> {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['judgements'],
		properties: {
			judgements: {
				type: 'array',
				minItems: dims.length,
				maxItems: dims.length,
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['dimension', 'findings'],
					properties: {
						dimension: { type: 'string', enum: [...dims] },
						findings: {
							type: 'array',
							items: {
								type: 'object',
								additionalProperties: false,
								required: ['dimension', 'severity', 'location', 'message'],
								properties: {
									dimension:      { type: 'string', enum: [...dims] },
									severity:       { type: 'string', enum: ['HIGH', 'MED', 'LOW'] },
									location:       { type: 'string', description: '`file:line` inside the Story\'s changed set' },
									message:        { type: 'string' },
									expectationRef: { type: 'string' },
									counterpartRef: { type: 'string' },
									confidence:     { type: 'string', enum: ['observation', 'breach'] },
									// coverage (ISSUE-b47dadc7): what the finding is about, and the listed symbol it names.
									findingKind:    { type: 'string', enum: ['symbol-coverage', 'promised-test', 'other'] },
									symbolId:       { type: 'string' },
								},
							},
						},
					},
				},
			},
		},
	};
}

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
		if (err instanceof StateTransitionBusyError) return errorResult('review-busy', err.message, true);
		if (err instanceof StateTokenNotFound) {
			return errorResult('state-not-found', err.message, false);
		}
		const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && 'code' in err && typeof err.code === 'string' && err.code.startsWith('review-input-')) return errorResult(err.code, msg, false);
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
		const payload = await loadState(step.state!);   // throws StateTokenNotFound → caught in dispatch
  if (payload.kind === 'controller-pipeline') {
   if ((step.repo !== undefined && canonicalReviewRepository(step.repo) !== canonicalReviewRepository(payload.repo)) || (step.epicHash !== undefined && step.epicHash !== payload.epicHash) || (step.storyId !== undefined && step.storyId !== payload.storyId)) return errorResult('review-target-mismatch', 'Controller continuation target cannot be changed.', false);
   return handleControllerContinuation(step.state!, deps, undefined, step.proceed === false);
  }
  if (payload.kind === 'daemon-review-pending') {
   if ((step.repo !== undefined && canonicalReviewRepository(step.repo) !== canonicalReviewRepository(payload.repo)) || (step.epicHash !== undefined && step.epicHash !== payload.epicHash) || (step.storyId !== undefined && step.storyId !== payload.storyId)) return errorResult('review-target-mismatch', 'Pending continuation target cannot be changed.', false);
   return resumeDaemonReview(payload, step.state!, deps, step.proceed === false);
  }
		deps = { ...deps, controllerRequest: step.controllerInput ?? payload.controllerInput };
		repo = payload.repo; epicHash = payload.epicHash; storyId = payload.storyId;
		subject = payload.subject;

		// proceed:false is an explicit DECLINE. s10: instead of failing closed, fall
		// back to a DIFF-ONLY (degraded) review — review the changed-file diff hunks
		// directly rather than the graph. Freshness is NOT re-checked (the decline is
		// the user's explicit choice), so a decline never silently upgrades to a full
		// graph review.
		if (step.proceed !== true) {
			await releaseState(step.state!);
			return await beginDiffOnlyReview(repo, epicHash, storyId, subject, deps, { kind: 'declined' });
		}
	} else {
  deps = { ...deps, controllerRequest: step.controllerInput };
		if (typeof step.epicHash !== 'string' || step.epicHash.length === 0) {
			return errorResult('bad-input', 'insrc_code_review_step: `epicHash` is required for phase=start.', false);
		}
		if (typeof step.storyId !== 'string' || step.storyId.length === 0) {
			return errorResult('bad-input', 'insrc_code_review_step: `storyId` is required for phase=start.', false);
		}
		// The caller's INSRC_REPO: the step context's inside a step call, this process's outside one.
		const r = step.repo !== undefined && step.repo.length > 0 ? step.repo : stepEnvRepo();
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
		const waitStart = deps.now();
		const deadline = waitStart + deps.freshnessTimeoutMs();
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
				await releaseState(step.state!);
				return await beginDiffOnlyReview(repo, epicHash, storyId, subject, deps, {
					kind:                 'freshness-timeout',
					waitedMs:             deps.now() - waitStart,
					inFlight:             f.inFlight,
					pendingCodeIndexJobs: f.pendingCodeIndexJobs,
					staleFiles:           [...f.staleFiles],
				});
			}
			await deps.sleep(POLL_INTERVAL_MS);
		}
		// Fresh: consume the confirm_wait token; a fresh emit_judgements state is
		// saved below.
		await releaseState(step.state!);
	} else {
		const f = await deps.fetchFreshness(freshParams);
		if (!f.ok) {
			return errorResult('freshness-unavailable', `insrc_code_review_step: freshness check unavailable — ${f.reason}.`, true);
		}
		if (f.isProcessing || f.staleFiles.length > 0) {
			const token = await saveState({
				runId:       `cr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				startedAtMs: Date.now(),
				repo, epicHash, storyId, subject, controllerInput: deps.controllerRequest,
				// grounding intentionally omitted — not fetched until the index is fresh.
			});
			return confirmWaitResult(f.staleFiles, f.isProcessing, token);
		}
	}

	const admittedFingerprint = deps.captureInput?.(subject);
 // 2. Fresh → fetch the sc2 grounding ONLY over the daemon IPC (k5/k6).
	const g = await deps.fetchGrounding({ repo, epicHash, storyId });
	if (!g.ok) {
		return errorResult('grounding-unavailable', `insrc_code_review_step: grounding unavailable — ${g.reason}.`, true);
	}
	if (admittedFingerprint !== undefined) assertReviewFingerprintCurrent(admittedFingerprint, admittedFingerprint.author === 'daemon' ? 'controller' : 'daemon');
 // Fresh-but-hollow: the index reports fresh but the graph grounding carries no
	// changed-symbol summaries (the hollow-PASS). Emitting a full-mode review over
	// an empty symbol set produces a meaningless verdict, so auto-fall-back to the
	// DIFF-ONLY (degraded) review over the changed-file diff instead. Runs only on
	// a successful fetch (g.ok), so it never masks a real grounding failure.
	if (g.grounding.symbols.length === 0) {
		return await beginDiffOnlyReview(repo, epicHash, storyId, subject, deps, { kind: 'hollow-grounding' });
	}
	const grounding = g.grounding;

	// Fresh grounding with symbols: a full review. The author is read at this
	// point (see beginDiffOnlyReview for the diff routes).
	if (authorOf(repo, epicHash, storyId, deps) !== 'daemon') {
		return await reviewByDaemon(subject, 'full', deps);
	}

	// 3. Save opaque state + hand the controller the four prompts + the schema.
	const token = await saveState({
		runId:       `cr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		startedAtMs: Date.now(),
		repo, epicHash, storyId, subject, grounding,
  ...(admittedFingerprint !== undefined ? { reviewInputFingerprint: admittedFingerprint } : {}),
	});

	return emitJudgementsResult(subject, grounding, token, 'full');
}

/**
 * s10 — the DIFF-ONLY (degraded) review path, reached from the decline branch.
 * Builds the diff-only grounding (the Story's commits since its range base, plus
 * uncommitted edits of its own files; ISSUE-b97752e9), saves
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
	reason:   CodeReviewFallbackReason,
): Promise<CodeReviewStepOutput> {
	// The author is read HERE, at the point a review is about to start, so it is
	// read on every route into a diff review, including the resumed call. Code the
	// daemon did not write is reviewed by the daemon, which grounds on the diff
	// itself; the controller is not handed the judgements prompt.
	if (authorOf(repo, epicHash, storyId, deps) !== 'daemon') {
		return await reviewByDaemon(subject, 'degraded', deps, reason);
	}

 const capability = deps.controllerExecution;
 if (capability === undefined) return errorResult('unsupported-bounded-controller', 'This degraded controller review requires the verified fresh isolated CLI helper. A raw controllerInput flag or inherited chat session cannot enforce the input cap.', false);
 const request = deps.controllerRequest;
 if (request !== undefined && (request.mode !== 'isolated-structured' || request.adapterId !== capability.adapterId || !Number.isSafeInteger(request.maxInputChars) || request.maxInputChars <= 0)) return errorResult('unsupported-bounded-controller', 'The requested controller adapter does not match its verified isolated execution capability.', false);
 const admittedCapability = { ...capability, maxInputChars: Math.min(capability.maxInputChars, request?.maxInputChars ?? capability.maxInputChars) };
 const startedAt = deps.now();
 const admittedFingerprint = (deps.captureInput ?? captureReviewInputFingerprint)(subject);
 assertReviewFingerprintCurrent(admittedFingerprint, 'controller');
 let grounding: CodeReviewGrounding;
	let changedFiles: readonly string[];
	let scoped: Pick<CodeReviewSubject, 'changeSetAttribution' | 'sharedWithExcluded' | 'excludedFromScope'>;
	try {
		// The same base and the same ledger exclusion the graph path's subject uses
		// (ISSUE-5f7a7cb9), so the two paths review the same Story range. `undefined`
		// for the seams keeps the assembler's own default.
		const diff = await deps.assembleDiffGrounding(repo, undefined, {
			base:         resolveStoryRangeBase(repo, subject.epicHash, subject.storyId),
			excludeGlobs: LEDGER_EXCLUDE_GLOBS,
			storyKey:     `${subject.epicHash}/${subject.storyId}`,
		});
		grounding = diff.grounding;
		changedFiles = diff.changedFiles;
		scoped = { changeSetAttribution: diff.changeSetAttribution, sharedWithExcluded: diff.sharedWithExcluded, excludedFromScope: diff.excludedFromScope };
	} catch (err) {
		if (err instanceof DiffUnavailableError) {
			return errorResult('diff-unavailable', `insrc_code_review_step: could not read the changed-file diff — ${err.message}.`, true);
		}
		throw err;
	}

	// An empty Story scope has nothing to review: the same decline the subject
	// gives, before any judge runs or any record is written (ISSUE-b97752e9).
	if (changedFiles.length === 0) {
		return errorResult('no-subject', 'insrc_code_review_step: cannot review — no-build-record (the Story\'s change set is empty).', false);
	}

	// Re-key the subject to the diff-derived changed set and to how the diff scoped
	// it (ISSUE-b47dadc7), including what it left out (ISSUE-b97752e9).
	const diffSubject: CodeReviewSubject = { ...subject, changedFiles, ...scoped };
 if (admittedFingerprint !== undefined) assertReviewFingerprintCurrent(admittedFingerprint, 'controller');

 const pipeline = await advanceControllerPipeline(prepareControllerPipeline(diffSubject, grounding, admittedFingerprint, reason, admittedCapability, startedAt, deps.now), deps.now);
 const token = await saveControllerState(pipeline);
 if (pipeline.active === undefined) return handleControllerContinuation(token, deps);
 return controllerCallFrame(pipeline, token);
}

/** Build the emit_judgements frame — the four per-dimension charges over the
 *  grounding + the judgements schema. Shared by the fresh graph path and the s10
 *  diff-only path (the four prompt builders consume grounding.symbols unchanged). */
function emitJudgementsResult(
	subject:       CodeReviewSubject,
	grounding:     CodeReviewGrounding,
	token:         string,
	groundingMode: 'full' | 'degraded',
): CodeReviewStepOutput {
	const dims = expectedDimensions(subject);
	// Prompts are keyed off the COMPUTED dims (not the content predicates) so a
	// declared-but-uncontented dimension (via the recorded adherence selection) still
	// gets its charge, and the prompts stay aligned with the judgements schema.
	const prompts = [
		buildAdherencePrompt(subject, grounding, undefined),
		buildConventionsPrompt(subject, grounding, undefined),
		// The same prepared symbol list the daemon's coverage judge sees (ISSUE-b47dadc7).
		buildCoveragePrompt(subject, prepareCoverageGrounding(subject, grounding, groundingMode), undefined, { groundingMode }),
		buildQualityPrompt(subject, grounding, undefined),
		...(dims.includes('functional-coverage') ? [buildFunctionalCoveragePrompt(subject, grounding, undefined)] : []),
		...(dims.includes('diagram') ? [buildDiagramPrompt(subject, grounding, undefined)] : []),
		...(dims.includes('ux') ? [buildUxPrompt(subject, grounding, undefined)] : []),
	];
	return {
		next:     'emit_judgements',
		guidance: `Judge each of the ${dims.length} dimensions (${dims.join(', ')}) over the grounding below, ` +
			'then call phase=\'judgements\' with judgements=<your JSON> + state. Emit one DimensionResult per dimension; each ' +
			'finding\'s location must be a `file:line` inside the Story\'s changed set.',
		prompts,
		schema:    buildJudgementsSchema(dims),
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
	const payload = await loadState(step.state);   // throws StateTokenNotFound → caught in dispatch
 if (payload.kind === 'controller-pipeline') {
  if (step.judgements !== undefined || step.callResult === undefined) return errorResult('bad-call-result', 'Controller pipeline states require exactly one identified callResult, never aggregate judgements.', false);
  return handleControllerContinuation(step.state, deps, step.callResult);
 }
 if (step.callResult !== undefined) return errorResult('bad-state', 'This legacy state does not accept pipeline callResult.', false);
 if (payload.kind === 'daemon-review-pending') return errorResult('bad-state', 'A pending daemon review accepts start/status or explicit cancellation, never controller judgements.', false);

	// A judgements turn always resumes an emit_judgements state, which carries the
	// fetched grounding. A confirm_wait state (grounding not yet fetched) is not a
	// valid judgements resume — guard rather than deref undefined.
	if (payload.groundingMode === 'degraded') return errorResult('restart-required', 'Legacy unbounded degraded review state is no longer accepted. Start again through the verified isolated controller helper.', false);
 if (payload.grounding === undefined) {
		return errorResult('bad-state', 'insrc_code_review_step: this state is awaiting a proceed/abort resume, not judgements.', false);
	}
	const grounding = payload.grounding;

	// This phase stamps the CONTROLLER's review, so it does not stamp one on code
	// the controller wrote. `start` already sends such code to the daemon; this
	// holds the rule at the point of the stamp, whatever led here.
	if (authorOf(payload.repo, payload.epicHash, payload.storyId, deps) === 'controller') {
		await releaseState(step.state);
		return errorResult('same-party-review', new SamePartyReviewError('controller', `the code of Story ${payload.storyId}`).message, false);
	}

	// Validate the controller's judgements BEFORE driving the runner. A fault
	// returns an error frame and writes nothing (ac5).
	const validated = validateJudgements(step.judgements?.judgements, payload.subject);
	if (!validated.ok) {
		return errorResult('bad-judgements', `insrc_code_review_step: ${validated.message}`, true);
	}
	const byDimension = validated.byDimension;
	const degraded = false;

	// Coverage HIGHs are normalised against the same prepared grounding the daemon
	// judge uses, so both paths fold the same verdict (ISSUE-b47dadc7).
	const coverage = byDimension.get('coverage');
	if (coverage !== undefined) {
		const prepared = prepareCoverageGrounding(payload.subject, grounding, degraded ? 'degraded' : 'full');
		byDimension.set('coverage', normalizeCoverageFindings(coverage, prepared, payload.subject));
	}

	// Drive the SAME sc5 runCodeReview with injected deps: each judge returns the
	// matching (already scope-dropped) DimensionResult; grounding is replayed from
	// state; write persists via writeAtomic. So the record is byte-identical to
	// the daemon-driven path (ac3/k2).
	const injected: CodeReviewRunnerDeps = {
		judges: expectedDimensions(payload.subject).map((dimension) => ({
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

	return await driveRunner(step.state, payload.subject, injected, deps, degraded, payload.fallbackReason, payload.reviewInputFingerprint);
}

async function driveRunner(
	token:    string,
	subject:  CodeReviewSubject,
	injected: CodeReviewRunnerDeps,
	deps:     CodeReviewStepDeps,
	degraded: boolean,
	fallbackReason?: CodeReviewFallbackReason | undefined,
 fingerprint?: ReviewInputFingerprint,
 completedTiming?: import('../../../workflow/code-review/types.js').ReviewTimingPlan,
 controllerModel = 'client',
): Promise<CodeReviewStepOutput> {
 if (deps.captureInput !== undefined && fingerprint === undefined) return errorResult('restart-required', 'Review state has no admitted input identity; start a new review.', false);
 const publication = fingerprint === undefined ? undefined : claimReviewPublication(fingerprint, 'controller');
 try {
	const runId = `cr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const completedOpts = completedTiming === undefined ? {} : { completedControllerTiming: completedTiming, startedAtMs: completedTiming.startedAt, now: deps.now };
	const outcome = await deps.runReview(
		subject,
		DUMMY_PROVIDER,
		degraded
			? { ...completedOpts, ...(publication !== undefined ? { publication, requirePublication: true } : {}), runId, modelLabel: controllerModel, reviewedBy: 'controller', groundingMode: 'degraded', capVerdictAtWarn: true, ...(fallbackReason !== undefined ? { fallbackReason } : {}) }
			: { ...completedOpts, ...(publication !== undefined ? { publication, requirePublication: true } : {}), runId, modelLabel: 'client', reviewedBy: 'controller' },
		injected,
	);
	if (!outcome.ok) {
		return errorResult(outcome.code ?? 'fold-failed', `insrc_code_review_step: ${outcome.error}`, outcome.code === undefined);
	}
	if (completedTiming === undefined) await releaseState(token);   // consumed — a resend of this token fails loadState (no double-write)
	const cra = codeReviewSubjectPathArgs(subject);
	const paths = codeReviewArtifactPaths(subject.repoPath, subject.epicHash, subject.storyId, cra.createdAtISO, cra.workItemKind, cra.epicSlug);
	// ISSUE-11e4fa88 — say so when findings were dropped. The operator reads this
	// response, not the record, and a clean-looking verdict that hides discarded
	// findings reports the opposite of what the reviewer said.
	const byDimension: Record<string, number> = {};
	for (const dim of outcome.artifact.body.dimensions) {
		const n = dim.outOfScope?.length ?? 0;
		if (n > 0) byDimension[dim.dimension] = n;
	}
	const count = Object.values(byDimension).reduce((a, b) => a + b, 0);
	if (count > 0) {
		log.warn(
			{ storyId: subject.storyId, count, byDimension, changedFiles: subject.changedFiles.length },
			'insrc_code_review_step: findings dropped as out of scope (not counted in the verdict)',
		);
	}
 publication?.validate();
	return {
		next:     'done',
		verdict:  outcome.artifact.body.verdict,
		counts:   outcome.artifact.body.counts,
		path:     paths.md,
		jsonPath: paths.json,
		...(outcome.artifact.body.fallbackReason !== undefined ? { fallbackReason: outcome.artifact.body.fallbackReason } : {}),
		...(count > 0 ? { scopeDropped: { count, changedFiles: subject.changedFiles.length, byDimension } } : {}),
	};
 } finally { publication?.release(); }
}

async function handleControllerContinuation(token: string, deps: CodeReviewStepDeps, raw?: unknown, cancel = false): Promise<CodeReviewStepOutput> {
 return withControllerStateLock(token, async () => {
  const state = await loadState(token);
  if (state.kind !== 'controller-pipeline') return errorResult('bad-state', 'This token is not a bounded controller pipeline.', false);
  try {
   assertReviewFingerprintCurrent(state.fingerprint, 'controller');
   const admitted = deps.controllerExecution;
   if (!cancel && state.capability.helperEpoch !== undefined && (admitted?.helperEpoch !== state.capability.helperEpoch || admitted.adapterId !== state.capability.adapterId)) return errorResult('unsupported-bounded-controller', 'The isolated helper owner was lost or changed; cancel/restart this controller review.', false);
   if (cancel) {
    if (state.terminal !== undefined) return state.terminal;
    const terminal = errorResult('review-cancelled', 'The controller review was cancelled; outstanding call IDs are revoked.', false);
    await replaceControllerState(token, state.revision, { ...state, revision: state.revision + 1, active: undefined, terminal }); return terminal;
   }
   const input = raw === undefined ? undefined : parseControllerCallResult(raw);
   if (input !== undefined) {
    const accepted = state.accepted.find(a => a.callId === input.callId);
    if (accepted !== undefined) {
     if (accepted.digest !== controllerAnswerDigest(input)) return errorResult('conflicting-call-replay', 'An accepted callId cannot be replayed with different content.', false);
     return accepted.response;
    }
   }
   if (state.terminal !== undefined) return input === undefined ? state.terminal : errorResult('bad-call-result', 'This controller pipeline is already terminal.', false);
   assertReviewTime(state.timing, deps.now());
   let next: ControllerPipelineState = input === undefined ? await advanceControllerPipeline(state, deps.now) : await applyControllerResult(state, input, deps.now);
   let response: CodeReviewStepOutput;
   if (next.active !== undefined) response = controllerCallFrame(next, token);
   else {
    const checked = validateJudgements(next.results, next.subject);
    if (!checked.ok) throw new Error(checked.message);
    const byDimension = checked.byDimension;
    for (const dimension of next.results) byDimension.set(dimension.dimension, { ...dimension, ...byDimension.get(dimension.dimension)! });
    const injected: CodeReviewRunnerDeps = { judges: expectedDimensions(next.subject).map(dimension => ({ dimension, judge: async () => byDimension.get(dimension)! })), assembleGrounding: async () => (next.snapshot.grounding as { grounding: CodeReviewGrounding }).grounding, write: deps.write };
    response = await driveRunner(token, next.subject, injected, deps, true, next.fallbackReason, next.fingerprint, next.timing, next.capability.modelLabel ?? 'client');
    next = { ...next, terminal: response };
   }
   if (input !== undefined) next = { ...next, accepted: [...next.accepted, { callId: input.callId, digest: controllerAnswerDigest(input), response }] };
   // A repeated start returns the same active call and clock without altering state.
   if (next !== state) await replaceControllerState(token, state.revision, { ...next, revision: Math.max(state.revision + 1, next.revision) });
   return response;
  } catch (err) {
   const message = err instanceof Error ? err.message : String(err);
   const code = err instanceof Error && 'code' in err && typeof err.code === 'string' ? err.code : /expired|deadline/.test(message) ? 'review-deadline' : err instanceof ReviewCallFailedError || err instanceof AtomTooLargeError || err instanceof MaterialChangedError ? 'controller-review-failed' : 'bad-call-result';
   const response = errorResult(code, message, false);
   if (state.terminal === undefined && (code.startsWith('review-input-') || code === 'same-party-review' || code === 'review-deadline' || code === 'controller-review-failed')) await replaceControllerState(token, state.revision, { ...state, revision: state.revision + 1, active: undefined, terminal: response });
   return response;
  }
 });
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
/** Exported for the review pipeline's controller-path test (Epic 8315a11f s3): a divided review's
 *  results go through this same split into findings and outOfScope. */
export function validateJudgements(raw: readonly DimensionResult[] | undefined, subject: CodeReviewSubject): ValidateResult {
	if (raw === undefined || !Array.isArray(raw) || raw.length === 0) {
		return { ok: false, message: 'judgements is missing or empty; supply one DimensionResult per dimension.' };
	}
	const changed = new Set(subject.changedFiles);
	const expected = expectedDimensions(subject);
	const seen = new Set<ReviewDimension>();
	const byDimension = new Map<ReviewDimension, DimensionResult>();

	for (const dr of raw) {
		if (typeof dr !== 'object' || dr === null || typeof dr.dimension !== 'string') {
			return { ok: false, message: 'each judgement must be a DimensionResult with a `dimension` + `findings`.' };
		}
		if (!expected.includes(dr.dimension as ReviewDimension)) {
			return { ok: false, message: `unknown dimension '${dr.dimension}'; expected one of ${expected.join(', ')}.` };
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
		const dropped: DimensionFinding[] = [];
		for (const f of dr.findings) {
			const bad = validateFinding(f, dimension);
			if (bad !== null) return { ok: false, message: bad };
			// scope-drop: keep only findings whose file is in the changed set
			// (daemon-path parity). fileOf = the substring before the first ':'.
			//
			// ISSUE-11e4fa88 — the filter is unchanged, but a dropped finding is no
			// longer discarded: it is carried on the dimension as `outOfScope`. It
			// used to fall off the end of this loop, so a dimension whose findings
			// were all filtered away was indistinguishable from one the reviewer
			// found clean.
			if (changed.has(fileOf((f as DimensionFinding).location))) kept.push(f as DimensionFinding);
			else dropped.push(f as DimensionFinding);
		}
		byDimension.set(dimension, {
			dimension, findings: kept,
			...(dropped.length > 0 ? { outOfScope: dropped } : {}),
		});
	}

	const missing = expected.filter(d => !seen.has(d));
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

function authorOf(repo: string, epicHash: string, storyId: string, deps: CodeReviewStepDeps): PartyOrUnknown {
	return (deps.readBuildAuthor ?? buildAuthorParty)(repo, epicHash, storyId);
}

/** How long the tool waits for the daemon's code review: at most `ceilingMs` in
 *  all, and at most `idleMs` without a progress frame (ISSUE-1973e125). A large
 *  Story's review runs for hours while reporting a call about once a minute. */
export interface CodeReviewWaitLimits {
	readonly ceilingMs: number;
	readonly idleMs:    number;
}

const CEILING_KEY = 'codeReview.daemonReviewCeilingMs';
const IDLE_KEY = 'codeReview.daemonReviewIdleMs';
const DEFAULT_CEILING_MS = 14_400_000;
const DEFAULT_IDLE_MS = 1_200_000;

/** The wait limits from `config` (default: `~/.insrc/config.json`). Fail-safe as
 *  readFreshnessTimeoutMs: a missing, non-positive or non-numeric value is its
 *  default, and the idle limit is at most the ceiling. Never throws. */
export function codeReviewWaitLimits(config?: unknown): CodeReviewWaitLimits {
	let raw = config;
	if (raw === undefined) {
		try {
			raw = existsSync(PATHS.config) ? JSON.parse(readFileSync(PATHS.config, 'utf8')) : {};
		} catch {
			raw = {};
		}
	}
	const section = (raw as { codeReview?: { daemonReviewCeilingMs?: unknown; daemonReviewIdleMs?: unknown } } | null)?.codeReview;
	const valid = (v: unknown, dflt: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : dflt);
	const ceilingMs = valid(section?.daemonReviewCeilingMs, DEFAULT_CEILING_MS);
	return { ceilingMs, idleMs: Math.min(valid(section?.daemonReviewIdleMs, DEFAULT_IDLE_MS), ceilingMs) };
}

/** The retryable causes: the same call can succeed once the cause is gone. */
const RETRYABLE_DAEMON_FAILURES: ReadonlySet<string> = new Set(['unreachable', 'closed', 'timeout']);

/**
 * Send the Story's code to the daemon for review and return its verdict.
 *
 * `mode` tells the daemon how to ground: `full` on the graph, or `degraded` on
 * the diff (the record is then stamped `degraded` and its verdict capped at
 * warn, as on the controller's own diff path). A daemon review that does not
 * complete is an error; it is never replaced by a controller review.
 */
async function reviewByDaemon(
	subject: CodeReviewSubject,
	mode:    'full' | 'degraded',
	deps:    CodeReviewStepDeps,
	reason?: CodeReviewFallbackReason | undefined,
): Promise<CodeReviewStepOutput> {
	const { repoPath: repo, epicHash, storyId } = subject;
 if (deps.reviewControl !== undefined) return startDaemonReview(subject, mode, deps, reason);
	const limits = (deps.waitLimits ?? codeReviewWaitLimits)();
	log.info({ repo, epicHash, storyId, mode, ...limits }, 'insrc_code_review_step: not daemon-authored; asking the daemon to review');
	try {
		const res = await (deps.reviewByDaemon ?? stepDaemonClient().codeReviewStream)(
			{ repo, epicHash, storyId, groundingMode: mode, ...(reason !== undefined ? { fallbackReason: reason } : {}), ...(deps.client !== undefined ? { client: deps.client } : {}) },
			{
				timeoutMs: limits.ceilingMs, idleMs: limits.idleMs,
				...(deps.progress !== undefined ? { onFrame: (_stream: 'progress' | 'delta', data: unknown) => deps.progress!(data) } : {}),
				...(deps.signal !== undefined ? { signal: deps.signal } : {}),
			},
		);
		// `codeReview.run` is older than the grounding mode and the reviewer stamp, so
		// a daemon that predates them accepts this request and silently ignores both:
		// it grounds on the graph when the diff was asked for, does not cap the
		// verdict, and stamps no reviewer. The unknown-method check cannot catch
		// that. What came back is checked against what was asked.
		const got = { mode: res.artifact.body.groundingMode, reviewedBy: res.artifact.meta.reviewedBy };
		if (got.mode !== mode || got.reviewedBy !== 'daemon') {
			throw new ReviewStreamError(
				'unknown-method',
				`codeReview.run: the daemon answered with grounding '${String(got.mode)}' and reviewer '${String(got.reviewedBy)}' ` +
				`where '${mode}' and 'daemon' were asked for; it is older than this request. Update the daemon and restart it. ` +
				'The record it wrote does not count as this review',
			);
		}
		const cra = codeReviewSubjectPathArgs(subject);
		const paths = codeReviewArtifactPaths(repo, epicHash, storyId, cra.createdAtISO, cra.workItemKind, cra.epicSlug);
		const model = res.artifact.meta.model;
		return {
			next:          'done',
			verdict:       res.artifact.body.verdict,
			counts:        res.artifact.body.counts,
			path:          paths.md,
			jsonPath:      paths.json,
			reviewedBy:    'daemon',
			groundingMode: res.artifact.body.groundingMode,
			...(reason !== undefined ? { fallbackReason: reason } : {}),
			...(typeof model === 'string' ? { model } : {}),
		};
	} catch (err) {
		const failure = err instanceof ReviewStreamError ? err.failure : 'failed';
		let cause = err instanceof Error ? err.message : String(err);
		// A timeout names the setting to raise.
		if (failure === 'timeout' && err instanceof ReviewStreamError) {
			if (err.reason === IDLE_TIMEOUT) cause += ` (the idle limit, ${IDLE_KEY})`;
			else if (err.reason === CEILING_TIMEOUT) cause += ` (the overall limit, ${CEILING_KEY})`;
		}
		log.warn({ repo, epicHash, storyId, mode, failure, cause }, 'insrc_code_review_step: the daemon review did not complete; nothing stamped');
		return errorResult(
			`daemon-review-${failure}`,
			`The daemon code review of Story ${storyId} did not complete: ${cause}. No review was recorded. ` +
			`The daemon reviews this code because the daemon did not write it; the review is not replaced by a ` +
			`controller review. Fix the cause and call insrc_code_review_step again, or approve with an override reason.`,
			RETRYABLE_DAEMON_FAILURES.has(failure),
		);
	}
}

function controlOpts(deps: CodeReviewStepDeps): ReviewStreamOpts {
 return { timeoutMs: 200_000, ...(deps.signal !== undefined ? { signal: deps.signal } : {}), ...(deps.progress !== undefined ? { onFrame: (_stream, data) => deps.progress!(data) } : {}) };
}
function pendingResult(payload: CodeReviewPendingState, state: string, reply?: Extract<CodeReviewControlResult, { status: 'pending' }>): CodeReviewStepOutput {
 return { next: 'review_pending', state, reviewHandle: payload.reviewHandle, daemonEpoch: payload.daemonEpoch, progress: reply?.progress ?? [], ...(reply?.timing !== undefined ? { timing: reply.timing } : {}),
  guidance: "The daemon still owns this review. Call phase='start' again with this SAME state to resume/status; each wait is at most200s. Do not relaunch, poll the host, or reset the chunk-derived deadline. Use proceed:false with this state only to cancel the owned review. No completed CR is claimed while pending." };
}
async function consumeControlReply(reply: CodeReviewControlResult, payload: CodeReviewPendingState, token: string | undefined, deps: CodeReviewStepDeps): Promise<CodeReviewStepOutput> {
 if (reply.daemonEpoch !== payload.daemonEpoch || reply.reviewHandle !== payload.reviewHandle) {
  if (token !== undefined) await releaseState(token);
  return errorResult('review-operation-lost', 'The daemon epoch or review handle changed. Start a new review.', false);
 }
 if (reply.status === 'pending') {
  const state = token ?? await savePendingState(payload, deps.operations ?? codeReviewOperations);
  return pendingResult(payload, state, reply);
 }
 if (token !== undefined) await releaseState(token);
 if (reply.status === 'failed') return errorResult(reply.reason, reply.error, false);
 if (reply.status === 'cancelled') return errorResult('review-cancelled', 'The owned review was cancelled. No completed CR is claimed.', false);
 const res = reply.result;
 if (res.artifact.body.groundingMode !== payload.mode || res.artifact.meta.reviewedBy !== 'daemon' || (payload.reviewInputFingerprint !== undefined && payload.reviewInputFingerprint.digest !== res.artifact.meta.reviewInputFingerprint?.digest)) return errorResult('review-input-changed', 'The final review does not match its admitted inputs and mode.', false);
 return { next: 'done', verdict: res.artifact.body.verdict, counts: res.artifact.body.counts, path: payload.paths.md, jsonPath: payload.paths.json, reviewedBy: 'daemon', groundingMode: payload.mode,
  ...(res.artifact.body.fallbackReason !== undefined ? { fallbackReason: res.artifact.body.fallbackReason } : {}), ...(res.artifact.meta.model !== undefined ? { model: res.artifact.meta.model } : {}) };
}
async function startDaemonReview(subject: CodeReviewSubject, mode: 'full' | 'degraded', deps: CodeReviewStepDeps, reason?: CodeReviewFallbackReason): Promise<CodeReviewStepOutput> {
 const params: CodeReviewControlParams = { operation: 'start', repo: subject.repoPath, epicHash: subject.epicHash, storyId: subject.storyId, groundingMode: mode, ...(reason !== undefined ? { fallbackReason: reason } : {}), ...(deps.client !== undefined ? { client: deps.client } : {}) };
 try {
  const fingerprint = deps.captureInput?.(subject), cra = codeReviewSubjectPathArgs(subject);
  const paths = codeReviewArtifactPaths(subject.repoPath, subject.epicHash, subject.storyId, cra.createdAtISO, cra.workItemKind, cra.epicSlug);
  const reply = codeReviewControlResult(await deps.reviewControl!(params, controlOpts(deps)), params);
  const payload: CodeReviewPendingState = { kind: 'daemon-review-pending', repo: canonicalReviewRepository(subject.repoPath), epicHash: subject.epicHash, storyId: subject.storyId, reviewHandle: reply.reviewHandle, daemonEpoch: reply.daemonEpoch, mode, paths,
   ...(reason !== undefined ? { fallbackReason: reason } : {}), ...(fingerprint !== undefined ? { reviewInputFingerprint: fingerprint } : {}) };
  return await consumeControlReply(reply, payload, undefined, deps);
 } catch (err) {
  const failure = err instanceof ReviewStreamError ? err.failure : 'failed';
  return errorResult(`daemon-review-${failure}`, `Review admission/wait did not return a handle: ${err instanceof Error ? err.message : String(err)}. Retry the same start; the daemon joins existing identical inputs.`, RETRYABLE_DAEMON_FAILURES.has(failure));
 }
}
async function resumeDaemonReview(payload: CodeReviewPendingState, token: string, deps: CodeReviewStepDeps, cancel: boolean): Promise<CodeReviewStepOutput> {
 const params: CodeReviewControlParams = { operation: cancel ? 'cancel' : 'status', repo: payload.repo, epicHash: payload.epicHash, storyId: payload.storyId, reviewHandle: payload.reviewHandle };
 try {
  const reply = codeReviewControlResult(await (deps.reviewControl ?? stepDaemonClient().codeReviewControl)(params, controlOpts(deps)), params);
  return await consumeControlReply(reply, payload, token, deps);
 } catch (err) {
  if (err instanceof ReviewStreamError && (RETRYABLE_DAEMON_FAILURES.has(err.failure) || err.failure === 'aborted')) return pendingResult(payload, token);
  await releaseState(token);
  return errorResult(err instanceof ReviewStreamError ? (err.reason ?? `daemon-review-${err.failure}`) : 'review-operation-lost', err instanceof Error ? err.message : String(err), false);
 }
}

function errorResult(code: string, message: string, retryable: boolean): CodeReviewStepError {
	return { next: 'error', error: { code, message, retryable } };
}
