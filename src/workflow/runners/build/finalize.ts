/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The `build` stage finalize projection + precondition guards + seal (Story
 * s5, t4 / t5 / t6). Pure of the storage seam where it can be, so the
 * projection + guards are exercised on hand-built fixture values.
 *
 * FINALIZE re-projects the run-level fields (`runState` / `halt` /
 * `filesTouched`) ONCE from the terminal `BuildRunProgress` (sc6), carries
 * `taskOutcomes[]` (sc4) verbatim, and maps a `BuildAdmissionAccepted` (sc3)
 * verdict into `BuildArtifactUpstream`. Before sealing it asserts three
 * pre-seal preconditions (the LLD error paths):
 *
 *   - `missing-admission`  — the sc3 accepted verdict is absent: refuse rather
 *     than fabricate the ac3 citation from the implementer self-report.
 *   - `non-terminal-run`   — `runState` is still `'running'`: refuse to seal a
 *     run-level state that has not reached complete/halted.
 *   - `halt-inconsistent`  — `halt` is not present-iff-`runState==='halted'`:
 *     refuse to seal a record whose halt block contradicts its run state.
 *
 * GROW-IN-PLACE: `buildCheckpointArtifact` assembles the SAME flat shape at
 * each Task boundary (no guards — a checkpoint may be `runState:'running'`),
 * and `sealBuildArtifact` seals the terminal record over it. The seal writer
 * is injectable so a writer throw is caught at the finalize boundary and the
 * prior grow-in-place checkpoint survives readable (the recoverable seal-
 * failure error path).
 */

import { existsSync, readFileSync } from 'node:fs';

import {
	BUILD_ARTIFACT_KIND,
	projectFilesTouched,
	type BuildArtifact,
	type BuildArtifactUpstream,
	type BuildMeta,
} from '../../artifacts/build.js';
import { buildArtifactPaths, writeAtomic } from '../../storage.js';
import type { Citation } from '../../types.js';
import type {
	BuildAdmissionAccepted,
	BuildHaltInfo,
	BuildRunProgress,
	BuildRunState,
	BuildTaskOutcome,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Projection + guards (pure — no storage seam)
// ---------------------------------------------------------------------------

/** The flat sc7 semantic fields the projection produces, minus the envelope
 *  (`meta` / `citations`) the orchestrator supplies. */
export interface BuildArtifactCore {
	readonly kind:         typeof BUILD_ARTIFACT_KIND;
	readonly upstream:     BuildArtifactUpstream;
	readonly runState:     BuildRunState;
	readonly taskOutcomes: readonly BuildTaskOutcome[];
	readonly halt?:        BuildHaltInfo | undefined;
	readonly filesTouched: readonly string[];
	readonly summary:      string;
}

export type BuildFinalizeErrorCode = 'missing-admission' | 'non-terminal-run' | 'halt-inconsistent';

export interface BuildFinalizeFailure {
	readonly ok:      false;
	readonly code:    BuildFinalizeErrorCode;
	readonly message: string;
}

export type BuildArtifactProjection =
	| { readonly ok: true; readonly core: BuildArtifactCore }
	| BuildFinalizeFailure;

export interface BuildFinalizeInput {
	/** The terminal sc6 frame, re-projected ONCE from the accumulated outcomes. */
	readonly progress:     BuildRunProgress;
	/** sc4 outcomes, carried verbatim into the record. */
	readonly taskOutcomes: readonly BuildTaskOutcome[];
	/** sc3 accepted verdict — the ONLY sanctioned source of the ac3 citation. */
	readonly admission:    BuildAdmissionAccepted | undefined;
	/** The parent Epic id (completes the up-the-chain citation trail). */
	readonly epicId:       string;
}

/**
 * Project the flat BuildArtifact core from the terminal run frame + outcomes
 * + accepted admission, asserting the three pre-seal preconditions first.
 * Returns a typed failure (no record produced) rather than sealing an
 * inconsistent / unsupported record.
 */
export function projectBuildArtifact(input: BuildFinalizeInput): BuildArtifactProjection {
	// Guard 1 (ac3) — the up-the-chain citation MUST pin an approved plan from
	// a sc3 accepted verdict; never fabricated from the implementer report.
	if (input.admission === undefined) {
		return {
			ok:   false,
			code: 'missing-admission',
			message:
				'finalize aborted: the BuildAdmissionAccepted (sc3) verdict is missing — ' +
				'refusing to fabricate the upstream PlanArtifact citation (ac3).',
		};
	}
	const runState = input.progress.runState;
	// Guard 2 — refuse a run-level state the projection cannot honestly seal.
	if (runState === 'running') {
		return {
			ok:   false,
			code: 'non-terminal-run',
			message:
				'finalize precondition violated: the run has not reached a terminal state ' +
				"(runState='running'); drive it to complete/halted before finalizing.",
		};
	}
	// Guard 3 — halt present iff runState==='halted'.
	const halt   = input.progress.halt;
	const halted = runState === 'halted';
	if (halted !== (halt !== undefined)) {
		return {
			ok:   false,
			code: 'halt-inconsistent',
			message:
				`finalize precondition violated: halt/runState inconsistency — runState='${runState}' ` +
				`but the halt block is ${halt === undefined ? 'absent' : 'present'}.`,
		};
	}

	const upstream: BuildArtifactUpstream = {
		planArtifactId:   input.admission.planArtifactId,
		planArtifactHash: input.admission.planArtifactHash,
		storyId:          input.admission.storyId,
		epicId:           input.epicId,
	};
	const core: BuildArtifactCore = {
		kind:         BUILD_ARTIFACT_KIND,
		upstream,
		runState,
		taskOutcomes: input.taskOutcomes,
		...(halt !== undefined ? { halt } : {}),
		filesTouched: projectFilesTouched(input.taskOutcomes),
		summary:      summarizeBuildRun(runState, input.taskOutcomes, halt),
	};
	return { ok: true, core };
}

/** A deterministic one-line human summary for the slug-md header. */
export function summarizeBuildRun(
	runState: BuildRunState,
	outcomes: readonly BuildTaskOutcome[],
	halt:     BuildHaltInfo | undefined,
): string {
	const total     = outcomes.length;
	const completed = outcomes.filter(o => o.status === 'completed').length;
	if (runState === 'halted' && halt !== undefined) {
		return `Build halted on Task ${halt.failedTaskId} (${halt.failedTaskTitle}) — ` +
			`${completed}/${total} Task(s) completed before the halt.`;
	}
	if (total === 0) return 'Build complete: no Tasks to implement (empty plan) — no-op run.';
	return `Build complete: ${completed}/${total} Task(s) implemented.`;
}

// ---------------------------------------------------------------------------
// Assemble (core + envelope → the flat BuildArtifact)
// ---------------------------------------------------------------------------

export function assembleBuildArtifact(args: {
	readonly meta:      BuildMeta;
	readonly core:      BuildArtifactCore;
	readonly citations: readonly Citation[];
}): BuildArtifact {
	const { meta, core, citations } = args;
	return {
		kind:         core.kind,
		meta,
		upstream:     core.upstream,
		runState:     core.runState,
		taskOutcomes: core.taskOutcomes,
		...(core.halt !== undefined ? { halt: core.halt } : {}),
		filesTouched: core.filesTouched,
		summary:      core.summary,
		citations,
	};
}

// ---------------------------------------------------------------------------
// Grow-in-place checkpoint (t5) — the SAME flat shape, unsealed
// ---------------------------------------------------------------------------

/**
 * Assemble the flat checkpoint record persisted at a Task boundary. NO guards:
 * a checkpoint may be `runState:'running'` (the run is still in flight) and
 * carries no upstream/seal preconditions — it is the durable substrate the
 * finalize seal reloads. `runState` / `halt` / `filesTouched` / `summary` are
 * projected from the current frame just like the sealed record, so the on-disk
 * checkpoint and the finalized record are ONE type.
 */
export function buildCheckpointArtifact(args: {
	readonly meta:         BuildMeta;
	readonly upstream:     BuildArtifactUpstream;
	readonly progress:     BuildRunProgress;
	readonly taskOutcomes: readonly BuildTaskOutcome[];
	readonly citations?:   readonly Citation[] | undefined;
}): BuildArtifact {
	const { meta, upstream, progress, taskOutcomes } = args;
	const halt = progress.halt;
	return {
		kind:         BUILD_ARTIFACT_KIND,
		meta,
		upstream,
		runState:     progress.runState,
		taskOutcomes,
		...(halt !== undefined ? { halt } : {}),
		filesTouched: projectFilesTouched(taskOutcomes),
		summary:      summarizeBuildRun(progress.runState, taskOutcomes, halt),
		citations:    args.citations ?? [],
	};
}

/** Reload the last grow-in-place checkpoint (or sealed record) from the
 *  canonical json path. Returns undefined when absent or undecodable — the
 *  caller falls back to the live step outputs. This is the restart-safe seam:
 *  a daemon that restarts mid-run reloads the checkpoint here. */
export function readBuildCheckpoint(
	repoPath: string,
	epicHash: string,
	storyId:  string,
): BuildArtifact | undefined {
	const p = buildArtifactPaths(repoPath, epicHash, storyId).json;
	if (!existsSync(p)) return undefined;
	try {
		return JSON.parse(readFileSync(p, 'utf8')) as BuildArtifact;
	} catch {
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// Seal (t6) — write the canonical hash-json + slug-md, injectable writer
// ---------------------------------------------------------------------------

export type ArtifactWriter = (absPath: string, content: string) => void;

export type SealResult =
	| { readonly ok: true;  readonly mdPath: string; readonly jsonPath: string; readonly renderedMd: string; readonly renderedJson: string }
	| { readonly ok: false; readonly error: string };

/**
 * Seal the terminal BuildArtifact in place over its checkpoint: render the
 * slug-md, canonically serialise the flat body, and write the hash-json +
 * slug-md pair through the reused storage writer. IDEMPOTENT: re-sealing an
 * already-sealed record rewrites the identical bytes.
 *
 * SEAL-FAILURE BOUNDARY (recoverable error path): a writer throw is CAUGHT
 * here and returned as `{ ok:false }`, so the prior grow-in-place checkpoint
 * that was persisted at the last Task boundary remains the readable record —
 * the run never crashes on a malformed body / failed atomic write. The writer
 * is injectable so this is exercised with a throwing stub.
 */
export function sealBuildArtifact(args: {
	readonly repoPath:  string;
	readonly artifact:  BuildArtifact;
	readonly render:    (a: BuildArtifact) => string;
	readonly write?:    ArtifactWriter | undefined;
}): SealResult {
	const { repoPath, artifact, render } = args;
	const write = args.write ?? writeAtomic;
	const paths = buildArtifactPaths(repoPath, artifact.meta.epicHash, artifact.meta.storyId, artifact.meta.epicSlug);
	try {
		const renderedMd   = render(artifact);
		const renderedJson = JSON.stringify(artifact, null, 2) + '\n';
		// json first (the canonical identity), then the slug-md view.
		write(paths.json, renderedJson);
		write(paths.md,   renderedMd);
		return { ok: true, mdPath: paths.md, jsonPath: paths.json, renderedMd, renderedJson };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

// ---------------------------------------------------------------------------
// Terminal-outcome resolution (fresh step outputs, else reloaded checkpoint)
// ---------------------------------------------------------------------------

/** Extract the sequenced `taskOutcomes[]` from a step-output map — the
 *  `tasks.sequence` runner surfaces it verbatim. Returns undefined when no
 *  step carries an outcome array (a refused run, or a restart with no live
 *  step outputs). */
export function extractStepOutcomes(
	stepOutputs: Readonly<Record<string, unknown>>,
): readonly BuildTaskOutcome[] | undefined {
	for (const v of Object.values(stepOutputs)) {
		if (typeof v === 'object' && v !== null && Array.isArray((v as { taskOutcomes?: unknown }).taskOutcomes)) {
			return (v as { taskOutcomes: readonly BuildTaskOutcome[] }).taskOutcomes;
		}
	}
	return undefined;
}

/** Resolve the terminal outcomes to seal: the live `tasks.sequence` output
 *  when present (fresh run), else the reloaded grow-in-place checkpoint
 *  (restart-safe seal), else `[]` (an admitted no-Task run). */
export function resolveTerminalOutcomes(
	stepOutputs: Readonly<Record<string, unknown>>,
	repoPath:    string,
	epicHash:    string,
	storyId:     string,
): readonly BuildTaskOutcome[] {
	const fromSteps = extractStepOutcomes(stepOutputs);
	if (fromSteps !== undefined) return fromSteps;
	const checkpoint = readBuildCheckpoint(repoPath, epicHash, storyId);
	if (checkpoint !== undefined && Array.isArray(checkpoint.taskOutcomes)) return checkpoint.taskOutcomes;
	return [];
}
