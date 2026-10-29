import { renderCodeReviewMd } from './rendering.js';
import { foldCounts, foldVerdict, validateArtifact } from './record-validation.js';
import { appendReviewRunEvent } from './run-events.js';
import { ReviewBudgetError } from '../review-pipeline/budget.js';
import { safeReviewFailure } from '../../shared/review-failure.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review S006 — the aggregate runner (sc5) that ties the four shipped
 * dimension judges into ONE persisted `CodeReviewArtifact` (sc4).
 *
 * `runCodeReview` is the serial orchestrator: it assembles the sc2 grounding
 * once, drives the four judges (adherence → conventions → coverage → quality)
 * in a SERIAL for-of loop — never `Promise.all` over the provider (k4/ac4) —
 * folds their aggregated finding severities into a `ReviewVerdict` (any HIGH →
 * block, else any MED → warn, else pass) + counts that mirror ReviewReport
 * VERBATIM (ac2), builds the sc4 record, VALIDATES it in memory, and only THEN
 * writes it atomically at `CR-<epic>-<story>`. A throwing judge, a grounding
 * failure, an in-memory validation failure, or an aborted signal returns
 * `{ ok:false, error }` BEFORE any write — so a run that fails partway leaves no
 * pass record on disk (ac5). Read-only over the code it judges.
 *
 * The judges, the grounding assembler, and the writer are injected via
 * {@link CodeReviewRunnerDeps} (defaulting to {@link DEFAULT_DEPS}) so the whole
 * orchestration is exercised by fakes with no live daemon / Ollama.
 */

import type { LLMProvider } from '../../shared/types.js';
import { getLogger } from '../../shared/logger.js';
import { reviewedBuildFingerprint } from './build-freshness.js';
import type { ReviewVerdict } from '../review/types.js';
import {
	codeReviewArtifactId,
	codeReviewArtifactPaths,
	folderIdentityMeta,
	writeArtifact,
	writeAtomic,
} from '../storage.js';
import { codeReviewSubjectPathArgs } from './subject-paths.js';
import type {
	CodeReviewArtifact,
	CodeReviewBody,
	CodeReviewFallbackReason,
	CodeReviewGrounding,
	CodeReviewMeta,
	CodeReviewOutcome,
	CodeReviewSubject,
	DimensionResult,
	JudgeContext,
	ReviewDimension,
} from './types.js';
import { CODE_REVIEW_SCHEMA_VERSION } from './types.js';
import { assembleCodeReviewGrounding, realGroundingDeps } from './grounding.js';
import { judgeAdherence } from './dimensions/adherence.js';
import { judgeConventions } from './dimensions/conventions.js';
import { judgeCoverage } from './dimensions/coverage.js';
import { judgeQuality } from './dimensions/quality.js';
import { judgeFunctionalCoverage } from './dimensions/functional-coverage.js';
import { judgeDiagram } from './dimensions/diagram/index.js';
import { judgeUx } from './dimensions/ux/index.js';
import { computeExpectedDimensions } from './expected-dimensions.js';
import { codeReviewSnapshot } from '../review-pipeline/code-review.js';
import type { Party } from '../review/party.js';
import { storeRound, withStoredModel } from '../runners/build/round-writer.js';
import type { RoundWriter } from '../runners/build/round-writer.js';

const log = getLogger('code-review:runner');

// ---------------------------------------------------------------------------
// sc5 — runner types
// ---------------------------------------------------------------------------

/** One serial judge slot: the dimension it owns + its judge fn (the uniform
 *  `(subject, grounding, provider) => Promise<DimensionResult>` signature the
 *  four shipped judges share). */
export interface JudgeSlot {
	readonly dimension: ReviewDimension;
	readonly judge: (
		subject:   CodeReviewSubject,
		grounding: CodeReviewGrounding,
		provider:  LLMProvider,
		/** How the run is grounded (ISSUE-b47dadc7); judges that do not need it ignore it. */
		ctx?:      JudgeContext,
	) => Promise<DimensionResult>;
}

/** The runner's injectable seams. Defaults (DEFAULT_DEPS) wire the four shipped
 *  judges in fixed order, S001's grounding assembler, and writeAtomic; tests
 *  substitute fakes so the runner is driven without a live daemon/Ollama. */
export interface CodeReviewRunnerDeps {
	/** The judges, in the fixed order they run. */
	readonly judges: readonly JudgeSlot[];
	/** Assemble the sc2 grounding for the changed files (read-only over the graph). */
	readonly assembleGrounding: (repoPath: string, changedFiles: readonly string[]) => Promise<CodeReviewGrounding>;
	/** Persist a file atomically (tmp-then-rename). */
	readonly write: (absPath: string, content: string) => void;
 readonly recordCallEvent?: ((repo: string, runId: string, event: import('../review-pipeline/call-events.js').ReviewCallEvent) => void) | undefined;
	/**
	 * When set, the record's body is stored through the lifecycle service first (staged, logged with the review's outcome,
	 * revisioned; the first round is created through the store) and `write` then only refreshes the json and the markdown.
	 * A failed store fails the run before any file is written.
	 */
	readonly through?: RoundWriter | undefined;
}

/** Run options — mirrors workflow-rpc's run opts. `modelLabel` is the resolved
 *  high-tier label stamped on meta; `onProgress` emits CodeReviewProgress frames. */
export interface RunCodeReviewOpts {
	readonly beforePersist?: ((artifact: CodeReviewArtifact) => void) | undefined;
	readonly runId:       string;
	readonly modelLabel:  string;
	readonly signal?:     AbortSignal | undefined;
	readonly onProgress?: ((f: CodeReviewProgress) => void) | undefined;
	/** How this run was grounded — stamped verbatim onto `body.groundingMode`.
	 *  Defaults to `'full'` (the graph-grounded path). The s10 diff-only fallback
	 *  passes `'degraded'`. */
	readonly groundingMode?: 'full' | 'degraded' | undefined;
	/** Why a degraded run fell back to the diff; stamped onto `body.fallbackReason`
	 *  when given (ISSUE-1102dc71). */
	readonly fallbackReason?: CodeReviewFallbackReason | undefined;
	/** When true, a folded `'pass'` is promoted to `'warn'` (block + warn are
	 *  NEVER lowered). Defaults to false. The s10 diff-only path sets it so a
	 *  degraded review can never register a `pass` — it reasons over diff hunks
	 *  rather than graph symbols, so a clean fold is not trustworthy as a pass. */
	readonly capVerdictAtWarn?: boolean | undefined;
	/** The party running this review, written to the record's `meta.reviewedBy`.
	 *  The MCP tool passes `controller`, the daemon request passes `daemon`.
	 *  When omitted the record carries no reviewer party. */
	readonly reviewedBy?: Party | undefined;
}

/** Incremental progress frame streamed through `onProgress`. */
export interface CodeReviewProgress {
	readonly phase:      'grounding' | 'dimension-start' | 'call' | 'call-event' | 'dimension-done' | 'finalize' | 'done' | 'error';
	readonly dimension?: ReviewDimension | undefined;
	readonly detail?:    string | undefined;
	readonly callEvent?: import('../review-pipeline/call-events.js').ReviewCallEvent | undefined;
}

/** The shipped judges, in fixed evaluation order. The trailing conditionals —
 *  `functional-coverage` (sc2 — S001), `diagram` (sc4 — S003), `ux` (sc4 — S004) —
 *  are dropped by `effectiveJudges` for a subject that does not require them (via
 *  computeExpectedDimensions), so non-FR / non-diagram / non-UX work keeps exactly
 *  the base four (absent-safe). */
const DEFAULT_JUDGES: readonly JudgeSlot[] = [
	{ dimension: 'adherence',           judge: judgeAdherence },
	{ dimension: 'conventions',         judge: judgeConventions },
	{ dimension: 'coverage',            judge: judgeCoverage },
	{ dimension: 'quality',             judge: judgeQuality },
	{ dimension: 'functional-coverage', judge: judgeFunctionalCoverage },
	{ dimension: 'diagram',             judge: judgeDiagram },
	{ dimension: 'ux',                  judge: judgeUx },
];

/** The judge slots that actually run for THIS subject: the base four always, plus
 *  each conditional dimension (functional-coverage / diagram / ux) exactly when it
 *  is in the computed expected-dimension set (content-derived gate OR recorded
 *  adherence selection). Derives from the SAME computeExpectedDimensions as the MCP
 *  handler's expectedDimensions, so the serial loop, validateArtifact, and the
 *  handler's buildJudgementsSchema can never disagree (lock-step). */
export function effectiveJudges(judges: readonly JudgeSlot[], subject: CodeReviewSubject): readonly JudgeSlot[] {
	const want = new Set<ReviewDimension>(computeExpectedDimensions(subject));
	return judges.filter(s => want.has(s.dimension));
}

/**
 * The default record writer. The code-review json is a signoff-covered record
 * (sc3), so it is written as CONTENT through `writeArtifact`: each regeneration
 * mints a revision. Its markdown stays a plain atomic render. Tests and the
 * step handler inject their own writer in its place.
 */
export function writeRecordFile(absPath: string, content: string): void {
	if (absPath.endsWith('.json')) {
		writeArtifact(absPath, JSON.parse(content), 'content');
		return;
	}
	// raw-write: markdown render of the record.
	writeAtomic(absPath, content);
}

/** The real dependency wiring: the four shipped judges + S001's assembler
 *  (backed by the LMDB graph) + the revision-minting record writer. */
export const DEFAULT_DEPS: CodeReviewRunnerDeps = {
	judges: DEFAULT_JUDGES,
	assembleGrounding: async (repoPath, changedFiles) =>
		assembleCodeReviewGrounding(repoPath, changedFiles, await realGroundingDeps()),
	write: writeRecordFile,
 recordCallEvent: appendReviewRunEvent,
};

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

/**
 * Drive one code review to a persisted sc4 record. Never throws — every failure
 * (throwing judge, grounding failure, in-memory validation failure, abort) is
 * converted to `{ ok:false, error }` BEFORE any write, so no partial/pass record
 * is left on disk (ac5). On success exactly one record is written atomically at
 * `CR-<epic>-<story>` (both `.json` and a minimal `.md`), after validation.
 */
export async function runCodeReview(
	subject:  CodeReviewSubject,
	provider: LLMProvider,
	opts:     RunCodeReviewOpts,
	deps:     CodeReviewRunnerDeps = DEFAULT_DEPS,
): Promise<CodeReviewOutcome> {
	const startedAtMs = Date.now();
	const callEvents: import('../review-pipeline/call-events.js').ReviewCallEvent[] = [];
 const emit = (f: CodeReviewProgress): void => {
  if (f.callEvent) { callEvents.push(f.callEvent); deps.recordCallEvent?.(subject.repoPath, opts.runId, f.callEvent); }
  try { opts.onProgress?.(f); } catch { log.warn({ errorCode: 'observer-failed' }, 'code review observer failed'); }
 };

	try {
		// 1. Grounding — assembled once, shared by every judge. An abort or a
		//    grounding throw returns {ok:false} before any judge runs.
		if (opts.signal?.aborted) return fail('aborted', emit);
		emit({ phase: 'grounding' });
		const grounding = await deps.assembleGrounding(subject.repoPath, subject.changedFiles);

		// 2. SERIAL judge loop — each awaited before the next (k4/ac4). The abort
		//    signal is checked at every iteration boundary; a throwing judge
		//    propagates to the catch below (=> {ok:false}, no write, later judges
		//    never run).
		const judges = effectiveJudges(deps.judges, subject);
		// One snapshot for the whole review (Epic 8315a11f): the grounding and every
		// companion file's existence, taken now; no judge reads the disk afterwards.
		const groundingMode = opts.groundingMode ?? 'full';
		const ctx: JudgeContext = { groundingMode, snapshot: codeReviewSnapshot(subject, grounding, groundingMode), signal: opts.signal };
		const dimensions: DimensionResult[] = [];
		for (const slot of judges) {
			if (opts.signal?.aborted) return fail('aborted', emit);
			emit({ phase: 'dimension-start', dimension: slot.dimension });
			// A frame as each of the dimension's review calls starts, so a long review is seen to progress (ISSUE-1973e125).
			let calls = 0;
			const onCall = (call: { readonly stage: string; readonly role: string }): void =>
				emit({ phase: 'call', dimension: slot.dimension, detail: `${call.stage} ${call.role} #${++calls}` });
			const result = await slot.judge(subject, grounding, provider, { ...ctx, onCall, onCallEvent: callEvent => emit({ phase: 'call-event', dimension: slot.dimension, callEvent }) });
			dimensions.push(result);
			emit({ phase: 'dimension-done', dimension: slot.dimension });
		}

		// 3. Fold the verdict from the aggregated severities. On the degraded
		//    (diff-only) path the fold is warn-capped: a clean fold can never be a
		//    pass, because the judges reasoned over diff hunks, not graph symbols.
		const counts  = foldCounts(dimensions);
		const verdict = foldVerdict(counts, opts.capVerdictAtWarn === true);

		// 4. Build the record.
		const built = buildArtifact(subject, dimensions, verdict, counts, opts, startedAtMs);
		// The record stores the folder identity it is filed under, so its meta and
		// its md location agree (ISSUE-764b88ed).
		const pa = codeReviewSubjectPathArgs(subject);
		const artifact: CodeReviewArtifact = { ...built, body: { ...built.body, callEvents }, meta: { ...built.meta, ...folderIdentityMeta(pa) } };

		// 5. VALIDATE in memory — the last gate before the irreversible write.
		const invalid = validateArtifact(artifact, judges.map(j => j.dimension));
		if (invalid !== null) return fail(`invalid code-review record: ${invalid}`, emit);

		// 6. Finalize: write BOTH files (json load-bearing; md a deterministic
		//    summary). Validation has already passed, so a write here is never partial.
		opts.beforePersist?.(artifact);
		emit({ phase: 'finalize' });
		const paths = codeReviewArtifactPaths(subject.repoPath, subject.epicHash, subject.storyId, pa.epicCreatedAt, pa.workItemKind, pa.epicSlug);
		if (deps.through !== undefined) {
			await storeRound(deps.through, codeReviewArtifactId(subject.epicHash, subject.storyId), paths.json, artifact.body,
				{ result: verdict, summary: `Code review ${verdict}: ${counts.high} HIGH, ${counts.med} MED, ${counts.low} LOW` });
		}
		deps.write(paths.json, JSON.stringify(deps.through !== undefined ? withStoredModel(paths.json, artifact) : artifact, null, 2) + '\n');
		deps.write(paths.md,   renderCodeReviewMd(artifact));
		log.info({ runId: opts.runId, storyId: subject.storyId, verdict, counts }, 'code-review record written');
		emit({ phase: 'done' });
		return { ok: true, artifact };
	} catch (err) {
		if (err instanceof ReviewBudgetError) throw err;
		const msg = err instanceof Error ? err.message : String(err);
		log.warn({ runId: opts.runId, storyId: subject.storyId, errorCode: safeReviewFailure(err) }, 'code review failed; no record written');
		emit({ phase: 'error', detail: msg });
		return { ok: false, error: msg };
	}
}

// ---------------------------------------------------------------------------
// Fold + build + validate + render
// ---------------------------------------------------------------------------

/** Assemble the sc4 record. `meta` mirrors ArtifactMetaBase (so the storage +
 *  approval machinery is reused); `model` records the resolved high-tier label. */
function buildArtifact(
	subject:    CodeReviewSubject,
	dimensions: readonly DimensionResult[],
	verdict:    ReviewVerdict,
	counts:     { readonly high: number; readonly med: number; readonly low: number },
	opts:       RunCodeReviewOpts,
	startedAtMs: number,
): CodeReviewArtifact {
	const meta: CodeReviewMeta = {
		workflow:      'code-review',
		runId:         opts.runId,
		repoPath:      subject.repoPath,
		createdAt:     new Date(startedAtMs).toISOString(),
		model:         opts.modelLabel,
		elapsedMs:     Date.now() - startedAtMs,
		repoIndexedAt: null,
		schemaVersion: CODE_REVIEW_SCHEMA_VERSION,
		epicHash:      subject.epicHash,
		storyId:       subject.storyId,
		...(opts.reviewedBy !== undefined ? { reviewedBy: opts.reviewedBy } : {}),
	};
	const body: CodeReviewBody = {
		kind:          'code-review',
		epicHash:      subject.epicHash,
		storyId:       subject.storyId,
		// s9: the graph-grounded path stamps 'full' (the default). s10's diff-only
		// fallback passes opts.groundingMode:'degraded' to stamp its own path.
		groundingMode: opts.groundingMode ?? 'full',
		...(opts.fallbackReason !== undefined ? { fallbackReason: opts.fallbackReason } : {}),
		subject:       {
			changedFiles: subject.changedFiles,
			...(subject.buildRecord !== null ? { buildFingerprint: reviewedBuildFingerprint(subject.buildRecord) } : {}),
			...(subject.changeSetAttribution !== undefined ? { changeSetAttribution: subject.changeSetAttribution } : {}),
			...(subject.sharedWithExcluded !== undefined ? { sharedWithExcluded: subject.sharedWithExcluded } : {}),
			...(subject.excludedFromScope !== undefined && subject.excludedFromScope.length > 0 ? { excludedFromScope: subject.excludedFromScope } : {}),
		},
		dimensions,
		verdict,
		counts,
	};
	return { meta, body };
}

/** Emit an error frame and return the {ok:false} outcome — no write happens. */
function fail(error: string, emit: (f: CodeReviewProgress) => void): CodeReviewOutcome {
	emit({ phase: 'error', detail: error });
	return { ok: false, error };
}

