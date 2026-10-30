/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon-side code-review entrypoint (code-review S006/sc5) — the thin
 * `codeReview.run` StreamHandler, a peer of workflow-rpc's `runStart`. It:
 *   - resolves the high-tier provider via `buildShaperProvider` (k10 — review
 *     runs no lower than the high tier);
 *   - resolves the fixed sc1 subject via `resolveCodeReviewSubject`, and
 *     DECLINES (an `error` frame, no run) when it returns `{ ok:false, reason }`
 *     — a review without an approved contract / build has nothing to judge;
 *   - drives `runCodeReview`, streaming each CodeReviewProgress frame as a
 *     `progress` message, and sends the terminal outcome on `done` / `error`.
 *
 * Wiring only — all the load-bearing logic (serial judge loop, verdict fold,
 * validate-then-write, no-pass-on-failure) lives in `runCodeReview`.
 */

import { withReviewExecutionCeiling } from '../shared/review-execution-time.js';
import { getLogger } from '../shared/logger.js';
import type { IpcStreamMessage, LLMProvider } from '../shared/types.js';
import { SamePartyReviewError } from '../workflow/review/party.js';
import { buildAuthorParty } from '../workflow/code-review/author.js';
import type { CodeReviewFallbackReason } from '../workflow/code-review/types.js';
import { assembleDiffCodeReviewGrounding, DiffUnavailableError } from '../workflow/code-review/grounding.js';
import { roundWriterFor } from './lifecycle-registry.js';
import type { RoundWriter } from '../workflow/runners/build/round-writer.js';
import type { CodeReviewProgress, runCodeReview as RunCodeReview } from '../workflow/code-review/runner.js';
import { LEDGER_EXCLUDE_GLOBS } from '../workflow/runners/build/changed-files.js';
import { resolveStoryRangeBase } from '../workflow/runners/build/range-base.js';
import type { resolveCodeReviewSubject } from '../workflow/code-review/subject.js';
import { buildShaperProvider, shaperModelLabel } from '../analyze/context/shaper-provider.js';
import { repoSchemaRefusal } from './repo-schema-guard.js';
import { familyForClient } from './model-registry.js';
import {
	loadAnalyzeConfig,
	type AnalyzeConfig,
	type AnalyzeShaperProviderKind,
} from '../config/analyze.js';

const log = getLogger('daemon:code-review-rpc');

type CodeReviewSubjectResolution = Awaited<ReturnType<typeof resolveCodeReviewSubject>>;

/** CLI-provider subprocess timeout for a code-review run — a full four-judge
 *  pass over a large changed set can run several minutes; the CLI default
 *  (120 s) SIGKILLs it. Ollama ignores this. Matches workflow-rpc's generosity. */
const CODE_REVIEW_CLI_TIMEOUT_MS = 2_700_000;

interface CodeReviewRunParams {
	readonly repo?:     string | undefined;
	readonly epicHash:  string;
	readonly storyId:   string;
	/** Invoking MCP agent, so a config with no explicit shaperProvider falls
	 *  back to that CLI (claude/codex) instead of Ollama. */
	readonly client?:   'claude' | 'codex' | undefined;
	/** How to ground the review. `degraded` grounds on the diff, stamps the
	 *  record `degraded` and caps the verdict at warn; omitted or `full` grounds
	 *  on the graph, as this request always has. */
	readonly groundingMode?: 'full' | 'degraded' | undefined;
	/** Why the caller fell back to a degraded review (ISSUE-1102dc71); stamped on
	 *  the record. Accepted only with groundingMode 'degraded'. */
	readonly fallbackReason?: CodeReviewFallbackReason | undefined;
}

/** The collaborators of {@link codeReviewRunStart}. Every one defaults to the
 *  real thing; a test replaces the ones it needs to. */
export interface CodeReviewRunDeps {
	readonly resolveSubject?: ((repoPath: string, epicHash: string, storyId: string) => Promise<CodeReviewSubjectResolution>) | undefined;
	/** The provider and its label for this review. */
	readonly resolveProvider?: ((repoPath: string, client: 'claude' | 'codex' | undefined) => { provider: LLMProvider; modelLabel: string }) | undefined;
	readonly runReview?: typeof RunCodeReview | undefined;
	readonly assembleDiffGrounding?: typeof assembleDiffCodeReviewGrounding | undefined;
	/** Where the record is written (the runner's `write`). */
	readonly write?: ((absPath: string, content: string) => void) | undefined;
	/** The repository's round writer: the record is stored through the lifecycle service first. The daemon's registry by default. */
	readonly roundWriterFor?: ((repoPath: string) => RoundWriter) | undefined;
}

/** `codeReview.run` stream handler. Emits `progress` frames per phase, then a
 *  terminal `done` (with the outcome) or `error`. Never throws — a bad payload,
 *  a declined subject, or a run failure is sent as an `error` / declined frame. */
async function codeReviewRunStartInner(
	rawParams: unknown,
	send:      (msg: IpcStreamMessage) => void,
	signal:    AbortSignal,
	deps:      CodeReviewRunDeps = {},
): Promise<void> {
	// 1. Parse the request.
	let params: CodeReviewRunParams;
	try {
		params = parseParams(rawParams);
	} catch (err) {
		send({ id: 0, stream: 'error', data: { error: (err as Error).message, recoverable: false } });
		return;
	}
	const repoPath = params.repo !== undefined && params.repo.length > 0 ? params.repo : process.env['INSRC_REPO'];
	if (repoPath === undefined || repoPath.length === 0) {
		send({ id: 0, stream: 'error', data: { error: 'codeReview.run: no repo (pass `repo` or set INSRC_REPO)', recoverable: false } });
		return;
	}
	const refusal = repoSchemaRefusal(repoPath);
	if (refusal !== undefined) {
		send({ id: 0, stream: 'error', data: { error: refusal, reason: 'repo-schema-unconverted', recoverable: false } });
		return;
	}

	try {
		// 2. Resolve the fixed subject. A DECLINE (no approved contract / build) is
		//    NOT a verdict — the handler sends an error frame and never runs.
		const resolveSubject = deps.resolveSubject ?? (await import('../workflow/code-review/subject.js')).resolveCodeReviewSubject;
		const resolved = await resolveSubject(repoPath, params.epicHash, params.storyId);
		if (!resolved.ok) {
			log.info({ repoPath, epicHash: params.epicHash, storyId: params.storyId, reason: resolved.reason }, 'codeReview.run declined');
			send({ id: 0, stream: 'error', data: { error: `codeReview.run declined: ${resolved.reason}`, reason: resolved.reason, recoverable: false } });
			return;
		}

		// 3. This is the daemon's review, so it does not review code the daemon
		//    wrote. Checked before a provider is built: no review is spent.
		if (buildAuthorParty(repoPath, params.epicHash, params.storyId) === 'daemon') {
			const refusal = new SamePartyReviewError('daemon', `the code of Story ${params.storyId}`);
			log.info({ repoPath, epicHash: params.epicHash, storyId: params.storyId }, 'codeReview.run refused: same-party review');
			send({ id: 0, stream: 'error', data: { error: refusal.message, reason: 'same-party-review', recoverable: false } });
			return;
		}

		// 4. Resolve the high-tier provider (k10) — per-repo override > global
		//    config > invoking CLI > Ollama, mirroring workflow-rpc's resolution.
		const { provider, modelLabel } = (deps.resolveProvider ?? defaultProvider)(repoPath, params.client);
		const runId      = `cr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

		// 5. Drive the runner, streaming each progress frame.
		const runner = await import('../workflow/code-review/runner.js');
		const runCodeReview = deps.runReview ?? runner.runCodeReview;
		const through = (deps.roundWriterFor ?? roundWriterFor)(repoPath);
		let stageIndex = 0;
		const base = {
			runId, modelLabel, signal,
			// This request is the daemon's review.
			reviewedBy: 'daemon' as const,
			onProgress: (f: CodeReviewProgress) => send({
				id: 0, stream: 'progress',
				data: { kind: 'stage', operation: 'codeReview.run', stageId: f.phase, stageLabel: [f.phase, f.dimension, f.detail].filter(Boolean).join(' · '), index: stageIndex++, total: null, ...(f.callEvent ? { callEvent: f.callEvent } : {}) },
			}),
		};
		let outcome: Awaited<ReturnType<typeof RunCodeReview>>;
		if (params.groundingMode === 'degraded') {
			// The caller could not get graph grounding for this Story (a stale index,
			// or no symbols). Ground on the diff instead, exactly as the controller's
			// diff-only path does: the same range base and ledger exclusion, the
			// subject re-keyed to the diff's changed set, the record stamped
			// `degraded`, and the verdict capped at warn.
			let diff: Awaited<ReturnType<typeof assembleDiffCodeReviewGrounding>>;
			try {
				diff = await (deps.assembleDiffGrounding ?? assembleDiffCodeReviewGrounding)(repoPath, undefined, {
					base:         resolveStoryRangeBase(repoPath, params.epicHash, params.storyId),
					excludeGlobs: LEDGER_EXCLUDE_GLOBS,
					storyKey:     `${params.epicHash}/${params.storyId}`,
				});
			} catch (err) {
				if (!(err instanceof DiffUnavailableError)) throw err;
				send({ id: 0, stream: 'error', data: { error: `codeReview.run: could not read the changed-file diff — ${err.message}`, reason: 'diff-unavailable', recoverable: false } });
				return;
			}
			// An empty Story scope has nothing to review: decline as the subject does,
			// before any judge runs or any record is written (ISSUE-b97752e9).
			if (diff.changedFiles.length === 0) {
				log.info({ repoPath, epicHash: params.epicHash, storyId: params.storyId }, 'codeReview.run declined: the diff-only scope is empty');
				send({ id: 0, stream: 'error', data: { error: 'codeReview.run declined: no-build-record', reason: 'no-build-record', recoverable: false } });
				return;
			}
			outcome = await runCodeReview(
				{ ...resolved.subject, changedFiles: diff.changedFiles, changeSetAttribution: diff.changeSetAttribution, sharedWithExcluded: diff.sharedWithExcluded, excludedFromScope: diff.excludedFromScope }, provider,
				{ ...base, groundingMode: 'degraded', capVerdictAtWarn: true, ...(params.fallbackReason !== undefined ? { fallbackReason: params.fallbackReason } : {}) },
				{ ...runner.DEFAULT_DEPS, ...(deps.write !== undefined ? { write: deps.write } : {}), through, assembleGrounding: async () => diff.grounding },
			);
		} else if (deps.write !== undefined) {
			outcome = await runCodeReview(resolved.subject, provider, base, { ...runner.DEFAULT_DEPS, write: deps.write, through });
		} else {
			outcome = await runCodeReview(resolved.subject, provider, base, { ...runner.DEFAULT_DEPS, through });
		}

		// 6. Terminal frame. A runner {ok:false} is an error frame; {ok:true}
		//    carries the outcome + artifact on `done`.
		if (!outcome.ok) {
			send({ id: 0, stream: 'error', data: { error: outcome.error, recoverable: false } });
			return;
		}
		send({ id: 0, stream: 'done', data: { runId, artifact: outcome.artifact } });
	} catch (err) {
		send({ id: 0, stream: 'error', data: { error: (err as Error).message, recoverable: false } });
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultProvider(_repoPath: string, client: 'claude' | 'codex' | undefined): { provider: LLMProvider; modelLabel: string } {
	const cfg = loadAnalyzeConfig();
	const clientDefault: AnalyzeShaperProviderKind | undefined = familyForClient(client);
	return {
		provider:   buildShaperProvider(cfg, { clientDefault, cliTimeoutMs: CODE_REVIEW_CLI_TIMEOUT_MS }),
		modelLabel: modelLabelFor(cfg, clientDefault),
	};
}

function parseParams(raw: unknown): CodeReviewRunParams {
	if (typeof raw !== 'object' || raw === null) throw new Error('codeReview.run: params must be an object');
	const o = raw as Record<string, unknown>;
	const epicHash = o['epicHash'];
	if (typeof epicHash !== 'string' || epicHash.length === 0) throw new Error('codeReview.run: `epicHash` is required');
	const storyId = o['storyId'];
	if (typeof storyId !== 'string' || storyId.length === 0) throw new Error('codeReview.run: `storyId` is required');
	const client = o['client'];
	// A mode this daemon does not know is refused, never read as `full`: the
	// caller asked for a specific grounding and must not get another one silently.
	const mode = o['groundingMode'];
	if (mode !== undefined && mode !== 'full' && mode !== 'degraded') {
		throw new Error(`codeReview.run: \`groundingMode\` must be 'full' or 'degraded', got ${JSON.stringify(mode)}`);
	}
	const fallbackReason = o['fallbackReason'] === undefined ? undefined : parseFallbackReason(o['fallbackReason']);
	if (fallbackReason !== undefined && mode !== 'degraded') {
		throw new Error('codeReview.run: `fallbackReason` is only accepted with groundingMode \'degraded\'');
	}
	return {
		epicHash,
		storyId,
		...(typeof o['repo'] === 'string' ? { repo: o['repo'] } : {}),
		...(client === 'claude' || client === 'codex' ? { client } : {}),
		...(mode === 'full' || mode === 'degraded' ? { groundingMode: mode } : {}),
		...(fallbackReason !== undefined ? { fallbackReason } : {}),
	};
}

/** A caller's fallback reason, checked field by field; a malformed one is
 *  refused rather than stamped on the record (ISSUE-1102dc71). */
function parseFallbackReason(raw: unknown): CodeReviewFallbackReason {
	const bad = (): never => { throw new Error(`codeReview.run: \`fallbackReason\` is malformed: ${JSON.stringify(raw)}`); };
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return bad();
	const r = raw as Record<string, unknown>;
	switch (r['kind']) {
		case 'declined':
		case 'hollow-grounding':
			return Object.keys(r).length === 1 ? { kind: r['kind'] } : bad();
		case 'freshness-timeout': {
			const { waitedMs, inFlight, pendingCodeIndexJobs, staleFiles } = r;
			const ok = Object.keys(r).length === 5
				&& typeof waitedMs === 'number' && Number.isFinite(waitedMs) && waitedMs >= 0
				&& typeof inFlight === 'boolean'
				&& typeof pendingCodeIndexJobs === 'number' && Number.isInteger(pendingCodeIndexJobs) && pendingCodeIndexJobs >= 0
				&& Array.isArray(staleFiles) && staleFiles.every(f => typeof f === 'string');
			return ok ? { kind: 'freshness-timeout', waitedMs, inFlight, pendingCodeIndexJobs, staleFiles: [...staleFiles] } : bad();
		}
		default:
			return bad();
	}
}

/** The `meta.model` label matching what `buildShaperProvider` resolves — the
 *  chosen provider along the chain: explicit config > invoking CLI > Ollama. Mirrors workflow-rpc's `modelLabelFor`. */
function modelLabelFor(
	cfg:           AnalyzeConfig,
	clientDefault: AnalyzeShaperProviderKind | undefined,
): string {
	return shaperModelLabel(cfg, clientDefault !== undefined ? { clientDefault } : undefined);
}

export { buildAuthorParty };

export async function codeReviewRunStart(rawParams: unknown, send: (msg: IpcStreamMessage) => void, signal: AbortSignal, deps: CodeReviewRunDeps = {}): Promise<void> {
	try { await withReviewExecutionCeiling(rawParams, () => codeReviewRunStartInner(rawParams, send, signal, deps)); }
	catch (err) { send({ id: 0, stream: 'error', data: { error: err instanceof Error ? err.message : 'review execution failed', recoverable: false } }); }
}
