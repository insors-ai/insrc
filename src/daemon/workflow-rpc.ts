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
import type { IpcStreamMessage, LLMMessage, LLMProvider, StructuredCompletionOpts } from '../shared/types.js';
import type { ClassifiedIntent } from '../shared/analyze-types.js';
import type { AnalyzeContextBundle } from '../analyze/context/types.js';
import { buildShaperProvider, runWithClientProviderContext } from '../analyze/context/shaper-provider.js';
import { loadAnalyzeConfig, type AnalyzeConfig, type AnalyzeShaperProviderKind } from '../config/analyze.js';
import { registerWorkflowRunners } from '../workflow/index.js';
import { prepareDecompose, prepareSynthesize, finalizeArtifact, type FinalizedArtifact } from '../workflow/orchestrator.js';
import { startRun, resumeRun } from '../workflow/executor.js';
import { appendRunLog, pathsForWorkflow, writeAtomic } from '../workflow/storage.js';
import { WORKFLOW_NAMES, type WorkflowIntent, type WorkflowName, type WorkflowPlan } from '../workflow/types.js';
import { epicKeyFor } from '../mcp/workflow-step/phases/start.js';
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
 *  `synthesize-attempt`, `synthesize-retry`, `done`. */
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
}

export interface RunWorkflowResult {
	readonly path:     string;
	readonly artifact: unknown;
	readonly runId:    string;
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
	let feedback = '';
	let finalized: FinalizedArtifact | undefined;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		checkAbort();
		opts.onProgress?.({ phase: 'synthesize-attempt', attempt });
		const artifactJson = await provider.completeStructured<Record<string, unknown>>(
			msgs(synth.systemPrompt, synth.userTurn + feedback), synth.schema, sco('synthesize'),
		);
		const result = finalizeArtifact(intent, stepOutputs, runId, Date.now() - startedAtMs, artifactJson, opts.modelLabel);
		if (result.ok) { finalized = result.finalized; break; }
		// A non-retryable failure derives from a fixed step output (e.g. a
		// checklist scope-boundary hard-fail) — re-emitting the artifact can't
		// change it, so surface immediately rather than burn the retry budget.
		if (!result.failure.ok && result.failure.retryable === false) {
			throw new Error(`workflow.run: synthesize failed (non-retryable — fix the upstream step): ${formatFailure(result.failure)}`);
		}
		if (attempt === maxAttempts) {
			throw new Error(`workflow.run: synthesize rejected after ${maxAttempts} attempts: ${formatFailure(result.failure)}`);
		}
		opts.onProgress?.({ phase: 'synthesize-retry', attempt, detail: formatFailure(result.failure) });
		feedback = `\n\nYour previous artifact was REJECTED: ${formatFailure(result.failure)}\nFix exactly that and re-emit valid JSON.`;
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
	opts.onProgress?.({ phase: 'done' });
	return { path: paths.md, artifact: finalized.artifact, runId };
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
}

/** `workflow.run` stream handler. Emits `progress` frames per phase, then a
 *  terminal `done` (with the artifact path) or `error`. */
export async function runStart(
	rawParams: unknown,
	send:      (msg: IpcStreamMessage) => void,
	signal:    AbortSignal,
): Promise<void> {
	let p: WorkflowRunParams;
	try {
		p = parseParams(rawParams);
	} catch (err) {
		send({ id: 0, stream: 'error', data: { error: (err as Error).message, recoverable: false } });
		return;
	}
	const repoPath = p.repo !== undefined && p.repo.length > 0 ? p.repo : process.env['INSRC_REPO'];
	if (repoPath === undefined || repoPath.length === 0) {
		send({ id: 0, stream: 'error', data: { error: 'workflow.run: no repo (pass `repo` or set INSRC_REPO)', recoverable: false } });
		return;
	}

	const runId   = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const params  = p.params ?? {};
	const epicKey = epicKeyFor(p.workflow, p.focus, params, runId);
	const intent: WorkflowIntent = { workflow: p.workflow, focus: p.focus, repoPath, repoIndexedAt: null, params };

	const cfg = loadAnalyzeConfig();
	const clientDefault: AnalyzeShaperProviderKind | undefined =
		p.client === 'claude' ? 'cli-claude' : p.client === 'codex' ? 'cli-codex' : undefined;
	// Workflow synthesize generates a whole artifact — well past the CLI's
	// 120 s default — so give CLI providers a generous timeout (Ollama ignores it).
	const provider   = buildShaperProvider(cfg, { clientDefault, cliTimeoutMs: WORKFLOW_CLI_TIMEOUT_MS });
	const modelLabel = modelLabelFor(cfg, clientDefault);

	try {
		const drive = (): Promise<RunWorkflowResult> => runWorkflowServerSide(intent, provider, {
			runId, epicKey, modelLabel, signal,
			onProgress: (f) => send({ id: 0, stream: 'progress', data: f }),
			onToken:    (stepId, token) => send({ id: 0, stream: 'delta', data: { stepId, token } }),
		});
		// Run inside the invoking CLI's provider context so the analyze
		// grounding (`buildRun`, called bare inside the driver) resolves to
		// the SAME provider as the workflow driving instead of falling back
		// to Ollama.
		const out = clientDefault !== undefined
			? await runWithClientProviderContext(clientDefault, drive)
			: await drive();
		send({ id: 0, stream: 'done', data: { path: out.path, runId: out.runId, model: modelLabel, artifact: out.artifact } });
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

/** The `meta.model` label matching what `buildShaperProvider` resolves — an
 *  explicit config provider wins, else the invoking CLI, else Ollama. */
function modelLabelFor(cfg: AnalyzeConfig, clientDefault: AnalyzeShaperProviderKind | undefined): string {
	const effective: AnalyzeShaperProviderKind = cfg.shaperProviderExplicit
		? cfg.shaperProvider
		: (clientDefault ?? cfg.shaperProvider);
	if (effective === 'ollama') return `ollama:${cfg.shaperModel}`;
	const cli = effective === 'cli-claude' ? 'claude' : 'codex';
	return cfg.shaperModelExplicit && cfg.shaperModel.length > 0 ? `${cli}:${cfg.shaperModel}` : cli;
}

function formatFailure(f: { readonly ok: boolean; readonly message?: string; readonly details?: readonly string[] }): string {
	if (f.ok) return 'ok';
	const details = f.details !== undefined && f.details.length > 0 ? ` — ${f.details.join(' | ')}` : '';
	return `${f.message ?? 'validation failed'}${details}`;
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
	};
}
