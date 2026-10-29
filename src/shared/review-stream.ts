/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The failure type and parameter shapes of the daemon's two review requests,
 * `workflow.review` (a design artifact) and `codeReview.run` (a Story's code).
 * Shared by the socket client in src/mcp/daemon-stream.ts and by the daemon's
 * in-process client, so both report a failed review the same way (Epic
 * c2ba6fa6, Story s11).
 */

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { isReviewInputFingerprint, REVIEW_INPUT_SCHEMA_VERSION } from './review-input-identity.js';
import type { CodeReviewProgress } from '../workflow/code-review/runner.js';
import { CODE_REVIEW_SCHEMA_VERSION } from '../workflow/code-review/types.js';
import type { CodeReviewArtifact, CodeReviewFallbackReason, CodeReviewGrounding, ReviewTimingPlan } from '../workflow/code-review/types.js';
import type { StepClient } from './step-context.js';

/** Why a review request did not produce a review. */
export type ReviewStreamFailure =
	| 'unreachable'      // the daemon is not running
	| 'unknown-method'   // the daemon is older than this request
	| 'daemon-error'     // the daemon answered with an error (frame or plain line)
	| 'closed'           // the connection ended before a final frame
	| 'timeout'          // the wait limit passed
	| 'protocol'         // a line that is not valid for a stream request
	| 'aborted';

export class ReviewStreamError extends Error {
	constructor(
		readonly failure: ReviewStreamFailure,
		message: string,
		/** The `reason` the daemon attached to its error frame, when it gave one. */
		readonly reason?: string | undefined,
	) {
		super(message);
		this.name = 'ReviewStreamError';
	}
}

export interface ReviewStreamOpts {
	/** How long to wait for the final frame, frames or not. */
	readonly timeoutMs: number;
	/** How long to wait without any frame; every progress or delta frame restarts
	 *  it. Absent, not above 0 or not below timeoutMs: no idle limit. */
	readonly idleMs?:   number | undefined;
	readonly onFrame?:  ((stream: 'progress' | 'delta', data: unknown) => void) | undefined;
	readonly signal?:   AbortSignal | undefined;
}

export interface ReviewArtifactStreamParams {
	/** The artifact's `.md` path. */
	readonly artifactPath: string;
	readonly repo?:        string | undefined;
}

export interface CodeReviewStreamParams {
	readonly repo?:    string | undefined;
	readonly epicHash: string;
	readonly storyId:  string;
	readonly client?:  StepClient | undefined;
	/** How the daemon should ground the review. Omitted means `full`. */
	readonly groundingMode?: 'full' | 'degraded' | undefined;
	/** Why a degraded review fell back to the diff (ISSUE-1102dc71). */
	readonly fallbackReason?: CodeReviewFallbackReason | undefined;
}

export interface CodeReviewStreamResult {
	readonly runId:    string;
	readonly artifact: CodeReviewArtifact;
}

/** Operation requests are separate from legacy final-only streaming requests. */
export type CodeReviewControlParams =
 | (CodeReviewStreamParams & { readonly operation: 'start'; readonly reviewHandle?: never })
 | { readonly operation: 'status' | 'cancel'; readonly reviewHandle: string; readonly repo?: string | undefined; readonly epicHash: string; readonly storyId: string };
export type CodeReviewControlResult = { readonly daemonEpoch: string } & (
 | { readonly status: 'pending'; readonly reviewHandle: string; readonly progress: readonly CodeReviewProgress[]; readonly timing?: ReviewTimingPlan | undefined }
 | { readonly status: 'done'; readonly reviewHandle: string; readonly result: CodeReviewStreamResult }
 | { readonly status: 'failed'; readonly reviewHandle: string; readonly error: string; readonly reason: string }
 | { readonly status: 'cancelled'; readonly reviewHandle: string });

// ---------------------------------------------------------------------------
// The code-review grounding and freshness replies, shaped the same way by the
// socket client and by the daemon's in-process client: a decline, an error or
// an unreachable daemon is `{ ok: false, reason }`, never a throw.
// ---------------------------------------------------------------------------

export type CodeReviewGroundingResult = { ok: true; grounding: CodeReviewGrounding } | { ok: false; reason: string };
export type CodeReviewFreshnessResult =
	| { ok: true; isProcessing: boolean; inFlight: boolean; pendingCodeIndexJobs: number; staleFiles: readonly string[] }
	| { ok: false; reason: string };

/** The `codeReview.grounding` reply as a result. */
export function groundingFromReply(res: { ok?: boolean; grounding?: CodeReviewGrounding; reason?: string; error?: string }): CodeReviewGroundingResult {
	if (res.ok === true && res.grounding !== undefined) return { ok: true, grounding: res.grounding };
	return { ok: false, reason: res.reason ?? res.error ?? 'code-review grounding unavailable' };
}

/** The `codeReview.freshness` reply as a result. A reply from an older daemon
 *  (no inFlight / pendingCodeIndexJobs) reads as inFlight = isProcessing and 0. */
export function freshnessFromReply(res: { isProcessing?: boolean | undefined; inFlight?: boolean | undefined; pendingCodeIndexJobs?: number | undefined; staleFiles?: readonly string[] | undefined; error?: string | undefined }): CodeReviewFreshnessResult {
	if (res.error === undefined && typeof res.isProcessing === 'boolean') {
		return {
			ok: true,
			isProcessing: res.isProcessing,
			inFlight: typeof res.inFlight === 'boolean' ? res.inFlight : res.isProcessing,
			pendingCodeIndexJobs: typeof res.pendingCodeIndexJobs === 'number' ? res.pendingCodeIndexJobs : 0,
			staleFiles: res.staleFiles ?? [],
		};
	}
	return { ok: false, reason: res.error ?? 'code-review freshness unavailable' };
}

/** A rejected grounding or freshness request as a result. */
export function unavailableFromError(err: unknown): { ok: false; reason: string } {
	return { ok: false, reason: err instanceof Error ? err.message : String(err) };
}

// ---------------------------------------------------------------------------
// The review request itself, shared by the socket client (src/mcp/daemon-stream.ts)
// and the daemon's in-process client (src/daemon/steps/daemon-client.ts), so the
// two cannot drift apart. Each supplies only its transport: how the request is
// sent and how its frames come back. Everything else is here: the parameters
// of the two requests, the wait limit, an aborted signal, settling once, and
// what each frame means.
// ---------------------------------------------------------------------------

/** The parameters `workflow.review` is sent. */
export function reviewArtifactRequestParams(params: ReviewArtifactStreamParams): Record<string, unknown> {
	return {
		artifactPath: params.artifactPath,
		...(params.repo !== undefined ? { repo: params.repo } : {}),
	};
}

/** The parameters `codeReview.run` is sent. */
export function codeReviewRequestParams(params: CodeReviewStreamParams | CodeReviewControlParams): Record<string, unknown> {
 const control = params as CodeReviewStreamParams & { operation?: unknown; reviewHandle?: unknown };
 if (control.operation !== undefined) {
  if (typeof control.operation !== 'string' || !['start', 'status', 'cancel'].includes(control.operation)) throw new ReviewStreamError('protocol', 'Invalid code-review control operation');
  if (params.repo !== undefined && (typeof params.repo !== 'string' || params.repo.length === 0)) throw new ReviewStreamError('protocol', 'Control repository must be a nonempty path');
  if (control.client !== undefined && control.client !== 'claude' && control.client !== 'codex') throw new ReviewStreamError('protocol', 'Invalid invoking control client');
  if (control.groundingMode !== undefined && control.groundingMode !== 'full' && control.groundingMode !== 'degraded') throw new ReviewStreamError('protocol', 'Invalid control grounding mode');
  if (typeof params.epicHash !== 'string' || params.epicHash.length === 0 || typeof params.storyId !== 'string' || params.storyId.length === 0) throw new ReviewStreamError('protocol', 'Control requests require a target');
  if (control.operation === 'start' ? control.reviewHandle !== undefined : typeof control.reviewHandle !== 'string' || control.reviewHandle.length === 0) throw new ReviewStreamError('protocol', 'Invalid control review handle');
  if (control.operation !== 'start' && [control.client, control.groundingMode, control.fallbackReason].some(v => v !== undefined)) throw new ReviewStreamError('protocol', 'Status/cancel cannot change review inputs');
 } else if (control.reviewHandle !== undefined) throw new ReviewStreamError('protocol', 'Review handles require a control operation');
 return {
  ...(control.operation !== undefined ? { operation: control.operation } : {}),
  ...(control.reviewHandle !== undefined ? { reviewHandle: control.reviewHandle } : {}),
		epicHash: params.epicHash,
		storyId:  params.storyId,
		...(params.repo          !== undefined ? { repo:          params.repo }          : {}),
		...(control.client        !== undefined ? { client:        control.client }        : {}),
		...(control.groundingMode !== undefined ? { groundingMode: control.groundingMode } : {}),
		...(control.fallbackReason !== undefined ? { fallbackReason: control.fallbackReason } : {}),
	};
}

/** A wait limit in words, never more than the limit: whole minutes when it is
 *  a whole number of minutes, otherwise seconds. */
export function waitText(ms: number): string {
	if (ms >= 60_000 && ms % 60_000 === 0) {
		const min = ms / 60_000;
		return `${min} minute${min === 1 ? '' : 's'}`;
	}
	const sec = Math.max(1, Math.floor(ms / 1000));
	return `${sec} second${sec === 1 ? '' : 's'}`;
}

/** A stream frame as the daemon sends it. */
export interface ReviewStreamFrame {
	readonly stream: string;
	readonly data?:  unknown;
}

/** Where a transport reports what happened to the request. Calls after the
 *  request has settled are ignored. */
export interface ReviewStreamSink {
	/** A stream frame from the daemon. */
	frame(frame: ReviewStreamFrame): void;
	/** The transport ended the request without a final frame. */
	fail(failure: ReviewStreamFailure, message: string, reason?: string): void;
}

/** A started request: `end` after a final frame, `cancel` when it failed (the
 *  wait limit, an abort, a failure), which also ends the work on the far side. */
export interface ReviewStreamHandle {
	end(): void;
	cancel(): void;
}

/** How a client sends one stream request and hears its frames. */
export type ReviewStreamTransport = (sink: ReviewStreamSink) => ReviewStreamHandle;

/** The `reason` of a 'timeout' failure: which limit ran out. */
export const CEILING_TIMEOUT = 'ceiling';
export const IDLE_TIMEOUT = 'idle';

/** Test seam: the timer the wait limit uses. */
export interface ReviewStreamTimers {
	readonly setTimer?:   ((fn: () => void, ms: number) => unknown) | undefined;
	readonly clearTimer?: ((handle: unknown) => void) | undefined;
}

/**
 * Run one review stream request over `transport`, resolved by its 'done'
 * frame's data. The wait limit, or `idleMs` without a frame, fails it with
 * 'timeout' (the message says which) and an aborted signal
 * with 'aborted' (both also cancel the transport); an 'error' frame is
 * 'daemon-error' with the frame's reason; 'progress' and 'delta' frames go to
 * `opts.onFrame`; any other frame is ignored.
 */
export function runReviewStream<T>(
	method:    string,
	opts:      ReviewStreamOpts,
	transport: ReviewStreamTransport,
	timers:    ReviewStreamTimers = {},
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const setTimer   = timers.setTimer   ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
		const clearTimer = timers.clearTimer ?? ((h: unknown) => clearTimeout(h as NodeJS.Timeout));
		let settled = false;
		let timer: unknown;
		let idleTimer: unknown;
		let handle: ReviewStreamHandle | undefined;
		let pending: 'end' | 'cancel' | undefined;   // settled while the transport was still starting

		const release = (how: 'end' | 'cancel'): void => {
			if (handle === undefined) { pending = how; return; }
			if (how === 'end') handle.end(); else handle.cancel();
		};
		const finish = (how: 'end' | 'cancel', action: () => void): void => {
			if (settled) return;
			settled = true;
			if (timer !== undefined) clearTimer(timer);
			if (idleTimer !== undefined) clearTimer(idleTimer);
			opts.signal?.removeEventListener('abort', onAbort);
			release(how);
			action();
		};
		const failWith = (failure: ReviewStreamFailure, message: string, reason?: string): void =>
			finish('cancel', () => reject(new ReviewStreamError(failure, message, reason)));

		function onAbort(): void { failWith('aborted', `${method}: aborted by client`); }
		if (opts.signal?.aborted) { onAbort(); return; }
		opts.signal?.addEventListener('abort', onAbort);
		timer = setTimer(
			() => failWith('timeout', `${method}: no result from the daemon within ${waitText(opts.timeoutMs)}`, CEILING_TIMEOUT),
			opts.timeoutMs,
		);
		const idleMs = opts.idleMs !== undefined && opts.idleMs > 0 && opts.idleMs < opts.timeoutMs ? opts.idleMs : undefined;
		const armIdle = (): void => {
			if (idleMs === undefined) return;
			if (idleTimer !== undefined) clearTimer(idleTimer);
			idleTimer = setTimer(() => failWith('timeout', `${method}: no progress from the daemon for ${waitText(idleMs)}`, IDLE_TIMEOUT), idleMs);
		};
		armIdle();

		const sink: ReviewStreamSink = {
			frame: (f) => {
				if (settled) return;
				if (f.stream === 'progress' || f.stream === 'delta') {
					armIdle();
					opts.onFrame?.(f.stream, f.data);
				} else if (f.stream === 'done') {
					finish('end', () => resolve(f.data as T));
				} else if (f.stream === 'error') {
					const data = f.data as { error?: string; reason?: string } | undefined;
					finish('end', () => reject(new ReviewStreamError('daemon-error', data?.error ?? `${method}: daemon error`, data?.reason)));
				}
				// Any other kind: ignored (forward-compatible).
			},
			fail: (failure, message, reason) => { if (!settled) failWith(failure, message, reason); },
		};
		// A transport that throws while opening (a connection refused before any
		// event) settles here like any other failure, so the wait timer and the
		// abort listener are released rather than left armed.
		try {
			handle = transport(sink);
		} catch (err) {
			failWith('unreachable', `${method}: cannot reach the daemon (${err instanceof Error ? err.message : String(err)})`);
			return;
		}
		if (pending !== undefined) release(pending);
	});
}


const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const DIMENSIONS = ['adherence', 'conventions', 'coverage', 'quality', 'functional-coverage', 'diagram', 'ux'] as const;
const PHASES = ['grounding', 'timing', 'dimension-start', 'call', 'dimension-done', 'finalize', 'done', 'error'];
function protocol(message: string): never { throw new ReviewStreamError('protocol', `codeReview.run: ${message}`); }
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const sameStory = (a: unknown, b: unknown): boolean => typeof a === 'string' && typeof b === 'string' && /^s[0-9]+$/i.test(a) && /^s[0-9]+$/i.test(b) && BigInt(a.slice(1)) === BigInt(b.slice(1));
function timingResult(value: unknown): ReviewTimingPlan {
 if (!record(value) || !integer(value['startedAt']) || !integer(value['chunkCount']) || value['chunkCount'] < 1 || !integer(value['budgetMs']) || value['budgetMs'] !== value['chunkCount'] * 600_000 || !integer(value['deadlineAt']) || value['deadlineAt'] !== value['startedAt'] + value['budgetMs'] || !Array.isArray(value['dimensions'])) protocol('malformed timing plan');
 let chunks = 0; const seen = new Set<string>(), ids = new Set<string>();
 for (const entry of value['dimensions']) {
  if (!record(entry) || !nonempty(entry['dimension']) || !(DIMENSIONS as readonly string[]).includes(entry['dimension']) || seen.has(entry['dimension']) || !integer(entry['primaryChunkCount']) || !integer(entry['budgetMs']) || entry['budgetMs'] !== entry['primaryChunkCount'] * 600_000 || !Array.isArray(entry['primaryChunkIds']) || entry['primaryChunkIds'].length !== entry['primaryChunkCount']) protocol('malformed dimension timing');
  seen.add(entry['dimension']); chunks += entry['primaryChunkCount'];
  for (const id of entry['primaryChunkIds']) { if (!nonempty(id) || ids.has(id) || !id.startsWith(entry['dimension'] + ':')) protocol('malformed primary timing identity'); ids.add(id); }
 }
 if (Math.max(1, chunks) !== value['chunkCount']) protocol('timing count does not match its dimensions');
 return structuredClone(value) as unknown as ReviewTimingPlan;
}
/** Keep legacy calls final-only; operation data must never be cast as a final CR. */
export function legacyCodeReviewRequestParams(params: CodeReviewStreamParams): Record<string, unknown> {
 if ('operation' in params || 'reviewHandle' in params) protocol('use codeReviewControl for operation requests');
 return codeReviewRequestParams(params);
}
export function legacyCodeReviewResult(value: unknown): CodeReviewStreamResult {
 if (!record(value) || 'status' in value || !nonempty(value['runId']) || !record(value['artifact'])) protocol('legacy stream did not return a final review');
 return value as unknown as CodeReviewStreamResult;
}
export function codeReviewControlRequestParams(params: CodeReviewControlParams): Record<string, unknown> {
 if (!record(params) || typeof params['operation'] !== 'string') protocol('control requests require an operation');
 return codeReviewRequestParams(params);
}

/** Client waits end before the host ceiling; stopping the transport only detaches this waiter. */
export function codeReviewControlWaitOpts(opts: ReviewStreamOpts): ReviewStreamOpts {
 if (!Number.isSafeInteger(opts.timeoutMs) || opts.timeoutMs <= 0) protocol('invalid control wait limit');
 return { ...opts, timeoutMs: Math.min(opts.timeoutMs, 200_000) };
}
function sameRepository(actual: string, requested: string | undefined): boolean {
 if (requested === undefined || resolve(actual) === resolve(requested)) return true;
 try { return realpathSync(actual) === realpathSync(requested); } catch { return false; }
}
const optionalStrings = (value: Record<string, unknown>, keys: readonly string[]): boolean => keys.every(key => value[key] === undefined || typeof value[key] === 'string');
function findingValid(value: unknown, dimension: string): boolean {
 return record(value) && value['dimension'] === dimension && typeof value['severity'] === 'string' && ['HIGH', 'MED', 'LOW'].includes(value['severity']) && nonempty(value['location']) && nonempty(value['message'])
  && optionalStrings(value, ['expectationRef', 'counterpartRef', 'symbolId'])
  && (value['confidence'] === undefined || value['confidence'] === 'breach' || value['confidence'] === 'observation')
  && (value['findingKind'] === undefined || (typeof value['findingKind'] === 'string' && ['symbol-coverage', 'promised-test', 'other'].includes(value['findingKind'])));
}
function rangeValid(value: unknown): boolean {
 return record(value) && nonempty(value['atomId']) && nonempty(value['parentId']) && integer(value['startOffset']) && integer(value['endOffset']) && value['endOffset'] > value['startOffset'] && typeof value['parentDigest'] === 'string' && /^[a-f0-9]{64}$/.test(value['parentDigest']);
}
function dimensionExtrasValid(value: Record<string, unknown>, dimension: string): boolean {
 if (value['outOfScope'] !== undefined && (!Array.isArray(value['outOfScope']) || !value['outOfScope'].every(f => findingValid(f, dimension)))) return false;
 if (value['lowered'] !== undefined && (!Array.isArray(value['lowered']) || !value['lowered'].every(f => record(f) && nonempty(f['location']) && nonempty(f['reason']) && optionalStrings(f, ['symbolId', 'expectationRef'])))) return false;
 for (const [key, required] of [['parts', ['map', 'reduce', 'compare']], ['pipelineCalls', ['chunk', 'obligation', 'relation', 'merge']]] as const) {
  const count = value[key]; if (count !== undefined && (!record(count) || !required.every(k => integer(count[k])))) return false;
 }
 if (value['materialRevisions'] !== undefined) {
  if (!Array.isArray(value['materialRevisions'])) return false;
  for (const revision of value['materialRevisions']) {
   if (!record(revision) || !['fromReviewId', 'toReviewId', 'refusedCallId'].every(k => nonempty(revision[k])) || !['fromMaterialHash', 'toMaterialHash'].every(k => typeof revision[k] === 'string' && /^[a-f0-9]{64}$/.test(revision[k])) || !integer(revision['limitChars']) || revision['limitChars'] === 0 || !Array.isArray(revision['initialPrimary']) || !revision['initialPrimary'].every(p => record(p) && nonempty(p['id']) && Array.isArray(p['ranges']) && p['ranges'].every(rangeValid)) || !Array.isArray(revision['descendantRanges']) || !revision['descendantRanges'].every(rangeValid)) return false;
   const time = revision['timing']; if (!record(time) || !['primaryChunkCount', 'budgetMs', 'startedAt', 'deadlineAt', 'rootDeadlineAt'].every(k => integer(time[k])) || (time['budgetMs'] as number) !== (time['primaryChunkCount'] as number) * 600_000 || (time['deadlineAt'] as number) > (time['rootDeadlineAt'] as number) || (time['deadlineAt'] as number) < (time['startedAt'] as number)) return false;
  }
 }
 return true;
}
function fallbackReasonValid(value: unknown): boolean {
 if (value === undefined) return true;
 if (!record(value)) return false;
 if (value['kind'] === 'declined' || value['kind'] === 'hollow-grounding') return Object.keys(value).length === 1;
 return value['kind'] === 'freshness-timeout' && Object.keys(value).length === 5 && integer(value['waitedMs']) && typeof value['inFlight'] === 'boolean' && integer(value['pendingCodeIndexJobs']) && Array.isArray(value['staleFiles']) && value['staleFiles'].every(nonempty);
}
function finalControlResult(value: unknown, params: CodeReviewControlParams): CodeReviewStreamResult {
 const result = legacyCodeReviewResult(value), artifact = result.artifact;
 const meta = artifact.meta, body = artifact.body;
 if (!record(meta) || !record(body) || meta.workflow !== 'code-review' || meta.schemaVersion !== CODE_REVIEW_SCHEMA_VERSION || !nonempty(meta.createdAt) || !Number.isFinite(Date.parse(meta.createdAt)) || !integer(meta.elapsedMs) || (meta.repoIndexedAt !== null && !integer(meta.repoIndexedAt)) || meta.runId !== result.runId || meta.reviewedBy !== 'daemon' || body.kind !== 'code-review' || !['full', 'degraded'].includes(body.groundingMode) || meta.epicHash !== params.epicHash || !sameStory(meta.storyId, params.storyId) || body.epicHash !== meta.epicHash || body.storyId !== meta.storyId) protocol('malformed or foreign final review');
 if (!sameRepository(meta.repoPath, params.repo)) protocol('final repository differs from the requested review');
 if (params.operation === 'start' && body.groundingMode !== (params.groundingMode ?? 'full')) protocol('final grounding mode differs from the requested review');
 if (meta.reviewInputSchemaVersion !== REVIEW_INPUT_SCHEMA_VERSION || !isReviewInputFingerprint(meta.reviewInputFingerprint) || meta.reviewInputFingerprint.epicHash !== meta.epicHash || meta.reviewInputFingerprint.storyId !== meta.storyId || meta.reviewInputFingerprint.repoPath !== meta.repoPath || meta.reviewInputFingerprint.author === 'daemon') protocol('final review has invalid input identity or author');
 if (!record(body.subject) || !Array.isArray(body.subject.changedFiles) || !body.subject.changedFiles.every(nonempty) || new Set(body.subject.changedFiles).size !== body.subject.changedFiles.length) protocol('malformed final subject');
 if (!fallbackReasonValid(body.fallbackReason)) protocol('malformed final fallback reason');
 const counts = body.counts;
 if (!record(counts) || !integer(counts.high) || !integer(counts.med) || !integer(counts.low) || !Array.isArray(body.dimensions) || body.dimensions.length < 4) protocol('malformed final review counts/dimensions');
 for (const key of ['sharedWithExcluded', 'excludedFromScope']) { const paths = (body.subject as unknown as Record<string, unknown>)[key]; if (paths !== undefined && (!Array.isArray(paths) || !paths.every(nonempty))) protocol('malformed final subject paths'); }
 if (body.subject.changeSetAttribution !== undefined && !['working-tree', 'first-parent-range', 'story-trailer'].includes(body.subject.changeSetAttribution)) protocol('malformed attribution');
 const actual = { high: 0, med: 0, low: 0 }; let previous = -1;
 for (const dimension of body.dimensions) {
  if (!record(dimension) || typeof dimension.dimension !== 'string' || !Array.isArray(dimension.findings)) protocol('malformed final dimension');
  if (!dimensionExtrasValid(dimension, dimension.dimension)) protocol('malformed optional dimension fields');
  const at = (DIMENSIONS as readonly string[]).indexOf(dimension.dimension);
  if (at <= previous || at < 0 || (previous < 3 && at !== previous + 1)) protocol('missing, duplicate or unordered final dimension'); previous = at;
  for (const finding of dimension.findings) {
   if (!findingValid(finding, dimension.dimension)) protocol('malformed final finding');
   if (finding.severity === 'HIGH') actual.high++; else if (finding.severity === 'MED') actual.med++; else actual.low++;
  }
 }
 if (actual.high !== counts.high || actual.med !== counts.med || actual.low !== counts.low) protocol('final counts do not match findings');
 const verdict = actual.high > 0 ? 'block' : actual.med > 0 || body.groundingMode === 'degraded' ? 'warn' : 'pass';
 if (body.verdict !== verdict) protocol('final verdict does not match findings');
 return structuredClone(result);
}
/** Both transports discriminate before any caller can consume a final artifact. */
export function codeReviewControlResult(value: unknown, params: CodeReviewControlParams): CodeReviewControlResult {
 if (!record(value) || !nonempty(value['reviewHandle']) || !nonempty(value['daemonEpoch']) || 'artifact' in value) protocol('malformed control reply');
 if (params.operation !== 'start' && value['reviewHandle'] !== params.reviewHandle) protocol('reply names a different review handle');
 const base = { reviewHandle: value['reviewHandle'], daemonEpoch: value['daemonEpoch'] };
 switch (value['status']) {
  case 'pending': {
   if ('result' in value || !Array.isArray(value['progress'])) protocol('pending reply cannot carry a final artifact');
   const progress = value['progress'].map(frame => {
    if (!record(frame) || typeof frame['phase'] !== 'string' || !PHASES.includes(frame['phase']) || (frame['dimension'] !== undefined && !(DIMENSIONS as readonly unknown[]).includes(frame['dimension'])) || (frame['detail'] !== undefined && typeof frame['detail'] !== 'string')) protocol('malformed progress');
    return { phase: frame['phase'], ...(frame['dimension'] !== undefined ? { dimension: frame['dimension'] } : {}), ...(frame['detail'] !== undefined ? { detail: frame['detail'] } : {}) } as CodeReviewProgress;
   });
   return { ...base, status: 'pending', progress, ...(value['timing'] !== undefined ? { timing: timingResult(value['timing']) } : {}) };
  }
  case 'done': return { ...base, status: 'done', result: finalControlResult(value['result'], params) };
  case 'failed': if ('result' in value || !nonempty(value['error']) || !nonempty(value['reason'])) protocol('malformed failed reply'); return { ...base, status: 'failed', error: value['error'], reason: value['reason'] };
  case 'cancelled': if ('result' in value) protocol('cancelled reply cannot carry a final artifact'); return { ...base, status: 'cancelled' };
  default: return protocol('unknown control status');
 }
}
