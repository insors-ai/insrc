/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Repair: brings existing records into the common model on a repository of any schema version, where the conversion does nothing
 * once its marker is written. It runs the conversion's own steps, each of which can be repeated, in their fixed order. It keeps no
 * progress file and never writes the schema marker: a run that stopped is finished by running it again from the files as they are.
 *
 * A preview writes nothing. A plan that lists a problem writes nothing either. Once a run has begun writing it always answers a
 * report: a step that throws stops the run, and the report says what was committed, where it stopped and what is left.
 */

import { basename } from 'node:path';

import { createRepoLifecycle } from '../artifact-core/repo-lifecycle.js';
import type { RepoWriteObserver } from '../artifact-core/repo-lifecycle.js';
import type { Actor } from '../artifact-core/types.js';
import { TaskSets } from '../tasks/task-set.js';
import { amendmentRule, applyAmendments } from './amendments.js';
import { migrateHeads } from './apply.js';
import { applyFeedback, feedbackRule } from './feedback-rule.js';
import type { MigratedHeadSeams } from './migrated-head.js';
import { planConversion } from './plan.js';
import { applyRenames, renameRule } from './rename.js';
import { applyStamps, stampRule } from './stamps.js';
import { applyStoryHistory, storyHistoryRule } from './story-history.js';
import { applyTasks, repairTasksRule } from './tasks.js';
import type { TasksResult } from './tasks.js';
import { ConversionRefused } from './types.js';
import type { ConversionChange, ConversionDeps, ConversionPlan, RepairRecorder, RepairReport, RepairStep, RepairWrite, UnitOutcome } from './types.js';
import { applyUnits, knownEpicsOf, repairUnitsRule } from './units.js';

export type RepairMode = 'repair-preview' | 'repair';

export const isRepairMode = (mode: unknown): mode is RepairMode => mode === 'repair-preview' || mode === 'repair';

const MIGRATION_ACTOR: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };

export interface RepairOptions {
	/** Test seams. `writeHead` replaces the head file of the repair's store; `headSeams` reach into the head migration. */
	readonly writeHead?: ((path: string, bytes: string) => void) | undefined;
	readonly headSeams?: MigratedHeadSeams | undefined;
	readonly beforeRound?: ((taskId: string) => void) | undefined;
}

/** The conversion's rules, with the units and Tasks found from any record: a repair also serves a Story with no Define and a plan past approved. */
const REPAIR_RULES = [renameRule, stampRule, amendmentRule, feedbackRule, repairUnitsRule, repairTasksRule, storyHistoryRule];

/** The plan of a repair: the conversion's rules at any schema version, with no requirement that the tree be clean. */
export function planRepair(repo: string): Promise<ConversionPlan> {
	return planConversion(repo, { rules: REPAIR_RULES, resume: true, anySchema: true });
}

/** The store, history and Task sets a repair writes through, each commit reported as it happens. They share the daemon's per-artifact queue. */
function repairDeps(repo: string, record: RepairRecorder, options: RepairOptions): ConversionDeps {
	const observer: RepoWriteObserver = {
		appended: (file, artifactId) => record(artifactId, file === 'feedback' ? 'feedback-line' : 'log-entry'),
		headReplaced: path => record(basename(path, '.json'), 'head'),
		...(options.writeHead !== undefined ? { writeHead: options.writeHead } : {}),
	};
	const { store, history, service } = createRepoLifecycle(repo, observer);
	return { store, history, now: () => new Date(), actor: MIGRATION_ACTOR, taskSets: new TaskSets({ repoPath: repo, store, service, history, bindingWritten: id => record(id, 'binding') }) };
}

/** The steps in the order they have to run: renames first because History refuses an uppercase Story id, amendments before migration because it skips a record with no meta. */
function stepsOf(repo: string, deps: ConversionDeps, record: RepairRecorder, options: RepairOptions, failed: UnitOutcome[]): readonly { readonly step: RepairStep; readonly run: () => unknown }[] {
	return [
		{ step: 'rename',        run: () => applyRenames(repo, record) },
		{ step: 'stamp',         run: () => applyStamps(repo, record) },
		{ step: 'amendments',    run: () => applyAmendments(repo, record) },
		{ step: 'feedback',      run: () => applyFeedback(repo, deps) },
		{ step: 'migrate',       run: () => migrateHeads(repo, deps, { ...options.headSeams, headWritten: id => record(id, 'head') }) },
		{ step: 'units',         run: () => applyUnits(repo, deps, record, knownEpicsOf) },
		{ step: 'tasks',         run: async () => { const done: TasksResult = await applyTasks(repo, deps, { repair: true, beforeRound: options.beforeRound }); failed.push(...(done.failed ?? [])); } },
		{ step: 'story-history', run: () => applyStoryHistory(repo, deps) },
	];
}

/** What a further run would still consider; when the files cannot be planned over, what this run started from. */
async function remainingAfter(repo: string, plan: ConversionPlan): Promise<readonly ConversionChange[]> {
	try { return (await planRepair(repo)).changes; } catch { return plan.changes; }
}

export async function runRepair(repo: string, mode: RepairMode, options: RepairOptions = {}): Promise<RepairReport> {
	const plan = await planRepair(repo);
	if (mode === 'repair-preview') return { mode, plan };
	if (plan.problems.length > 0) {
		throw new ConversionRefused(`the plan lists ${plan.problems.length} files that cannot be repaired: ${plan.problems.slice(0, 3).map(p => `${p.file} (${p.reason})`).join('; ')}`);
	}
	// opening the store creates files, so a repository with nothing to do is left exactly as it is
	if (plan.changes.length === 0) return { mode, plan, result: { written: [], remaining: [], held: [], failed: [] } };

	const written: RepairWrite[] = [];
	let current: RepairStep = 'rename';
	const record: RepairRecorder = (artifactId, action) => { written.push({ step: current, artifactId, action }); };
	const deps = repairDeps(repo, record, options);
	const failed: UnitOutcome[] = [];
	let stoppedAt: { readonly step: RepairStep; readonly reason: string } | undefined;
	for (const { step, run } of stepsOf(repo, deps, record, options, failed)) {
		current = step;
		try { await run(); }
		catch (err) { stoppedAt = { step, reason: err instanceof Error ? err.message : String(err) }; break; }
	}
	return {
		mode, plan,
		result: { written, remaining: await remainingAfter(repo, plan), ...(stoppedAt !== undefined ? { stoppedAt } : {}), held: [], failed },
	};
}
