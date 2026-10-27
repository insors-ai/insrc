import { claimReviewTransaction } from '../review-transaction.js';
import { validateFinding } from '../../../workflow/code-review/controller-validation.js';
import { getLogger } from '../../../shared/logger.js';
import { reviewCallEvent, reviewTiming, reviewFailureCode } from '../../../workflow/review-pipeline/call-events.js';
import { randomUUID } from 'node:crypto';
import type { ReviewBudgetPolicy, ReviewControllerBudgetDeclaration, ReviewBudgetBreakdown } from '../../../shared/review-budget.js';
import { currentStepContext } from '../../../shared/step-context.js';
import { requireReviewOwnerContext } from '../../../shared/review-owner-context.js';
import { ReviewBudgetError } from '../../../workflow/review-pipeline/budget.js';
import { admitControllerFrame, controllerPolicy, controllerPolicyId, controllerReplySchema, CONTROLLER_STATE_PLACEHOLDER, requireControllerReply } from '../../../workflow/review-pipeline/controller.js';
import type { ControllerReviewProtocol, ControllerReviewReply } from '../../../workflow/review-pipeline/controller.js';
import { createReviewJob, nextCalls, applyOutput, applyFailure, runStage, result, pipelineCallsOf, deadlineError } from '../../../workflow/review-pipeline/job.js';
import type { ReviewAdapter, ReviewPipelineJob } from '../../../workflow/review-pipeline/types.js';
import { codeReviewSnapshot, modelDimensionAdapter, deterministicDimensionAdapter } from '../../../workflow/review-pipeline/code-review.js';
import type { ModelDimensionSpec } from '../../../workflow/review-pipeline/code-review.js';
import { adherenceSpec } from '../../../workflow/code-review/dimensions/adherence.js';
import { conventionsSpec } from '../../../workflow/code-review/dimensions/conventions.js';
import { coverageSpec } from '../../../workflow/code-review/dimensions/coverage.js';
import { qualitySpec } from '../../../workflow/code-review/dimensions/quality.js';
import { functionalCoverageSpec } from '../../../workflow/code-review/dimensions/functional-coverage.js';
import { diagramSpec } from '../../../workflow/code-review/dimensions/diagram/index.js';
import { uxSpec } from '../../../workflow/code-review/dimensions/ux/index.js';
import { computeExpectedDimensions } from '../../../workflow/code-review/expected-dimensions.js';
import type { CodeReviewSubject, DimensionResult, ReviewDimension } from '../../../workflow/code-review/types.js';
import { roundWriterFor } from '../../lifecycle-registry.js';
import { getStepStateStore } from '../../threads/step-state.js';
import { ReviewStateRefused } from '../../threads/review-state-contract.js';
import type { ReviewStateClaim } from '../../threads/review-state-contract.js';
import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import type { CodeReviewStepDeps } from './handler.js';
import type { CodeReviewStepInputStart, CodeReviewStepInputJudgements, CodeReviewStepStatePayload, CodeReviewStepOutput } from './types.js';
import { LEDGER_EXCLUDE_GLOBS } from '../../../workflow/runners/build/changed-files.js';
import { DiffUnavailableError } from '../../../workflow/code-review/grounding.js';
import { resolveStoryRangeBase } from '../../../workflow/runners/build/range-base.js';

export class ControllerCodeReviewError extends Error {
	constructor(readonly code: string) { super(code); this.name = 'ControllerCodeReviewError'; }
}
const log = getLogger('review-controller');
export interface ControllerCodeReviewState extends ControllerReviewProtocol {
	readonly frameBudget?: ReviewBudgetBreakdown | undefined;
	readonly frameAttemptMs?: number | undefined;
	readonly frameStartedAt?: number | undefined;
	readonly frameDeadlineAt?: number | undefined;
	readonly executionStartedAt?: number | undefined;
	readonly phase: 'confirm_wait' | 'review';
	readonly dimensions: readonly ReviewDimension[];
	readonly results: readonly DimensionResult[];
	readonly completedBudgetMs: number;
	readonly job?: ReviewPipelineJob | undefined;
}
type Payload = CodeReviewStepStatePayload & { readonly controller: ControllerCodeReviewState };
type Finalize = (payload: CodeReviewStepStatePayload, results: readonly DimensionResult[], deps: CodeReviewStepDeps) => Promise<CodeReviewStepOutput>;

function owner() { return requireReviewOwnerContext(currentStepContext()?.reviewOwner); }
function adapterFor(payload: Payload, dimension: ReviewDimension): ReviewAdapter<unknown> {
	const snapshot = payload.controller.job?.snapshot ?? codeReviewSnapshot(payload.subject, payload.grounding!, payload.groundingMode ?? 'full');
	const policy = payload.controller.policy;
	const model = <O>(spec: ModelDimensionSpec<O>) => modelDimensionAdapter(spec, payload.subject, snapshot, policy.totalTokens * 3, 'controller', policy) as unknown as ReviewAdapter<unknown>;
	switch (dimension) {
		case 'adherence': return model(adherenceSpec(payload.subject));
		case 'conventions': return model(conventionsSpec(payload.subject));
		case 'coverage': return model(coverageSpec(payload.subject));
		case 'quality': return model(qualitySpec(payload.subject));
		case 'functional-coverage': return model(functionalCoverageSpec(payload.subject));
		case 'diagram': return deterministicDimensionAdapter(diagramSpec(payload.subject), payload.subject, snapshot) as unknown as ReviewAdapter<unknown>;
		case 'ux': return deterministicDimensionAdapter(uxSpec(payload.subject), payload.subject, snapshot) as unknown as ReviewAdapter<unknown>;
	}
}

async function advance(payload: Payload, deps: CodeReviewStepDeps): Promise<Payload> {
	let state = payload;
	while (state.controller.results.length < state.controller.dimensions.length) {
		owner().assertActive();
		const c = state.controller;
		const dimension = c.dimensions[c.results.length]!;
		const adapter = adapterFor(state, dimension);
		let job = c.job ?? createReviewJob(adapter, 'controller', codeReviewSnapshot(state.subject, state.grounding!, state.groundingMode ?? 'full'), c.policy.totalTokens * 3, { budgetPolicy: c.policy, now: c.executionStartedAt ?? deps.now() });
		const epoch = c.executionStartedAt ?? job.executionStartedAt;
		const timeline = (value: ReviewPipelineJob): ReviewPipelineJob => epoch === undefined ? value : { ...value, executionStartedAt: epoch, priorWorkBudgetMs: c.completedBudgetMs, deadlineBudgetMs: c.completedBudgetMs + value.workUnits.filter(unit => !unit.replaced).length * 600000, deadlineAt: epoch + c.completedBudgetMs + value.workUnits.filter(unit => !unit.replaced).length * 600000 };
		job = timeline(job);
		while (job.phase !== 'done' && nextCalls(job, adapter, deps.now()).length === 0) job = timeline(await runStage(job, adapter, { signal: deps.signal, now: deps.now }));
		if (job.phase !== 'done') return { ...state, controller: { ...c, executionStartedAt: epoch, job, callId: job.pending[0]!.callId } };
		const answer = result<DimensionResult>(job);
		const counts = pipelineCallsOf(job);
		state = { ...state, controller: { ...c, job: c.results.length + 1 === c.dimensions.length ? job : undefined, results: [...c.results, { ...answer, ...(counts ? { pipelineCalls: counts } : {}) }], executionStartedAt: epoch, completedBudgetMs: job.deadlineBudgetMs ?? c.completedBudgetMs } };
	}
	return state;
}

function emitted(payload: Payload, now: number, stale?: { staleFiles: readonly string[]; isProcessing: boolean }): CodeReviewStepOutput {
	const c = payload.controller;
	const protocol = { version: 1 as const, generation: c.generation, callId: c.callId, policyId: controllerPolicyId(c.policy), qualification: 'controller-reserved' as const };
	if (c.phase === 'confirm_wait') return {
		next: 'confirm_wait', guidance: "Choose whether to wait for indexing. Resume phase='start' with state, a fresh reviewBudget, and reply={version:1,generation,callId,answer:{proceed:true|false}}.",
		staleFiles: stale?.staleFiles ?? [], isProcessing: stale?.isProcessing ?? false, state: CONTROLLER_STATE_PLACEHOLDER,
		call: protocol, timing: { kind: 'review-freshness' },
	};
	const call = nextCalls(c.job!, adapterFor(payload, c.dimensions[c.results.length]!), now)[0]!;
	return {
		next: 'emit_judgements', guidance: "Execute this one assigned review request. Emit JSON matching schema, then call phase='judgements' with reply=<that JSON>, state, and a fresh reviewBudget declaration. Host history is caller-declared/reserved; it is not measured by the daemon.",
		prompts: [[...call.messages]], schema: controllerReplySchema(call, c.generation), state: CONTROLLER_STATE_PLACEHOLDER,
		call: { ...protocol, dimension: c.dimensions[c.results.length]!, stage: call.stage, role: call.role },
		timing: { ...reviewTiming(c.job!, now), attemptLimitMs: call.execution.mode === 'reviewer-session' ? call.execution.deadlineMs : call.execution.timeoutMs!, jobBudgetMs: c.job!.deadlineBudgetMs ?? 0, deadlineAt: c.job!.deadlineAt!, storyBudgetMs: c.job!.deadlineBudgetMs ?? 0 },
	};
}

async function admitted(payload: Payload, declaration: ReviewControllerBudgetDeclaration, deps: CodeReviewStepDeps): Promise<{ payload: Payload; frame: CodeReviewStepOutput }> {
	// Refuse a reserve-only overflow before attempting evidence repartitioning.
	admitControllerFrame({}, payload.controller.policy, declaration);
	let state = await advance(payload, deps);
	for (;;) {
		const frame = emitted(state, deps.now());
		try {
			const frameBudget = admitControllerFrame(frame, state.controller.policy, declaration);
			return { payload: { ...state, controller: { ...state.controller, frameBudget, frameAttemptMs: frame.next === 'emit_judgements' && typeof frame.timing?.['attemptLimitMs'] === 'number' ? frame.timing['attemptLimitMs'] : undefined, frameStartedAt: deps.now(), frameDeadlineAt: frame.next === 'emit_judgements' && typeof frame.timing?.['attemptLimitMs'] === 'number' ? deps.now() + frame.timing['attemptLimitMs'] : undefined } }, frame };
		}
		catch (error) {
			if (!(error instanceof ReviewBudgetError) || error.code !== 'controller-frame-over-budget') throw error;
			const c = state.controller;
			const adapter = adapterFor(state, c.dimensions[c.results.length]!);
			const call = nextCalls(c.job!, adapter, deps.now())[0]!;
			const job = applyFailure(c.job!, adapter, call.callId, 'size-refusal', Math.max(1, Math.floor(call.chars * 0.75)), { now: deps.now() });
			state = await advance({ ...state, controller: { ...c, job } }, deps);
		}
	}
}

function logReady(payload: Payload): void {
	const c = payload.controller;
	if (!c.job || !c.frameBudget) return;
	const pending = c.job.pending.find(value => value.callId === c.callId);
	const call = pending && c.frameAttemptMs !== undefined ? { ...pending, execution: pending.execution.mode === 'reviewer-session' ? { ...pending.execution, deadlineMs: c.frameAttemptMs } : { ...pending.execution, timeoutMs: c.frameAttemptMs } } : pending;
	if (!call) return;
	log.info({ ...reviewCallEvent(c.job, call, c.frameBudget, 'start', 0), event: 'controller-frame-ready' }, 'controller review: admitted response ready; external execution is unobserved');
}
function logCommitted(payload: Payload, reply: ControllerReviewReply): void {
	const c = payload.controller;
	const pending = c.job?.pending.find(value => value.callId === reply.callId);
	const call = pending && c.frameAttemptMs !== undefined ? { ...pending, execution: pending.execution.mode === 'reviewer-session' ? { ...pending.execution, deadlineMs: c.frameAttemptMs } : { ...pending.execution, timeoutMs: c.frameAttemptMs } } : pending;
	if (!c.job || !call || !c.frameBudget) return;
	log.info({ ...reviewCallEvent(c.job, call, c.frameBudget, 'success', 0), event: 'controller-answer-committed' }, 'controller review: matching answer committed');
}

function logFailed(payload: Payload, error: unknown): void {
	const c = payload.controller, job = c.job;
	const call = job?.pending.find(value => value.callId === c.callId);
	if (!job || !call || !c.frameBudget) return;
	log.info({ ...reviewCallEvent(job, call, c.frameBudget, reviewFailureCode(error) === 'cancelled' ? 'cancel' : 'failure', 0, reviewFailureCode(error)), event: 'controller-call-failed' }, 'controller review: terminal protocol failure; external execution is unobserved');
}

async function ground(payload: Payload, deps: CodeReviewStepDeps, degraded: boolean, reason?: CodeReviewStepStatePayload['fallbackReason']): Promise<Payload> {
	owner().assertActive();
	if (!degraded) {
		const g = await deps.fetchGrounding({ repo: payload.repo, epicHash: payload.epicHash, storyId: payload.storyId });
		if (!g.ok) throw new ControllerCodeReviewError('grounding-unavailable');
		if (g.grounding.symbols.length > 0) return { ...payload, grounding: g.grounding, controller: { ...payload.controller, phase: 'review' } };
		reason = { kind: 'hollow-grounding' };
	}
	const diff = await deps.assembleDiffGrounding(payload.repo, undefined, { base: resolveStoryRangeBase(payload.repo, payload.epicHash, payload.storyId), excludeGlobs: LEDGER_EXCLUDE_GLOBS, storyKey: `${payload.epicHash}/${payload.storyId}` }).catch(error => { if (error instanceof DiffUnavailableError) throw new ControllerCodeReviewError('diff-unavailable'); throw error; });
	if (diff.changedFiles.length === 0) throw new ControllerCodeReviewError('no-subject');
	return { ...payload, subject: { ...payload.subject, changedFiles: diff.changedFiles, changeSetAttribution: diff.changeSetAttribution, sharedWithExcluded: diff.sharedWithExcluded, excludedFromScope: diff.excludedFromScope }, grounding: diff.grounding, groundingMode: 'degraded', ...(reason ? { fallbackReason: reason } : {}), controller: { ...payload.controller, phase: 'review' } };
}

export async function startControllerCodeReview(subject: CodeReviewSubject, declaration: ReviewControllerBudgetDeclaration | undefined, deps: CodeReviewStepDeps, identity: { repo: string; epicHash: string; storyId: string }, route?: { degraded: true; reason: CodeReviewStepStatePayload['fallbackReason'] }): Promise<CodeReviewStepOutput> {
	const { policy, declaration: d } = controllerPolicy(declaration);
	owner().assertActive();
	let payload: Payload = { runId: `cr-${randomUUID()}`, startedAtMs: deps.now(), repo: identity.repo, epicHash: identity.epicHash, storyId: identity.storyId, subject,
		controller: { version: 1, generation: 0, callId: randomUUID(), policy, phase: 'confirm_wait', dimensions: computeExpectedDimensions(subject), results: [], completedBudgetMs: 0 } };
	if (route?.degraded) {
		const next = await admitted(await ground(payload, deps, true, route.reason), d, deps);
		owner().assertActive();
		const token = await getStepStateStore().mintReviewState('code-review', next.payload, next.payload.controller);
		logReady(next.payload);
		return { ...next.frame, state: token } as CodeReviewStepOutput;
	}
	const fresh = await deps.fetchFreshness({ repo: payload.repo, epicHash: payload.epicHash, storyId: payload.storyId, changedFiles: subject.changedFiles });
	if (!fresh.ok) throw new ControllerCodeReviewError('freshness-unavailable');
	let frame: CodeReviewStepOutput;
	if (fresh.isProcessing || fresh.staleFiles.length > 0) { frame = emitted(payload, deps.now(), fresh); admitControllerFrame(frame, policy, d); }
	else { const next = await admitted(await ground(payload, deps, false), d, deps); payload = next.payload; frame = next.frame; }
	owner().assertActive();
	const token = await getStepStateStore().mintReviewState('code-review', payload, payload.controller);
	logReady(payload);
	return { ...frame, state: token } as CodeReviewStepOutput;
}

export async function resumeControllerCodeReview(step: CodeReviewStepInputStart | CodeReviewStepInputJudgements, deps: CodeReviewStepDeps, finalize: Finalize): Promise<CodeReviewStepOutput> {
	const { declaration } = controllerPolicy(step.reviewBudget);
	const reply = requireControllerReply(step.reply);
	const authority = owner();
	const claimed = await claimReviewTransaction<Payload>('code-review', step.state!, reply);
	if (claimed.status === 'completed') return { next: 'already_completed', receipt: claimed.receipt };
	const claim: ReviewStateClaim = claimed.claim;
	let effects = false;
	try {
		let payload = claimed.payload;
		if (payload.controller?.version !== 1 || (payload.controller.phase === 'review' && payload.controller.frameDeadlineAt === undefined)) throw new ReviewBudgetError('review-budget-state-stale');
		controllerPolicy(declaration, payload.controller.policy);
		admitControllerFrame({}, payload.controller.policy, declaration);
		if (payload.controller.phase === 'confirm_wait') {
			if (step.phase !== 'start' || !reply.answer || typeof reply.answer !== 'object' || typeof (reply.answer as { proceed?: unknown }).proceed !== 'boolean') throw new ReviewBudgetError('controller-budget-incompatible');
			const proceed = (reply.answer as { proceed: boolean }).proceed;
			let reason: CodeReviewStepStatePayload['fallbackReason'] = { kind: 'declined' };
			let degraded = !proceed;
			const waitStart = deps.now();
			while (proceed) {
				authority.assertActive();
				const fresh = await deps.fetchFreshness({ repo: payload.repo, epicHash: payload.epicHash, storyId: payload.storyId, changedFiles: payload.subject.changedFiles });
				if (!fresh.ok) throw new ControllerCodeReviewError('freshness-unavailable');
				if (!fresh.isProcessing && fresh.staleFiles.length === 0) break;
				if (deps.now() - waitStart >= deps.freshnessTimeoutMs()) { degraded = true; reason = { kind: 'freshness-timeout', waitedMs: deps.now() - waitStart, inFlight: fresh.inFlight, pendingCodeIndexJobs: fresh.pendingCodeIndexJobs, staleFiles: [...fresh.staleFiles] }; break; }
				await deps.sleep(1500);
			}
			payload = await ground(payload, deps, degraded, degraded ? reason : undefined);
		} else {
			if (step.phase !== 'judgements') throw new ReviewBudgetError('controller-budget-incompatible');
			const c = payload.controller;
			const adapter = adapterFor(payload, c.dimensions[c.results.length]!);
			if (c.frameDeadlineAt !== undefined && deps.now() >= c.frameDeadlineAt) {
				if (c.job!.deadlineAt !== undefined && deps.now() >= c.job!.deadlineAt!) throw deadlineError(c.job!, adapter);
				throw Object.assign(new ControllerCodeReviewError('review-attempt-timeout'), { timeoutKind: 'review-attempt' });
			}
			const call = nextCalls(c.job!, adapter, deps.now()).find(call => call.callId === reply.callId);
			if (!call || !validateAgainstSchema(controllerReplySchema(call, c.generation), reply).ok) throw new ReviewBudgetError('controller-budget-incompatible');
			const findings = (reply.answer as { findings?: unknown[] } | null)?.findings;
			if (Array.isArray(findings) && findings.some(finding => validateFinding(finding, c.dimensions[c.results.length]!) !== null)) throw new ReviewBudgetError('controller-budget-incompatible');
			const job = applyOutput(c.job!, adapter, reply.callId, { callId: reply.callId, answer: reply.answer }, deps.now());
			payload = { ...payload, controller: { ...c, job } };
		}
		payload = await advance(payload, deps);
		if (payload.controller.results.length === payload.controller.dimensions.length) {
			const assertFinalActive = (): void => {
				authority.assertActive();
				if (deps.signal?.aborted) throw new ReviewStateRefused('review-state-owner-mismatch');
				const job = payload.controller.job;
				if (job?.deadlineAt !== undefined && deps.now() >= job.deadlineAt) throw deadlineError(job, adapterFor(payload, job.dimension as ReviewDimension));
			};
			assertFinalActive();
			const guarded: CodeReviewStepDeps = { ...deps,
				admitCompletion: frame => { assertFinalActive(); admitControllerFrame(frame, payload.controller.policy, declaration); },
				write: (path, content) => { assertFinalActive(); effects = true; deps.write(path, content); },
				roundWriterFor: repo => {
					assertFinalActive();
					const through = (deps.roundWriterFor ?? roundWriterFor)(repo);
					return { actor: through.actor, writer: { updateContent: async (...args) => {
						assertFinalActive(); effects = true; const written = await through.writer.updateContent(...args); assertFinalActive(); return written;
					} } };
				},
			};
			const done = await finalize(payload, payload.controller.results, guarded);
			if (done.next === 'error' && done.error.code === 'bad-judgements') {
				// This validator returns before the runner or any persistence begins.
				effects = false; await claimed.release(); return done;
			}
			if (done.next === 'error') {
				if (!effects) { await claimed.release(); return done; }
				await claimed.invalidate();
				return { ...done, error: { ...done.error, retryable: false } };
			}
			if (done.next !== 'done') throw new ControllerCodeReviewError('review-state-uncertain');
			authority.assertActive();
			await claimed.complete({ status: 'completed', callId: reply.callId, artifactId: `CR-${payload.epicHash}-${payload.storyId}`, runId: payload.runId });
			logCommitted(claimed.payload, reply);
			return done;
		}
		payload = { ...payload, controller: { ...payload.controller, generation: claim.generation + 1 } };
		const next = await admitted(payload, declaration, deps);
		authority.assertActive(); effects = true;
		const committed = await claimed.advance(next.payload, next.payload.controller.callId);
		logCommitted(claimed.payload, reply); logReady(next.payload);
		return { ...next.frame, state: committed.token } as CodeReviewStepOutput;
	} catch (error) {
		if (error instanceof ReviewBudgetError && !error.context) error = new ReviewBudgetError(error.code, error.breakdown, { stage: claimed.payload.controller.job?.stage, callId: reply.callId });
		const terminal = ['review-job', 'review-attempt'].includes(String((error as { timeoutKind?: unknown } | null)?.timeoutKind));
		if (effects || terminal) logFailed(claimed.payload, error);
		await claimed.fail(error, effects, terminal);
		throw error;
	}
}
