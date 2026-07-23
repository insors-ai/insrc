/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon-side workflow runner — drives a workflow (define / design.epic /
 * design.story / plan / stub) autonomously through the `LLMProvider`
 * abstraction, with NO MCP client in the loop. It fuses the four MCP
 * `insrc_workflow_step` phases (start / plan / step / synthesize) into one
 * server-side loop: each turn the client used to emit by hand is generated
 * via `provider.completeStructured(prompt, schema)`, and the produced
 * artifact is stamped `meta.model = '<provider-id>'` (vs `'client'`).
 *
 * Provider selection follows the analyze framework's `buildShaperProvider`:
 * an explicit `models.analyze.shaperProvider` in config wins; otherwise the
 * invoking MCP agent (`params.client`) decides the CLI provider
 * (Claude Code → claude, Codex → codex); Ollama is the config default. So
 * the runner is provider-agnostic — local Ollama or a cloud CLI, per config.
 *
 * The two analyze-dependent steps (`scope.assess`, `context.assemble`)
 * assume a tool-calling driver; a raw `completeStructured` can't call tools,
 * so the runner pre-runs the server-side `buildRun` (graph-grounded analyze)
 * and injects its bundle as authoritative context — the model still emits
 * the step JSON, but grounded on real paths (no hallucinated citations).
 */

import { getLogger } from '../shared/logger.js';
import type { IpcStreamMessage, LLMMessage, LLMProvider, StageProgressEvent, StructuredCompletionOpts, TokenProgressEvent } from '../shared/types.js';
import type { ClassifiedIntent } from '../shared/analyze-types.js';
import type { AnalyzeContextBundle } from '../analyze/context/types.js';
import { buildShaperProvider, resolveShaperKind, runWithClientProviderContext } from '../analyze/context/shaper-provider.js';
import { loadAnalyzeConfig, resolveRepoShaperProvider, type AnalyzeConfig, type AnalyzeShaperProviderKind } from '../config/analyze.js';
import { registerWorkflowRunners } from '../workflow/index.js';
import { prepareDecompose, prepareSynthesize, finalizeArtifact, type FinalizedArtifact } from '../workflow/orchestrator.js';
import { startRun, resumeRun } from '../workflow/executor.js';
import type { BoundaryFinding } from '../workflow/synthesizer.js';
import { appendProgressLog, appendRunLog, pathsForWorkflow, writeAtomic } from '../workflow/storage.js';
import { reviewArtifactFile } from '../workflow/review/index.js';
import type { ReviewReport } from '../workflow/review/types.js';
import { WORKFLOW_NAMES, type WorkflowIntent, type WorkflowName, type WorkflowPlan } from '../workflow/types.js';
import { augmentStandaloneParams, epicKeyFor } from '../mcp/workflow-step/phases/start.js';
import { buildRun } from './analyze-rpc.js';

const log = getLogger('daemon:workflow-rpc');

/** Steps whose prompts instruct the driver to call `insrc_analyze_step`.
 *  The runner pre-runs server-side analyze for these and injects the bundle. */
const ANALYZE_STEP_RUNNERS: ReadonlySet<string> = new Set(['scope.assess', 'context.assemble']);

/** CLI-provider subprocess timeout for workflow turns. A full-artifact
 *  synthesize can run many minutes — an XL Story LLD (full HLD + every step
 *  output in the prompt) has been observed near ten; the CLI default (120 s)
 *  SIGKILLs it, and even 600 s clipped the largest ones. */
const WORKFLOW_CLI_TIMEOUT_MS = 900_000;

// ---------------------------------------------------------------------------
// Pure driver
// ---------------------------------------------------------------------------

/** Incremental progress event. `phase` is one of: `decompose`, `plan-ready`,
 *  `grounding` (running analyze for a step), `step-start`, `step-done`,
 *  `synthesize-attempt`, `synthesize-retry`, `correction-round`, `done`. */
export interface WorkflowProgress {
	readonly phase:    string;
	readonly stepId?:  string | undefined;
	readonly runner?:  string | undefined;
	readonly attempt?: number | undefined;
	readonly detail?:  string | undefined;
}

export interface RunWorkflowOpts {
	readonly runId:            string;
	readonly epicKey:          string;
	/** Stamped into `meta.model`, e.g. `ollama:qwen3…` / `claude` / `codex`. */
	readonly modelLabel:       string;
	readonly signal?:          AbortSignal | undefined;
	readonly onProgress?:      ((f: WorkflowProgress) => void) | undefined;
	/** Token-level deltas (Ollama streams; CLI providers don't). `stepId` is
	 *  the emitting step, or `'plan'` / `'synthesize'`. */
	readonly onToken?:         ((stepId: string, token: string) => void) | undefined;
	readonly maxSynthAttempts?: number | undefined;
	/** Max SURGICAL correction rounds for a correctable scope-boundary hard-fail
	 *  (e.g. s8 flagging an invented reference). Each round re-emits the artifact
	 *  against a targeted "fix ONLY the flagged reference" directive and re-audits
	 *  the corrected content — never re-running the design steps. DEFAULT 3.
	 *  Set 0 to reproduce the historical terminate-on-first-boundary-fail. */
	readonly maxCorrectionRounds?: number | undefined;
	/** Auto-run the grounded review cycle at finalize. DEFAULT FALSE — review
	 *  is a CONTROLLER task (independent 2nd eyes via insrc_review_step), not a
	 *  daemon self-review, since a daemon-side review runs the SAME provider
	 *  that authored the artifact. Set true only for fully-autonomous runs with
	 *  no controller in the loop. */
	readonly review?:          boolean | undefined;
}

export interface RunWorkflowResult {
	readonly path:     string;
	readonly artifact: unknown;
	readonly runId:    string;
	/** The finalize review result, when review ran and succeeded. Its
	 *  `verdict` is what a subsequent `approve` enforces. */
	readonly review?:  ReviewReport | undefined;
}

/** Drive one workflow to a persisted artifact via `provider`. Throws on a
 *  step error, an exhausted synthesize retry, or abort. */
export async function runWorkflowServerSide(
	intent:   WorkflowIntent,
	provider: LLMProvider,
	opts:     RunWorkflowOpts,
): Promise<RunWorkflowResult> {
	registerWorkflowRunners();   // idempotent — the daemon never registers them otherwise
	if (!provider.capabilities.structuredOutput) {
		throw new Error(`workflow.run: provider '${opts.modelLabel}' does not support structured output`);
	}
	const { runId, epicKey, signal } = opts;
	const startedAtMs = Date.now();
	/** Per-turn opts — token deltas tagged with the emitting step id. */
	const sco = (streamId: string): StructuredCompletionOpts => ({
		signal,
		...(opts.onToken !== undefined ? { onToken: (t: string) => opts.onToken!(streamId, t) } : {}),
	});
	const checkAbort = (): void => { if (signal?.aborted) throw new Error('workflow.run: aborted'); };

	// 1. Decompose → the workflow plan.
	const decomp = prepareDecompose(intent);
	opts.onProgress?.({ phase: 'decompose' });
	const plan = await provider.completeStructured<WorkflowPlan>(msgs(decomp.systemPrompt, decomp.userTurn), decomp.schema, sco('plan'));
	opts.onProgress?.({ phase: 'plan-ready' });

	// 2. Execute — drive each llm-pause through the provider; skipped steps
	//    auto-advance inside the executor (no provider call).
	let tick = await startRun(intent, plan, runId, epicKey);
	while (tick.type === 'paused') {
		checkAbort();
		const pause = tick.state.pause;
		if (pause === undefined) throw new Error('workflow.run: paused tick carried no pause');
		let userTurn = pause.userTurn;
		if (ANALYZE_STEP_RUNNERS.has(pause.runner)) {
			opts.onProgress?.({ phase: 'grounding', stepId: pause.stepId, runner: pause.runner });
			const res = await buildRun({ runId, intent: classifiedIntent(intent) });
			if (!res.ok) {
				throw new Error(`workflow.run: analyze grounding failed for step '${pause.runner}': ${res.error.message}`);
			}
			userTurn += '\n\nReal analyze context (graph-grounded — base every `analyzeBundles[]` entry on this; ' +
				'cite ONLY paths that appear here; invent nothing):\n' + flattenBundle(res.bundle);
		}
		opts.onProgress?.({ phase: 'step-start', stepId: pause.stepId, runner: pause.runner });
		const stepJson = await provider.completeStructured<Record<string, unknown>>(msgs(pause.prompt, userTurn), pause.schema, sco(pause.stepId));
		tick = await resumeRun(tick.state, stepJson, epicKey);
		opts.onProgress?.({ phase: 'step-done', stepId: pause.stepId, runner: pause.runner });
	}
	if (tick.type === 'error') {
		throw new Error(`workflow.run: step '${tick.stepId}' failed (${tick.code}): ${tick.message}`);
	}
	const stepOutputs = tick.stepOutputs;

	// 3. Synthesize with a validation-feedback retry loop (mirrors the MCP
	//    retryable-failure contract + withStructuredRetry).
	const synth = prepareSynthesize(intent, stepOutputs);
	// 4 attempts: a long artifact commonly needs one citation-grounding retry
	// AND may need one shape retry, leaving a genuine final attempt.
	const maxAttempts = opts.maxSynthAttempts ?? 4;
	const maxCorrectionRounds = opts.maxCorrectionRounds ?? 3;
	const auditStepId = intent.workflow === 'define' ? 's4' : 's8';
	let feedback = '';
	let finalized: FinalizedArtifact | undefined;
	// The audit step output (sN) may be replaced by a fresh re-audit verdict
	// during a correction round; finalize reads it, so keep a live copy.
	let liveStepOutputs: Readonly<Record<string, unknown>> = stepOutputs;
	synthLoop:
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		checkAbort();
		opts.onProgress?.({ phase: 'synthesize-attempt', attempt });
		const artifactJson = await provider.completeStructured<Record<string, unknown>>(
			msgs(synth.systemPrompt, synth.userTurn + feedback), synth.schema, sco('synthesize'),
		);
		const result = finalizeArtifact(intent, liveStepOutputs, runId, Date.now() - startedAtMs, artifactJson, opts.modelLabel);
		if (result.ok) { finalized = result.finalized; break; }
		const failure = result.failure;

		// A CORRECTABLE scope-boundary hard-fail (e.g. s8 sbdry4 = an invented
		// reference): run a bounded SURGICAL correction loop rather than
		// discarding the whole run. Each round re-emits the artifact against a
		// targeted "fix ONLY the flagged reference, change nothing else"
		// directive, re-audits the CORRECTED content (the frozen audit verdict
		// described the pre-correction body), swaps the fresh verdict into the
		// audit step output, and re-finalizes. The design steps are never
		// re-run — no workflow / no scope re-run.
		if (!failure.ok && failure.kind === 'boundary' && failure.correctable === true
			&& failure.findings !== undefined && failure.findings.length > 0 && maxCorrectionRounds > 0) {
			let findings: readonly BoundaryFinding[] = failure.findings;
			for (let round = 1; round <= maxCorrectionRounds; round += 1) {
				checkAbort();
				opts.onProgress?.({ phase: 'correction-round', attempt: round, detail: findings.map(f => f.itemId).join(', ') });
				const corrected = await provider.completeStructured<Record<string, unknown>>(
					msgs(synth.systemPrompt, synth.userTurn + correctionDirective(findings)), synth.schema, sco('synthesize'),
				);
				const freshAudit = await reAuditBoundary(provider, corrected, findings, sco('re-audit'));
				liveStepOutputs = { ...liveStepOutputs, [auditStepId]: freshAudit };
				const r2 = finalizeArtifact(intent, liveStepOutputs, runId, Date.now() - startedAtMs, corrected, opts.modelLabel);
				if (r2.ok) { finalized = r2.finalized; break synthLoop; }
				const f2 = r2.failure;
				if (!f2.ok && f2.kind === 'boundary' && f2.correctable === true
					&& f2.findings !== undefined && f2.findings.length > 0) {
					findings = f2.findings;   // residual / shifted findings → next round
					continue;
				}
				// The correction cleared the boundary but tripped a different,
				// non-correctable failure — surface it rather than loop blindly.
				throw new Error(`workflow.run: correction produced a non-correctable failure: ${formatFailure(f2)}`);
			}
			if (finalized !== undefined) break;
			throw new Error(
				`workflow.run: could not correct scope-boundary findings after ${maxCorrectionRounds} rounds: ` +
				findings.map(f => `${f.itemId} (${f.detail})`).join('; '),
			);
		}

		// A non-retryable, non-correctable failure derives from a fixed step
		// output a plain re-emit cannot change — surface it (historical
		// behavior; also the maxCorrectionRounds=0 path).
		if (!failure.ok && failure.retryable === false) {
			throw new Error(`workflow.run: synthesize failed (non-retryable — fix the upstream step): ${formatFailure(failure)}`);
		}
		if (attempt === maxAttempts) {
			throw new Error(`workflow.run: synthesize rejected after ${maxAttempts} attempts: ${formatFailure(failure)}`);
		}
		opts.onProgress?.({ phase: 'synthesize-retry', attempt, detail: formatFailure(failure) });
		feedback = `\n\nYour previous artifact was REJECTED: ${formatFailure(failure)}\nFix exactly that and re-emit valid JSON.`;
	}
	if (finalized === undefined) throw new Error('workflow.run: synthesize produced no artifact');

	// 4. Persist (paths from the finalized meta, shared router).
	const meta = (finalized.artifact as { meta?: { epicHash?: string; epicSlug?: string; storyId?: string } }).meta ?? {};
	const storyIdParam = typeof intent.params['storyId'] === 'string' ? intent.params['storyId'] as string : undefined;
	const paths = pathsForWorkflow({
		workflow: intent.workflow, repoPath: intent.repoPath, epicKey, runId,
		epicHash: meta.epicHash, epicSlug: meta.epicSlug, storyId: meta.storyId, storyIdParam,
	});
	writeAtomic(paths.md,   finalized.renderedMd);
	writeAtomic(paths.json, finalized.renderedJson);
	appendRunLog(epicKey, intent.workflow, runId, {
		ts: new Date().toISOString(), event: 'artifact-written', md: paths.md, json: paths.json, model: opts.modelLabel,
	});
	log.info({ workflow: intent.workflow, runId, model: opts.modelLabel, path: paths.md }, 'workflow.run: artifact written');

	// 5. Review at finalize — OPT-IN (default off; enable with `review:true`).
	//    Review is a CONTROLLER task (insrc_review_step, independent 2nd eyes):
	//    a daemon-side review here would run the SAME provider that authored the
	//    artifact — self-review, not independent. This path stays only for
	//    fully-autonomous runs with no controller in the loop. When it runs it
	//    stamps `meta.review` (whose block verdict `approve` enforces); a review
	//    failure is non-fatal since the artifact is already persisted.
	let review: ReviewReport | undefined;
	if (opts.review === true) {
		checkAbort();
		opts.onProgress?.({ phase: 'review' });
		try {
			const res = await reviewArtifactFile({
				mdPath: paths.md, jsonPath: paths.json, repo: intent.repoPath,
				provider, model: opts.modelLabel, reviewedAt: new Date().toISOString(),
				onProgress: (m) => opts.onProgress?.({ phase: 'review', detail: m }),
				...(opts.signal !== undefined ? { signal: opts.signal } : {}),
			});
			review = res.report;
			const c = res.report.counts;
			opts.onProgress?.({ phase: 'review-done', detail: `${res.report.verdict} · HIGH=${c.high} MED=${c.med} LOW=${c.low}` });
		} catch (err) {
			log.warn(
				{ runId, err: err instanceof Error ? err.message : String(err) },
				'workflow.run: review failed; artifact persisted without meta.review',
			);
		}
	}

	opts.onProgress?.({ phase: 'done' });
	return { path: paths.md, artifact: finalized.artifact, runId, ...(review !== undefined ? { review } : {}) };
}

// ---------------------------------------------------------------------------
// Streaming IPC handler
// ---------------------------------------------------------------------------

interface WorkflowRunParams {
	readonly repo?:     string;
	readonly workflow:  WorkflowName;
	readonly focus:     string;
	readonly params?:   Record<string, unknown>;
	/** Invoking MCP agent, so a config with no explicit shaperProvider falls
	 *  back to that CLI (claude/codex) instead of Ollama. */
	readonly client?:   'claude' | 'codex';
	/** Opt out of the finalize review cycle for this run (default: review runs). */
	readonly review?:   boolean;
}

/** Everything the streaming handler AND the async run registry need to drive a
 *  workflow: the resolved intent + run identity, the built provider, and the
 *  client-context selector. Produced once by `prepareWorkflowRun` so the two
 *  entry points share identical provider-build + timeout + client-context logic. */
export interface PreparedWorkflowRun {
	readonly intent:        WorkflowIntent;
	readonly runId:         string;
	readonly epicKey:       string;
	readonly provider:      LLMProvider;
	/** Stamped into `meta.model` by the driver. */
	readonly modelLabel:    string;
	/** When set, drive inside `runWithClientProviderContext(clientDefault, …)`
	 *  so bare `buildRun` grounding resolves to the same CLI provider. */
	readonly clientDefault: AnalyzeShaperProviderKind | undefined;
	/** Opt-in finalize review (default off — a controller task). */
	readonly review:        boolean | undefined;
}

/** Parse + resolve a `workflow.run` request into a ready-to-drive bundle. Throws
 *  on a bad payload or a missing repo (both `runStart` and the async registry
 *  wrap this and surface the message their own way). */
export function prepareWorkflowRun(rawParams: unknown): PreparedWorkflowRun {
	const p = parseParams(rawParams);
	const repoPath = p.repo !== undefined && p.repo.length > 0 ? p.repo : process.env['INSRC_REPO'];
	if (repoPath === undefined || repoPath.length === 0) {
		throw new Error('workflow.run: no repo (pass `repo` or set INSRC_REPO)');
	}
	const runId   = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const params  = { ...(p.params ?? {}) };
	// Standalone runs (triage routed a non-Epic feature here) mint a self-hash
	// + default storyId, identical to the MCP `insrc_workflow_step` entry.
	augmentStandaloneParams(params, runId);
	const epicKey = epicKeyFor(p.workflow, p.focus, params, runId);
	const intent: WorkflowIntent = { workflow: p.workflow, focus: p.focus, repoPath, repoIndexedAt: null, params };

	const cfg = loadAnalyzeConfig();
	const clientDefault: AnalyzeShaperProviderKind | undefined =
		p.client === 'claude' ? 'cli-claude' : p.client === 'codex' ? 'cli-codex' : undefined;
	// Resolution chain: per-repo override > global config > per-run caller >
	// ollama. `repoOverride` is read FRESH from disk (never the global cache).
	const repoOverride = resolveRepoShaperProvider(repoPath);
	// Workflow synthesize generates a whole artifact — well past the CLI's
	// 120 s default — so give CLI providers a generous timeout (Ollama ignores it).
	const provider   = buildShaperProvider(cfg, { repoOverride, clientDefault, cliTimeoutMs: WORKFLOW_CLI_TIMEOUT_MS });
	const modelLabel = modelLabelFor(cfg, repoOverride, clientDefault);
	return { intent, runId, epicKey, provider, modelLabel, clientDefault, review: p.review };
}

/** `workflow.run` stream handler. Emits `progress` frames per phase, then a
 *  terminal `done` (with the artifact path) or `error`. */
export async function runStart(
	rawParams: unknown,
	send:      (msg: IpcStreamMessage) => void,
	signal:    AbortSignal,
): Promise<void> {
	let prep: PreparedWorkflowRun;
	try {
		prep = prepareWorkflowRun(rawParams);
	} catch (err) {
		send({ id: 0, stream: 'error', data: { error: (err as Error).message, recoverable: false } });
		return;
	}
	const { intent, runId, epicKey, provider, modelLabel, clientDefault } = prep;
	const p = { review: prep.review };

	try {
		// t5/t6: map the driver's internal vocabulary onto the sc1 wire shape.
		// WorkflowProgress → StageProgressEvent on `progress`; the per-token
		// string stream is counted + batched into TokenProgressEvent on `delta`.
		// Both stay s1-internal — WorkflowProgress/onToken are unchanged.
		let stageIndex = 0;
		const tokens = makeTokenAccumulator();
		const drive = (): Promise<RunWorkflowResult> => runWorkflowServerSide(intent, provider, {
			runId, epicKey, modelLabel, signal,
			onProgress: (f) => { appendProgressLog(runId, 'workflow.run', f.phase, formatProgressDetail(f)); send({ id: 0, stream: 'progress', data: workflowProgressToStage(f, stageIndex++) }); },
			onToken:    (stepId, token) => { const ev = tokens.push(stepId, token); if (ev !== null) send({ id: 0, stream: 'delta', data: ev }); },
			...(p.review !== undefined ? { review: p.review } : {}),
		});
		// Run inside the invoking CLI's provider context so the analyze
		// grounding (`buildRun`, called bare inside the driver) resolves to
		// the SAME provider as the workflow driving instead of falling back
		// to Ollama.
		const out = clientDefault !== undefined
			? await runWithClientProviderContext(clientDefault, drive)
			: await drive();
		const tail = tokens.flush();   // emit any tokens left below the batch threshold
		if (tail !== null) send({ id: 0, stream: 'delta', data: tail });
		send({ id: 0, stream: 'done', data: { path: out.path, runId: out.runId, model: modelLabel, artifact: out.artifact, ...(out.review !== undefined ? { review: { verdict: out.review.verdict, counts: out.review.counts } } : {}) } });
	} catch (err) {
		send({ id: 0, stream: 'error', data: { error: (err as Error).message, recoverable: false } });
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function msgs(systemPrompt: string, userTurn: string): LLMMessage[] {
	return [{ role: 'system', content: systemPrompt }, { role: 'user', content: userTurn }];
}

/** t6: map the workflow driver's internal `WorkflowProgress` onto the sc1
 *  `StageProgressEvent`. `phase` becomes `stageId`; `runner`/`attempt`/`detail`
 *  fold into a human `stageLabel`. `total` is null — the workflow stage set is
 *  not enumerable ahead of time (synthesize may retry). `index` is the caller's
 *  monotonic counter. Total function — never throws. */
export function workflowProgressToStage(f: WorkflowProgress, index: number): StageProgressEvent {
	const detail = formatProgressDetail(f);
	const label = detail.length > 0 ? detail : f.phase;
	return { kind: 'stage', operation: 'workflow.run', stageId: f.phase, stageLabel: label, index, total: null };
}

/** Compose the human-readable detail for a progress frame. The STEP IDENTITY of
 *  a `step-start`/`step-done`/`grounding` frame lives in `stepId` + `runner`,
 *  NOT `detail` (which is only set for synthesize-retry / review). Any consumer
 *  that folds only `f.detail` — the tailable progress log did — renders a step
 *  as a bare "step-start" with no name, which reads as stalled. Fold the
 *  identity in so both the log and the stream carry "s2 · alternatives.enumerate". */
export function formatProgressDetail(f: WorkflowProgress): string {
	return [
		f.stepId,
		f.runner,
		f.attempt !== undefined ? `attempt ${f.attempt}` : undefined,
		f.detail,
	].filter((s): s is string => typeof s === 'string' && s.length > 0).join(' · ');
}

/** t5: the s1-internal workflow token accumulator. The driver's `onToken`
 *  yields token *strings*, not counts (workflow-rpc.ts:78); this counts them
 *  (one call = one token) and batches into `TokenProgressEvent` at a fixed
 *  cadence so the wire never floods per-token. A numeric guard keeps
 *  `tokensTotal` monotonic and `tokensDelta` finite + non-negative. */
export function makeTokenAccumulator(): {
	push(stepId: string, token: string): TokenProgressEvent | null;
	flush(): TokenProgressEvent | null;
} {
	const BATCH = 16;
	let total = 0;
	let delta = 0;
	let stage: string | null = null;
	const mk = (): TokenProgressEvent => ({
		kind: 'token', operation: 'workflow.run', stageId: stage, tokensDelta: delta, tokensTotal: total,
	});
	return {
		push(stepId: string, _token: string): TokenProgressEvent | null {
			total += 1;
			delta += 1;
			stage = stepId.length > 0 ? stepId : null;
			if (delta >= BATCH) { const ev = mk(); delta = 0; return ev; }
			return null;
		},
		flush(): TokenProgressEvent | null {
			if (delta <= 0) return null;
			const ev = mk();
			delta = 0;
			return ev;
		},
	};
}

function classifiedIntent(intent: WorkflowIntent): ClassifiedIntent {
	return {
		target:    'code',
		scope:     'M',
		focused:   true,
		focus:     intent.focus,
		scopeRef:  { kind: 'workspace', value: intent.repoPath },
		reasoning: 'daemon workflow runner grounding',
	};
}

/** Flatten the non-empty prose layers of an analyze bundle for injection. */
function flattenBundle(b: AnalyzeContextBundle): string {
	return [b.system, b.focus, b.summary, b.structure, b.surface, b.artefacts]
		.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
		.join('\n\n');
}

/** The `meta.model` label matching what `buildShaperProvider` resolves — the
 *  chosen provider along the chain: per-repo override > explicit config >
 *  invoking CLI > Ollama. */
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

function formatFailure(f: { readonly ok: boolean; readonly message?: string; readonly details?: readonly string[] }): string {
	if (f.ok) return 'ok';
	const details = f.details !== undefined && f.details.length > 0 ? ` — ${f.details.join(' | ')}` : '';
	return `${f.message ?? 'validation failed'}${details}`;
}

/** The targeted correction directive appended to the synthesize prompt when a
 *  correctable scope-boundary hard-fail occurs. Tightly scoped: fix ONLY the
 *  flagged findings, ground any replacement in the real analyze context, and
 *  leave every other field verbatim — so the re-emit does not perturb valid
 *  content (the surgical intent). */
export function correctionDirective(findings: readonly BoundaryFinding[]): string {
	return [
		'',
		'',
		'STOP — your previous artifact tripped the scope-boundary audit. Fix EXACTLY the findings below and CHANGE NOTHING ELSE: preserve every other field, sentence, and citation verbatim.',
		...findings.map(f => `  - [${f.itemId}] ${f.detail}`),
		'',
		'For each finding: REMOVE the invented / ungrounded reference, or REPLACE it with a real path or symbol that appears in the s1 analyze bundles above. Do NOT introduce any new reference that is not grounded in s1. Re-emit the COMPLETE, valid artifact JSON.',
	].join('\n');
}

/** JSON Schema for the focused re-audit verdict — one result per flagged item,
 *  shaped exactly like the audit step output finalize reads. */
const RE_AUDIT_SCHEMA = {
	type: 'object', additionalProperties: false, required: ['results'],
	properties: {
		results: {
			type: 'array', minItems: 1,
			items: {
				type: 'object', additionalProperties: false, required: ['itemId', 'verdict', 'evidence'],
				properties: {
					itemId:   { type: 'string', minLength: 1 },
					verdict:  { enum: ['passed', 'missed', 'partial', 'ambiguous'] },
					evidence: { type: 'string', minLength: 1 },
				},
			},
		},
	},
} as const;

interface ReAuditResult { readonly results: ReadonlyArray<{ readonly itemId: string; readonly verdict: string; readonly evidence: string }>; }

/** Re-run ONLY the scope-boundary audit against the CORRECTED artifact — the
 *  frozen audit verdict described the pre-correction body, so finalize must
 *  judge a fresh verdict for the corrected content. Verifies each previously-
 *  flagged item and returns results shaped like the audit step output (so the
 *  caller can swap it into stepOutputs[auditStepId] and re-finalize). Does not
 *  re-run any design step. */
export async function reAuditBoundary(
	provider: LLMProvider,
	artifactJson: Record<string, unknown>,
	findings: readonly BoundaryFinding[],
	sco: StructuredCompletionOpts,
): Promise<ReAuditResult> {
	const system = [
		'You are the scope-boundary AUDITOR re-verifying a CORRECTED design artifact.',
		'For EACH flagged item below, decide whether the corrected artifact STILL trips it.',
		'Mark an item `passed` iff the flagged problem is fully resolved in the corrected artifact — e.g. an invented / ungrounded reference has been removed or replaced with a real, grounded one. Mark it `missed` iff the problem remains, `ambiguous` iff you genuinely cannot tell.',
		'Emit exactly one result per flagged itemId; do NOT invent new items.',
	].join('\n');
	const user = [
		'Previously-flagged findings:',
		'```json', JSON.stringify(findings, null, 2), '```',
		'',
		'Corrected artifact:',
		'```json', JSON.stringify(artifactJson, null, 2), '```',
		'',
		'Emit the re-audit verdict JSON now (one result per flagged itemId).',
	].join('\n');
	return provider.completeStructured<ReAuditResult>(
		msgs(system, user), RE_AUDIT_SCHEMA as unknown as Record<string, unknown>, sco,
	);
}

function parseParams(raw: unknown): WorkflowRunParams {
	if (typeof raw !== 'object' || raw === null) throw new Error('workflow.run: params must be an object');
	const o = raw as Record<string, unknown>;
	const workflow = o['workflow'];
	if (typeof workflow !== 'string' || !(WORKFLOW_NAMES as readonly string[]).includes(workflow)) {
		throw new Error(`workflow.run: unknown workflow '${String(workflow)}'`);
	}
	const focus = o['focus'];
	if (typeof focus !== 'string' || focus.length === 0) throw new Error('workflow.run: `focus` is required');
	const client = o['client'];
	return {
		workflow: workflow as WorkflowName,
		focus,
		...(typeof o['repo'] === 'string' ? { repo: o['repo'] } : {}),
		...(typeof o['params'] === 'object' && o['params'] !== null ? { params: o['params'] as Record<string, unknown> } : {}),
		...(client === 'claude' || client === 'codex' ? { client } : {}),
		...(typeof o['review'] === 'boolean' ? { review: o['review'] } : {}),
	};
}
