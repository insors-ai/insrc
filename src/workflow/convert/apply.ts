/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The applier: runs the conversion's rules in their fixed order over the files the plan described. Before it writes anything it
 * refuses a delivery reader that still reads the legacy stamps (the after-snapshot would then be wrong), recomputes the plan and
 * refuses a tree that is no longer the one the plan described, and refuses a plan that lists a problem.
 *
 * Order: rename ids and files, stamp epicCreatedAt, convert flat amendments, convert body.feedback (the lines are appended before
 * the head that holds them is replaced), migrate every head, create EPIC and STORY heads and move their bindings, create the Task
 * heads of earlier Stories, move the Story history. The migration write is the one step that strips the legacy fields.
 *
 * Every step can be repeated. The run keeps `.insrc/convert-progress.json` with the before-snapshot from the first start, so a
 * run that stopped part-way is resumed from the files as they are (the tree is then not clean, and the legacy stamps the snapshot
 * was computed from are gone from the heads already converted).
 */

import { join } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { RepoSchemaGate } from '../artifact-core/repo-schema.js';
import { liftStoreFile } from '../delivery/load.js';
import { writeAtomic } from '../storage.js';
import { applyAmendments, amendmentRule } from './amendments.js';
import { backfillHead } from './backfill.js';
import { applyFeedback, feedbackRule } from './feedback-rule.js';
import { PROGRESS_FILE, readProgress } from './marker.js';
import { writeMigratedHead } from './migrated-head.js';
import type { MigratedHeadSeams } from './migrated-head.js';
import { planConversion, plansEqual } from './plan.js';
import type { PlanRule } from './plan.js';
import { readRawHeads } from './raw-heads.js';
import { applyRenames, renameRule } from './rename.js';
import { applyStamps, stampRule } from './stamps.js';
import { applyStoryHistory, storyHistoryRule } from './story-history.js';
import { applyTasks, tasksRule } from './tasks.js';
import { ConversionRefused } from './types.js';
import type { ConversionDeps, ConversionPlan, ConversionResult, UnitView } from './types.js';
import { applyUnits, unitsRule } from './units.js';

const log = getLogger('workflow:convert');

/** The rules the planner is given, in the order they are listed. The applier's own order is the one in {@link applyConversion}. */
export const CONVERSION_RULES: readonly PlanRule[] = [renameRule, stampRule, amendmentRule, feedbackRule, unitsRule, tasksRule, storyHistoryRule];

export { PROGRESS_FILE };

/** The steps of an apply, as a test seam sees them: called after each step has finished. */
export type ApplyStep = 'rename' | 'stamp' | 'amendments' | 'feedback' | 'migrate' | 'units' | 'tasks' | 'story-history';

export interface ApplySeams {
	readonly afterStep?:  ((step: ApplyStep) => void | Promise<void>) | undefined;
	readonly headSeams?:  MigratedHeadSeams | undefined;
}

export interface ApplyOptions {
	readonly seams?:                 ApplySeams | undefined;
	/** Whether the delivery reader takes approval from the lifecycle. Defaults to asking the reader itself ({@link deliveryReadsLifecycle}). */
	readonly deliveryReadsLifecycle?: (() => boolean) | undefined;
}

/**
 * Asks the delivery reader what it makes of a head that carries an approved lifecycle and none of the legacy stamps. The
 * conversion removes the stamps, so a reader that does not answer 'approved' would see every converted unit as pending.
 */
export function deliveryReadsLifecycle(): boolean {
	const head = {
		meta: {
			workflow: 'define', epicHash: 'a'.repeat(16), createdAt: '2026-01-01T00:00:00.000Z', revision: 1,
			lifecycle: { status: 'approved', revision: { number: 1, contentHash: '', at: '', by: { id: 'insrc:system', kind: 'system', properties: {} } }, signoffs: [],
				approval: { revision: 1, by: { id: 'github:probe', kind: 'person', properties: {} }, at: '2026-01-01T00:00:00.000Z' } },
		},
		body: {}, citations: [],
	};
	const lifted = liftStoreFile(`DEF-${'a'.repeat(16)}.json`, head);
	return !('reason' in lifted) && lifted.approval.state === 'approved';
}

/** Migrate every head that has no lifecycle or still carries a legacy field. Answers how many were written. */
async function migrateHeads(repo: string, deps: ConversionDeps, seams: MigratedHeadSeams | undefined): Promise<number> {
	let written = 0;
	for (const head of readRawHeads(repo).heads) {
		const meta = (head.json as { meta?: Record<string, unknown> }).meta;
		if (meta === undefined || typeof meta !== 'object') continue;
		const hasLog = (await deps.history.log(head.artifactId)).length > 0;
		const out = backfillHead({ head, hasLog, now: deps.now().toISOString(), actor: deps.actor });
		if (out.legacyFields.length === 0 && meta['lifecycle'] !== undefined) continue;
		if ((await writeMigratedHead(repo, out.converted, deps, seams)) === 'written') written += 1;
	}
	return written;
}

/**
 * Apply the conversion. `plan` is the preview the caller saw; it is recomputed here and a difference is refused. Heads and files
 * are written; the schema marker is not (the sweep writes it once every head has passed its checks).
 */
export async function applyConversion(repo: string, plan: ConversionPlan, deps: ConversionDeps, options: ApplyOptions = {}): Promise<ConversionResult> {
	if (RepoSchemaGate.read(repo).version >= 2) return { written: [], markerWritten: false, trackerFailures: [] }; // converted already: nothing to write
	if (!(options.deliveryReadsLifecycle ?? deliveryReadsLifecycle)()) {
		throw new ConversionRefused('the delivery reader still reads the legacy approval and review stamps, which the conversion removes: run the conversion with a build whose readers read the lifecycle');
	}
	const progress = readProgress(repo);
	const current = await planConversion(repo, { tracker: deps.tracker, rules: CONVERSION_RULES, resume: progress !== undefined });
	if (progress === undefined && !plansEqual(plan, current)) {
		throw new ConversionRefused('the repository changed since the plan was made: run the preview again');
	}
	if (current.problems.length > 0) {
		throw new ConversionRefused(`the plan lists ${current.problems.length} files that cannot be converted: ${current.problems.slice(0, 3).map(p => `${p.file} (${p.reason})`).join('; ')}`);
	}
	if (progress === undefined) writeAtomic(join(repo, PROGRESS_FILE), JSON.stringify({ snapshot: current.snapshot }, null, 2) + '\n');

	const seams = options.seams;
	const done = async (step: ApplyStep): Promise<void> => { log.info({ step }, 'convert: step done'); await seams?.afterStep?.(step); };

	applyRenames(repo);                                      await done('rename');
	applyStamps(repo);                                       await done('stamp');
	applyAmendments(repo);                                   await done('amendments');
	await applyFeedback(repo, deps);                         await done('feedback');
	await migrateHeads(repo, deps, seams?.headSeams);        await done('migrate');
	await applyUnits(repo, deps);                            await done('units');
	await applyTasks(repo, deps);                            await done('tasks');
	await applyStoryHistory(repo, deps);                     await done('story-history');

	return { written: current.changes, markerWritten: false, trackerFailures: [] };
}
