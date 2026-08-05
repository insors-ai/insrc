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
import type { ReviewVerdict } from '../review/types.js';
import {
	artifactIdMarker,
	codeReviewArtifactId,
	codeReviewArtifactPaths,
	writeAtomic,
} from '../storage.js';
import type {
	CodeReviewArtifact,
	CodeReviewBody,
	CodeReviewGrounding,
	CodeReviewMeta,
	CodeReviewOutcome,
	CodeReviewSubject,
	DimensionResult,
	ReviewDimension,
} from './types.js';
import { CODE_REVIEW_SCHEMA_VERSION } from './types.js';
import { assembleCodeReviewGrounding, realGroundingDeps } from './grounding.js';
import { judgeAdherence } from './dimensions/adherence.js';
import { judgeConventions } from './dimensions/conventions.js';
import { judgeCoverage } from './dimensions/coverage.js';
import { judgeQuality } from './dimensions/quality.js';

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
}

/** Run options — mirrors workflow-rpc's run opts. `modelLabel` is the resolved
 *  high-tier label stamped on meta; `onProgress` emits CodeReviewProgress frames. */
export interface RunCodeReviewOpts {
	readonly runId:       string;
	readonly modelLabel:  string;
	readonly signal?:     AbortSignal | undefined;
	readonly onProgress?: ((f: CodeReviewProgress) => void) | undefined;
	/** How this run was grounded — stamped verbatim onto `body.groundingMode`.
	 *  Defaults to `'full'` (the graph-grounded path). The s10 diff-only fallback
	 *  passes `'degraded'`. */
	readonly groundingMode?: 'full' | 'degraded' | undefined;
	/** When true, a folded `'pass'` is promoted to `'warn'` (block + warn are
	 *  NEVER lowered). Defaults to false. The s10 diff-only path sets it so a
	 *  degraded review can never register a `pass` — it reasons over diff hunks
	 *  rather than graph symbols, so a clean fold is not trustworthy as a pass. */
	readonly capVerdictAtWarn?: boolean | undefined;
}

/** Incremental progress frame streamed through `onProgress`. */
export interface CodeReviewProgress {
	readonly phase:      'grounding' | 'dimension-start' | 'dimension-done' | 'finalize' | 'done' | 'error';
	readonly dimension?: ReviewDimension | undefined;
	readonly detail?:    string | undefined;
}

/** The four shipped judges, in fixed evaluation order. */
const DEFAULT_JUDGES: readonly JudgeSlot[] = [
	{ dimension: 'adherence',   judge: judgeAdherence },
	{ dimension: 'conventions', judge: judgeConventions },
	{ dimension: 'coverage',    judge: judgeCoverage },
	{ dimension: 'quality',     judge: judgeQuality },
];

/** The real dependency wiring: the four shipped judges + S001's assembler
 *  (backed by the LMDB graph) + writeAtomic. */
export const DEFAULT_DEPS: CodeReviewRunnerDeps = {
	judges: DEFAULT_JUDGES,
	assembleGrounding: async (repoPath, changedFiles) =>
		assembleCodeReviewGrounding(repoPath, changedFiles, await realGroundingDeps()),
	write: writeAtomic,
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
	const emit = (f: CodeReviewProgress): void => opts.onProgress?.(f);

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
		const dimensions: DimensionResult[] = [];
		for (const slot of deps.judges) {
			if (opts.signal?.aborted) return fail('aborted', emit);
			emit({ phase: 'dimension-start', dimension: slot.dimension });
			const result = await slot.judge(subject, grounding, provider);
			dimensions.push(result);
			emit({ phase: 'dimension-done', dimension: slot.dimension });
		}

		// 3. Fold the verdict from the aggregated severities. On the degraded
		//    (diff-only) path the fold is warn-capped: a clean fold can never be a
		//    pass, because the judges reasoned over diff hunks, not graph symbols.
		const counts  = foldCounts(dimensions);
		const verdict = foldVerdict(counts, opts.capVerdictAtWarn === true);

		// 4. Build the record.
		const artifact = buildArtifact(subject, dimensions, verdict, counts, opts, startedAtMs);

		// 5. VALIDATE in memory — the last gate before the irreversible write.
		const invalid = validateArtifact(artifact, deps.judges.map(j => j.dimension));
		if (invalid !== null) return fail(`invalid code-review record: ${invalid}`, emit);

		// 6. Finalize: write BOTH files (json load-bearing; md a deterministic
		//    summary). Validation has already passed, so a write here is never partial.
		emit({ phase: 'finalize' });
		const paths = codeReviewArtifactPaths(subject.repoPath, subject.epicHash, subject.storyId);
		deps.write(paths.json, JSON.stringify(artifact, null, 2) + '\n');
		deps.write(paths.md,   renderCodeReviewMd(artifact));
		log.info({ runId: opts.runId, storyId: subject.storyId, verdict, counts }, 'code-review record written');
		emit({ phase: 'done' });
		return { ok: true, artifact };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log.warn({ runId: opts.runId, storyId: subject.storyId, err: msg }, 'code review failed; no record written');
		emit({ phase: 'error', detail: msg });
		return { ok: false, error: msg };
	}
}

// ---------------------------------------------------------------------------
// Fold + build + validate + render
// ---------------------------------------------------------------------------

/** Count the finding severities across every dimension. */
function foldCounts(dimensions: readonly DimensionResult[]): { readonly high: number; readonly med: number; readonly low: number } {
	let high = 0, med = 0, low = 0;
	for (const dim of dimensions) {
		for (const f of dim.findings) {
			if (f.severity === 'HIGH') high += 1;
			else if (f.severity === 'MED') med += 1;
			else if (f.severity === 'LOW') low += 1;
		}
	}
	return { high, med, low };
}

/** The verdict fold — mirrors the artifact-review vocabulary VERBATIM: any HIGH
 *  → block, else any MED → warn, else pass (LOW neither warns nor blocks). When
 *  `capAtWarn` is set a would-be `'pass'` is promoted to `'warn'` — the cap NEVER
 *  lowers a `block`/`warn` (it only raises the floor for a clean fold). */
function foldVerdict(
	counts: { readonly high: number; readonly med: number; readonly low: number },
	capAtWarn = false,
): ReviewVerdict {
	const verdict: ReviewVerdict = counts.high > 0 ? 'block' : counts.med > 0 ? 'warn' : 'pass';
	return capAtWarn && verdict === 'pass' ? 'warn' : verdict;
}

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
	};
	const body: CodeReviewBody = {
		kind:          'code-review',
		epicHash:      subject.epicHash,
		storyId:       subject.storyId,
		// s9: the graph-grounded path stamps 'full' (the default). s10's diff-only
		// fallback passes opts.groundingMode:'degraded' to stamp its own path.
		groundingMode: opts.groundingMode ?? 'full',
		subject:       { changedFiles: subject.changedFiles },
		dimensions,
		verdict,
		counts,
	};
	return { meta, body };
}

/** In-memory validation of the assembled record — the last gate before the
 *  write. Returns a reason string on failure, or null when the record is sound:
 *  a known kind, the expected dimensions in order, a verdict in the ReviewVerdict
 *  union, and counts consistent with a re-fold of the findings. */
function validateArtifact(a: CodeReviewArtifact, expectedDims: readonly ReviewDimension[]): string | null {
	const b = a.body;
	if (b.kind !== 'code-review') return `body.kind is '${String(b.kind)}'`;
	if (b.dimensions.length !== expectedDims.length) {
		return `expected ${expectedDims.length} dimensions, got ${b.dimensions.length}`;
	}
	for (let i = 0; i < expectedDims.length; i += 1) {
		if (b.dimensions[i]?.dimension !== expectedDims[i]) {
			return `dimension[${i}] is '${String(b.dimensions[i]?.dimension)}', expected '${String(expectedDims[i])}'`;
		}
	}
	if (b.verdict !== 'pass' && b.verdict !== 'warn' && b.verdict !== 'block') {
		return `verdict '${String(b.verdict)}' is not in the ReviewVerdict union`;
	}
	const refold = foldCounts(b.dimensions);
	if (refold.high !== b.counts.high || refold.med !== b.counts.med || refold.low !== b.counts.low) {
		return `counts {${b.counts.high},${b.counts.med},${b.counts.low}} disagree with the folded severities {${refold.high},${refold.med},${refold.low}}`;
	}
	// A degraded record is warn-capped: its verdict must never be a bare 'pass'.
	// Re-fold with the same cap so the check is consistent with what was built.
	const expectedVerdict = foldVerdict(refold, b.groundingMode === 'degraded');
	if (b.verdict !== expectedVerdict) {
		return `verdict '${b.verdict}' disagrees with the counts (expected '${expectedVerdict}')`;
	}
	return null;
}

/** Emit an error frame and return the {ok:false} outcome — no write happens. */
function fail(error: string, emit: (f: CodeReviewProgress) => void): CodeReviewOutcome {
	emit({ phase: 'error', detail: error });
	return { ok: false, error };
}

/** A minimal, deterministic markdown summary of the record — carries the
 *  `insrc:artifact` marker (so the slug-named `.md` resolves back to its
 *  hash-named `.json`), the verdict + counts, and each dimension's findings.
 *  The `.json` is load-bearing; this `.md` is for humans. */
function renderCodeReviewMd(a: CodeReviewArtifact): string {
	const { body, meta } = a;
	const id   = codeReviewArtifactId(meta.epicHash, meta.storyId);
	const icon = body.verdict === 'block' ? '⛔' : body.verdict === 'warn' ? '⚠️' : '✅';
	const lines: string[] = [
		artifactIdMarker(id),
		'',
		`# Code review: ${meta.epicHash}:${meta.storyId}`,
		'',
		`${icon} **${body.verdict.toUpperCase()}** — HIGH ${body.counts.high} · MED ${body.counts.med} · LOW ${body.counts.low} · model \`${meta.model ?? 'unknown'}\``,
		'',
		`**Changed files:** ${body.subject.changedFiles.length}`,
		'',
	];
	for (const dim of body.dimensions) {
		lines.push(`## ${dim.dimension} — ${dim.findings.length} finding(s)`, '');
		if (dim.findings.length === 0) {
			lines.push('_No findings._', '');
			continue;
		}
		lines.push('| Severity | Location | Message |', '| --- | --- | --- |');
		for (const f of dim.findings) {
			lines.push(`| ${f.severity} | ${escapeCell(f.location)} | ${escapeCell(f.message)} |`);
		}
		lines.push('');
	}
	return lines.join('\n') + '\n';
}

/** Escape a markdown table cell (pipes + newlines) so a finding message can't
 *  break the table layout. */
function escapeCell(s: string): string {
	return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
