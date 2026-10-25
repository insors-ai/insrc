/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Today's reviews through the review pipeline (Epic 8315a11f s1): under the
 * limit each review makes today's calls, with today's prompts, schemas and
 * working directory, and gives today's findings and verdict. Recorded answers
 * stand in for the model; the grounding is fixed and the record is not written.
 *
 * Run: npx tsx --test src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildRetryNote, validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import type { LLMMessage, LLMProvider, ReviewSessionOpts, StructuredCompletionOpts, StructuredSchema } from '../../../shared/types.js';
import type { ErDefinition } from '../../artifacts/companion/er.js';
import type { UxDefinition } from '../../artifacts/companion/ux.js';
import { ADHERENCE_FINDINGS_SCHEMA, buildAdherencePrompt, judgeAdherence } from '../../code-review/dimensions/adherence.js';
import { buildConventionsPrompt, CONVENTIONS_FINDINGS_SCHEMA } from '../../code-review/dimensions/conventions.js';
import { buildCoveragePrompt, COVERAGE_FINDINGS_SCHEMA, prepareCoverageGrounding } from '../../code-review/dimensions/coverage.js';
import { buildFunctionalCoveragePrompt, FUNCTIONAL_COVERAGE_FINDINGS_SCHEMA } from '../../code-review/dimensions/functional-coverage.js';
import { buildQualityPrompt, QUALITY_FINDINGS_SCHEMA } from '../../code-review/dimensions/quality.js';
import { DEFAULT_DEPS, runCodeReview } from '../../code-review/runner.js';
import type { CodeReviewGrounding, CodeReviewSubject } from '../../code-review/types.js';
import { enveloped, unenveloped } from './enveloped.js';
import { buildExtractPrompt, EXTRACT_SCHEMA, normalizeClaimsEnvelope } from '../../review/extract.js';
import { gatherEvidence } from '../../review/probe.js';
import { computeReviewVerdict, runReview } from '../../review/review.js';
import { buildTemplateReviewPrompt, DEFAULT_DESIGN_REVIEW_SETTINGS, reviewTemplateFor, validateTemplateAnswer } from '../../review/template.js';
import { buildBatchedVerifyPrompt, buildVerifyPrompt, VERDICTS_SCHEMA, VERIFY_CALL_STALL_MS, VERIFY_CALL_TIMEOUT_MS, VERIFY_SCHEMA } from '../../review/verify.js';
import { designReviewSnapshot, premiseAdapter, templateCorrection } from '../design-review.js';
import { applyOutput, createReviewJob, nextCalls, result, runStage } from '../job.js';
import type { ReviewAdapter } from '../types.js';

const EPIC = 'e1a2b3c4d5e6f708';
const validEr: ErDefinition = {
	classes: {
		Customer: { attributes: { id: { range: 'string', identifier: true } } },
		Order:    { attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true } } },
	},
};
const validUx: UxDefinition = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'hi' }] };

/** A Story that needs every dimension: an LLD with an FR, an ER model, a UX design, a UX mock and an ER companion. */
function subject(repoPath: string, withContract = true): CodeReviewSubject {
	return {
		repoPath, epicHash: EPIC, storyId: 's1', changedFiles: ['src/a.ts'],
		approvedLld: withContract ? {
			meta: { epicHash: EPIC, storyId: 's1', epicSlug: 'slug', createdAt: '2026-10-20T00:00:00.000Z', epicCreatedAt: '2026-10-20T00:00:00.000Z' },
			body: {
				functionalDefinition: { requirements: [{ id: 'FR-1', statement: 'orders name their customer', scope: 'item' }] },
				erDefinition: validEr,
				uxDefinition: validUx,
				companions: [
					{ kind: 'ux-mock', relPath: 'docs/ux.html', title: 'UX' },
					{ kind: 'diagram-mermaid', relPath: 'docs/er.html', title: 'ER model' },
				],
			},
		} as unknown as CodeReviewSubject['approvedLld'] : null,
		approvedPlan: null,
		buildRecord: { changedFiles: ['src/a.ts'] } as CodeReviewSubject['buildRecord'],
	};
}

const grounding: CodeReviewGrounding = {
	symbols: [{ entityId: 'e1', name: 'placeOrder', kind: 'function', file: 'src/a.ts', startLine: 1, endLine: 9, signature: 'placeOrder()', callers: [], callees: [], testsReaching: [] }],
} as unknown as CodeReviewGrounding;

/** Recorded answers, by the dimension's schema. */
const ANSWERS = new Map<unknown, unknown>([
	[ADHERENCE_FINDINGS_SCHEMA, { findings: [
		{ severity: 'MED', location: 'src/a.ts:3', message: 'diverges from c1', expectationRef: 'c1' },
		{ severity: 'HIGH', location: 'src/other.ts:1', message: 'outside the Story' },
	] }],
	[CONVENTIONS_FINDINGS_SCHEMA, { findings: [{ severity: 'LOW', location: 'src/a.ts:5', message: 'idiom drift', confidence: 'observation' }] }],
	[COVERAGE_FINDINGS_SCHEMA, { findings: [{ severity: 'HIGH', location: 'src/a.ts:1', message: 'untested', confidence: 'breach', findingKind: 'other' }] }],
	[QUALITY_FINDINGS_SCHEMA, { findings: [] }],
	[FUNCTIONAL_COVERAGE_FINDINGS_SCHEMA, { findings: [
		{ severity: 'HIGH', location: 'src/a.ts:2', message: 'FR-1 not realized', expectationRef: 'FR-1' },
		{ severity: 'HIGH', location: 'src/a.ts:2', message: 'invented', expectationRef: 'FR-9' },
	] }],
]);

interface Seen { readonly messages: LLMMessage[]; readonly schema: unknown; readonly opts: StructuredCompletionOpts | undefined }

/** A provider answering from ANSWERS, recording each call as the adapter made it. */
function recordedProvider(onCall?: (seen: Seen) => void): { provider: LLMProvider; seen: Seen[] } {
	const seen: Seen[] = [];
	const provider = {
		completeStructured: async (messages: LLMMessage[], schema: StructuredSchema, opts?: StructuredCompletionOpts) => {
			const inner = (schema as unknown as { properties: { answer: unknown } }).properties.answer;
			const s: Seen = { messages: unenveloped(messages), schema: inner, opts };
			seen.push(s);
			onCall?.(s);
			if (!ANSWERS.has(inner)) throw new Error('no recorded answer for this schema');
			return enveloped(schema, ANSWERS.get(inner));
		},
	} as unknown as LLMProvider;
	return { provider, seen };
}

function repoWithMock(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-parity-'));
	mkdirSync(join(repo, 'docs'));
	writeFileSync(join(repo, 'docs/ux.html'), '<html></html>');
	return repo;
}

const deps = { judges: DEFAULT_DEPS.judges, assembleGrounding: async () => grounding, write: () => {} };
const opts = { runId: 'parity', modelLabel: 'test' };

test("an under-limit code review makes today's calls per dimension, with the repo as cwd, and gives today's findings and verdict, diagram and ux included", async () => {
	const repo = repoWithMock();
	try {
		const s = subject(repo);
		const { provider, seen } = recordedProvider();
		const out = await runCodeReview(s, provider, opts, deps);
		assert.ok(out.ok, out.ok ? '' : out.error);

		// Today's calls, in today's order: one per model dimension; ux and diagram make none.
		assert.deepEqual(seen.map(c => c.schema), [ADHERENCE_FINDINGS_SCHEMA, CONVENTIONS_FINDINGS_SCHEMA, COVERAGE_FINDINGS_SCHEMA, QUALITY_FINDINGS_SCHEMA, FUNCTIONAL_COVERAGE_FINDINGS_SCHEMA]);
		assert.deepEqual(seen.map(c => c.messages), [
			buildAdherencePrompt(s, grounding, undefined),
			buildConventionsPrompt(s, grounding, undefined),
			buildCoveragePrompt(s, prepareCoverageGrounding(s, grounding, 'full'), undefined, { groundingMode: 'full' }),
			buildQualityPrompt(s, grounding, undefined),
			buildFunctionalCoveragePrompt(s, grounding, undefined),
		], "today's prompts, byte for byte");
		for (const c of seen) {
			assert.equal(c.opts?.cwd, repo, 'the repo as cwd');
			assert.equal(c.opts?.internalRetry, false, 'the pipeline owns retries');
		}

		// Today's findings, dimension by dimension.
		const a = out.artifact.body;
		assert.deepEqual(a.dimensions.map(d => d.dimension), ['adherence', 'conventions', 'coverage', 'quality', 'functional-coverage', 'diagram', 'ux']);
		const byDim = new Map(a.dimensions.map(d => [d.dimension, d] as const));
		assert.deepEqual(byDim.get('adherence')!.findings, [{ dimension: 'adherence', severity: 'MED', location: 'src/a.ts:3', message: 'diverges from c1', expectationRef: 'c1' }], 'out-of-scope dropped');
		assert.deepEqual(byDim.get('conventions')!.findings, [{ dimension: 'conventions', severity: 'LOW', location: 'src/a.ts:5', message: 'idiom drift', confidence: 'observation' }]);
		const coverage = byDim.get('coverage')!;
		assert.deepEqual(coverage.findings.map(f => [f.severity, f.confidence, f.findingKind]), [['LOW', 'observation', 'other']], 'a HIGH that may not stand is lowered, once');
		assert.equal(coverage.lowered?.length, 1);
		assert.deepEqual(byDim.get('quality')!.findings, []);
		assert.deepEqual(byDim.get('functional-coverage')!.findings.map(f => f.expectationRef), ['FR-1'], 'an unknown FR id is dropped');
		const diagram = byDim.get('diagram')!;
		assert.ok(diagram.findings.some(f => f.severity === 'HIGH' && f.location === 'docs/er.html'), 'the missing ER companion is a HIGH');
		const ux = byDim.get('ux')!;
		assert.ok(!ux.findings.some(f => f.location === 'docs/ux.html'), 'the shipped mock is not reported missing');
		for (const d of a.dimensions) assert.equal(d.pipelineCalls, undefined, 'a single-chunk review records no pipelineCalls');

		// Today's verdict rule over today's counts.
		const all = a.dimensions.flatMap(d => d.findings);
		assert.deepEqual(a.counts, { high: all.filter(f => f.severity === 'HIGH').length, med: all.filter(f => f.severity === 'MED').length, low: all.filter(f => f.severity === 'LOW').length });
		assert.equal(a.verdict, 'block');

		// An answer that breaks the schema is asked again once, with today's correction note.
		let first = true;
		const retried = recordedProvider();
		const flaky = {
			completeStructured: async (messages: LLMMessage[], schema: StructuredSchema, o?: StructuredCompletionOpts) => {
				const inner = (schema as unknown as { properties: { answer: unknown } }).properties.answer;
				if (inner === ADHERENCE_FINDINGS_SCHEMA && first) { first = false; retried.seen.push({ messages: unenveloped(messages), schema: inner, opts: o }); return enveloped(schema, { findings: 'not an array' }); }
				return retried.provider.completeStructured(messages, schema, o);
			},
		} as unknown as LLMProvider;
		assert.ok((await runCodeReview(s, flaky, opts, deps)).ok);
		const adherenceCalls = retried.seen.filter(c => c.schema === ADHERENCE_FINDINGS_SCHEMA);
		assert.equal(adherenceCalls.length, 2);
		assert.deepEqual(adherenceCalls[1]!.messages, buildAdherencePrompt(s, grounding, buildRetryNote((validateAgainstSchema(ADHERENCE_FINDINGS_SCHEMA, { findings: 'not an array' }) as { errors: string[] }).errors)), "today's correction note");

		// A dimension failing both attempts fails the review as today: { ok: false }, nothing written.
		let qualityAsks = 0;
		const written: string[] = [];
		const failing = {
			completeStructured: async (messages: LLMMessage[], schema: StructuredSchema, o?: StructuredCompletionOpts) => {
				if ((schema as unknown as { properties: { answer: unknown } }).properties.answer === QUALITY_FINDINGS_SCHEMA) { qualityAsks++; throw new Error('model unavailable'); }
				return recordedProvider().provider.completeStructured(messages, schema, o);
			},
		} as unknown as LLMProvider;
		const failed = await runCodeReview(s, failing, opts, { ...deps, write: (path: string) => { written.push(path); } });
		assert.equal(failed.ok, false);
		assert.ok(!failed.ok && /quality|judge/.test(failed.error) && failed.error.includes('model unavailable'), failed.ok ? '' : failed.error);
		assert.equal(qualityAsks, 2, 'two attempts in all');
		assert.deepEqual(written, [], 'no record');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('adherence makes no call without an approved LLD or plan', async () => {
	const repo = repoWithMock();
	try {
		// No approved design, but the work item still has a head that carries the Epic's creation time, so the record can be filed.
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, '.insrc', 'artifacts', `DEF-${EPIC}.json`), JSON.stringify({ meta: { epicHash: EPIC, epicSlug: 'slug', createdAt: '2026-10-20T00:00:00.000Z' }, body: {} }));
		const s = subject(repo, false);
		// The judge alone: no provider method is touched, and the result is empty.
		const untouchable = new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : () => { throw new Error(`adherence called ${String(p)}`); }) }) as LLMProvider;
		assert.deepEqual(await judgeAdherence(s, grounding, untouchable), { dimension: 'adherence', findings: [] });
		// The whole review: the other dimensions are asked; adherence is not.
		const { provider, seen } = recordedProvider();
		const out = await runCodeReview(s, provider, opts, deps);
		assert.ok(out.ok, out.ok ? '' : out.error);
		assert.deepEqual(seen.map(c => c.schema), [CONVENTIONS_FINDINGS_SCHEMA, COVERAGE_FINDINGS_SCHEMA, QUALITY_FINDINGS_SCHEMA]);
		assert.deepEqual(out.artifact.body.dimensions.find(d => d.dimension === 'adherence'), { dimension: 'adherence', findings: [] });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a mock added or removed after prepare does not change the ux result', async () => {
	const missing = (out: Awaited<ReturnType<typeof runCodeReview>>): boolean =>
		out.ok && out.artifact.body.dimensions.find(d => d.dimension === 'ux')!.findings.some(f => f.location === 'docs/ux.html' && f.severity === 'HIGH');
	// Removed while the review runs (during the first model call, after prepare): still present.
	{
		const repo = repoWithMock();
		try {
			const s = subject(repo);
			const { provider } = recordedProvider(() => rmSync(join(repo, 'docs/ux.html'), { force: true }));
			assert.equal(missing(await runCodeReview(s, provider, opts, deps)), false, 'the mock existed at prepare');
			// A new review, prepared now, sees it gone: the removal is real.
			assert.equal(missing(await runCodeReview(s, recordedProvider().provider, opts, deps)), true);
		} finally { rmSync(repo, { recursive: true, force: true }); }
	}
	// Added while the review runs: still missing.
	{
		const repo = repoWithMock();
		rmSync(join(repo, 'docs/ux.html'));
		try {
			const s = subject(repo);
			// The ER companion appears too: the diagram dimension also reads the facts taken at prepare.
			const { provider } = recordedProvider(() => { writeFileSync(join(repo, 'docs/ux.html'), '<html></html>'); writeFileSync(join(repo, 'docs/er.html'), '<html></html>'); });
			const during = await runCodeReview(s, provider, opts, deps);
			assert.equal(missing(during), true, 'the mock was missing at prepare');
			assert.ok(during.ok && during.artifact.body.dimensions.find(d => d.dimension === 'diagram')!.findings.some(f => f.location === 'docs/er.html' && f.severity === 'HIGH'), 'so was the ER companion');
			assert.equal(missing(await runCodeReview(s, recordedProvider().provider, opts, deps)), false);
		} finally { rmSync(repo, { recursive: true, force: true }); }
	}
});

// -- design reviews (plan task t11) -------------------------------------------

const DEF = '# DEF\n\nThe store keeps a `TOKEN_ALPHA` and a `TOKEN_BETA`.\n';
const CLAIMS = [
	{ id: 'p1', kind: 'citation', text: 'TOKEN_ALPHA exists', anchors: ['src/a.ts'], probe: { greps: ['TOKEN_ALPHA'] } },
	{ id: 'p2', kind: 'semantic', text: 'TOKEN_BETA is kept', anchors: [], probe: { greps: ['TOKEN_BETA'] } },
];
const noEntities = async (): Promise<never[]> => [];

function defRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-parity-def-'));
	mkdirSync(join(repo, 'src'));
	writeFileSync(join(repo, 'src/a.ts'), 'export const TOKEN_ALPHA = 1;\nexport const TOKEN_BETA = 2;\n');
	return repo;
}

/** A provider for the premise review: extraction gives CLAIMS; each premise is judged LOW unless `fail` says otherwise. */
function premiseProvider(fail: { extract?: boolean; verify?: string } = {}): { provider: LLMProvider; seen: Seen[] } {
	const seen: Seen[] = [];
	const provider = {
		completeStructured: async (messages: LLMMessage[], schema: StructuredSchema, opts?: StructuredCompletionOpts) => {
			const inner = (schema as unknown as { properties: { answer: unknown } }).properties.answer;
			seen.push({ messages: unenveloped(messages), schema: inner, opts });
			if (inner === EXTRACT_SCHEMA) {
				if (fail.extract === true) throw new Error('extraction unavailable');
				return enveloped(schema, { claims: CLAIMS });
			}
			const text = asText(messages);
			if (fail.verify !== undefined && text.includes(`text: ${fail.verify}`)) throw new Error(`stalled judging ${fail.verify}`);
			return enveloped(schema, { severity: 'LOW', evidence: 'found', action: 'none — verified sound', fixability: 'manual' });
		},
	} as unknown as LLMProvider;
	return { provider, seen };
}
const asText = (messages: readonly LLMMessage[]): string => messages.map(m => (typeof m.content === 'string' ? m.content : '')).join('\n');

test('an under-limit DEF review makes one extract call, a probe and one verify call per premise with the design-verify limits; extraction failing fails the review, a verify call failing twice records the premise as not judged', async () => {
	const repo = defRepo();
	try {
		const { provider, seen } = premiseProvider();
		const report = await runReview(DEF, { repo, stage: 'define', provider, model: 'm', reviewedAt: '2026-10-20T00:00:00.000Z', readEntitiesForRepo: noEntities });
		// One extract call, then one verify call per premise in claim order.
		assert.deepEqual(seen.map(c => c.schema), [EXTRACT_SCHEMA, VERIFY_SCHEMA, VERIFY_SCHEMA]);
		const ex = buildExtractPrompt(DEF, 'define');
		assert.deepEqual(seen[0]!.messages, [{ role: 'system', content: ex.system }, { role: 'user', content: ex.user }], "today's extraction prompt");
		assert.equal(seen[0]!.opts?.cwd, repo, 'extraction runs in the repository, as every structured review call');
		// The probe ran: each verify prompt is today's, over the evidence gatherEvidence finds.
		const claims = normalizeClaimsEnvelope({ claims: CLAIMS as never });
		const evidence = await gatherEvidence(claims, repo, { readEntitiesForRepo: noEntities });
		claims.forEach((claim, i) => {
			const v = buildVerifyPrompt(claim, evidence.find(e => e.claimId === claim.id)!);
			assert.deepEqual(seen[i + 1]!.messages, [{ role: 'system', content: v.system }, { role: 'user', content: v.user }]);
			assert.ok(asText(seen[i + 1]!.messages).includes('src/a.ts'), 'the probe\'s matches reached the judgement');
			assert.equal(seen[i + 1]!.opts?.timeoutMs, VERIFY_CALL_TIMEOUT_MS, 'the design-verify cap');
			assert.equal(seen[i + 1]!.opts?.stallMs, VERIFY_CALL_STALL_MS, 'the design-verify silence limit');
			assert.equal(seen[i + 1]!.opts?.cwd, repo, 'the repo as cwd, the one addition');
		});
		assert.ok(seen.every(c => c.opts?.internalRetry === false));
		// Today's report.
		assert.deepEqual(report.findings.map(f => [f.claimId, f.severity]), [['p1', 'LOW'], ['p2', 'LOW']]);
		assert.equal(report.verdict, computeReviewVerdict(report.findings));
		assert.equal(report.stage, 'define');

		// Extraction failing (both attempts) fails the review.
		const broken = premiseProvider({ extract: true });
		await assert.rejects(runReview(DEF, { repo, stage: 'define', provider: broken.provider, model: 'm', readEntitiesForRepo: noEntities }), /extraction unavailable/);
		assert.equal(broken.seen.filter(c => c.schema === EXTRACT_SCHEMA).length, 2);
		assert.equal(broken.seen.filter(c => c.schema === VERIFY_SCHEMA).length, 0, 'nothing is verified');

		// A verify call failing twice: that premise is not judged (MED, never a pass); the other is kept.
		const stalls = premiseProvider({ verify: 'TOKEN_ALPHA exists' });
		const partial = await runReview(DEF, { repo, stage: 'define', provider: stalls.provider, model: 'm', readEntitiesForRepo: noEntities });
		assert.equal(stalls.seen.filter(c => asText(c.messages).includes('text: TOKEN_ALPHA exists')).length, 2, 'asked twice, not more');
		const p1 = partial.findings.find(f => f.claimId === 'p1')!;
		assert.equal(p1.severity, 'MED');
		assert.ok(p1.evidence.startsWith('Not judged') && p1.evidence.includes('stalled judging TOKEN_ALPHA exists'), p1.evidence);
		assert.equal(partial.findings.find(f => f.claimId === 'p2')!.severity, 'LOW');
		assert.equal(partial.verdict, 'block');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

const SPEC_TEMPLATE = reviewTemplateFor('spec', DEFAULT_DESIGN_REVIEW_SETTINGS);
const HLD = '# HLD\n\nThe design body.';
function templateAnswer(): { items: unknown[] } {
	return { items: SPEC_TEMPLATE.items.map(it => ({ item: it.id, premises: [{ premise: `claim under ${it.id}`, outcome: 'holds', evidence: 'read the body', action: '' }] })) };
}

/** A reviewer-session provider that plays `script` (an Error is thrown), recording each session as the adapter made it. */
function sessionProvider(script: readonly unknown[]): { provider: LLMProvider; sessions: { prompt: string; callId: string; opts: ReviewSessionOpts }[] } {
	const sessions: { prompt: string; callId: string; opts: ReviewSessionOpts }[] = [];
	const provider = {
		completeStructured: async () => { throw new Error('a design review makes no structured call'); },
		runReviewSession: async (prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts) => {
			const callId = (schema as unknown as { properties: { callId: { const: string } } }).properties.callId.const;
			sessions.push({ prompt: prompt.slice(0, prompt.lastIndexOf('\n\nThis request\'s id is "')), callId, opts });
			const step = script[Math.min(sessions.length - 1, script.length - 1)];
			if (step instanceof Error) throw step;
			return enveloped(schema, step);
		},
	} as unknown as LLMProvider;
	return { provider, sessions };
}

test("an under-limit HLD review makes one reviewer-session call and gives today's report", async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-parity-hld-'));
	try {
		const { provider, sessions } = sessionProvider([templateAnswer()]);
		const report = await runReview(HLD, { repo, stage: 'design.epic', provider, model: 'm', intent: 'spec', deadlineMs: 600_000, nowMs: () => 1_000, reviewedAt: '2026-10-20T00:00:00.000Z' });
		assert.equal(sessions.length, 1);
		const { system, user } = buildTemplateReviewPrompt(SPEC_TEMPLATE, HLD, 'design.epic');
		assert.equal(sessions[0]!.prompt, `${system}\n\n${user}`, "today's session prompt");
		assert.equal(sessions[0]!.opts.cwd, repo);
		assert.equal(sessions[0]!.opts.deadlineMs, 600_000, 'the whole limit');
		assert.equal(sessions[0]!.opts.internalRetry, false);
		// Today's report: the checklist's findings, today's verdict rule, the template named.
		const expected = validateTemplateAnswer(SPEC_TEMPLATE, templateAnswer() as never);
		assert.ok(expected.ok);
		assert.deepEqual(report.findings, expected.findings);
		assert.equal(report.verdict, computeReviewVerdict(expected.findings));
		assert.equal(report.template, SPEC_TEMPLATE.id);
		assert.equal(report.pipelineCalls, undefined);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test("the controller premise stage plan under the limit offers one batched verify call holding every premise, with today's buildBatchedVerifyPrompt prompt and schema", async () => {
	const repo = defRepo();
	try {
		const snapshot = designReviewSnapshot(DEF);
		const adapter = premiseAdapter(snapshot, { stage: 'define', repo, readEntitiesForRepo: noEntities }) as unknown as ReviewAdapter<unknown>;
		let job = createReviewJob(adapter, 'controller', snapshot, 384_000);
		const ex = nextCalls(job, adapter);
		assert.equal(ex.length, 1);
		job = applyOutput(job, adapter, ex[0]!.callId, { callId: ex[0]!.callId, answer: { claims: CLAIMS } });
		job = await runStage(job, adapter);
		const verify = nextCalls(job, adapter);
		assert.equal(verify.length, 1, 'one batched call');
		const claims = normalizeClaimsEnvelope({ claims: CLAIMS as never });
		const evidence = await gatherEvidence(claims, repo, { readEntitiesForRepo: noEntities });
		const b = buildBatchedVerifyPrompt(claims, evidence);
		assert.deepEqual(verify[0]!.prompt.messages, [{ role: 'system', content: b.system }, { role: 'user', content: b.user }], "today's batched prompt, every premise in it");
		assert.equal(verify[0]!.prompt.schema, VERDICTS_SCHEMA);
		// The verdicts come back keyed by claimId and become today's findings.
		const verdicts = claims.map(c => ({ claimId: c.id, severity: c.id === 'p1' ? 'HIGH' : 'LOW', evidence: 'e', action: 'a', fixability: 'manual' }));
		job = applyOutput(job, adapter, verify[0]!.callId, { callId: verify[0]!.callId, answer: { verdicts } });
		assert.deepEqual((result<readonly { claimId: string; severity: string }[]>(job)).map(f => [f.claimId, f.severity]), [['p1', 'HIGH'], ['p2', 'LOW']]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test("an HLD answer that breaks the checklist is re-issued once by the pipeline with today's correction text under a new callId; a second break fails the review; the stage never re-asks", async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-parity-hld-'));
	try {
		const run = (script: readonly unknown[]) => {
			const p = sessionProvider(script);
			return { p, done: runReview(HLD, { repo, stage: 'design.epic', provider: p.provider, model: 'm', intent: 'spec', deadlineMs: 600_000, nowMs: () => 1_000 }) };
		};
		const broken = { items: [] };
		const errors = (validateTemplateAnswer(SPEC_TEMPLATE, broken as never) as { errors: string[] }).errors;
		const { system, user } = buildTemplateReviewPrompt(SPEC_TEMPLATE, HLD, 'design.epic');

		// Broken, then sound: two sessions, the second with today's correction, under a new callId.
		const once = run([broken, templateAnswer()]);
		const report = await once.done;
		assert.equal(once.p.sessions.length, 2);
		assert.equal(once.p.sessions[1]!.prompt, `${system}\n\n${templateCorrection(errors)}\n\n${user}`, "today's correction text");
		assert.notEqual(once.p.sessions[1]!.callId, once.p.sessions[0]!.callId, 'a new callId');
		assert.ok(report.findings.length > 0);

		// Broken twice: the review fails with today's message, after exactly two sessions.
		const twice = run([broken, broken, templateAnswer()]);
		await assert.rejects(twice.done, new RegExp(`failed checklist ${SPEC_TEMPLATE.id} \\(2 of 2 attempts were invalid answers\\)\\. No review was recorded`));
		assert.equal(twice.p.sessions.length, 2, 'the stage never asks a third time');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
