/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Taking over parked work (Story s6): carrying out a verified resume. The parked files are put back in the working tree (every
 * file rolled back if any step fails), a parked run is rebound to this clone and stored with the actor as its owner, and the
 * workflow turn the previous owner would have seen next is returned, so the new owner continues from there. Verification
 * (registration, identity, stage, branch, checkpoint, upstream, local changes) is `resumeCheck` in the handoff module.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getLogger } from '../../../shared/logger.js';
import { prepareDecompose, prepareSynthesize } from '../../../workflow/orchestrator.js';
import { actingUser } from '../../../workflow/team/gate.js';
import { rebindCheckpoint, resumeCheck, type ResumeCheck, type ResumeDeps, type ResumePlan, type RunCheckpoint, type StageWorkflow } from '../../../workflow/team/handoff.js';
import type { UnitRef } from '../../../workflow/tracker/refs.js';
import { saveState } from './state-store.js';
import type { WorkflowStepStatePayload } from './state.js';
import type { WorkflowStepEmitPlan, WorkflowStepEmitStep, WorkflowStepEmitSynthesize } from './types.js';

const log = getLogger('mcp:workflow-step:resume');

export type ResumeResult =
	/** The parked run is stored under a new token and `turn` is the turn to answer next. */
	| { readonly kind: 'resumed'; readonly turn: WorkflowStepEmitPlan | WorkflowStepEmitStep | WorkflowStepEmitSynthesize }
	/** Start the stage afresh on the committed artifacts; `draftRestored` is true when a parked draft was put back first. */
	| { readonly kind: 'restart'; readonly workflow: StageWorkflow; readonly params: { readonly epicHash: string; readonly storyId?: string | undefined }; readonly reason: string; readonly draftRestored: boolean }
	| { readonly kind: 'nothing-to-resume'; readonly reason: string }
	| { readonly kind: 'refused'; readonly reason: string };

/** Test seam: makes writing a given path fail with the returned text. */
export interface ApplyDeps { readonly failWrite?: ((path: string) => string | undefined) | undefined }

const refusedWith = (reason: string): ResumeResult => ({ kind: 'refused', reason });

/**
 * Put the parked files in the working tree. Each file is written beside its place and moved into it, and the file it replaces (or
 * its absence) is remembered: if any file fails, every file written so far is put back as it was, and the directories this call
 * made are removed. Returns undefined on success, or the reason (the tree is then as it was).
 */
function restoreFiles(repo: string, files: ResumePlan['files'], deps: ApplyDeps): { readonly rollback: () => void } | { readonly failed: string } {
	const done: Array<{ path: string; before: string | null }> = [];
	const madeDirs: string[] = [];
	const rollback = (): void => {
		for (const f of done.reverse()) {
			try { f.before === null ? rmSync(f.path, { force: true }) : writeFileSync(f.path, f.before, 'utf8'); } catch (err) { log.warn({ path: f.path, err: err instanceof Error ? err.message : String(err) }, 'resume: could not roll back a restored file'); }
		}
		for (const d of madeDirs.reverse()) { try { rmdirSync(d); } catch { /* not empty or already gone */ } }
	};
	for (const f of files) {
		const abs = join(repo, f.path);
		try {
			const injected = deps.failWrite?.(f.path);
			if (injected !== undefined) throw new Error(injected);
			// directories this call is about to make, so a rollback leaves none behind
			const missing: string[] = [];
			for (let d = dirname(abs); !existsSync(d) && d !== dirname(d); d = dirname(d)) missing.push(d);
			mkdirSync(dirname(abs), { recursive: true });
			madeDirs.push(...missing);
			const before = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
			const tmp = `${abs}.resume-tmp`;
			// raw-write: restores a parked file byte for byte (its meta.revision included); this is not a new content write
			writeFileSync(tmp, f.content, 'utf8');
			renameSync(tmp, abs);
			done.push({ path: abs, before });
		} catch (err) {
			rmSync(`${abs}.resume-tmp`, { force: true });
			rollback();
			return { failed: `restoring ${f.path} failed (${err instanceof Error ? err.message : String(err)}); the working tree is as it was` };
		}
	}
	return { rollback };
}

/** The turn the run's stage calls for, built from the rebound payload; the `state` token is filled in once the run is stored. */
function turnFor(payload: WorkflowStepStatePayload): Omit<WorkflowStepEmitPlan, 'state'> | Omit<WorkflowStepEmitStep, 'state'> | Omit<WorkflowStepEmitSynthesize, 'state'> | { error: string } {
	if (payload.stage === 'awaiting_plan') {
		const prepared = prepareDecompose(payload.intent);
		return {
			next: 'emit_plan',
			guidance: `Emit a WorkflowPlan JSON matching the schema below, then call insrc_workflow_step again with phase="plan", plan=<your JSON>, state=<the state field verbatim>.`,
			prompt: prepared.systemPrompt, userTurn: prepared.userTurn, schema: prepared.schema,
		};
	}
	if (payload.stage === 'awaiting_llm_step') {
		const pause = payload.executor?.pause;
		if (pause === undefined) return { error: 'the parked run is at an LLM step but carries no pause to answer' };
		return {
			next: 'emit_step',
			guidance: `Emit the JSON matching the schema below, then call insrc_workflow_step again with phase="step", stepId="${pause.stepId}", response=<your JSON>, state=<the state field verbatim>.`,
			stepId: pause.stepId, runner: pause.runner, prompt: pause.prompt, userTurn: pause.userTurn, schema: pause.schema,
		};
	}
	if (payload.stepOutputs === undefined) return { error: 'the parked run is awaiting synthesis but carries no step outputs' };
	const prepared = prepareSynthesize(payload.intent, payload.stepOutputs);
	return {
		next: 'emit_synthesize',
		guidance: `Emit the artifact JSON matching the schema below, then call insrc_workflow_step again with phase="synthesize", artifact=<your JSON>, state=<the state field verbatim>.`,
		prompt: prepared.systemPrompt, userTurn: prepared.userTurn, schema: prepared.schema,
	};
}

/**
 * Carry out a verified resume check. A run checkpoint: the parked files are restored, the run is rebound to this clone, stored
 * owned by the acting user with the checkpoint's upstream snapshot, and its next turn returned. A draft-only checkpoint: the files
 * are restored and a restart is returned. If anything fails after files were written they are rolled back and no state is saved.
 */
export function applyResume(check: ResumeCheck, repo: string, deps: ApplyDeps = {}): ResumeResult {
	if (check.kind === 'refused') return refusedWith(check.reason);
	if (check.kind === 'nothing-to-resume') return check;
	if (check.kind === 'restart') {
		if (check.restore === undefined) return { kind: 'restart', workflow: check.workflow, params: check.params, reason: check.reason, draftRestored: false };
		const restored = restoreFiles(repo, check.restore.files, deps);
		if ('failed' in restored) return refusedWith(restored.failed);
		return { kind: 'restart', workflow: check.workflow, params: check.params, reason: check.reason, draftRestored: true };
	}

	const checkpoint: RunCheckpoint = check.plan.checkpoint;
	const restored = restoreFiles(repo, check.plan.files, deps);
	if ('failed' in restored) return refusedWith(restored.failed);
	try {
		const payload = rebindCheckpoint(checkpoint, { repoPath: repo, repoIndexedAt: null, now: Date.now() });
		const turn = turnFor(payload);
		if ('error' in turn) { restored.rollback(); return refusedWith(`${turn.error}; the working tree is as it was`); }
		const owner = actingUser(repo);
		const state = saveState(payload, { ...(owner !== undefined ? { owner } : {}), upstream: checkpoint.upstream });
		return { kind: 'resumed', turn: { ...turn, state } as WorkflowStepEmitPlan | WorkflowStepEmitStep | WorkflowStepEmitSynthesize };
	} catch (err) {
		restored.rollback();
		return refusedWith(`the parked run could not be resumed (${err instanceof Error ? err.message : String(err)}); the working tree is as it was`);
	}
}

/**
 * Take over a unit someone parked: verify (resumeCheck, which throws TeamGateRefusedError when another user holds the unit), then
 * carry out. A repo's first run resumes where the parker stopped; with no parked branch the answer is to start the stage afresh.
 */
export async function resumeStage(repo: string, unit: UnitRef, opts: { readonly workflow?: string | undefined } = {}, deps: ResumeDeps & ApplyDeps = {}): Promise<ResumeResult> {
	return applyResume(await resumeCheck(repo, unit, opts, deps), repo, deps);
}
