/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review of a DESIGN document (HLD / LLD): ONE reviewer session checks the
 * design against its template and returns every finding in one answer.
 *
 * No premises are extracted up front, no probes are pre-declared, and there is
 * no model call per premise: the reviewer reads the code and uses insrc analyze
 * itself. The whole review — the session, the one repeat after an invalid
 * answer, any transient retry — shares ONE deadline.
 */

import { resolveReviewBudgetPolicy } from '../../agent/providers/review-budget.js';
import { getLogger } from '../../shared/logger.js';
import type { ReviewSessionOpts } from '../../agent/providers/cli-provider.js';
import type { StructuredSchema } from '../../shared/types.js';
import type { RunReviewOpts } from './review.js';
import type { LLMProvider } from '../../shared/types.js';
import { runReviewJob } from '../review-pipeline/driver.js';
import { designReviewSnapshot, templateAdapter } from '../review-pipeline/design-review.js';
import { createReviewJob, pipelineCallsOf, ReviewCallFailedError } from '../review-pipeline/job.js';
import { readReviewChunkTokens, reviewLimitChars } from '../review-pipeline/limit.js';
import type { PipelineCalls, ReviewAdapter } from '../review-pipeline/types.js';
import { HARD_REVIEW_DEADLINE_MS, reviewDeadlineMs, reviewTemplateFor } from './template.js';
import type { Finding, ReviewReport } from './types.js';
import { computeVerdict, DEFAULT_BLOCK_ON, tally } from './verdict.js';

const log = getLogger('review');

/** What a provider must offer to review a design: a read-only reviewer session
 *  (see `CliProvider.runReviewSession`). A structural type, so a test can hand
 *  in a fake and a provider without the capability is detected, not assumed. */
export interface ReviewSessionProvider {
	runReviewSession<T>(prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts): Promise<T>;
}

function sessionProviderOf(provider: unknown): ReviewSessionProvider | undefined {
	return typeof (provider as { runReviewSession?: unknown } | null)?.runReviewSession === 'function'
		? (provider as ReviewSessionProvider)
		: undefined;
}

const minutes = (ms: number): string => {
	const m = ms / 60_000;
	return `${Number.isInteger(m) ? m : m.toFixed(1)} minute${m === 1 ? '' : 's'}`;
};

/** Run the template review of a design document. Called by `runReview` for
 *  stage `design.epic` / `design.story`; never for any other stage. */
export async function runTemplateReview(artifactMarkdown: string, opts: RunReviewOpts): Promise<ReviewReport> {
	const { repo, stage, model } = opts;
	const emit = opts.onProgress ?? (() => { /* no-op */ });
	const nowMs = opts.nowMs ?? Date.now;

	const session = sessionProviderOf(opts.provider);
	if (session === undefined) {
		// No fallback to the extract → probe → verify pipeline: a design review
		// that cannot read the code is not a weaker review, it is a different one.
		throw new Error(
			`A design review (${stage}) needs a tool-capable reviewer: a claude or codex CLI provider that can run a ` +
			'reviewer session. The configured review provider cannot. Point the review role at a CLI provider.',
		);
	}

	const intent = opts.intent ?? 'spec';
	const template = reviewTemplateFor(intent);
	const limitMs = Math.min(opts.deadlineMs ?? reviewDeadlineMs(intent === 'issue' ? 'issue' : 'feature'), HARD_REVIEW_DEADLINE_MS);
	const startedAt = nowMs();

	const timedOut = (totalMs: number): Error => new Error(
		`The design review passed its time limit of ${minutes(totalMs)} (template ${template.id}). No review was recorded.`,
	);

	// One review-pipeline job (Epic 8315a11f): one reviewer session under the
	// review's one deadline; an answer that breaks the checklist is re-issued once
	// by the pipeline with today's correction, and a second break fails the review.
	const snapshot = designReviewSnapshot(artifactMarkdown);
	const adapter = templateAdapter(snapshot, { template, stage, repo, limitMs, timedOut }) as unknown as ReviewAdapter<unknown>;
	const budgetPolicy = resolveReviewBudgetPolicy(opts.provider as LLMProvider, 'reviewer-session', readReviewChunkTokens());
	const job = createReviewJob(adapter, 'daemon', snapshot, budgetPolicy.totalTokens * 3, { now: startedAt, budgetPolicy });
	let findings: readonly Finding[];
	let pipelineCalls: PipelineCalls | undefined;
	try {
		findings = await runReviewJob(job, adapter, session as LLMProvider, {
			signal: opts.signal, now: nowMs, onCall: () => emit('template'), onDone: done => { pipelineCalls = pipelineCallsOf(done); },
		}) as readonly Finding[];
	} catch (err) {
		// A cancel of this review keeps today's message; a provider's own abort propagates as it was.
		if (opts.signal?.aborted === true) throw new Error('review: aborted');
		if (err instanceof ReviewCallFailedError && err.stage === 'template' && err.cause === 'invalid-answer') {
			const tried = `${err.invalidAnswers} of ${err.attempts} attempts`;
			log.warn({ stage, template: template.id, attempts: err.attempts, invalidAnswers: err.invalidAnswers }, `review:template: the answer failed the checklist (${tried})`);
			throw new Error(
				`The design review answer failed checklist ${template.id} (${tried} were invalid answers). No review was recorded.\n` +
				err.reasons.map(e => `- ${e}`).join('\n'),
			);
		}
		throw err;
	}

	const counts = tally(findings);
	const verdict = computeVerdict(findings, opts.blockOn ?? DEFAULT_BLOCK_ON);
	const reviewedAt = opts.reviewedAt ?? (opts.now !== undefined ? opts.now() : new Date(0).toISOString());

	emit('done');
	log.info({ stage, template: template.id, verdict, counts, tookMs: nowMs() - startedAt }, 'review:template: completed design review');

	return { artifact: opts.artifact ?? stage, stage, verdict, findings, counts, template: template.id, reviewedAt, model, ...(pipelineCalls !== undefined ? { pipelineCalls } : {}) };
}
