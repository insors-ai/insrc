/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `workflow.review` StreamHandler: the daemon reviews an EXISTING design
 * artifact (a DEF, HLD or LLD) that it did not author.
 *
 * It is the daemon-side half of "the party that did not author the work
 * reviews it": `insrc_review_step` sends controller-authored work here. The
 * review itself is `reviewArtifactFile`, with the provider the role router
 * resolves for the `review` role, exactly as the TUI review service runs it.
 * An artifact the daemon authored is refused inside `reviewArtifactFile`, before
 * any model call; that refusal reaches the caller as this handler's error frame.
 *
 * Frames: `progress` per review phase, then one terminal `done` or `error`.
 * Never throws.
 */

import { existsSync } from 'node:fs';

import { createRoleRouter } from '../analyze/context/role-router.js';
import { runWithRoutingContext } from '../analyze/context/shaper-provider.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import { getLogger } from '../shared/logger.js';
import type { IpcStreamMessage, LLMProvider } from '../shared/types.js';
import { jsonPathForMd } from '../workflow/gates.js';
import { reviewArtifactFile, SamePartyReviewError } from '../workflow/review/index.js';
import type { ReviewArtifactResult } from '../workflow/review/index.js';
import { renderReviewReport } from '../workflow/review/report.js';

const log = getLogger('daemon:workflow-review-rpc');

interface WorkflowReviewParams {
	readonly artifactPath: string;
	readonly repo?:        string | undefined;
}

/** What the terminal `done` frame carries. */
export interface WorkflowReviewDone {
	readonly artifactPath: string;
	readonly verdict:      string;
	readonly counts:       { readonly high: number; readonly med: number; readonly low: number; readonly unverified?: number | undefined };
	readonly reviewedBy:   'daemon';
	readonly model:        string;
	readonly template?:    string | undefined;
	/** Number of auto-fixable findings whose edits were applied. */
	readonly applied:      number;
	/** Number of findings left for the user. */
	readonly pending:      number;
	/** The rendered review report (markdown). */
	readonly report:       string;
}

/** The collaborators of {@link workflowReviewStart}. Each defaults to the real
 *  thing; a test replaces the ones it needs to. */
export interface WorkflowReviewDeps {
	/** The provider for the `review` role and its label. */
	readonly resolveProvider?: ((repoPath: string) => { provider: LLMProvider; model: string }) | undefined;
	readonly review?: typeof reviewArtifactFile | undefined;
}

export async function workflowReviewStart(
	rawParams: unknown,
	send:      (msg: IpcStreamMessage) => void,
	signal:    AbortSignal,
	deps:      WorkflowReviewDeps = {},
): Promise<void> {
	const fail = (error: string, reason?: string): void => {
		send({ id: 0, stream: 'error', data: { error, ...(reason !== undefined ? { reason } : {}), recoverable: false } });
	};

	let params: WorkflowReviewParams;
	try {
		params = parseParams(rawParams);
	} catch (err) {
		fail((err as Error).message);
		return;
	}
	const repoPath = params.repo !== undefined && params.repo.length > 0 ? params.repo : process.env['INSRC_REPO'];
	if (repoPath === undefined || repoPath.length === 0) {
		fail('workflow.review: no repo (pass `repo` or set INSRC_REPO)');
		return;
	}

	try {
		const mdPath = params.artifactPath;
		if (!mdPath.endsWith('.md')) throw new Error(`workflow.review: \`artifactPath\` must be the artifact's .md path, got '${mdPath}'`);
		if (!existsSync(mdPath)) throw new Error(`workflow.review: no artifact at ${mdPath}`);
		const jsonPath = jsonPathForMd(mdPath);

		let stageIndex = 0;
		const progress = (label: string): void => send({
			id: 0, stream: 'progress',
			data: { kind: 'stage', operation: 'workflow.review', stageId: label, stageLabel: label, index: stageIndex++, total: null },
		});

		const run = async (provider: LLMProvider, model: string): Promise<ReviewArtifactResult> =>
			(deps.review ?? reviewArtifactFile)({
				mdPath, jsonPath, repo: repoPath, provider, model,
				reviewedAt: new Date().toISOString(),
				onProgress: progress,
				signal,
			});

		let res: ReviewArtifactResult;
		let model: string;
		if (deps.resolveProvider !== undefined) {
			const r = deps.resolveProvider(repoPath);
			model = r.model;
			res = await run(r.provider, r.model);
		} else {
			// The same choke point the workflow runner and the TUI review service use,
			// so the review resolves by role (`review` is a critical role).
			const router = createRoleRouter({});
			const out = await runWithRoutingContext({ router, repoPath }, async () => {
				const { provider, resolution } = router.resolveProviderForRole('review', loadAnalyzeConfig(), repoPath);
				const label = `${resolution.runner}:${resolution.model}`;
				return { label, res: await run(provider, label) };
			});
			model = out.label;
			res = out.res;
		}

		const done: WorkflowReviewDone = {
			artifactPath: mdPath,
			verdict:      res.report.verdict,
			counts:       res.report.counts,
			reviewedBy:   'daemon',
			model,
			...(res.report.template !== undefined ? { template: res.report.template } : {}),
			applied:      res.applied.length,
			pending:      res.pendingUser.length,
			report:       renderReviewReport(res.report),
		};
		log.info({ repoPath, mdPath, verdict: done.verdict, model }, 'workflow.review: reviewed');
		send({ id: 0, stream: 'done', data: done });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		const samePartyRefusal = err instanceof SamePartyReviewError;
		log.info({ repoPath, artifactPath: params.artifactPath, err: msg, samePartyRefusal }, 'workflow.review: no review recorded');
		fail(msg, samePartyRefusal ? 'same-party-review' : undefined);
	}
}

function parseParams(raw: unknown): WorkflowReviewParams {
	if (typeof raw !== 'object' || raw === null) throw new Error('workflow.review: params must be an object');
	const o = raw as Record<string, unknown>;
	const artifactPath = o['artifactPath'];
	if (typeof artifactPath !== 'string' || artifactPath.length === 0) throw new Error('workflow.review: `artifactPath` is required');
	const repo = o['repo'];
	return { artifactPath, ...(typeof repo === 'string' ? { repo } : {}) };
}
