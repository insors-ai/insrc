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

import { getLogger } from '../shared/logger.js';
import type { IpcStreamMessage } from '../shared/types.js';
import { buildShaperProvider, resolveShaperKind } from '../analyze/context/shaper-provider.js';
import {
	loadAnalyzeConfig,
	resolveRepoShaperProvider,
	type AnalyzeConfig,
	type AnalyzeShaperProviderKind,
} from '../config/analyze.js';

const log = getLogger('daemon:code-review-rpc');

/** CLI-provider subprocess timeout for a code-review run — a full four-judge
 *  pass over a large changed set can run several minutes; the CLI default
 *  (120 s) SIGKILLs it. Ollama ignores this. Matches workflow-rpc's generosity. */
const CODE_REVIEW_CLI_TIMEOUT_MS = 900_000;

interface CodeReviewRunParams {
	readonly repo?:     string;
	readonly epicHash:  string;
	readonly storyId:   string;
	/** Invoking MCP agent, so a config with no explicit shaperProvider falls
	 *  back to that CLI (claude/codex) instead of Ollama. */
	readonly client?:   'claude' | 'codex';
}

/** `codeReview.run` stream handler. Emits `progress` frames per phase, then a
 *  terminal `done` (with the outcome) or `error`. Never throws — a bad payload,
 *  a declined subject, or a run failure is sent as an `error` / declined frame. */
export async function codeReviewRunStart(
	rawParams: unknown,
	send:      (msg: IpcStreamMessage) => void,
	signal:    AbortSignal,
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

	try {
		// 2. Resolve the fixed subject. A DECLINE (no approved contract / build) is
		//    NOT a verdict — the handler sends an error frame and never runs.
		const { resolveCodeReviewSubject } = await import('../workflow/code-review/subject.js');
		const resolved = await resolveCodeReviewSubject(repoPath, params.epicHash, params.storyId);
		if (!resolved.ok) {
			log.info({ repoPath, epicHash: params.epicHash, storyId: params.storyId, reason: resolved.reason }, 'codeReview.run declined');
			send({ id: 0, stream: 'error', data: { error: `codeReview.run declined: ${resolved.reason}`, reason: resolved.reason, recoverable: false } });
			return;
		}

		// 3. Resolve the high-tier provider (k10) — per-repo override > global
		//    config > invoking CLI > Ollama, mirroring workflow-rpc's resolution.
		const cfg = loadAnalyzeConfig();
		const clientDefault: AnalyzeShaperProviderKind | undefined =
			params.client === 'claude' ? 'cli-claude' : params.client === 'codex' ? 'cli-codex' : undefined;
		const repoOverride = resolveRepoShaperProvider(repoPath);
		const provider   = buildShaperProvider(cfg, { repoOverride, clientDefault, cliTimeoutMs: CODE_REVIEW_CLI_TIMEOUT_MS });
		const modelLabel = modelLabelFor(cfg, repoOverride, clientDefault);
		const runId      = `cr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

		// 4. Drive the runner, streaming each progress frame.
		const { runCodeReview } = await import('../workflow/code-review/runner.js');
		let stageIndex = 0;
		const outcome = await runCodeReview(resolved.subject, provider, {
			runId, modelLabel, signal,
			onProgress: (f) => send({
				id: 0, stream: 'progress',
				data: { kind: 'stage', operation: 'codeReview.run', stageId: f.phase, stageLabel: [f.phase, f.dimension, f.detail].filter(Boolean).join(' · '), index: stageIndex++, total: null },
			}),
		});

		// 5. Terminal frame. A runner {ok:false} is an error frame; {ok:true}
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

function parseParams(raw: unknown): CodeReviewRunParams {
	if (typeof raw !== 'object' || raw === null) throw new Error('codeReview.run: params must be an object');
	const o = raw as Record<string, unknown>;
	const epicHash = o['epicHash'];
	if (typeof epicHash !== 'string' || epicHash.length === 0) throw new Error('codeReview.run: `epicHash` is required');
	const storyId = o['storyId'];
	if (typeof storyId !== 'string' || storyId.length === 0) throw new Error('codeReview.run: `storyId` is required');
	const client = o['client'];
	return {
		epicHash,
		storyId,
		...(typeof o['repo'] === 'string' ? { repo: o['repo'] } : {}),
		...(client === 'claude' || client === 'codex' ? { client } : {}),
	};
}

/** The `meta.model` label matching what `buildShaperProvider` resolves — the
 *  chosen provider along the chain: per-repo override > explicit config >
 *  invoking CLI > Ollama. Mirrors workflow-rpc's `modelLabelFor`. */
function modelLabelFor(
	cfg:           AnalyzeConfig,
	repoOverride:  AnalyzeShaperProviderKind | undefined,
	clientDefault: AnalyzeShaperProviderKind | undefined,
): string {
	const effective = resolveShaperKind({
		repoOverride,
		globalExplicit: cfg.shaperProviderExplicit ? cfg.shaperProvider : undefined,
		clientDefault,
	});
	if (effective === 'ollama') return `ollama:${cfg.shaperModel}`;
	const cli = effective === 'cli-claude' ? 'claude' : 'codex';
	return cfg.shaperModelExplicit && cfg.shaperModel.length > 0 ? `${cli}:${cfg.shaperModel}` : cli;
}
