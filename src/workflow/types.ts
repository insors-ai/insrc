/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ReviewReport } from './review/types.js';

/**
 * Workflow framework type surface.
 *
 * See plans/meta-workflow-framework.md for the architecture and
 * plans/workflow-implementation.md §5 for how the pieces fit
 * together.
 *
 * A workflow is a NAMED, versioned recipe:
 *   - `define`  produces an Epic + Stories
 *   - `design.epic` (HLD) picks a framework for an Epic
 *   - `design.story` (LLD) picks a contract + test strategy for a Story
 *   - `plan | build | test` land later
 *   - `tracker/{push,sync,post}` are internal utility workflows
 *
 * Every workflow's execution flows through the same shape:
 *
 *   WorkflowIntent  -> decomposer prompt -> WorkflowPlan
 *                                            |
 *                                            v
 *                          for each step in plan.steps:
 *                             runner(step) -> StepOutput
 *                                            |
 *                                            v
 *                          synthesizer prompt -> WorkflowArtifact
 *                                            |
 *                                            v
 *                          validate + write to disk
 */

// ---------------------------------------------------------------------------
// Intent (input)
// ---------------------------------------------------------------------------

/** All workflows accept an intent with the same top-level shape. Runner-
 *  and workflow-specific fields ride under `params`. */
export interface WorkflowIntent {
	/** Which workflow to run. Registered names are enumerated in
	 *  `WORKFLOW_NAMES`. */
	readonly workflow: WorkflowName;
	/** One-line human framing of the ask. Passed to the decomposer +
	 *  every step prompt for grounding. */
	readonly focus:    string;
	/** Absolute path to the target repo. Must be registered with the
	 *  daemon (`insrc repo add`). */
	readonly repoPath: string;
	/** Repo's `lastIndexedAt` watermark at intent capture. Used to
	 *  invalidate cached step outputs when the repo is re-indexed
	 *  mid-run. Null when the repo is unindexed / non-git. */
	readonly repoIndexedAt: number | null;
	/** Freeform per-workflow parameters. `define` uses `{ flavor? }`,
	 *  `design.epic` uses `{ epicHash }`, `design.story` uses
	 *  `{ epicHash, storyId }`, `tracker.push` uses
	 *  `{ epicHash, force? }`, etc. Runners validate their own
	 *  slice.
	 *
	 *  Kept as `Record<string, unknown>` at the intent layer so the
	 *  MCP tool + CLI don't have to know every workflow's params
	 *  shape. Epic-scoped workflows carry `params.epicHash` (16-char
	 *  hex — see `workflow/hash.ts`); the display slug lives in the
	 *  finalized artifact's `meta.epicSlug`. */
	readonly params: Record<string, unknown>;
}

export const WORKFLOW_NAMES = [
	'stub',            // Phase A only
	'define',          // Phase B
	'design.epic',     // Phase C
	'design.story',   // Phase D
	'plan',            // Phase G — Story LLD → N ordered/sized/dependency-labelled Tasks
	'build',           // Phase H — implement an approved Story plan's Tasks into code
	'tracker.push',    // Phase F
	'tracker.sync',    // Phase F
	'tracker.post',    // Phase F
] as const;

export type WorkflowName = typeof WORKFLOW_NAMES[number];

// ---------------------------------------------------------------------------
// Plan (decomposer output)
// ---------------------------------------------------------------------------

/** Every workflow's decomposer emits this shape. Steps run
 *  sequentially in order; the executor never reorders them. */
export interface WorkflowPlan {
	readonly workflow: WorkflowName;
	/** Ordered list of steps to execute. Each `id` is unique within
	 *  the plan (`s1`, `s2`, ...); later steps may reference earlier
	 *  outputs via `$s1.<accessor>` placeholders in their params. */
	readonly steps: readonly WorkflowStep[];
	/** Optional decomposer commentary — reasoning that led to this
	 *  step decomposition. Not consumed by the executor; surfaced in
	 *  logs + the final artifact's meta. */
	readonly rationale?: string;
}

export interface WorkflowStep {
	/** Stable id — `s1`, `s2`, ... The executor uses this to key
	 *  outputs into `stepOutputs`. */
	readonly id: string;
	/** Runner id — matches an entry in the workflow's runner registry
	 *  (e.g. `context.assemble`, `epic.frame`, `echo.a`). */
	readonly runner: string;
	/** Per-step params. May contain `$sN.<accessor>` placeholders
	 *  which the executor substitutes from prior step outputs before
	 *  invoking the runner. */
	readonly params: Record<string, unknown>;
	/** Optional human note for logs / traces. */
	readonly note?: string;
}

// ---------------------------------------------------------------------------
// Step runners
// ---------------------------------------------------------------------------

/** Every runner returns either:
 *   - `type: 'output'` — deterministic result, executor moves on.
 *   - `type: 'llm-pause'` — needs an LLM turn from the outer client;
 *     the executor pauses, hands the prompt + schema out, and
 *     resumes when the client's structured response arrives.
 *   - `type: 'error'` — hard failure; the executor aborts the run.
 */
export type StepRunnerResult =
	| StepRunnerOutput
	| StepRunnerLlmPause
	| StepRunnerError;

export interface StepRunnerOutput {
	readonly type:    'output';
	/** Structured result the executor stores under
	 *  `stepOutputs[step.id]`. Later steps may reference it via
	 *  `$s1.<accessor>` placeholders. */
	readonly output:  unknown;
	/** Optional short summary for logs / traces. */
	readonly summary?: string;
}

export interface StepRunnerLlmPause {
	readonly type:     'llm-pause';
	/** System prompt for the outer LLM. */
	readonly prompt:   string;
	/** Short user-turn framing shown after the prompt. */
	readonly userTurn: string;
	/** JSON schema the LLM's response must satisfy. Validated on
	 *  resume. */
	readonly schema:   Record<string, unknown>;
	/** Runner-scoped opaque blob preserved across the pause so the
	 *  finalize step knows how to translate the LLM's response into
	 *  a step output. */
	readonly preparedBlob: unknown;
}

export interface StepRunnerError {
	readonly type:      'error';
	readonly code:      string;
	readonly message:   string;
	readonly retryable: boolean;
}

/** Context handed to every runner at invocation time. */
export interface StepRunnerContext {
	readonly intent:      WorkflowIntent;
	readonly plan:        WorkflowPlan;
	readonly runId:       string;
	/** Outputs produced by prior steps in this run, keyed by step id. */
	readonly stepOutputs: Readonly<Record<string, unknown>>;
	/** Substituted-in params — placeholders already resolved. */
	readonly params:      Record<string, unknown>;
}

/** A finalize function: given the outer LLM's structured response +
 *  the prepared blob from the pause, produce the step's final
 *  output. */
export type StepRunnerFinalize = (
	llmResponse:  Record<string, unknown>,
	preparedBlob: unknown,
	ctx:          StepRunnerContext,
) => Promise<StepRunnerOutput | StepRunnerError>;

/** A registered runner. `run` executes the step; `finalize` (if
 *  present) resolves an `llm-pause` back into an output. */
export interface StepRunner {
	readonly id:       string;
	readonly workflow: WorkflowName;
	run(ctx: StepRunnerContext):
		Promise<StepRunnerResult>;
	finalize?: StepRunnerFinalize;
}

// ---------------------------------------------------------------------------
// Executor state
// ---------------------------------------------------------------------------

/** Executor state carried across a run. When the run is paused for
 *  an LLM turn, this is what the state store persists (indexed by
 *  the executor's opaque token). */
export interface ExecutorState {
	readonly intent: WorkflowIntent;
	readonly plan:   WorkflowPlan;
	readonly runId:  string;
	/** Index into `plan.steps` of the NEXT step to run. When paused
	 *  on an LLM turn for step `plan.steps[i]`, `nextStepIndex === i`
	 *  and `pause` describes the pause. */
	readonly nextStepIndex: number;
	/** Outputs so far. */
	readonly stepOutputs:   Record<string, unknown>;
	/** Present when the executor is paused waiting for an LLM turn. */
	readonly pause?: ExecutorPause;
}

export interface ExecutorPause {
	readonly stepId:       string;
	readonly runner:       string;
	readonly prompt:       string;
	readonly userTurn:     string;
	readonly schema:       Record<string, unknown>;
	readonly preparedBlob: unknown;
}

/** Return value of a single executor tick. */
export type ExecutorTickResult =
	| { readonly type: 'complete'; readonly stepOutputs: Record<string, unknown> }
	| { readonly type: 'paused';   readonly state: ExecutorState }
	| { readonly type: 'error';    readonly stepId: string; readonly code: string; readonly message: string; readonly retryable: boolean };

// ---------------------------------------------------------------------------
// Artifact base
// ---------------------------------------------------------------------------

/** The status of one open-question resolution. `resolved` carries a
 *  `choice`; `ignored` leaves it to downstream judgment; `deferred`
 *  parks it for the dedicated deferred-review flow (it does NOT
 *  auto-resurface at the next stage boundary). */
export type QuestionResolutionStatus = 'resolved' | 'ignored' | 'deferred';

/** One resolution of an artifact open question, recorded by the
 *  cross-stage open-question gate (`insrc_workflow_step`
 *  resolve_question). ADDITIVE — absent on every artifact until at
 *  least one question is resolved. Keyed in
 *  `ArtifactMetaBase.questionResolutions` by the stable `questionId`
 *  derived from the open-question text. */
export interface QuestionResolution {
	/** The open-question text, verbatim, at resolution time. */
	readonly question:   string;
	readonly status:     QuestionResolutionStatus;
	readonly choice?:    string;
	readonly rationale?: string;
	/** ISO 8601 timestamp. */
	readonly resolvedAt: string;
}

/** Every artifact shares this meta envelope. Runner-specific
 *  artifact types extend the payload. */
export interface ArtifactMetaBase {
	readonly workflow:     WorkflowName;
	readonly runId:        string;
	readonly repoPath:     string;
	/** ISO 8601 timestamp. */
	readonly createdAt:    string;
	/** Which model produced this run's LLM turns. `client` when the
	 *  outer LLM (Claude Code / Codex) drove; otherwise a provider
	 *  id (`ollama:qwen3.6:35b-a3b`, etc.). */
	readonly model:        'client' | 'ollama' | string;
	/** Total wall-clock elapsed from start to synthesize. */
	readonly elapsedMs:    number;
	/** Repo watermark when the run started. */
	readonly repoIndexedAt: number | null;
	/** Schema version for the artifact-specific payload. Every
	 *  artifact type owns its version namespace. Bump on breaking
	 *  changes to the payload shape. */
	readonly schemaVersion: number;
	/** ISO 8601 timestamp set by `insrc workflow approve`. Absent
	 *  until approved. */
	readonly approvedAt?:  string;
	/** ISO 8601 timestamp + reason set by `insrc workflow reject`. */
	readonly rejectedAt?:  string;
	readonly rejectReason?: string;
	/** Canonical 16-char Epic hash. Populated on every Epic-scoped
	 *  artifact (`define` / `design.epic` / `design.story` /
	 *  `tracker.*`). Absent on `stub`. Every downstream artifact for
	 *  an Epic reuses the SAME hash — see `workflow/hash.ts`. */
	readonly epicHash?:    string;
	/** Human-readable Epic slug, derived from the Define focus. Kept
	 *  in meta for display in prompts / titles / CLI hints. Files
	 *  are named by hash, never by slug. */
	readonly epicSlug?:    string;
	/** Open-question resolutions, keyed by the stable questionId
	 *  derived from each `body.openQuestions` entry. Written by the
	 *  cross-stage open-question gate (`insrc_workflow_step`
	 *  resolve_question). Additive; absent until a question is
	 *  resolved / ignored / deferred. */
	readonly questionResolutions?: Readonly<Record<string, QuestionResolution>>;
	/** Post-stage review-cycle result — the grounded premise audit run at
	 *  finalize (see `workflow/review/`). Its `verdict` gates approval:
	 *  a `block` (HIGH/MED findings) refuses `insrc workflow approve` until
	 *  the findings are auto-fixed, resolved at the user gate, or explicitly
	 *  overridden. Absent until a review has run. */
	readonly review?: ReviewReport;
	/** Set when approval overrode a `block` review verdict — records who
	 *  chose to proceed despite unresolved HIGH/MED findings, and why. */
	readonly reviewOverride?: { readonly reason: string; readonly at: string };
	/** Per-finding resolutions from the interactive review gate, keyed by the
	 *  finding's `claimId`. A resolved/overridden/deferred finding no longer
	 *  counts toward the block verdict. Additive; absent until a finding is
	 *  resolved. See `workflow/review/resolve.ts`. */
	readonly reviewResolutions?: Readonly<Record<string, ReviewResolution>>;
}

/** One interactive resolution of a review finding (R3). */
export interface ReviewResolution {
	readonly findingId:  string;
	readonly status:     'resolved' | 'overridden' | 'deferred';
	/** The applied fix note, chosen option, or override/defer reason. */
	readonly note?:      string | undefined;
	readonly resolvedAt: string;
}

/** A citation grounds a claim in the artifact body against a step
 *  output or an analyze bundle. Every claim in a rendered artifact
 *  body must reference at least one citation id. */
export interface Citation {
	readonly id:   string;
	/** What kind of source this points at. */
	readonly kind: 'step-output' | 'analyze-bundle' | 'doc' | 'code' | 'stakeholder' | 'convention' | 'prior-artifact';
	/** Ref shape depends on kind:
	 *   - `step-output`: `s1.<accessor>`
	 *   - `analyze-bundle`: bundle id or focus
	 *   - `doc` / `code`: `path[:line]`
	 *   - `stakeholder`: name / role
	 */
	readonly ref: string;
	readonly quotedText?: string;
}

/** The generic artifact envelope. Runner-specific artifact types
 *  narrow `body` to their payload shape. */
export interface WorkflowArtifact<Body = unknown> {
	readonly meta:      ArtifactMetaBase;
	readonly body:      Body;
	readonly citations: readonly Citation[];
}

// ---------------------------------------------------------------------------
// Runner registry
// ---------------------------------------------------------------------------

/** Registry key: `{workflow}/{runner-id}`. Runners are keyed by
 *  workflow so two workflows may reuse the same runner id
 *  (`context.assemble` in both `define` and `design.epic`) without
 *  a clash. */
export type RunnerRegistryKey = `${WorkflowName}/${string}`;

// ---------------------------------------------------------------------------
// Placeholder substitution
// ---------------------------------------------------------------------------

/** Regex the executor uses to spot placeholders in step params.
 *  Matches `$s1`, `$s1.foo`, `$s1.foo.bar[0]` — anything with a
 *  step id anchor. */
export const PLACEHOLDER_RE = /^\$s(\d+)(?:\.(.+))?$/;
