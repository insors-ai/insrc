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

import { getLogger } from '../../shared/logger.js';
import type { ReviewSessionOpts } from '../../agent/providers/cli-provider.js';
import type { StructuredSchema } from '../../shared/types.js';
import type { RunReviewOpts } from './review.js';
import {
	buildTemplateReviewPrompt, HARD_REVIEW_DEADLINE_MS, reviewDeadlineMs, reviewTemplateFor, TEMPLATE_ANSWER_SCHEMA,
	validateTemplateAnswer,
} from './template.js';
import type { RawTemplateAnswer } from './template.js';
import type { ReviewReport } from './types.js';
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
	const { system, user } = buildTemplateReviewPrompt(template, artifactMarkdown, stage);

	const timedOut = (): Error => new Error(
		`The design review passed its time limit of ${minutes(limitMs)} (template ${template.id}). No review was recorded.`,
	);

	/** Read through a function: the signal can flip while a session is awaited. */
	const aborted = (): boolean => opts.signal?.aborted === true;

	/** One session, started with only the time that remains on the review's deadline. */
	const ask = async (prompt: string): Promise<RawTemplateAnswer> => {
		if (aborted()) throw new Error('review: aborted');
		const remainingMs = limitMs - (nowMs() - startedAt);
		if (remainingMs <= 0) throw timedOut();
		let raw: RawTemplateAnswer;
		try {
			raw = await session.runReviewSession<RawTemplateAnswer>(prompt, TEMPLATE_ANSWER_SCHEMA as StructuredSchema, { cwd: repo, deadlineMs: remainingMs });
		} catch (err) {
			if (err instanceof Error && err.name === 'ReviewSessionTimeoutError') throw timedOut();
			throw err;
		}
		// The session cannot be interrupted mid-run, so an abort raised while it ran
		// is honoured here: a cancelled review never returns a report to be stamped.
		if (aborted()) throw new Error('review: aborted');
		return raw;
	};

	emit('template');
	let result = validateTemplateAnswer(template, await ask(`${system}\n\n${user}`));
	if (!result.ok) {
		log.warn({ stage, template: template.id, errors: result.errors.length }, 'review:template: answer failed validation; asking once more');
		const correction = [
			'Your previous answer was REJECTED because it did not satisfy the checklist:',
			...result.errors.map(e => `- ${e}`),
			'Answer again, correcting every point above.',
		].join('\n');
		// The correction sits between the instructions and the checklist, so the design stays last.
		result = validateTemplateAnswer(template, await ask(`${system}\n\n${correction}\n\n${user}`));
		if (!result.ok) {
			throw new Error(
				`The design review answer failed checklist ${template.id} twice. No review was recorded.\n` +
				result.errors.map(e => `- ${e}`).join('\n'),
			);
		}
	}

	const findings = result.findings;
	const counts = tally(findings);
	const verdict = computeVerdict(findings, opts.blockOn ?? DEFAULT_BLOCK_ON);
	const reviewedAt = opts.reviewedAt ?? (opts.now !== undefined ? opts.now() : new Date(0).toISOString());

	emit('done');
	log.info({ stage, template: template.id, verdict, counts, tookMs: nowMs() - startedAt }, 'review:template: completed design review');

	return { artifact: opts.artifact ?? stage, stage, verdict, findings, counts, template: template.id, reviewedAt, model };
}
