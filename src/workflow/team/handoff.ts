/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Handing unfinished work to a new owner (Story s6): the parts that are pure. The branch a parked draft goes to
 * is named from the repo's branch pattern; a checkpoint (a run's whole state, or just the draft) is validated before
 * anything is restored from it and rebound to the receiving clone; the stage a unit needs next is read off the
 * committed artifact chain. Nothing in this module touches git, the tracker or the daemon's run store.
 */

import { existsSync } from 'node:fs';

import { validateBranchPattern } from '../../config/repo-fields.js';
import type { WorkflowStepStatePayload } from '../../daemon/steps/workflow-step/state.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId } from '../storage.js';
import type { UnitRef } from '../tracker/refs.js';
import type { ExecutorState, WorkflowIntent } from '../types.js';
import type { UpstreamRevision } from './run-meta.js';

/** The branch pattern used when the repo sets none. */
export const DEFAULT_BRANCH_PATTERN = 'insrc/handoff/{type}-{id}';

export const CHECKPOINT_SCHEMA_VERSION = 1 as const;

export type HandoffStage = 'awaiting_plan' | 'awaiting_llm_step' | 'awaiting_synthesize';
const STAGES: ReadonlySet<string> = new Set<HandoffStage>(['awaiting_plan', 'awaiting_llm_step', 'awaiting_synthesize']);

/** The unit a checkpoint is for: an Epic, or a Story of it. */
export interface HandoffUnit {
	readonly epicHash: string;
	readonly storyId?: string | undefined;
}

interface CheckpointCommon {
	readonly schemaVersion: typeof CHECKPOINT_SCHEMA_VERSION;
	readonly unit:          HandoffUnit;
	readonly parkedBy:      string;
	readonly parkedAt:      string;
	/** The commit the parker was on. */
	readonly sourceHead:    string;
	/** The root commit id of the parker's repository: a clone of another repository is refused. */
	readonly repositoryId:  string;
	/** Repo-relative files parked with the checkpoint. */
	readonly artifactPaths: readonly string[];
}

/** A run's whole state, minus what belongs to the parker's machine (repoPath, repoIndexedAt, the clock). */
export interface RunCheckpoint extends CheckpointCommon {
	readonly kind:     'run';
	readonly runId:    string;
	readonly epicKey:  string;
	readonly stage:    HandoffStage;
	readonly intent:   Omit<WorkflowIntent, 'repoPath' | 'repoIndexedAt'>;
	/** Present at awaiting_llm_step. */
	readonly executor?: Omit<ExecutorState, 'intent'> | undefined;
	/** Present at awaiting_synthesize. */
	readonly stepOutputs?: Readonly<Record<string, unknown>> | undefined;
	readonly owner:    string;
	/** The upstream revisions the run started from. */
	readonly upstream: readonly UpstreamRevision[];
}

/** Only the draft artifacts: for a daemon that restarted, or a draft with no live run. */
export interface DraftCheckpoint extends CheckpointCommon {
	readonly kind: 'draft';
}

export type HandoffCheckpoint = RunCheckpoint | DraftCheckpoint;

// ---------------------------------------------------------------------------
// Branch name
// ---------------------------------------------------------------------------

const unitId = (unit: HandoffUnit): string => (unit.storyId !== undefined ? `${unit.epicHash}-${unit.storyId}` : unit.epicHash);
const unitType = (unit: HandoffUnit): string => (unit.storyId !== undefined ? 'story' : 'epic');
const slugOf = (slug: string): string => slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * The handoff branch for a unit: the pattern's {id}, {slug} and {type} filled in. {id} is the epic hash (and the story id) so the
 * name is the same every time for a unit, which is how a second park lands on the same branch and resume finds it without
 * reading the tracker. A pattern that breaks the branch-pattern grammar, or that leaves out {id} (so two units could share a
 * branch), or a result that is not a usable branch name, is refused with the reason.
 */
export function handoffBranchName(pattern: string | undefined, unit: HandoffUnit, slug: string): { ok: true; name: string } | { ok: false; reason: string } {
	const used = pattern !== undefined && pattern.length > 0 ? pattern : DEFAULT_BRANCH_PATTERN;
	const checked = validateBranchPattern(used);
	if (!checked.ok) return { ok: false, reason: `the branch pattern ${checked.message}` };
	if (!used.includes('{id}')) return { ok: false, reason: 'the branch pattern does not identify the unit: it needs {id}' };
	const name = used.replace(/\{id\}/g, unitId(unit)).replace(/\{type\}/g, unitType(unit)).replace(/\{slug\}/g, slugOf(slug));
	if (name.length === 0 || name.length > 200) return { ok: false, reason: `the branch name '${name}' must be 1 to 200 characters` };
	if (!/^[A-Za-z0-9/_.-]+$/.test(name)) return { ok: false, reason: `the branch name '${name}' has characters a branch name cannot have` };
	if (name.startsWith('/') || name.endsWith('/') || name.includes('//')) return { ok: false, reason: `the branch name '${name}' has a leading, trailing or doubled slash (an empty {slug}?)` };
	if (name.includes('..') || name.endsWith('.lock') || name.endsWith('.') || name.split('/').some(part => part.startsWith('.'))) return { ok: false, reason: `the branch name '${name}' is not a valid branch name` };
	return { ok: true, name };
}

// ---------------------------------------------------------------------------
// Artifact paths a unit may park
// ---------------------------------------------------------------------------

/** The artifact ids a unit's stages write: an Epic the Define and HLD, a Story its LLD and PLAN. */
function unitArtifactIds(unit: HandoffUnit): readonly string[] {
	return unit.storyId !== undefined
		? [lldArtifactId(unit.epicHash, unit.storyId), planArtifactId(unit.epicHash, unit.storyId)]
		: [defineArtifactId(unit.epicHash), hldArtifactId(unit.epicHash)];
}

/**
 * Is this repo-relative path one of the unit's own artifact files: the artifact JSON of one of its stages, or a markdown file
 * in its work-item folder (the segment ending in the epic hash prefix), and for a Story only in that Story's own folder?
 * Absolute paths, '..' and backslashes are never the unit's.
 */
export function isUnitArtifactPath(unit: HandoffUnit, path: string): boolean {
	if (path.length === 0 || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..') || /^[A-Za-z]:/.test(path)) return false;
	if (unitArtifactIds(unit).some(id => path === `.insrc/artifacts/${id}.json`)) return true;
	const parts = path.split('/');
	if (parts[0] !== 'docs' || (parts[1] !== 'epics' && parts[1] !== 'standalone') || !path.endsWith('.md')) return false;
	const folder = parts[2];
	if (folder === undefined || !new RegExp(`E\\d{8}${unit.epicHash.slice(0, 8)}$`).test(folder)) return false;
	const sub = parts[3];
	if (unit.storyId === undefined) return sub !== undefined && !/^S\d{3}$/.test(sub);
	const number = /^s(\d+)$/i.exec(unit.storyId)?.[1];
	return number !== undefined && sub === `S${number.padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type CheckpointCheck = { readonly ok: true; readonly checkpoint: HandoffCheckpoint } | { readonly ok: false; readonly reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const no = (reason: string): CheckpointCheck => ({ ok: false, reason });

/**
 * Check a checkpoint read from a branch before anything is restored from it: the schema version and kind, that it is for this unit,
 * that every parked path is the unit's own, and the fields its kind needs. The reason names the first thing wrong.
 */
export function validateCheckpoint(raw: unknown, unit: HandoffUnit): CheckpointCheck {
	if (!isObject(raw)) return no('the checkpoint is not an object');
	if (raw['schemaVersion'] !== CHECKPOINT_SCHEMA_VERSION) return no(`unknown checkpoint schemaVersion ${String(raw['schemaVersion'])} (this daemon reads ${CHECKPOINT_SCHEMA_VERSION})`);
	const kind = raw['kind'];
	if (kind !== 'run' && kind !== 'draft') return no(`unknown checkpoint kind '${String(kind)}'`);
	const u = raw['unit'];
	if (!isObject(u) || u['epicHash'] !== unit.epicHash || (u['storyId'] ?? undefined) !== (unit.storyId ?? undefined)) return no('the checkpoint is for a different unit');
	for (const f of ['parkedBy', 'parkedAt', 'sourceHead', 'repositoryId'] as const) if (!isString(raw[f])) return no(`the checkpoint has no ${f}`);
	const paths = raw['artifactPaths'];
	if (!Array.isArray(paths) || !paths.every(isString)) return no('the checkpoint has no artifactPaths list');
	for (const p of paths as string[]) if (!isUnitArtifactPath(unit, p)) return no(`the checkpoint lists a file outside the unit's own artifacts: ${p}`);
	if (kind === 'draft') return { ok: true, checkpoint: raw as unknown as DraftCheckpoint };

	for (const f of ['runId', 'epicKey', 'owner'] as const) if (!isString(raw[f])) return no(`the run checkpoint has no ${f}`);
	const stage = raw['stage'];
	if (typeof stage !== 'string' || !STAGES.has(stage)) return no(`unknown run stage '${String(stage)}'`);
	const intent = raw['intent'];
	if (!isObject(intent) || !isString(intent['workflow']) || typeof intent['focus'] !== 'string' || !isObject(intent['params'])) return no('the run checkpoint has no usable intent');
	if ('repoPath' in intent || 'repoIndexedAt' in intent) return no("the run checkpoint's intent carries the parker's machine paths");
	const up = raw['upstream'];
	if (!Array.isArray(up) || !up.every(x => isObject(x) && isString(x['artifactId']) && typeof x['revision'] === 'number')) return no('the run checkpoint has no upstream snapshot');
	const executor = raw['executor'];
	if (stage === 'awaiting_llm_step') {
		if (!isObject(executor) || !isObject(executor['plan']) || typeof executor['nextStepIndex'] !== 'number' || !isObject(executor['stepOutputs']) || 'intent' in executor) {
			return no('the run checkpoint at awaiting_llm_step has no usable executor state');
		}
	} else if (executor !== undefined) return no(`the run checkpoint at ${stage} must not carry executor state`);
	if (stage === 'awaiting_synthesize') {
		if (!isObject(raw['stepOutputs'])) return no('the run checkpoint at awaiting_synthesize has no stepOutputs');
	} else if (raw['stepOutputs'] !== undefined) return no(`the run checkpoint at ${stage} must not carry stepOutputs`);
	return { ok: true, checkpoint: raw as unknown as RunCheckpoint };
}

// ---------------------------------------------------------------------------
// Rebinding
// ---------------------------------------------------------------------------

/**
 * A runnable payload for the receiving clone from a validated run checkpoint: the payload intent and the executor intent both get the
 * receiving repo's path and index watermark, and the run's clock starts now. Nothing from the parker's machine is left in the fields
 * the daemon reads (the checkpoint never stored them).
 */
export function rebindCheckpoint(checkpoint: RunCheckpoint, binding: { readonly repoPath: string; readonly repoIndexedAt: number | null; readonly now: number }): WorkflowStepStatePayload {
	const intent: WorkflowIntent = { ...checkpoint.intent, repoPath: binding.repoPath, repoIndexedAt: binding.repoIndexedAt };
	return {
		version:     1,
		runId:       checkpoint.runId,
		epicKey:     checkpoint.epicKey,
		startedAtMs: binding.now,
		intent,
		stage:       checkpoint.stage,
		...(checkpoint.stage === 'awaiting_llm_step' && checkpoint.executor !== undefined ? { executor: { ...checkpoint.executor, intent } } : {}),
		...(checkpoint.stage === 'awaiting_synthesize' && checkpoint.stepOutputs !== undefined ? { stepOutputs: checkpoint.stepOutputs } : {}),
	};
}

// ---------------------------------------------------------------------------
// Stage inference
// ---------------------------------------------------------------------------

/**
 * Which stage a unit needs next, from the artifact chain on disk: an Epic with no HLD needs design.epic; a Story with no LLD needs
 * design.story, with an LLD and no PLAN needs plan (a committed LLD never hides an unfinished plan), with both is complete.
 */
export function inferStageWorkflow(repoPath: string, unit: UnitRef | (HandoffUnit & { readonly repoPath: string })): 'design.epic' | 'design.story' | 'plan' | 'complete' {
	const has = (id: string): boolean => existsSync(artifactJsonPath(repoPath, id));
	if (unit.storyId === undefined) return has(hldArtifactId(unit.epicHash)) ? 'complete' : 'design.epic';
	if (!has(lldArtifactId(unit.epicHash, unit.storyId))) return 'design.story';
	return has(planArtifactId(unit.epicHash, unit.storyId)) ? 'complete' : 'plan';
}
