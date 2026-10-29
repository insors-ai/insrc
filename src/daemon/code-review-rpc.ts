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

import { realpathSync } from 'node:fs';
import { CodeReviewOperationRegistry, codeReviewOperationIdleMs, codeReviewOperations, CODE_REVIEW_CONTROL_WAIT_MS, ReviewOperationError } from './code-review-operations.js';
import type { CodeReviewProgress as OperationProgress } from '../workflow/code-review/runner.js';
import { assertReviewFingerprintCurrent } from '../workflow/code-review/publication.js';
import { getLogger } from '../shared/logger.js';
import type { IpcStreamMessage, LLMProvider } from '../shared/types.js';
import type { StepClient } from '../shared/step-context.js';
import { SamePartyReviewError } from '../workflow/review/party.js';
import { buildAuthorParty } from '../workflow/code-review/author.js';
import { captureReviewInputFingerprint } from '../workflow/code-review/input-fingerprint.js';
import { claimReviewPublication, type ReviewPublicationGuard } from '../workflow/code-review/publication.js';
import type { CodeReviewSubject, ReviewInputFingerprint, CodeReviewFallbackReason } from '../workflow/code-review/types.js';
import { assembleDiffCodeReviewGrounding, DiffUnavailableError } from '../workflow/code-review/grounding.js';
import type { CodeReviewProgress, runCodeReview as RunCodeReview } from '../workflow/code-review/runner.js';
import { LEDGER_EXCLUDE_GLOBS } from '../workflow/runners/build/changed-files.js';
import { resolveStoryRangeBase } from '../workflow/runners/build/range-base.js';
import type { resolveCodeReviewSubject } from '../workflow/code-review/subject.js';
import { buildShaperProvider, shaperModelLabel } from '../analyze/context/shaper-provider.js';
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
 readonly operation?: 'start' | 'status' | 'cancel' | undefined;
 readonly reviewHandle?: string | undefined;
	readonly repo?:     string;
	readonly epicHash:  string;
	readonly storyId:   string;
	/** Invoking MCP agent, so a config with no explicit shaperProvider falls
	 *  back to that CLI (claude/codex/vibe) instead of Ollama. */
	readonly client?:   StepClient;
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
 readonly operations?: CodeReviewOperationRegistry | undefined;
 readonly controlWaitMs?: number | undefined;
 /** Supplied only by the owned-operation runner, never accepted from raw request JSON. */
 readonly startedAtMs?: number | undefined;
 /** Explicit legacy injected-test seam; shipped calls always use the enforcing capture default. */
 readonly captureInput?: ((subject: CodeReviewSubject) => ReviewInputFingerprint | undefined) | undefined;
	readonly resolveSubject?: ((repoPath: string, epicHash: string, storyId: string) => Promise<CodeReviewSubjectResolution>) | undefined;
	/** The provider and its label for this review. */
	readonly resolveProvider?: ((repoPath: string, client: StepClient | undefined) => { provider: LLMProvider; modelLabel: string }) | undefined;
	readonly runReview?: typeof RunCodeReview | undefined;
	readonly assembleDiffGrounding?: typeof assembleDiffCodeReviewGrounding | undefined;
	/** Where the record is written (the runner's `write`). */
	readonly write?: ((absPath: string, content: string) => void) | undefined;
}

/** `codeReview.run` stream handler. Emits `progress` frames per phase, then a
 *  terminal `done` (with the outcome) or `error`. Never throws — a bad payload,
 *  a declined subject, or a run failure is sent as an `error` / declined frame. */
export async function codeReviewRunStart(
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

 if (params.operation !== undefined) return codeReviewControlStart({ ...params, repo: repoPath }, send, signal, deps);
 let publication: ReviewPublicationGuard | undefined;
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

		const admittedAt = deps.startedAtMs ?? Date.now();
  const fingerprint = (deps.captureInput ?? captureReviewInputFingerprint)(resolved.subject);
  publication = fingerprint === undefined ? undefined : claimReviewPublication(fingerprint, 'daemon');

  // 4. Resolve the high-tier provider (k10) — per-repo override > global
		//    config > invoking CLI > Ollama, mirroring workflow-rpc's resolution.
		const { provider, modelLabel } = (deps.resolveProvider ?? defaultProvider)(repoPath, params.client);
		const runId      = `cr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

		// 5. Drive the runner, streaming each progress frame.
		const runner = await import('../workflow/code-review/runner.js');
		const runCodeReview = deps.runReview ?? runner.runCodeReview;
		let stageIndex = 0;
		const base = {
			runId, modelLabel, signal, startedAtMs: admittedAt,
   ...(publication !== undefined ? { publication, requirePublication: true } : {}),
			// This request is the daemon's review.
			reviewedBy: 'daemon' as const,
			onProgress: (f: CodeReviewProgress) => send({
				id: 0, stream: 'progress',
				data: { kind: 'stage', operation: 'codeReview.run', stageId: f.phase, stageLabel: [f.phase, f.dimension, f.detail].filter(Boolean).join(' · '), index: stageIndex++, total: null, reviewProgress: f },
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
				{ ...runner.DEFAULT_DEPS, ...(deps.write !== undefined ? { write: deps.write } : {}), assembleGrounding: async () => diff.grounding },
			);
		} else if (deps.write !== undefined) {
			outcome = await runCodeReview(resolved.subject, provider, base, { ...runner.DEFAULT_DEPS, write: deps.write });
		} else {
			outcome = await runCodeReview(resolved.subject, provider, base);
		}

		// 6. Terminal frame. A runner {ok:false} is an error frame; {ok:true}
		//    carries the outcome + artifact on `done`.
		if (!outcome.ok) {
			send({ id: 0, stream: 'error', data: { error: outcome.error, ...(outcome.code !== undefined ? { reason: outcome.code } : {}), recoverable: false } });
			return;
		}
  publication?.validate();
		send({ id: 0, stream: 'done', data: { runId, artifact: outcome.artifact } });
	} catch (err) {
		send({ id: 0, stream: 'error', data: { error: (err as Error).message, ...(err instanceof Error && 'code' in err && typeof err.code === 'string' ? { reason: err.code } : {}), recoverable: false } });
	} finally { publication?.release(); }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultProvider(_repoPath: string, client: StepClient | undefined): { provider: LLMProvider; modelLabel: string } {
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
 const operation = o['operation'], reviewHandle = o['reviewHandle'];
 if (operation !== undefined && operation !== 'start' && operation !== 'status' && operation !== 'cancel') throw new Error('codeReview.run: invalid operation');
 if ((operation === 'status' || operation === 'cancel') && (typeof reviewHandle !== 'string' || reviewHandle.length === 0)) throw new Error('codeReview.run: status/cancel requires reviewHandle');
 if (reviewHandle !== undefined && operation !== 'status' && operation !== 'cancel') throw new Error('codeReview.run: reviewHandle requires status/cancel');
	return {
  ...(operation !== undefined ? { operation } : {}),
  ...(typeof reviewHandle === 'string' ? { reviewHandle } : {}),
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


/** Operation-mode RPC: the request owns only this bounded waiter, never the review's signal. */
async function codeReviewControlStart(params: CodeReviewRunParams & { readonly repo: string }, send: (msg: IpcStreamMessage) => void, waiterSignal: AbortSignal, deps: CodeReviewRunDeps): Promise<void> {
 const requestStarted = Date.now(), registry = deps.operations ?? codeReviewOperations;
 try {
  const repo = realpathSync(params.repo), target = { repo, epicHash: params.epicHash, storyId: params.storyId };
  let handle = params.reviewHandle;
  if (params.operation === 'start') {
   const resolved = await boundedAdmission((deps.resolveSubject ?? (await import('../workflow/code-review/subject.js')).resolveCodeReviewSubject)(repo, params.epicHash, params.storyId), waiterSignal);
   if (!resolved.ok) throw new ReviewOperationError('no-build-record', `codeReview.run declined: ${resolved.reason}`);
   if (buildAuthorParty(repo, params.epicHash, params.storyId) === 'daemon') throw new SamePartyReviewError('daemon', `the code of Story ${params.storyId}`);
   const fingerprint = (deps.captureInput ?? captureReviewInputFingerprint)(resolved.subject);
   if (fingerprint === undefined) throw new ReviewOperationError('review-input-unavailable', 'Owned reviews require an admitted input fingerprint');
   if (waiterSignal.aborted) throw Object.assign(new Error('Review admission aborted'), { name: 'AbortError' });
   if (Date.now() - requestStarted >= CODE_REVIEW_CONTROL_WAIT_MS) throw new ReviewOperationError('review-admission-timeout', 'Review admission exceeded the bounded request wait; no review was started');
   handle = registry.start({ idleMs: codeReviewOperationIdleMs(), fingerprint, inputKey: JSON.stringify({ fingerprint: fingerprint.digest, mode: params.groundingMode ?? 'full', fallbackReason: params.fallbackReason ?? null }), startedAt: requestStarted,
    validateDone: () => assertReviewFingerprintCurrent(fingerprint, 'daemon'),
    execute: async (ownerSignal, progress) => {
     let terminal: IpcStreamMessage | undefined;
     await codeReviewRunStart({ repo, epicHash: params.epicHash, storyId: params.storyId,
      ...(params.client !== undefined ? { client: params.client } : {}), ...(params.groundingMode !== undefined ? { groundingMode: params.groundingMode } : {}), ...(params.fallbackReason !== undefined ? { fallbackReason: params.fallbackReason } : {}),
     }, frame => {
      if (frame.stream === 'progress') {
       const data = frame.data as { reviewProgress?: OperationProgress } | undefined;
       if (data?.reviewProgress !== undefined) progress(data.reviewProgress);
      } else if (frame.stream === 'done' || frame.stream === 'error') terminal = frame;
     }, ownerSignal, { ...deps, startedAtMs: requestStarted, captureInput: subject => {
      const current = captureReviewInputFingerprint(subject);
      if (current.digest !== fingerprint.digest) throw new ReviewOperationError('review-input-changed', 'Review inputs changed after admission; start a new review');
      return fingerprint;
     } });
     if (terminal?.stream !== 'done') {
      const error = terminal?.data as { error?: string; reason?: string } | undefined;
      throw new ReviewOperationError(error?.reason ?? 'review-failed', error?.error ?? 'Owned review ended without a result');
     }
     return terminal.data as import('../shared/review-stream.js').CodeReviewStreamResult;
    },
   });
  }
  if (handle === undefined) throw new ReviewOperationError('review-operation-lost', 'No owned review handle was supplied');
  const waitMs = Math.max(0, Math.min(deps.controlWaitMs ?? 180_000, 180_000 - (Date.now() - requestStarted)));
  const outcome = params.operation === 'cancel' ? await registry.cancel(handle, target, { signal: waiterSignal, waitMs }) : await registry.wait(handle, target, { signal: waiterSignal, waitMs });
  send({ id: 0, stream: 'done', data: outcome });
 } catch (err) {
  send({ id: 0, stream: 'error', data: { error: err instanceof Error ? err.message : String(err), ...(err instanceof Error && 'code' in err && typeof err.code === 'string' ? { reason: err.code } : {}), recoverable: false } });
 }
}
async function boundedAdmission<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
 if (signal.aborted) throw Object.assign(new Error('Review admission aborted'), { name: 'AbortError' });
 return await new Promise<T>((resolve, reject) => {
  let settled = false;
  const finish = (error: unknown, value?: T): void => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', aborted); if (error !== undefined) reject(error); else resolve(value as T); };
  const aborted = (): void => finish(Object.assign(new Error('Review admission aborted'), { name: 'AbortError' }));
  const timer = setTimeout(() => finish(new ReviewOperationError('review-admission-timeout', 'Review admission exceeded the bounded request wait')), CODE_REVIEW_CONTROL_WAIT_MS);
  signal.addEventListener('abort', aborted, { once: true });
  work.then(value => finish(undefined, value), err => finish(err));
 });
}
