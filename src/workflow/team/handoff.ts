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

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve } from 'node:path';

import { validateBranchPattern } from '../../config/repo-fields.js';
import { resolveBranchPattern } from '../config/github.js';
import type { WorkflowStepStatePayload } from '../../daemon/steps/workflow-step/state.js';
import { listStates, type RunEntryMeta } from '../../daemon/steps/workflow-step/state-store.js';
import { snapshotUpstream } from './run-meta.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId, readEpicDefinitionCore } from '../storage.js';
import type { IssueRef, TrackerPort } from '../tracker/port.js';
import type { UnitRef } from '../tracker/refs.js';
import type { ExecutorState, WorkflowIntent } from '../types.js';
import { authorUnitOf } from './author-gate.js';
import { claimsEnforcedFor, describeOutcome, readHolder, teamContext, teamGate, TeamGateRefusedError, type GateOutcome } from './gate.js';
import { createDeadline, runGitAsync } from './git-async.js';
import { runGit } from './git.js';
import { pickRemote } from './policy-reader.js';
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
	/** Set by buildRunCheckpoint / the draft builder once the parker's repository path has been replaced by REPO_ROOT_TOKEN everywhere. */
	readonly portable:      true;
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
	if (name.startsWith('-') || name.includes('..') || name.endsWith('.') || name.split('/').some(part => part.startsWith('.') || part.endsWith('.lock'))) return { ok: false, reason: `the branch name '${name}' is not a valid branch name` };
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
	// only a path already in normal form: no '.', '..' or empty segments, no backslash, not absolute or drive-lettered
	if (path.length === 0 || path.startsWith('/') || path.includes('\\') || /^[A-Za-z]:/.test(path) || posix.normalize(path) !== path || path.split('/').some(part => part === '' || part === '.' || part === '..')) return false;
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
	if (raw['portable'] !== true) return no('the checkpoint was not made portable (it may still carry the parker\'s machine paths)');
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

/** Stands for the parker's repository root inside a checkpoint; rebinding writes the receiving clone's path in its place. */
export const REPO_ROOT_TOKEN = '<repo-root>';

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A deep copy of `value` with every string passed through `fn` (objects and arrays are walked; other values are kept). */
function mapStrings<T>(value: T, fn: (text: string) => string): T {
	if (typeof value === 'string') return fn(value) as T;
	if (Array.isArray(value)) return value.map(v => mapStrings(v, fn)) as T;
	if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [fn(k), mapStrings(v, fn)])) as T;
	return value;
}

/**
 * `value` with the parker's absolute repository path replaced, wherever it appears in a string, by REPO_ROOT_TOKEN. Park runs
 * a run's params, executor state and step outputs through this, so a checkpoint never carries the parker's machine path
 * (a step output may quote a file by its full path). A longer name that merely starts with the path (repo2, repo.v2) is left alone; a path that ends a sentence is replaced.
 */
export function portablePaths<T>(value: T, parkerRepoPath: string): T {
	if (parkerRepoPath.length === 0) return value;
	const re = new RegExp(`${escapeRegExp(parkerRepoPath.replace(/\/+$/, ''))}(?![A-Za-z0-9_-]|\\.[A-Za-z0-9])`, 'g');
	return mapStrings(value, text => text.replace(re, REPO_ROOT_TOKEN));
}

/**
 * A runnable payload for the receiving clone from a validated run checkpoint: the payload intent and the executor intent both get the
 * receiving repo's path and index watermark, the run's clock starts now, and every REPO_ROOT_TOKEN a park left in the params, the
 * executor state or the step outputs becomes the receiving clone's path. Nothing from the parker's machine is left in the payload.
 */
export function rebindCheckpoint(checkpoint: RunCheckpoint, binding: { readonly repoPath: string; readonly repoIndexedAt: number | null; readonly now: number }): WorkflowStepStatePayload {
	// every REPO_ROOT_TOKEN, in the params, the executor state and the step outputs, becomes the receiving clone's path
	const local = <V>(v: V): V => mapStrings(v, text => text.split(REPO_ROOT_TOKEN).join(binding.repoPath));
	const intent: WorkflowIntent = { ...local(checkpoint.intent), repoPath: binding.repoPath, repoIndexedAt: binding.repoIndexedAt };
	return {
		version:     1,
		runId:       checkpoint.runId,
		epicKey:     checkpoint.epicKey,
		startedAtMs: binding.now,
		intent,
		stage:       checkpoint.stage,
		...(checkpoint.stage === 'awaiting_llm_step' && checkpoint.executor !== undefined ? { executor: { ...local(checkpoint.executor), intent } } : {}),
		...(checkpoint.stage === 'awaiting_synthesize' && checkpoint.stepOutputs !== undefined ? { stepOutputs: local(checkpoint.stepOutputs) } : {}),
	};
}

/** What park knows when it turns a live run into a checkpoint. */
export interface RunCheckpointInput {
	readonly unit:          HandoffUnit;
	readonly parkedBy:      string;
	readonly parkedAt:      string;
	readonly sourceHead:    string;
	readonly repositoryId:  string;
	readonly artifactPaths: readonly string[];
	/** The live run, as the daemon holds it (carrying the parker's repoPath and repoIndexedAt). */
	readonly payload:       WorkflowStepStatePayload;
	readonly owner:         string;
	readonly upstream:      readonly UpstreamRevision[];
}

/**
 * The run checkpoint for a live run: the machine-local fields (repoPath, repoIndexedAt, the executor's own intent, the clock) are
 * dropped, and the parker's repository path is replaced by REPO_ROOT_TOKEN everywhere else (params, executor state, step
 * outputs), so what is committed to the handoff branch carries nothing from the parker's machine. This is the only builder of a
 * run checkpoint, and it sets `portable`, which validation requires.
 */
export function buildRunCheckpoint(input: RunCheckpointInput): RunCheckpoint {
	const { payload } = input;
	const parker = payload.intent.repoPath;
	const portable = <V>(v: V): V => portablePaths(v, parker);
	const { repoPath: _repoPath, repoIndexedAt: _indexedAt, ...intent } = payload.intent;
	void _repoPath; void _indexedAt;
	const { intent: _executorIntent, ...executor } = payload.executor ?? ({} as ExecutorState);
	void _executorIntent;
	return {
		schemaVersion: CHECKPOINT_SCHEMA_VERSION, kind: 'run', portable: true,
		unit: input.unit, parkedBy: input.parkedBy, parkedAt: input.parkedAt, sourceHead: input.sourceHead, repositoryId: input.repositoryId,
		artifactPaths: input.artifactPaths,
		runId: payload.runId, epicKey: payload.epicKey, stage: payload.stage,
		intent: portable(intent),
		...(payload.stage === 'awaiting_llm_step' && payload.executor !== undefined ? { executor: portable(executor) } : {}),
		...(payload.stage === 'awaiting_synthesize' && payload.stepOutputs !== undefined ? { stepOutputs: portable(payload.stepOutputs) } : {}),
		owner: input.owner, upstream: input.upstream,
	};
}

// ---------------------------------------------------------------------------
// Stage inference
// ---------------------------------------------------------------------------

/**
 * The unit's own artifact files that differ from HEAD in the working tree (changed, staged or untracked): its draft, as
 * repo-relative paths. A repo that is not a git repository, or a git failure, has none.
 */
export function unitDraftFiles(repoPath: string, unit: HandoffUnit): readonly string[] {
	const status = runGit(repoPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.insrc/artifacts', 'docs']);
	if (!status.ok) return [];
	const files: string[] = [];
	const entries = status.stdout.split('\0').filter(e => e.length > 3);
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i] as string;
		const code = entry.slice(0, 2);
		const path = entry.slice(3);
		if (code[0] === 'R' || code[0] === 'C') i += 1;   // a rename or copy entry is followed by its source path
		if (isUnitArtifactPath(unit, path)) files.push(path);
	}
	return files;
}

/**
 * The park offer a process can make from the working tree alone: the unit (an Epic or a Story) has a draft artifact that is not
 * committed. The daemon adds the live runs it holds; the terminal, which has no run store, uses this. Never throws.
 */
export function draftParkOffer(repoPath: string, unit: { readonly unit: string } & HandoffUnit): boolean {
	try { return unit.unit !== 'task' && unitDraftFiles(repoPath, unit).length > 0; } catch { return false; }
}

/** Is this file committed at HEAD? (A file only in the working tree, such as a local draft, is not.) */
function committedAtHead(repoPath: string, artifactId: string): boolean {
	return runGit(repoPath, ['cat-file', '-e', `HEAD:${relative(repoPath, artifactJsonPath(repoPath, artifactId)).split('\\').join('/')}`]).ok;
}

/**
 * Which stage a unit needs next, from the artifacts committed at HEAD (a draft that exists only in the working tree does not
 * count): an Epic with no HLD needs design.epic; a Story with no LLD needs design.story, with an LLD and no PLAN needs plan (a
 * committed LLD never hides an unfinished plan), with both is complete.
 */
export function inferStageWorkflow(repoPath: string, unit: UnitRef | (HandoffUnit & { readonly repoPath: string })): 'design.epic' | 'design.story' | 'plan' | 'complete' {
	const has = (id: string): boolean => committedAtHead(repoPath, id);
	if (unit.storyId === undefined) return has(hldArtifactId(unit.epicHash)) ? 'complete' : 'design.epic';
	if (!has(lldArtifactId(unit.epicHash, unit.storyId))) return 'design.story';
	return has(planArtifactId(unit.epicHash, unit.storyId)) ? 'complete' : 'plan';
}

// ---------------------------------------------------------------------------
// Parking: deciding what to hand over
// ---------------------------------------------------------------------------

/** Does a stored run change this unit (same repository, unit kind, epic and story)? (park-offer.ts holds the same check; see docs/plans/s6-open-issues.md S6-1.) */
function runIsForUnit(intent: Pick<WorkflowIntent, 'workflow' | 'repoPath' | 'params'>, unit: UnitRef): boolean {
	const u = authorUnitOf(intent);
	return u !== undefined
		&& resolve(u.repoPath) === resolve(unit.repoPath)
		&& u.unit === unit.unit
		&& u.epicHash === unit.epicHash
		&& (u.storyId ?? undefined) === (unit.storyId ?? undefined);
}

/** What park may be told about its surroundings; tests replace these. */
export interface ParkDeps {
	readonly branchPattern?: ((repo: string) => string | undefined) | undefined;
	readonly now?:           (() => string) | undefined;
	/** Where the temporary worktree is made (the system temp directory by default). */
	readonly tmpRoot?:       string | undefined;
	/** Called after the commit is made and before it is pushed. */
	readonly beforePush?:    (() => void) | undefined;
	/** Test seam: makes a git command of a park fail with this text when it returns one (it is given the command's arguments). */
	readonly failGit?:       ((args: readonly string[]) => string | undefined) | undefined;
}

/** Everything park has decided, ready to be carried out. Nothing has been changed yet. */
export interface ParkPlan {
	readonly ok:         true;
	readonly repo:       string;
	readonly unit:       UnitRef;
	readonly branch:     string;
	readonly variant:    'run' | 'draft';
	readonly checkpoint: HandoffCheckpoint;
	/** The unit's uncommitted draft files that go to the branch with the checkpoint. */
	readonly files:      readonly string[];
	/** The run that is checkpointed, for the issue note; absent for a draft-only plan. */
	readonly runId?:     string | undefined;
	readonly actor:      string;
	readonly holder:     string;
	readonly issue:      IssueRef;
	readonly port:       TrackerPort;
}

export type ParkPlanResult = ParkPlan | { readonly ok: false; readonly reason: string };

const refuse = (reason: string): ParkPlanResult => ({ ok: false, reason });
const reasonOf = (o: GateOutcome): string => (o.kind === 'allowed' ? 'the gate allowed an action it should have refused' : describeOutcome(o));

/**
 * Decide whether and what to park, as the actor, for a unit someone else now holds. Refuses (with the reason, changing nothing)
 * when the unit is a Task, the repo does not enforce claims, the unit has no issue or nobody holds it, the actor holds it, a
 * supplied run token is not the actor's run for this unit, there is nothing to hand over, or the branch name is not valid.
 * Otherwise it picks the actor's most recently touched owned run (or only the draft) and assembles the checkpoint. Only reads.
 */
export function parkPlan(repo: string, unit: UnitRef, opts: { readonly runToken?: string | undefined } = {}, deps: ParkDeps = {}): ParkPlanResult {
	try {
		if (unit.unit === 'task') return refuse('a Task has no run to hand over: commit your code on a branch as usual');

		// the branch first: it needs no git and no tracker, so a bad pattern refuses before either is touched
		const slug = readEpicDefinitionCore(repo, unit.epicHash).epicSlug ?? unit.epicHash;
		const pattern = (deps.branchPattern ?? resolveBranchPattern)(repo);
		const named = handoffBranchName(pattern, unit, slug);
		if (!named.ok) return refuse(named.reason);


		// the tracker side: who acts, which issue, who holds it
		// a read: a missing issue is reported, never created
		const ctx = teamContext(repo, unit, { createIssue: false });
		if (!ctx.ok) return refuse(ctx.outcome.kind === 'no-issue' ? 'this stage has no tracker issue yet, so there is nobody to hand over to' : reasonOf(ctx.outcome));
		if (!ctx.team) return refuse('this repository does not enforce claims, so there is nothing to hand over');
		const read = readHolder(ctx, unit, deps.now ?? (() => new Date().toISOString()));
		if (!read.ok) return refuse(reasonOf(read.outcome));
		const holder = read.state.holder;
		if (holder === null) return refuse('nobody holds this stage: claim it and continue, there is nothing to hand over');
		if (holder.toLowerCase() === ctx.who.toLowerCase()) return refuse('you hold this stage; there is nothing to hand over');
		const actor = ctx.who;

		// the run: a supplied token must be the actor's own run for this unit; otherwise the most recently touched owned run
		const mine = (e: ReturnType<typeof listStates>[number]): boolean => e.meta?.owner !== undefined && e.meta.owner.toLowerCase() === actor.toLowerCase() && runIsForUnit(e.payload.intent, { ...unit, repoPath: repo });
		let chosen: ReturnType<typeof listStates>[number] | undefined;
		if (opts.runToken !== undefined) {
			const entry = listStates().find(e => e.token === opts.runToken);
			if (entry === undefined) return refuse('that run token is not a live run (the daemon may have restarted or the run expired)');
			if (!runIsForUnit(entry.payload.intent, { ...unit, repoPath: repo })) return refuse('that run belongs to another unit');
			if (entry.meta?.owner === undefined) return refuse('that run has no recorded owner, so it cannot be shown to be yours');
			if (entry.meta.owner.toLowerCase() !== actor.toLowerCase()) return refuse(`that run belongs to ${entry.meta.owner}`);
			chosen = entry;
		} else {
			chosen = listStates().find(mine);   // newest touch first
		}
		const files = unitDraftFiles(repo, unit);
		if (chosen === undefined && files.length === 0) return refuse('no draft or run to hand over');

		// the checkpoint
		const head = runGit(repo, ['rev-parse', 'HEAD']);
		const roots = runGit(repo, ['rev-list', '--max-parents=0', 'HEAD']);
		if (!head.ok || !roots.ok) return refuse(`cannot read the repository's history: ${head.ok ? (roots as { stderr: string }).stderr : head.stderr}`);
		const repositoryId = roots.stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0).sort()[0];
		if (repositoryId === undefined) return refuse('the repository has no commits to park from');
		const common = { unit: { epicHash: unit.epicHash, ...(unit.storyId !== undefined ? { storyId: unit.storyId } : {}) }, parkedBy: actor, parkedAt: (deps.now ?? (() => new Date().toISOString()))(), sourceHead: head.stdout.trim(), repositoryId, artifactPaths: files };
		const meta: RunEntryMeta | undefined = chosen?.meta;
		const checkpoint: HandoffCheckpoint = chosen !== undefined
			? buildRunCheckpoint({ ...common, payload: chosen.payload, owner: actor, upstream: meta?.upstream ?? [] })
			: { schemaVersion: CHECKPOINT_SCHEMA_VERSION, kind: 'draft', portable: true, ...common };
		return {
			ok: true, repo, unit, branch: named.name, variant: checkpoint.kind, checkpoint, files,
			...(chosen !== undefined ? { runId: chosen.payload.runId } : {}),
			actor, holder, issue: ctx.issue, port: ctx.port,
		};
	} catch (err) {
		return refuse(`park could not be planned: ${err instanceof Error ? err.message : String(err)}`);
	}
}

// ---------------------------------------------------------------------------
// Parking: carrying it out
// ---------------------------------------------------------------------------

export type ParkResult =
	| {
		readonly ok:        true;
		readonly branch:    string;
		readonly commit:    string;
		/** Whether the note was added to the issue; a failed note does not undo the push. */
		readonly noted:     boolean;
		readonly noteFailure?: string | undefined;
		/** Set when the park succeeded but the temporary worktree or branch could not all be removed. */
		readonly cleanupWarning?: string | undefined;
		readonly variant:   'run' | 'draft';
		readonly runId?:    string | undefined;
	}
	| { readonly ok: false; readonly reason: string };

/** The checkpoint's path on the handoff branch. */
export const checkpointPath = (unit: HandoffUnit): string => `.insrc/handoff/${unit.storyId !== undefined ? `story-${unit.epicHash}-${unit.storyId}` : `epic-${unit.epicHash}`}.json`;

/** The time one git call of a park may take; the commands that talk to the remote can be slow, so none of them blocks the daemon. */
const PARK_GIT_MS = 60_000;

/** Run git without blocking the daemon: the same {ok, stdout} / {ok:false, stderr} shape as runGit. */
async function git(cwd: string, args: readonly string[], deps: ParkDeps = {}): Promise<{ ok: true; stdout: string } | { ok: false; stderr: string }> {
	const injected = deps.failGit?.(args);
	if (injected !== undefined) return { ok: false, stderr: injected };
	const r = await runGitAsync(cwd, args, createDeadline(PARK_GIT_MS));
	return r.ok ? r : { ok: false, stderr: r.timedOut ? `git ${args[0] ?? ''} did not finish within ${PARK_GIT_MS / 1000} s` : r.stderr };
}

/** The note added to the unit's issue, with a marker so it can be told from other comments. */
function handoffNote(plan: ParkPlan, commit: string): string {
	return [
		'<!-- insrc:handoff -->',
		`**Handoff:** ${plan.actor} parked unfinished work on this ${plan.unit.unit === 'epic' ? 'Epic' : 'Story'} before ${plan.holder} took it over.`,
		'',
		`- Branch: \`${plan.branch}\``,
		`- Commit: \`${commit}\``,
		`- What was parked: ${plan.variant === 'run' ? `the run \`${plan.runId ?? ''}\` (stage \`${(plan.checkpoint as RunCheckpoint).stage}\`) and its draft files` : 'the draft files'}`,
		'',
		`Continue with \`team resume ${plan.unit.epicHash}${plan.unit.storyId !== undefined ? ` ${plan.unit.storyId}` : ''}\`.`,
	].join('\n');
}

/**
 * Carry out a park plan: commit the unit's draft files and the checkpoint to the handoff branch through a temporary worktree
 * (so the checked-out branch, the index and the working tree are never touched), push it, and add one note to the issue. A second
 * park builds on the branch as the remote has it. Whatever goes wrong, the temporary worktree and its local branch are removed
 * and the run stays in the daemon. A push that loses a race is reported as another owner having parked first; a note that fails
 * is reported in the result and does not undo the push.
 */
export async function executePark(plan: ParkPlan, deps: ParkDeps = {}): Promise<ParkResult> {
	const { repo, branch } = plan;
	const remote = pickRemote(repo);
	if (remote === undefined) return { ok: false, reason: 'park failed: the repository has no git remote to push the handoff branch to' };
	const fail = (step: string, detail: string): ParkResult => ({ ok: false, reason: `park failed at ${step}: ${detail}` });

	const base = await (async (): Promise<{ ok: true; sha: string } | { ok: false; result: ParkResult }> => {
		const listed = await git(repo, ['ls-remote', '--heads', remote, `refs/heads/${branch}`], deps);
		if (!listed.ok) return { ok: false, result: fail('looking for the handoff branch', `remote '${remote}' could not be reached: ${listed.stderr}`) };
		if (listed.stdout.trim().length === 0) return { ok: true, sha: plan.checkpoint.sourceHead };
		const fetched = await git(repo, ['fetch', '--quiet', remote, `refs/heads/${branch}`], deps);
		if (!fetched.ok) return { ok: false, result: fail('fetching the handoff branch', fetched.stderr) };
		const sha = await git(repo, ['rev-parse', 'FETCH_HEAD'], deps);
		return sha.ok ? { ok: true, sha: sha.stdout.trim() } : { ok: false, result: fail('reading the handoff branch', sha.stderr) };
	})();
	if (!base.ok) return base.result;

	const dir = mkdtempSync(join(deps.tmpRoot ?? tmpdir(), 'insrc-park-'));
	const tmpBranch = `insrc-park-tmp-${Math.random().toString(36).slice(2, 10)}`;
	const attempt = async (): Promise<ParkResult> => {
		const added = await git(repo, ['worktree', 'add', '-q', '-b', tmpBranch, dir, base.sha], deps);
		if (!added.ok) return fail('making the temporary worktree', added.stderr);   // the finally below removes whatever git did make

		// the draft files, copied as they are in the working tree (a deleted draft is deleted on the branch)
		const paths: string[] = [];
		for (const f of plan.files) {
			const src = join(repo, f);
			if (existsSync(src)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); copyFileSync(src, join(dir, f)); paths.push(f); }
			else {
				const removed = await git(dir, ['rm', '-q', '--ignore-unmatch', '--', f], deps);
				if (!removed.ok) return fail('removing a deleted draft file', removed.stderr);
			}
		}
		const cp = checkpointPath(plan.unit);
		mkdirSync(dirname(join(dir, cp)), { recursive: true });
		writeFileSync(join(dir, cp), JSON.stringify(plan.checkpoint, null, 2) + '\n', 'utf8');
		const staged = await git(dir, ['add', '-f', '--', cp, ...paths], deps);
		if (!staged.ok) return fail('staging the draft', staged.stderr);
		const committed = await git(dir, ['commit', '-q', '--allow-empty', '-m', `park: ${plan.variant === 'run' ? 'run and draft' : 'draft'} of ${plan.unit.unit} ${plan.unit.epicHash}${plan.unit.storyId !== undefined ? `/${plan.unit.storyId}` : ''} from ${plan.actor} (now held by ${plan.holder})`], deps);
		if (!committed.ok) return fail('committing the draft', committed.stderr);
		const head = await git(dir, ['rev-parse', 'HEAD'], deps);
		if (!head.ok) return fail('reading the commit', head.stderr);
		const commit = head.stdout.trim();

		deps.beforePush?.();
		const pushed = await git(dir, ['push', '-q', remote, `${tmpBranch}:refs/heads/${branch}`], deps);
		if (!pushed.ok) {
			return /non-fast-forward|fetch first|\(already exists\)|stale info/.test(pushed.stderr)
				? { ok: false, reason: `park failed at pushing: someone else parked first: the handoff branch '${branch}' moved while you were parking; resume from it or park again` }
				: fail('pushing the handoff branch', pushed.stderr);
		}

		// the note: one comment; its failure is reported, the push stands
		const note = plan.port.issueOps.comment(plan.issue, handoffNote(plan, commit));
		return {
			ok: true, branch, commit, noted: note.ok, variant: plan.variant,
			...(note.ok ? {} : { noteFailure: `${note.kind}: ${note.reason}` }),
			...(plan.runId !== undefined ? { runId: plan.runId } : {}),
		};
	};

	let result: ParkResult;
	try { result = await attempt(); }
	catch (err) { result = fail('parking', err instanceof Error ? err.message : String(err)); }

	// Always, and in this order: even a worktree that git half-made (a hook failed after the branch and directory existed) is removed.
	// Each step is harmless when there is nothing to remove; afterwards what is still there is reported, never silently left.
	await git(repo, ['worktree', 'remove', '--force', dir], deps);
	rmSync(dir, { recursive: true, force: true });
	await git(repo, ['worktree', 'prune'], deps);
	const deleted = await git(repo, ['branch', '-D', tmpBranch], deps);
	if (!deleted.ok) await git(repo, ['update-ref', '-d', `refs/heads/${tmpBranch}`], deps);   // a second way to drop the branch
	const left: string[] = [];
	const worktrees = await git(repo, ['worktree', 'list', '--porcelain']);
	if (!worktrees.ok || worktrees.stdout.includes(dir)) left.push(`the temporary worktree ${dir}`);
	const branches = await git(repo, ['branch', '--list', tmpBranch]);
	if (!branches.ok || branches.stdout.trim().length > 0) left.push(`the temporary branch ${tmpBranch}`);
	if (existsSync(dir)) left.push(`the directory ${dir}`);
	if (left.length > 0) {
		const warning = `${left.join(' and ')} could not be removed; remove ${left.length > 1 ? 'them' : 'it'} by hand (git worktree remove --force, git branch -D)`;
		result = result.ok ? { ...result, cleanupWarning: warning } : { ok: false, reason: `${result.reason}; cleanup also failed: ${warning}` };
	}
	return result;
}

/** Plan a park and, when it is allowed, carry it out. */
export async function parkDraft(repo: string, unit: UnitRef, opts: { readonly runToken?: string | undefined } = {}, deps: ParkDeps = {}): Promise<ParkResult> {
	const plan = parkPlan(repo, unit, opts, deps);
	return plan.ok ? await executePark(plan, deps) : { ok: false, reason: plan.reason };
}

// ---------------------------------------------------------------------------
// Resuming: verifying before anything is restored
// ---------------------------------------------------------------------------

/** The stages a unit can be resumed at. */
export type StageWorkflow = 'design.epic' | 'design.story' | 'plan';

/** What resume would do, verified and ready to be carried out. Nothing in the working tree has been changed. */
export interface ResumePlan {
	readonly repo:       string;
	readonly unit:       UnitRef;
	readonly workflow:   StageWorkflow;
	readonly branch:     string;
	readonly checkpoint: HandoffCheckpoint;
	/** The parked files as the branch holds them, to be written to the working tree. */
	readonly files:      readonly { readonly path: string; readonly content: string }[];
}

export type ResumeCheck =
	/** A parked run to restore into the daemon's store and continue. */
	| { readonly kind: 'resume'; readonly plan: ResumePlan & { readonly checkpoint: RunCheckpoint } }
	/** Start the stage afresh on the committed artifacts; `restore` is set when a draft-only checkpoint's files are to be put back first. */
	| { readonly kind: 'restart'; readonly workflow: StageWorkflow; readonly params: { readonly epicHash: string; readonly storyId?: string | undefined }; readonly reason: string; readonly restore?: ResumePlan | undefined }
	| { readonly kind: 'nothing-to-resume'; readonly reason: string }
	| { readonly kind: 'refused'; readonly reason: string };

export interface ResumeDeps extends ParkDeps {
	/** The repos registered with the daemon; the real registry by default. */
	readonly listRepos?: (() => Promise<readonly { readonly path: string }[]>) | undefined;
}

const refused = (reason: string): ResumeCheck => ({ kind: 'refused', reason });

const STAGE_WORKFLOWS: ReadonlySet<string> = new Set<StageWorkflow>(['design.epic', 'design.story', 'plan']);

/** The root commit id of a repository (the first when there are several), or undefined when git cannot say. */
function repositoryIdOf(repoPath: string): string | undefined {
	const roots = runGit(repoPath, ['rev-list', '--max-parents=0', 'HEAD']);
	return roots.ok ? roots.stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0).sort()[0] : undefined;
}

/** Is the path registered with the daemon, and (when an id is given) is it the same repository? */
export async function verifyReceivingRepo(repoPath: string, repositoryId: string | undefined, deps: Pick<ResumeDeps, 'listRepos'> = {}): Promise<{ ok: true } | { ok: false; reason: string }> {
	let registered: readonly { readonly path: string }[];
	try { registered = await (deps.listRepos ?? (async () => (await import('../../db/repos.js')).listRepos(null as never)))(); }
	catch (err) { return { ok: false, reason: `the daemon's repository registry could not be read: ${err instanceof Error ? err.message : String(err)}` }; }
	if (!registered.some(r => resolve(r.path) === resolve(repoPath))) return { ok: false, reason: `${repoPath} is not a repository registered with the daemon: register it first (insrc repo add)` };
	if (repositoryId === undefined) return { ok: true };
	const mine = repositoryIdOf(repoPath);
	if (mine === undefined) return { ok: false, reason: `${repoPath} is not a git repository with history, so it cannot be the repository the draft was parked from` };
	return mine === repositoryId ? { ok: true } : { ok: false, reason: `${repoPath} is a different repository from the one the draft was parked from (its first commit is ${mine.slice(0, 12)}, the checkpoint's is ${repositoryId.slice(0, 12)})` };
}

const sameSnapshot = (a: readonly UpstreamRevision[], b: readonly UpstreamRevision[]): string[] => {
	const key = (u: UpstreamRevision): string => `${u.artifactId} @ revision ${u.revision}`;
	const left = new Set(a.map(key));
	const right = new Set(b.map(key));
	return [...[...left].filter(k => !right.has(k)).map(k => `${k} (parked)`), ...[...right].filter(k => !left.has(k)).map(k => `${k} (now)`)];
};

/** Is this file committed (and so on the clone) already as the unit's stage artifact? */
function stageArtifactCommitted(repoPath: string, unit: HandoffUnit, workflow: StageWorkflow): boolean {
	const id = workflow === 'design.epic' ? hldArtifactId(unit.epicHash) : workflow === 'design.story' ? lldArtifactId(unit.epicHash, unit.storyId ?? '') : planArtifactId(unit.epicHash, unit.storyId ?? '');
	return committedAtHead(repoPath, id);
}

/**
 * Everything resume checks before it changes anything (it writes no working file): that the receiving path is a registered repository,
 * that this is a repo enforcing claims and the actor may author the stage (the author gate, which claims an unassigned unit), which
 * stage is next (the given workflow or the one inferred from the committed artifacts), whether the stage is already done, whether
 * a handoff branch exists (a missing branch is told apart from a failure to reach the remote), that the checkpoint on it is valid
 * and for this unit and for this repository, that the upstream artifacts still have the revisions the run started from, and that
 * no file to be restored has local changes. Throws TeamGateRefusedError when the gate refuses; every other refusal is a value.
 */
export async function resumeCheck(repo: string, unit: UnitRef, opts: { readonly workflow?: string | undefined } = {}, deps: ResumeDeps = {}): Promise<ResumeCheck> {
	try {
		if (unit.unit === 'task') return refused('a Task has no run to resume: continue its build as usual');

		const registered = await verifyReceivingRepo(repo, undefined, deps);
		if (!registered.ok) return refused(registered.reason);
		const enforced = claimsEnforcedFor(repo);
		if (enforced !== 'yes') return refused(enforced === 'no' ? 'this repository does not enforce claims, so there is nothing to take over' : enforced);

		// the stage: the one asked for (it must fit the unit) or the one the committed artifacts say is next
		let workflow: StageWorkflow;
		if (opts.workflow !== undefined) {
			if (!STAGE_WORKFLOWS.has(opts.workflow)) return refused(`'${opts.workflow}' is not a stage that can be resumed: use design.epic, design.story or plan`);
			workflow = opts.workflow as StageWorkflow;
			if ((workflow === 'design.epic') !== (unit.storyId === undefined)) return refused(`the stage ${workflow} does not belong to this ${unit.unit}`);
			if (workflow === 'plan' && !stageArtifactCommitted(repo, unit, 'design.story')) return refused('the plan cannot be resumed: the Story has no committed LLD yet, so design.story comes first');
			if (stageArtifactCommitted(repo, unit, workflow)) return { kind: 'nothing-to-resume', reason: `the ${workflow} stage of this ${unit.unit} is already committed` };
		} else {
			const inferred = inferStageWorkflow(repo, unit);
			if (inferred === 'complete') return { kind: 'nothing-to-resume', reason: `every stage of this ${unit.unit} that can be resumed is already committed` };
			workflow = inferred;
		}

		// may this actor author it? (An unassigned stage is claimed; a held one throws.)
		const outcome = teamGate(repo, unit, 'author', workflow);
		if (outcome.kind !== 'allowed' && !(outcome.kind === 'no-issue' && outcome.allowFirstAuthor)) throw new TeamGateRefusedError(outcome);

		const handoff: HandoffUnit = { epicHash: unit.epicHash, ...(unit.storyId !== undefined ? { storyId: unit.storyId } : {}) };
		const restart = (reason: string, restore?: ResumePlan): ResumeCheck => ({ kind: 'restart', workflow, params: handoff, reason, ...(restore !== undefined ? { restore } : {}) });

		// the branch
		const slug = readEpicDefinitionCore(repo, unit.epicHash).epicSlug ?? unit.epicHash;
		const named = handoffBranchName((deps.branchPattern ?? resolveBranchPattern)(repo), unit, slug);
		if (!named.ok) return refused(named.reason);
		const branch = named.name;
		const remote = pickRemote(repo);
		if (remote === undefined) return restart('this repository has no git remote, so there is no parked branch: start the stage afresh on the committed artifacts');
		const listed = await git(repo, ['ls-remote', '--heads', remote, `refs/heads/${branch}`], deps);
		if (!listed.ok) return refused(`the remote '${remote}' could not be reached to look for the handoff branch: ${listed.stderr}`);
		if (listed.stdout.trim().length === 0) return restart(`nothing was parked: there is no branch '${branch}' on '${remote}'; start the stage afresh on the committed artifacts`);

		// fetch it to a temporary ref, read and check the checkpoint, then drop the ref
		const tmpRef = `refs/insrc/resume/${Math.random().toString(36).slice(2, 10)}`;
		// fetched by URL with no FETCH_HEAD, so no remote-tracking ref is created or moved besides the temporary one
		const url = runGit(repo, ['remote', 'get-url', remote]);
		if (!url.ok) return refused(`the URL of remote '${remote}' could not be read: ${url.stderr}`);
		const fetched = await git(repo, ['fetch', '--quiet', '--no-write-fetch-head', url.stdout.trim(), `refs/heads/${branch}:${tmpRef}`], deps);
		if (!fetched.ok) return refused(`the handoff branch '${branch}' could not be fetched: ${fetched.stderr}`);
		try {
			const cpPath = checkpointPath(handoff);
			const shown = await git(repo, ['show', `${tmpRef}:${cpPath}`], deps);
			if (!shown.ok) return refused(`the handoff branch '${branch}' has no checkpoint at ${cpPath}: ${shown.stderr}`);
			let raw: unknown;
			try { raw = JSON.parse(shown.stdout); } catch { return refused(`the checkpoint at ${cpPath} on '${branch}' is not valid JSON`); }
			const valid = validateCheckpoint(raw, handoff);
			if (!valid.ok) return refused(valid.reason);
			const checkpoint = valid.checkpoint;

			const same = await verifyReceivingRepo(repo, checkpoint.repositoryId, deps);
			if (!same.ok) return refused(same.reason);

			if (checkpoint.kind === 'run') {
				if (checkpoint.intent.workflow !== workflow) return refused(`the parked run is for ${checkpoint.intent.workflow}, but the next stage of this ${unit.unit} is ${workflow}`);
				const moved = sameSnapshot(checkpoint.upstream, snapshotUpstream(repo, checkpoint.intent.workflow, checkpoint.intent.params));
				if (moved.length > 0) return refused(`the upstream moved since this run started: ${moved.join('; ')}; start the stage afresh instead`);
			}

			// the files to put back: none may have local changes, and their content is read from the branch now
			const dirty = checkpoint.artifactPaths.length === 0 ? { ok: true as const, stdout: '' } : runGit(repo, ['status', '--porcelain', '--untracked-files=all', '--', ...checkpoint.artifactPaths]);
			if (!dirty.ok) return refused(`the working tree could not be checked: ${dirty.stderr}`);
			if (dirty.stdout.trim().length > 0) return refused(`these files have local changes that a resume would overwrite: ${dirty.stdout.split('\n').filter(l => l.length > 3).map(l => l.slice(3)).join(', ')}; commit or stash them first`);
			const files: { path: string; content: string }[] = [];
			for (const path of checkpoint.artifactPaths) {
				const file = await git(repo, ['show', `${tmpRef}:${path}`], deps);
				if (file.ok) files.push({ path, content: file.stdout });   // a path the parker deleted is not on the branch: nothing to restore
			}

			const plan: ResumePlan = { repo, unit, workflow, branch, checkpoint, files };
			if (checkpoint.kind === 'run') return { kind: 'resume', plan: plan as ResumePlan & { checkpoint: RunCheckpoint } };
			return restart(`the parked draft carries no run: its files are restored and the stage restarts on them`, plan);
		} finally {
			await git(repo, ['update-ref', '-d', tmpRef], deps);
		}
	} catch (err) {
		if (err instanceof TeamGateRefusedError) throw err;
		return refused(`resume could not be checked: ${err instanceof Error ? err.message : String(err)}`);
	}
}
