import { appendReviewRunEvent } from '../../../workflow/code-review/run-events.js';
import { admitControllerTurn, assertControllerAttempt, controllerObservedEvent } from '../../../workflow/review-pipeline/controller.js';
import { claimReviewTransaction } from '../review-transaction.js';
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
import { reviewTiming, reviewFailureCode } from '../../../workflow/review-pipeline/call-events.js';
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
	const head = JSON.parse(readFileSync(state.jsonPath, 'utf8')) as { meta?: Record<string, unknown> | undefined; body: unknown; citations?: unknown | undefined };
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
			completedVerdicts: job.stageAnswers.flatMap(answer => (answer.answer as { verdicts?: readonly RawVerdict[] | undefined }).verdicts ?? []) } : {}),
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
function frameFor(state: Payload, call: ReviewCall, now: number): Extract<ReviewStepOutput, { next: 'emit_claims' | 'emit_findings' | 'emit_verdicts' }> {
	const c = state.controller;
	const common = { state: CONTROLLER_STATE_PLACEHOLDER,
		guidance: `Execute only this assigned request and emit JSON matching schema. Resume phase='${c.phase}' with reply={version:1,generation,callId,answer}, state, and a fresh reviewBudget. Host context is declared/reserved; external model execution is not measured by the daemon.`,
		prompt: { system: 'Execute the complete assigned review request below; preserve its evidence and identifiers.', user: serialiseMessages(call.messages) },
		schema: controllerReplySchema(call, c.generation),
		call: { version: 1 as const, generation: c.generation, callId: call.callId, policyId: controllerPolicyId(c.policy), stage: call.stage, role: call.role, ...(c.assignedClaimIds ? { assignedClaimIds: c.assignedClaimIds } : {}) },
		timing: { ...reviewTiming(c.job!, now), jobBudgetMs: c.budgetMs, deadlineAt: c.deadlineAt, attemptLimitMs: call.execution.mode === 'reviewer-session' ? call.execution.deadlineMs : call.execution.timeoutMs! },
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
	const frame = frameFor(advanced, call, clock(deps)());
	try {
		const lifetime = admitControllerTurn(frame, advanced.controller.policy, declaration, frame.timing?.['attemptLimitMs'] as number, clock(deps)());
		return { state: { ...advanced, controller: { ...advanced.controller, ...lifetime } }, frame };
	} catch (error) {
		// Current design partitions are whole templates/extractions/claims. Never drop source or evidence to fit.
		if (error instanceof ReviewBudgetError && error.code === 'controller-frame-over-budget') throw error;
		throw error;
	}
}
function logFrame(state: Payload, event: 'controller-frame-ready' | 'controller-answer-committed' | 'controller-call-failed', deps: ReviewStepDeps, call?: ReviewCall, error?: unknown): void {
 const c = state.controller, job = c.job;
 const pending = call ?? job?.pending.find(value => value.callId === c.callId);
 if (!job || !pending || !c.frameBudget) return;
 const code = event === 'controller-call-failed' ? reviewFailureCode(error) : undefined;
 const metadata = controllerObservedEvent(job, pending, c, code === 'cancelled' ? 'cancel' : event === 'controller-call-failed' ? 'failure' : event === 'controller-answer-committed' ? 'success' : 'start', clock(deps)(), code);
 (deps.recordCallEvent ?? appendReviewRunEvent)(state.repo, state.runId, metadata);
 log.info(metadata, 'design controller: observed protocol transition');
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
	logFrame(ready.state, 'controller-frame-ready', deps);
	return { ...ready.frame, state: token } as ReviewStepOutput;
}

export async function hasControllerDesignJob(token: string): Promise<boolean> {
	return (await getStepStateStore().read<ReviewStepStatePayload>('review', token))?.payload?.controller?.job !== undefined;
}
export async function resumeControllerDesignReview(input: ReviewStepInputClaims | ReviewStepInputFindings | ReviewStepInputVerdicts, deps: ReviewStepDeps): Promise<ReviewStepOutput> {
	const declaration = controllerPolicy(input.reviewBudget).declaration;
	const reply = requireControllerReply(input.reply);
	const authority = owner();
	const held = await claimReviewTransaction<Payload>('review', input.state, reply);
	if (held.status === 'completed') return { next: 'already_completed', receipt: held.receipt };
	let effects = false;
	try {
		let state = held.payload;
		const c = state.controller;
		if (!c || c.version !== 1 || !c.job || c.frameDeadlineAt === undefined || c.callId !== reply.callId || c.generation !== reply.generation) throw new ReviewBudgetError('review-budget-state-stale');
		controllerPolicy(declaration, c.policy);
		admitControllerFrame({}, c.policy, declaration);
		assertControllerAttempt(c, clock(deps)(), () => { if (c.job!.deadlineAt !== undefined && clock(deps)() >= c.job!.deadlineAt!) throw deadlineError(c.job!, adapterFor(state, deps)); }, () => new ReviewTerminalError('review-attempt-timeout'));
		if (c.phase !== input.phase) throw new ReviewTerminalError('review-terminal-incompatible');
		assertSource(state);
		const adapter = adapterFor(state, deps), now = clock(deps);
		const call = nextCalls(c.job, adapter, now()).find(call => call.callId === reply.callId);
		if (c.phase === 'verdicts') validateVerdictCoverage({ expected: c.expectedClaimIds ?? [], assigned: c.assignedClaimIds ?? [], completed: c.completedVerdicts ?? [], received: (reply.answer as { verdicts?: readonly RawVerdict[] | undefined } | null)?.verdicts, extractionComplete: c.extractionComplete === true, requireComplete: false });
		if (!call || !validateAgainstSchema(controllerReplySchema(call, c.generation), reply).ok) throw new ReviewTerminalError('review-terminal-incompatible');
		if (c.phase === 'findings') {
			const template = reviewTemplateFor(state.templateIntent!);
			const validated = validateTemplateAnswer(template, reply.answer as RawTemplateAnswer);
			if (!validated.ok) {
				await held.release();
				return { next: 'error', error: { code: 'invalid-findings', message: `The answer does not satisfy checklist ${template.id}; nothing was recorded.\n` + validated.errors.join('\n'), retryable: true } };
			}
		} else if (c.phase === 'claims') {
			const claims = (reply.answer as { claims: Claim[] }).claims;
			assertExactReviewIds(claims.map(claim => claim.id), claims.map(claim => claim.id), 'verdict-coverage-invalid');
		}
		let job = applyOutput(c.job, adapter, reply.callId, { callId: reply.callId, answer: reply.answer }, now());
		state = await advance({ ...state, controller: { ...c, job } }, deps);
		job = state.controller.job!;
		if (job.phase !== 'done') {
			state = { ...state, controller: { ...state.controller, generation: held.claim.generation + 1 } };
			const ready = await admit(state, declaration, deps);
			authority.assertActive(); assertSource(ready.state); effects = true;
			const committed = await held.advance(ready.state, ready.state.controller.callId);
			logFrame(held.payload, 'controller-answer-committed', deps, call); logFrame(ready.state, 'controller-frame-ready', deps);
			return { ...ready.frame, state: committed.token } as ReviewStepOutput;
		}
		const assertActive = (): void => { authority.assertActive(); if (deps.signal?.aborted) throw new ReviewStateRefused('review-state-owner-mismatch'); if (job.deadlineAt !== undefined && now() >= job.deadlineAt) throw deadlineError(job, adapterFor(state, deps)); };
		const guard: ReviewTerminalGuard = { assertActive, assertSource: () => assertSource(state), beginSideEffects: () => { assertActive(); assertSource(state); effects = true; }, admitCompletion: frame => { admitControllerFrame(frame, c.policy, declaration); } };
		assertActive(); assertSource(state);
		let done: ReviewStepOutput;
		const lifecycle = deps.lifecycleFor ?? (repo => lifecycleFor(repo).service);
		if (state.templateIntent !== undefined) {
			const answer = (job.outputs['template'] as readonly StageAnswer[])[0];
   if (!answer) throw new ReviewTerminalError('review-terminal-incompatible');
			const raw = answer.answer as RawTemplateAnswer;
			done = await persistTemplateFindings(state, raw, lifecycle, guard);
		} else {
			const verdicts = ((job.outputs['verify'] ?? []) as readonly StageAnswer[]).flatMap(answer => (answer.answer as { verdicts: readonly RawVerdict[] }).verdicts);
			const expected = state.claims?.map(claim => claim.id) ?? [];
			validateVerdictCoverage({ expected, assigned: expected, completed: [], received: verdicts, extractionComplete: job.outputs['extract'] !== undefined });
			state = { ...state, controller: { ...state.controller, assignedClaimIds: expected, completedVerdicts: [], extractionComplete: true } };
			done = await persistPremiseVerdicts(state, { verdicts }, lifecycle, guard);
		}
		if (done.next !== 'done') { if (!effects) { await held.release(); return done; } throw new ReviewTerminalError('review-terminal-incompatible'); }
		assertActive(); effects = true;
		await held.complete({ status: 'completed', callId: reply.callId, artifactId: basename(state.jsonPath, '.json'), runId: state.runId });
		logFrame(held.payload, 'controller-answer-committed', deps, call);
		return done;
	} catch (error) {
		const terminal = error instanceof SamePartyReviewError || (error as { timeoutKind?: unknown | undefined } | null)?.timeoutKind === 'review-job' || (error instanceof ReviewTerminalError && ['review-job-timeout', 'review-source-changed', 'review-attempt-timeout'].includes(error.code));
		if (effects || terminal) logFrame(held.payload, 'controller-call-failed', deps, undefined, error);
		await held.fail(error, effects, terminal);
		throw error;
	}
}
