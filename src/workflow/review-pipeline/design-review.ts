/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The design review's single-chunk adapters (Epic 8315a11f s1, plan task t11).
 *
 * Premise review (DEF, plan, ...): extract (a model stage; failing it fails the
 * review), probe (a deterministic stage over the claims), then verify. On the
 * daemon path verify is one call per premise with the design-verify limits and the
 * repo as cwd, and a premise whose call is exhausted is recorded as not judged;
 * on the controller path it is today's one batched verify call. The claims and
 * the evidence enter the snapshot once, and verify reads them from there.
 *
 * Template review (HLD, LLD): one reviewer-session stage whose answer must pass
 * today's checklist; a break is re-issued once by the pipeline with today's
 * correction text, under the review's one deadline.
 *
 * Dividing a design review (sections, references, gather) is Story s4: until
 * then a review whose single call is over the limit fails with that reason.
 */

import { buildExtractPrompt, EXTRACT_SCHEMA, normalizeClaimsEnvelope } from '../review/extract.js';
import { gatherEvidence } from '../review/probe.js';
import type { EntitiesForRepoReader } from '../review/source-roots.js';
import {
	buildTemplateReviewPrompt, TEMPLATE_ANSWER_SCHEMA, validateTemplateAnswer, type RawTemplateAnswer, type ReviewTemplate,
} from '../review/template.js';
import type { Claim, Evidence, Finding } from '../review/types.js';
import { REVIEW_CALL_LIMITS, structuredLimits } from '../review/call-limits.js';
import { buildBatchedVerifyPrompt, buildVerifyPrompt, normalizeFinding, VERDICTS_SCHEMA, VERIFY_SCHEMA, type RawFinding } from '../review/verify.js';
import type { StructuredSchema } from '../../shared/types.js';
import { attemptsText } from './job.js';
import type { AdapterStage, NotJudged, ReviewAdapter, ReviewMaterialSnapshot, StageAnswer, StageOutputs } from './types.js';

/** A design review's snapshot: the document, taken once. */
export function designReviewSnapshot(documentText: string): ReviewMaterialSnapshot {
	return { kind: 'design-review', documentText };
}

/** The record of a premise whose judgement failed every attempt: MED, never a pass (ISSUE-d4b2cd1c).
 *  `attempts` is how often the call was issued; without it the count is not stated. */
export function notJudgedFinding(claim: Claim, cause: string, attempts?: number | undefined): Finding {
	return {
		claimId: claim.id,
		...(claim.ref !== undefined ? { ref: claim.ref } : {}),
		kind: claim.kind,
		severity: 'MED',
		premise: claim.text,
		evidence: `Not judged: the reviewing model call failed${attempts !== undefined ? ` ${attemptsText(attempts)}` : ''}. Last error: ${cause}`,
		action: 'Re-run the review, or judge this premise by hand.',
		fixability: 'manual',
	};
}

function refuseDivided(kind: string, divided: boolean): void {
	if (divided) throw new Error(`${kind}: the review's single call is over the review.chunkTokens limit, and dividing a design review is not available yet. No review was recorded.`);
}

function onlyAnswer(outputs: StageOutputs, stage: string): unknown {
	const answers = outputs[stage] as readonly StageAnswer[] | undefined;
	if (answers === undefined || answers.length !== 1) throw new Error(`design review: expected one ${stage} answer, got ${answers?.length ?? 0}`);
	return answers[0]!.answer;
}

export interface PremiseAdapterOpts {
	readonly stage: string;
	readonly repo:  string;
	readonly readEntitiesForRepo?: EntitiesForRepoReader | undefined;
	/** Told when the probe had to search the whole repository root. */
	readonly onSourceRootFallback?: ((reason: string) => void) | undefined;
}

/** The premise review's adapter; its result is the findings, one per premise in claim order. */
export function premiseAdapter(snapshot: ReviewMaterialSnapshot, opts: PremiseAdapterOpts): ReviewAdapter<readonly Finding[]> {
	const document = snapshot.documentText ?? '';
	const extract: AdapterStage = {
		id: 'extract', kind: 'model', after: [], onCallFailure: 'fail-review',
		// Today's extract prompt; like every structured review call, it runs in the repository (HLD).
		singleCalls: () => {
			const { system, user } = buildExtractPrompt(document, opts.stage);
			return [{ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], schema: EXTRACT_SCHEMA, execution: { mode: 'structured', cwd: opts.repo, ...structuredLimits('design-extract') } }];
		},
		chunkCalls: () => [],
		snapshotField: 'claims',
		toSnapshot: out => normalizeClaimsEnvelope(((out as readonly StageAnswer[])[0]?.answer ?? {}) as Parameters<typeof normalizeClaimsEnvelope>[0]),
	};
	const probe: AdapterStage = {
		id: 'probe', kind: 'deterministic', after: ['extract'], onCallFailure: 'fail-review',
		singleCalls: () => [], chunkCalls: () => [],
		run: async (_prior, snap) => gatherEvidence([...(snap.claims ?? []) as Claim[]], opts.repo, {
			readEntitiesForRepo: opts.readEntitiesForRepo,
			onSourceRootFallback: reason => opts.onSourceRootFallback?.(reason),
		}),
		snapshotField: 'evidence',
		toSnapshot: out => out as readonly Evidence[],
	};
	const evidenceFor = (snap: ReviewMaterialSnapshot, claim: Claim): Evidence =>
		((snap.evidence ?? []) as Evidence[]).find(e => e.claimId === claim.id) ?? { claimId: claim.id, grepResults: [], reads: [] };
	const verifyDaemon: AdapterStage = {
		id: 'verify', kind: 'model', after: ['probe'], onCallFailure: 'record-not-judged',
		// One call per premise, in claim order, with the design-verify limits; the repo as cwd is an addition.
		singleCalls: (_prior, snap) => ((snap.claims ?? []) as Claim[]).map(claim => {
			const { system, user } = buildVerifyPrompt(claim, evidenceFor(snap, claim));
			return {
				key: claim.id, schema: VERIFY_SCHEMA,
				messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
				execution: { mode: 'structured', cwd: opts.repo, ...structuredLimits('design-verify') },
			};
		}),
		chunkCalls: () => [],
	};
	const verifyController: AdapterStage = {
		id: 'verify', kind: 'model', after: ['probe'], onCallFailure: 'fail-review',
		// Today's one batched verify call holding every premise, with the design-verify limits.
		singleCalls: (_prior, snap) => {
			const claims = (snap.claims ?? []) as Claim[];
			if (claims.length === 0) return [];
			const { system, user } = buildBatchedVerifyPrompt(claims, (snap.evidence ?? []) as Evidence[]);
			return [{ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], schema: VERDICTS_SCHEMA as unknown as StructuredSchema, execution: { mode: 'structured', cwd: opts.repo, ...structuredLimits('design-verify') } }];
		},
		chunkCalls: () => [],
	};
	return {
		kind: 'design-review', dimension: 'premise',
		material: () => ({ atoms: [], relations: [], obligations: [] }),
		stagesFor: path => [extract, probe, path === 'daemon' ? verifyDaemon : verifyController],
		finish: (outputs, ctx) => {
			refuseDivided('premise review', ctx.divided);
			const claims = normalizeClaimsEnvelope((onlyAnswer(outputs, 'extract') ?? {}) as Parameters<typeof normalizeClaimsEnvelope>[0]);
			const answers = (outputs['verify'] ?? []) as readonly StageAnswer[];
			const batched = answers.length === 1 && answers[0]!.key === undefined
				? new Map(((answers[0]!.answer as { verdicts?: readonly (RawFinding & { claimId: string })[] }).verdicts ?? []).map(v => [v.claimId, v] as const))
				: undefined;
			const notJudged = new Map(ctx.notJudged.filter((n: NotJudged) => n.stage === 'verify').map(n => [n.key, n] as const));
			return claims.map(claim => {
				const raw = batched !== undefined ? batched.get(claim.id) : answers.find(a => a.key === claim.id)?.answer as RawFinding | undefined;
				if (raw !== undefined) return normalizeFinding(claim, raw);
				const failed = notJudged.get(claim.id);
				return notJudgedFinding(claim, failed?.detail ?? failed?.cause ?? 'no verdict was returned for this premise', failed?.attempts);
			});
		},
	};
}

export interface TemplateAdapterOpts {
	readonly template: ReviewTemplate;
	readonly stage:    string;
	readonly repo:     string;
	/** The review's time limit (capped at 30 minutes). */
	readonly limitMs:  number;
	/** Today's time-limit error. */
	readonly timedOut: () => Error;
}

/** Today's correction for an answer that broke the checklist; it sits between the instructions and the checklist. */
export function templateCorrection(errors: readonly string[]): string {
	return [
		'Your previous answer was REJECTED because it did not satisfy the checklist:',
		...errors.map(e => `- ${e}`),
		'Answer again, correcting every point above.',
	].join('\n');
}

/** The template review's adapter; its result is the checklist's findings. */
export function templateAdapter(snapshot: ReviewMaterialSnapshot, opts: TemplateAdapterOpts): ReviewAdapter<readonly Finding[]> {
	const { system, user } = buildTemplateReviewPrompt(opts.template, snapshot.documentText ?? '', opts.stage);
	const execution = { mode: 'reviewer-session' as const, cwd: opts.repo, deadlineMs: opts.limitMs, tools: 'read-only' as const, stallMs: REVIEW_CALL_LIMITS['design-session'].silenceMs };
	const session: AdapterStage = {
		id: 'template', kind: 'model', after: [], onCallFailure: 'fail-review',
		singleCalls: () => [{ messages: [{ role: 'user', content: `${system}\n\n${user}` }], schema: TEMPLATE_ANSWER_SCHEMA as unknown as StructuredSchema, execution }],
		chunkCalls: () => [],
		validate: answer => {
			const r = validateTemplateAnswer(opts.template, answer as RawTemplateAnswer);
			return r.ok ? [] : r.errors;
		},
		withCorrection: (prompt, reasons) => ({ ...prompt, messages: [{ role: 'user', content: `${system}\n\n${templateCorrection(reasons)}\n\n${user}` }] }),
	};
	return {
		kind: 'design-review', dimension: 'template',
		material: () => ({ atoms: [], relations: [], obligations: [] }),
		stagesFor: () => [session],
		finish: (outputs, ctx) => {
			refuseDivided('design review', ctx.divided);
			const r = validateTemplateAnswer(opts.template, onlyAnswer(outputs, 'template') as RawTemplateAnswer);
			if (!r.ok) throw new Error(`design review: a validated answer failed checklist ${opts.template.id}`);
			return r.findings;
		},
		deadlineError: () => opts.timedOut(),
	};
}
