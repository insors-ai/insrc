/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `build` workflow runners — Phase H (5th in the chain).
 *
 * Recipe:
 *   s1: context.assemble — read the approved plan (ordered Tasks) upstream
 *   s3: tasks.sequence   — the verdict-driven sequenced Task loop: implement
 *                          each Task via one serial CliProvider subprocess,
 *                          then advance ONLY on the daemon's own test run +
 *                          working-tree diff (never the implementer's report)
 *
 * The upstream gate (`readBuildUpstream` → `requireApprovedPlan`) runs at
 * each step's prompt build, and the sc3 admission gate (`admitBuild`) runs
 * at the sequencing turn, so an unapproved/stale plan aborts before any
 * Task is touched — the approved plan is `build`'s authorization boundary.
 *
 * SCOPE BOUNDARY: s3 owns sc4 (`BuildTaskOutcome`) + sc5
 * (`TaskImplementerAdapter`). Still deferred:
 *   - TODO(s4): halt/report framing on a failing Task.
 *   - TODO(s5): the full BuildArtifact body + finalize.
 *
 * Mirrors `runners/plan/index.ts` in shape exactly (module-level
 * `registered` guard, `llmPauseRunner` helper, `registerRunner` calls,
 * each runner `workflow: 'build'`).
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { getLogger } from '../../../shared/logger.js';
import { registerRunner } from '../../executor.js';
import { readBuildUpstream, requireApprovedPlan } from '../../gates.js';
import { assertEpicHash } from '../../hash.js';
import { appendRunLog, lldArtifactPaths, planArtifactId, planArtifactPaths } from '../../storage.js';
import { renderPlanMarkdown, type PlanArtifact } from '../../artifacts/plan.js';
import type { StepRunner, StepRunnerContext } from '../../types.js';
import { approvalVerdict, driftVerdict } from './admission.js';
import { CliTaskImplementerAdapter } from './adapter.js';
import { projectBuildRunProgress } from './progress.js';
import { sequenceBuildTasks, type BuildTaskProgress } from './sequencer.js';
import { createGitTestVerifier, type TaskVerifier } from './verifier.js';
import {
	buildContextSchema,
} from './schemas.js';
import type {
	BuildAdmissionRefusal,
	BuildAdmissionResult,
	BuildRunProgress,
	BuildTaskOutcome,
	TaskImplementerAdapter,
} from './schemas.js';

export type {
	BuildAdmissionAccepted,
	BuildAdmissionRefusal,
	BuildAdmissionResult,
	BuildRefusalReason,
	BuildRunProgress,
	BuildRunState,
	BuildHaltInfo,
} from './schemas.js';

const log = getLogger('workflow:build');

/** Default per-Task repair budget. Kept generous — the LLD notes giving up
 *  early produces a wrong `'failed'` (accuracy over cost). */
const DEFAULT_MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Params helpers
// ---------------------------------------------------------------------------

function epicHashFrom(ctx: StepRunnerContext): string {
	const hash = ctx.intent.params['epicHash'];
	assertEpicHash(hash, `build requires intent.params.epicHash`);
	return hash;
}

function storyIdFrom(ctx: StepRunnerContext): string {
	const id = ctx.intent.params['storyId'];
	if (typeof id !== 'string' || id.length === 0) {
		throw new Error(`build requires intent.params.storyId`);
	}
	return id;
}

/** Read the approved plan (the ordered Tasks) `build` will implement.
 *  Throws (via the gate) when the plan is unusable. */
function upstream(ctx: StepRunnerContext): ReturnType<typeof readBuildUpstream> {
	return readBuildUpstream(ctx.intent.repoPath, epicHashFrom(ctx), storyIdFrom(ctx));
}

// ---------------------------------------------------------------------------
// Shared: llm-pause runner
// ---------------------------------------------------------------------------

function llmPauseRunner(spec: {
	readonly id:          string;
	readonly buildPrompt: (ctx: StepRunnerContext) => { readonly prompt: string; readonly userTurn: string };
	readonly schema:      Record<string, unknown>;
}): StepRunner {
	return {
		id:       spec.id,
		workflow: 'build',
		async run(ctx) {
			const { prompt, userTurn } = spec.buildPrompt(ctx);
			return { type: 'llm-pause', prompt, userTurn, schema: spec.schema, preparedBlob: { stepId: spec.id } };
		},
		async finalize(llmResponse) {
			return { type: 'output', output: llmResponse };
		},
	};
}

// ---------------------------------------------------------------------------
// s1 — context.assemble
// ---------------------------------------------------------------------------

const contextAssemble = llmPauseRunner({
	id: 'context.assemble',
	buildPrompt: (ctx) => {
		const { plan } = upstream(ctx);
		return {
			prompt: [
				'You are running the `context.assemble` step of the `build` workflow.',
				'',
				'The `build` stage implements ONE approved Story plan (a list of ordered,',
				'dependency-labelled Tasks) into code. This step is READ-ONLY discovery — do',
				'NOT edit any file or start implementing yet.',
				'',
				'What to do:',
				'  1. Read the approved plan below — its Tasks are the atomic units build will',
				'     implement one at a time, in `order`, respecting `dependsOn`.',
				'  2. Emit a compact BuildContext JSON: the Task count + a one-line summary of',
				'     the work ahead.',
			].join('\n'),
			userTurn: [
				`Focus: ${ctx.intent.focus}`,
				`Epic hash: ${epicHashFrom(ctx)}   Story: ${storyIdFrom(ctx)}`,
				'',
				'Approved plan (ordered Tasks to implement):',
				'```json',
				JSON.stringify(plan.body, null, 2),
				'```',
				'',
				'Emit the BuildContext JSON now.',
			].join('\n'),
		};
	},
	schema: buildContextSchema,
});

// ---------------------------------------------------------------------------
// s3 — tasks.sequence: the verdict-driven sequenced Task loop
//
// Replaces the s1 `tasks.implement` placeholder. This is a DETERMINISTIC
// (`output`) runner, not an llm-pause: the per-Task editing is delegated to
// a serial CliProvider subprocess (the injected adapter) while the daemon
// keeps sequencing + verification on its own side — it does NOT ask the
// outer LLM to self-report Task status (that would breach the k2 invariant).
// ---------------------------------------------------------------------------

/** The two INJECTED seams the build stage drives. Injectable so the whole
 *  driver is testable with fakes (t9) and the sequencer never constructs a
 *  concrete CliProvider itself. */
export interface BuildStageDeps {
	readonly adapter:  TaskImplementerAdapter;
	readonly verifier: TaskVerifier;
}

export interface BuildStageInput {
	readonly repoPath: string;
	readonly epicHash: string;
	readonly storyId:  string;
	readonly maxAttempts?:  number | undefined;
	readonly onProgress?:   ((frame: BuildTaskProgress) => void) | undefined;
	readonly onCheckpoint?: ((outcomes: readonly BuildTaskOutcome[]) => void) | undefined;
	readonly onInFlight?:   ((outcomes: readonly BuildTaskOutcome[]) => void) | undefined;
}

export interface BuildStageResult {
	readonly admitted:     boolean;
	readonly refusal?:     BuildAdmissionRefusal | undefined;
	readonly taskOutcomes: readonly BuildTaskOutcome[];
	/** The sc6 run-level frame — a PURE read-time projection of `taskOutcomes`
	 *  plus the approved plan graph (winning alt a1; never a stored record).
	 *  Present on an admitted run; a refused run touched no Task and has none. */
	readonly progress?:    BuildRunProgress | undefined;
}

/**
 * Drive the `build` stage for one Story: consume the sc3 admission verdict,
 * materialize the approved plan's `PlanTask[]` work list ONLY when
 * `admitted === true`, and run the private sequencer over the injected
 * adapter + verifier. On a refused run the adapter is UNREACHABLE and
 * `treeUntouched` holds structurally — no Task-touching path exists.
 *
 * The verifier + adapter are injected (`deps`) so this is exercised end-to-
 * end with fakes; the registered runner below supplies the LIVE deps.
 */
export async function driveBuildStage(input: BuildStageInput, deps: BuildStageDeps): Promise<BuildStageResult> {
	const admission = admitBuild(input.repoPath, input.epicHash, input.storyId);
	if (!admission.admitted) {
		// Adapter unreachable on refusal — treeUntouched holds structurally.
		log.info({ storyId: input.storyId, reason: admission.refusal.reason }, 'build refused; sequencer not run');
		return { admitted: false, refusal: admission.refusal, taskOutcomes: [] };
	}

	const plan = requireApprovedPlan(input.repoPath, input.epicHash, input.storyId);
	const storyDesignMarkdown = readMdOr(lldArtifactPaths(input.repoPath, input.epicHash, input.storyId).md, '');
	const planMarkdown = readMdOr(
		planArtifactPaths(input.repoPath, input.epicHash, input.storyId).md,
		renderPlanMarkdown(plan),
	);

	const outcomes = await sequenceBuildTasks(plan.body.tasks, {
		adapter:  deps.adapter,
		verifier: deps.verifier,
		repoRoot: input.repoPath,
		storyDesignMarkdown,
		planMarkdown,
		maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
		...(input.onProgress   !== undefined ? { onProgress:   input.onProgress }   : {}),
		...(input.onCheckpoint !== undefined ? { onCheckpoint: input.onCheckpoint } : {}),
		...(input.onInFlight   !== undefined ? { onInFlight:   input.onInFlight }   : {}),
	});

	// sc6: the run-level frame is a PURE read-time projection over the
	// accumulated outcomes plus the approved plan graph — computed HERE from
	// the same authoritative array the run just produced, never a second
	// writeable record (winning alt a1). On a halted run it carries the halt
	// frame (failed Task + reason + recomputed blockedTaskIds).
	const progress = projectBuildRunProgress(outcomes, plan.body.tasks, input.storyId);
	log.info(
		{ storyId: input.storyId, runState: progress.runState, total: progress.totalTasks, completed: progress.completedTaskIds.length, halted: progress.halt !== undefined },
		`build: run ${progress.runState}`,
	);
	return { admitted: true, taskOutcomes: outcomes, progress };
}

/** Construct the LIVE build-stage deps: the concrete git verifier (real test
 *  run + real working-tree diff) and the CliProvider editing adapter. THIS
 *  IS THE LIVE BOUNDARY — it spawns the local `claude` CLI binary with the
 *  repo as cwd + edit permissions (CLAUDE.md's sanctioned cloud path; no
 *  direct REST). Kept lazy (constructed per run) and separate from
 *  `driveBuildStage` so tests inject fakes instead. */
function liveBuildStageDeps(): BuildStageDeps {
	return {
		verifier: createGitTestVerifier(),
		adapter:  new CliTaskImplementerAdapter(new CliProvider({ kind: 'claude' })),
	};
}

/** Test seam: when set, the registered `tasks.sequence` runner drives the
 *  INJECTED fake deps instead of spawning the live CliProvider. Lets the
 *  driving-surface mirror + halt-and-report end-to-end suites exercise the
 *  real runner (registration → drive loop → halt → progress) with no live
 *  provider and no real git. Mirrors `_clearWorkflowStateStoreForTests`. */
let testDepsOverride: BuildStageDeps | undefined;
export function _setBuildStageDepsForTests(deps: BuildStageDeps | undefined): void {
	testDepsOverride = deps;
}

/** Read a markdown artifact file if present, else fall back. */
function readMdOr(mdPath: string, fallback: string): string {
	try { return existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : fallback; }
	catch { return fallback; }
}

const tasksSequence: StepRunner = {
	id:       'tasks.sequence',
	workflow: 'build',
	async run(ctx) {
		const repoPath = ctx.intent.repoPath;
		const epicHash = epicHashFrom(ctx);
		const storyId  = storyIdFrom(ctx);
		const epicKey  = epicHash;

		const result = await driveBuildStage(
			{
				repoPath, epicHash, storyId,
				onProgress: (f) => {
					log.info({ storyId, ...f }, `build: ${f.phase}`);
					appendRunLog(epicKey, 'build', ctx.runId, {
						ts: new Date().toISOString(), event: 'task-progress',
						taskId: f.taskId, phase: f.phase, status: f.status ?? null, detail: f.detail ?? null,
					});
				},
				// Persist the FULL accumulated BuildTaskOutcome[] at EVERY Task
				// boundary through the existing run-log envelope (t4/ac3): a daemon
				// restart mid-run can decode the last checkpoint and re-project the
				// run state rather than losing the already-landed outcomes. No
				// second, parallel result store — the same storage substrate the
				// sibling stages use.
				onCheckpoint: (outcomes) => {
					appendRunLog(epicKey, 'build', ctx.runId, {
						ts: new Date().toISOString(), event: 'task-checkpoint',
						reached: outcomes.length,
						outcomes,
					});
				},
				// The single in-flight `'running'` slot, persisted before a Task is
				// driven, so a restart mid-Task re-derives inFlightTaskId (a1).
				onInFlight: (outcomes) => {
					appendRunLog(epicKey, 'build', ctx.runId, {
						ts: new Date().toISOString(), event: 'task-inflight',
						reached: outcomes.length,
						outcomes,
					});
				},
			},
			testDepsOverride ?? liveBuildStageDeps(),
		);

		return {
			type: 'output',
			output: {
				admitted:     result.admitted,
				refusal:      result.refusal ?? null,
				taskOutcomes: result.taskOutcomes,
				// sc6 halt/progress frame, surfaced through the SAME step output
				// s3 flows outcome data through — no bespoke MCP output member
				// (t6). Null on a refused run (no Task was touched).
				progress:     result.progress ?? null,
			},
			summary: result.admitted
				? `build: ${result.progress?.runState ?? 'unknown'} — ${result.taskOutcomes.length} Task outcome(s)`
				: `build refused: ${result.refusal?.reason ?? 'unknown'}`,
		};
	},
};

// ---------------------------------------------------------------------------
// s2 — admitBuild: the start-turn admission gate (sc3)
// ---------------------------------------------------------------------------

/** A stable identity hash of the resolved plan version being admitted.
 *  Honest content hash of the on-disk plan JSON (the object came from
 *  `JSON.parse`, so re-stringify preserves key order deterministically).
 *  Kept build-private — how the pointer's hash is derived is s2's alone. */
function planContentHash(plan: PlanArtifact): string {
	return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

/** The `build` stage's read-only start-turn admission gate. Refuses to
 *  touch code when the Story's plan is missing, unapproved, or stale, and
 *  reports WHICH condition failed as a typed `BuildAdmissionResult` — never
 *  throwing for any of the four modeled conditions (accepted / plan-missing
 *  / plan-unapproved / plan-stale), mirroring `scanLldStaleness`'s return-a-
 *  typed-verdict discipline so `treeUntouched` is structural, not asserted.
 *
 *  Fixed evaluation order — approval BEFORE staleness — so:
 *    - a missing plan short-circuits to `plan-missing` (ac4), never a
 *      staleness verdict and never an empty admitted run;
 *    - an unapproved (or rejected) plan short-circuits to `plan-unapproved`
 *      (ac2), so an unapproved-AND-drifted plan yields the single reason
 *      `plan-unapproved` and the drift comparison is never computed;
 *    - only an approved plan reaches the drift check, which yields
 *      `plan-stale` (ac3, with the inline drift hashes) or admits (ac1).
 *
 *  Unmodeled errors — a malformed `epicHash` (via `assertEpicHash`), a
 *  corrupt plan body, or a missing CURRENT design.story — propagate rather
 *  than being remapped to a modeled reason.
 *
 *  `epicHash` is threaded in the same way the runners read
 *  `{epicHash, storyId}` from `intent.params` (the LLD's `admitBuild(repoPath,
 *  storyId)` assumed an internal `computeEpicHash` resolution that the real
 *  stage-agnostic call site does not have — the caller already carries the
 *  validated hash). */
export function admitBuild(repoPath: string, epicHash: string, storyId: string): BuildAdmissionResult {
	// Guard the hash up front so a malformed epicHash is a propagated
	// internal error, not a mis-reported `plan-missing`.
	assertEpicHash(epicHash, `admitBuild requires a well-formed epicHash`);

	const approval = approvalVerdict(repoPath, epicHash, storyId);
	if ('missing' in approval) {
		return {
			admitted: false,
			refusal: {
				reason:  'plan-missing',
				message:
					`Build refused for Story '${storyId}': no plan artifact exists (plan-missing). ` +
					`Run \`plan\` for Story '${storyId}' and approve it before build.`,
				treeUntouched: true,
			},
		};
	}
	if ('unapproved' in approval) {
		return {
			admitted: false,
			refusal: {
				reason:  'plan-unapproved',
				message:
					`Build refused for Story '${storyId}': the plan exists but is not approved ` +
					`(plan-unapproved). Approve the plan before build.`,
				treeUntouched: true,
			},
		};
	}

	// Approved — now the plan-vs-design.story drift check (ac3).
	const drift = driftVerdict(repoPath, epicHash, storyId, approval.plan);
	if ('stale' in drift) {
		return {
			admitted: false,
			refusal: {
				reason:  'plan-stale',
				message:
					`Build refused for Story '${storyId}': the plan is stale (plan-stale) — its recorded ` +
					`design.story basis (${short(drift.planRecordedDesignHash)}) differs from the current ` +
					`design.story (${short(drift.currentDesignHash)}). Re-run \`plan\` against the current LLD before build.`,
				staleness: {
					planRecordedDesignHash: drift.planRecordedDesignHash,
					currentDesignHash:      drift.currentDesignHash,
				},
				treeUntouched: true,
			},
		};
	}

	// Approved + fresh — admit with the THIN plan pointer (ac1).
	return {
		admitted: true,
		plan: {
			planArtifactId:   planArtifactId(epicHash, storyId),
			planArtifactHash: planContentHash(approval.plan),
			storyId,
		},
	};
}

/** Short display form for a hash inside a refusal message. */
function short(hash: string): string {
	return hash.length > 0 ? `${hash.slice(0, 12)}…` : '(empty)';
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let registered = false;

export function registerBuildRunners(): void {
	if (registered) return;
	registerRunner(contextAssemble);
	registerRunner(tasksSequence);
	registered = true;
}
