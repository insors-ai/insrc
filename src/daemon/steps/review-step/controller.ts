import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { getLogger } from '../../../shared/logger.js';
import { currentStepContext } from '../../../shared/step-context.js';
import { requireReviewOwnerContext } from '../../../shared/review-owner-context.js';
import { serialiseMessages } from '../../../agent/providers/cli-wire.js';
import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import { contentHash } from '../../../workflow/artifact-core/lifecycle.js';
import { authorPartyOf, SamePartyReviewError } from '../../../workflow/review/party.js';
import { stripReviewSection } from '../../../workflow/review/persist-review.js';
import { reviewTemplateFor, validateTemplateAnswer } from '../../../workflow/review/template.js';
import type { RawTemplateAnswer } from '../../../workflow/review/template.js';
import type { Claim, Evidence } from '../../../workflow/review/types.js';
import { assertExactReviewIds, validateVerdictCoverage } from '../../../workflow/review/exact-coverage.js';
import { ReviewBudgetError } from '../../../workflow/review-pipeline/budget.js';
import { admitControllerFrame, controllerPolicy, controllerPolicyId, controllerReplySchema, CONTROLLER_STATE_PLACEHOLDER, requireControllerReply } from '../../../workflow/review-pipeline/controller.js';
import { createReviewJob, nextCalls, applyOutput, runStage, deadlineError } from '../../../workflow/review-pipeline/job.js';
import { designReviewSnapshot, premiseAdapter, templateAdapter } from '../../../workflow/review-pipeline/design-review.js';
import { reviewCallEvent } from '../../../workflow/review-pipeline/call-events.js';
import type { ReviewAdapter, ReviewCall, StageAnswer } from '../../../workflow/review-pipeline/types.js';
import type { ReviewControllerBudgetDeclaration } from '../../../shared/review-budget.js';
import { getStepStateStore } from '../../threads/step-state.js';
import { ReviewStateRefused } from '../../threads/review-state-contract.js';
import { lifecycleFor } from '../../lifecycle-registry.js';
import { persistTemplateFindings } from './phases/findings.js';
import { persistPremiseVerdicts } from './phases/verdicts.js';
import { ReviewTerminalError } from './terminal.js';
import type { ReviewTerminalProtocol, ReviewTerminalGuard } from './terminal.js';
import type { ReviewStepDeps, ReviewStepInputClaims, ReviewStepInputFindings, ReviewStepInputVerdicts, ReviewStepOutput, ReviewStepStatePayload, RawVerdict } from './types.js';

type Payload = ReviewStepStatePayload & { readonly controller: ReviewTerminalProtocol };
const log = getLogger('design-review-controller');
const clock = (deps: ReviewStepDeps) => deps.nowMs ?? Date.now;
const owner = () => requireReviewOwnerContext(currentStepContext()?.reviewOwner);

function sourceDigest(state: ReviewStepStatePayload, enforceAuthor = false): string {
	const head = JSON.parse(readFileSync(state.jsonPath, 'utf8')) as { meta?: Record<string, unknown>; body: unknown; citations?: unknown };
	if (enforceAuthor && authorPartyOf(head.meta) === 'controller') throw new SamePartyReviewError('controller', `this ${state.stage} artifact`);
	return contentHash('controller-review-source', { body: { body: head.body, workflow: head.meta?.['workflow'], markdown: stripReviewSection(readFileSync(state.mdPath, 'utf8')) }, citations: head.citations ?? [] });
}
function assertSource(state: Payload): void {
	try { if (state.controller.sourceDigest !== sourceDigest(state, true)) throw new Error(); }
	catch (error) { if (error instanceof SamePartyReviewError) throw error; throw new ReviewTerminalError('review-source-changed'); }
}
function adapterFor(state: Payload, deps: ReviewStepDeps): ReviewAdapter<unknown> {
	const snapshot = state.controller.job?.snapshot ?? designReviewSnapshot(state.markdown);
	return (state.templateIntent === undefined
		? premiseAdapter(snapshot, { stage: state.stage, repo: state.repo, readEntitiesForRepo: deps.readEntitiesForRepo,
			onSourceRootFallback: () => deps.progress?.({ kind: 'review-grounding', mode: 'degraded' }) })
		: templateAdapter(snapshot, { template: reviewTemplateFor(state.templateIntent), stage: state.stage, repo: state.repo,
			limitMs: state.controller.templateLimitMs ?? 600000, timedOut: () => new ReviewTerminalError('review-job-timeout') })) as unknown as ReviewAdapter<unknown>;
}
function syncProtocol(state: Payload): Payload {
	const c = state.controller, job = c.job!;
	const claims = job.snapshot.claims as readonly Claim[] | undefined;
	const evidence = job.snapshot.evidence as readonly Evidence[] | undefined;
	const call = job.pending[0];
	const phase = call?.stage === 'extract' ? 'claims' : state.templateIntent !== undefined ? 'findings' : 'verdicts';
	return { ...state, ...(claims !== undefined ? { claims } : {}), ...(evidence !== undefined ? { evidence } : {}), controller: { ...c,
		phase, callId: call?.callId ?? c.callId, schema: call?.prompt.schema as Record<string, unknown> ?? c.schema,
		deadlineAt: job.deadlineAt ?? c.deadlineAt, budgetMs: job.deadlineBudgetMs ?? c.budgetMs,
		...(state.templateIntent !== undefined ? { expectedItemIds: reviewTemplateFor(state.templateIntent).items.map(item => item.id) } : {}),
		...(claims !== undefined ? { expectedClaimIds: claims.map(claim => claim.id), assignedClaimIds: call?.carries.key !== undefined ? [call.carries.key] : [], extractionComplete: job.outputs['extract'] !== undefined,
			completedVerdicts: job.stageAnswers.flatMap(answer => (answer.answer as { verdicts?: readonly RawVerdict[] }).verdicts ?? []) } : {}),
	} };
}
async function advance(state: Payload, deps: ReviewStepDeps): Promise<Payload> {
	let job = state.controller.job!;
	const now = clock(deps);
	while (job.phase !== 'done') {
		owner().assertActive(); assertSource(state);
		const adapter = adapterFor({ ...state, controller: { ...state.controller, job } }, deps);
		if (nextCalls(job, adapter, now()).length > 0) break;
		deps.progress?.({ kind: 'review-stage', stage: job.stage });
		job = await runStage(job, adapter, { signal: deps.signal, now });
	}
	return syncProtocol({ ...state, controller: { ...state.controller, job } });
}
function frameFor(state: Payload, call: ReviewCall): Extract<ReviewStepOutput, { next: 'emit_claims' | 'emit_findings' | 'emit_verdicts' }> {
	const c = state.controller;
	const common = { state: CONTROLLER_STATE_PLACEHOLDER,
		guidance: `Execute only this assigned request and emit JSON matching schema. Resume phase='${c.phase}' with reply={version:1,generation,callId,answer}, state, and a fresh reviewBudget. Host context is declared/reserved; external model execution is not measured by the daemon.`,
		prompt: { system: 'Execute the complete assigned review request below; preserve its evidence and identifiers.', user: serialiseMessages(call.messages) },
		schema: controllerReplySchema(call, c.generation),
		call: { version: 1 as const, generation: c.generation, callId: call.callId, policyId: controllerPolicyId(c.policy), stage: call.stage, role: call.role, ...(c.assignedClaimIds ? { assignedClaimIds: c.assignedClaimIds } : {}) },
		timing: { kind: 'review-execution', jobBudgetMs: c.budgetMs, deadlineAt: c.deadlineAt, attemptLimitMs: call.execution.mode === 'reviewer-session' ? call.execution.deadlineMs : call.execution.timeoutMs! },
	};
	if (c.phase === 'findings') return { ...common, next: 'emit_findings', stage: state.stage, template: reviewTemplateFor(state.templateIntent!).id };
	if (c.phase === 'claims') return { ...common, next: 'emit_claims', stage: state.stage };
	return { ...common, next: 'emit_verdicts' };
}
async function admit(state: Payload, declaration: ReviewControllerBudgetDeclaration, deps: ReviewStepDeps) {
	admitControllerFrame({}, state.controller.policy, declaration);
	const advanced = await advance(state, deps);
	const call = nextCalls(advanced.controller.job!, adapterFor(advanced, deps), clock(deps)())[0];
	if (!call) throw new ReviewTerminalError('review-terminal-incompatible');
	const frame = frameFor(advanced, call);
	try {
		const frameBudget = admitControllerFrame(frame, advanced.controller.policy, declaration);
		return { state: { ...advanced, controller: { ...advanced.controller, frameBudget, frameAttemptMs: frame.timing?.['attemptLimitMs'] as number } }, frame };
	} catch (error) {
		// Current design partitions are whole templates/extractions/claims. Never drop source or evidence to fit.
		if (error instanceof ReviewBudgetError && error.code === 'review-budget-exceeded') throw new ReviewBudgetError('required-context-over-budget', error.breakdown);
		throw error;
	}
}
function logFrame(state: Payload, event: 'controller-frame-ready' | 'controller-answer-committed', call?: ReviewCall): void {
	const c = state.controller, job = c.job;
	const raw = call ?? job?.pending.find(value => value.callId === c.callId);
	const pending = raw && c.frameAttemptMs !== undefined ? { ...raw, execution: raw.execution.mode === 'reviewer-session' ? { ...raw.execution, deadlineMs: c.frameAttemptMs } : { ...raw.execution, timeoutMs: c.frameAttemptMs } } : raw;
	if (!job || !pending || !c.frameBudget) return;
	log.info({ ...reviewCallEvent(job, pending, c.frameBudget, event === 'controller-answer-committed' ? 'success' : 'start', 0), event }, 'design controller: observed protocol transition; external execution is unobserved');
}

export async function startControllerDesignReview(state: ReviewStepStatePayload, declaration: ReviewControllerBudgetDeclaration | undefined, deps: ReviewStepDeps, templateLimitMs?: number): Promise<ReviewStepOutput> {
	const prepared = controllerPolicy(declaration);
	owner().assertActive();
	const now = clock(deps)();
	let payload: Payload = { ...state, markdown: stripReviewSection(state.markdown), controller: { version: 1, generation: 0, callId: randomUUID(), policy: prepared.policy,
		phase: state.templateIntent !== undefined ? 'findings' : 'claims', schema: {}, deadlineAt: now + 600000, budgetMs: 600000, ...(templateLimitMs !== undefined ? { templateLimitMs } : {}) } };
	payload = { ...payload, controller: { ...payload.controller, sourceDigest: sourceDigest(payload) } };
	const adapter = adapterFor(payload, deps);
	const job = createReviewJob(adapter, 'controller', designReviewSnapshot(payload.markdown), prepared.policy.totalTokens * 3, { budgetPolicy: prepared.policy, now });
	const ready = await admit({ ...payload, controller: { ...payload.controller, job } }, prepared.declaration, deps);
	owner().assertActive(); assertSource(ready.state);
	const token = await getStepStateStore().mintReviewState('review', ready.state, ready.state.controller);
	logFrame(ready.state, 'controller-frame-ready');
	return { ...ready.frame, state: token } as ReviewStepOutput;
}

export async function hasControllerDesignJob(token: string): Promise<boolean> {
	return (await getStepStateStore().read<ReviewStepStatePayload>('review', token))?.payload?.controller?.job !== undefined;
}
export async function resumeControllerDesignReview(input: ReviewStepInputClaims | ReviewStepInputFindings | ReviewStepInputVerdicts, deps: ReviewStepDeps): Promise<ReviewStepOutput> {
	const declaration = controllerPolicy(input.reviewBudget).declaration;
	const reply = requireControllerReply(input.reply);
	const authority = owner(), store = getStepStateStore();
	let held;
	try { held = await store.claimReviewState<Payload>({ kind: 'review', token: input.state, generation: reply.generation, callId: reply.callId, owner: authority.nonce }); }
	catch (error) { if (error instanceof ReviewStateRefused && error.reason === 'review-state-stale') throw new ReviewBudgetError('review-budget-state-stale'); throw error; }
	if (held.status === 'completed') return { next: 'already_completed', receipt: held.receipt };
	let effects = false;
	try {
		let state = held.payload;
		const c = state.controller;
		if (!c || c.version !== 1 || !c.job || c.callId !== reply.callId || c.generation !== reply.generation) throw new ReviewBudgetError('review-budget-state-stale');
		controllerPolicy(declaration, c.policy);
		if (c.phase !== input.phase) throw new ReviewTerminalError('review-terminal-incompatible');
		assertSource(state);
		const adapter = adapterFor(state, deps), now = clock(deps);
		const call = nextCalls(c.job, adapter, now()).find(call => call.callId === reply.callId);
		if (!call || !validateAgainstSchema(controllerReplySchema(call, c.generation), reply).ok) throw new ReviewTerminalError('review-terminal-incompatible');
		if (c.phase === 'findings') {
			const template = reviewTemplateFor(state.templateIntent!);
			const validated = validateTemplateAnswer(template, reply.answer as RawTemplateAnswer);
			if (!validated.ok) {
				await store.releaseReviewClaim(held.claim, true);
				return { next: 'error', error: { code: 'invalid-findings', message: `The answer does not satisfy checklist ${template.id}; nothing was recorded.\n` + validated.errors.join('\n'), retryable: true } };
			}
		} else if (c.phase === 'claims') {
			const claims = (reply.answer as { claims: Claim[] }).claims;
			assertExactReviewIds(claims.map(claim => claim.id), claims.map(claim => claim.id), 'review-verdict-set-mismatch');
		} else {
			validateVerdictCoverage({ expected: c.expectedClaimIds ?? [], assigned: c.assignedClaimIds ?? [], completed: c.completedVerdicts ?? [], received: (reply.answer as { verdicts?: readonly RawVerdict[] }).verdicts,
				extractionComplete: c.extractionComplete === true, requireComplete: false });
		}
		let job = applyOutput(c.job, adapter, reply.callId, { callId: reply.callId, answer: reply.answer }, now());
		state = await advance({ ...state, controller: { ...c, job } }, deps);
		job = state.controller.job!;
		if (job.phase !== 'done') {
			state = { ...state, controller: { ...state.controller, generation: held.claim.generation + 1 } };
			const ready = await admit(state, declaration, deps);
			authority.assertActive(); assertSource(ready.state); effects = true;
			const committed = await store.commitReviewState(held.claim, { status: 'pending', payload: ready.state, callId: ready.state.controller.callId });
			logFrame(held.payload, 'controller-answer-committed', call); logFrame(ready.state, 'controller-frame-ready');
			return { ...ready.frame, state: committed.token } as ReviewStepOutput;
		}
		const assertActive = (): void => { authority.assertActive(); if (deps.signal?.aborted) throw new ReviewStateRefused('review-state-owner-mismatch'); if (job.deadlineAt !== undefined && now() >= job.deadlineAt) throw deadlineError(job, adapterFor(state, deps)); };
		const guard: ReviewTerminalGuard = { assertActive, beginSideEffects: () => { assertActive(); assertSource(state); effects = true; } };
		assertActive(); assertSource(state);
		let done: ReviewStepOutput;
		const lifecycle = deps.lifecycleFor ?? (repo => lifecycleFor(repo).service);
		if (state.templateIntent !== undefined) {
			const raw = (job.outputs['template'] as readonly StageAnswer[])[0]!.answer as RawTemplateAnswer;
			done = await persistTemplateFindings(state, raw, lifecycle, guard);
		} else {
			const verdicts = ((job.outputs['verify'] ?? []) as readonly StageAnswer[]).flatMap(answer => (answer.answer as { verdicts: readonly RawVerdict[] }).verdicts);
			const expected = state.claims?.map(claim => claim.id) ?? [];
			validateVerdictCoverage({ expected, assigned: expected, completed: [], received: verdicts, extractionComplete: job.outputs['extract'] !== undefined });
			state = { ...state, controller: { ...state.controller, assignedClaimIds: expected, completedVerdicts: [], extractionComplete: true } };
			done = await persistPremiseVerdicts(state, { verdicts }, lifecycle, guard);
		}
		if (done.next !== 'done') { if (!effects) { await store.releaseReviewClaim(held.claim, true); return done; } throw new ReviewTerminalError('review-terminal-incompatible'); }
		assertActive(); effects = true;
		await store.commitReviewState(held.claim, { status: 'completed', receipt: { status: 'completed', callId: reply.callId, artifactId: basename(state.jsonPath, '.json'), runId: state.runId } });
		logFrame(held.payload, 'controller-answer-committed', call);
		return done;
	} catch (error) {
		try {
			const terminal = error instanceof SamePartyReviewError || (error as { timeoutKind?: unknown } | null)?.timeoutKind === 'review-job' || (error instanceof ReviewTerminalError && (error.code === 'review-job-timeout' || error.code === 'review-source-changed'));
			if (effects || terminal) await store.invalidateReviewClaim(held.claim); else await store.releaseReviewClaim(held.claim, true);
		} catch { /* Owner loss/ambiguous completion is already fenced. */ }
		throw error;
	}
}
