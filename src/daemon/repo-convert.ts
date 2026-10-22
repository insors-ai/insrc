/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's `repo.convert` method (s9): convert a repository's artifacts to the current schema. A bare call is a preview, which
 * writes nothing; `mode: 'apply'` runs the conversion. This method is the one entry point the repository schema gate lets through
 * on an unconverted repository.
 */

import { existsSync, statSync } from 'node:fs';

import { History } from '../workflow/artifact-core/history.js';
import { createFileSidecarStore } from '../workflow/artifact-core/sidecar-store.js';
import type { Actor } from '../workflow/artifact-core/types.js';
import { CONVERSION_RULES } from '../workflow/convert/apply.js';
import { planConversion } from '../workflow/convert/plan.js';
import { runConversion } from '../workflow/convert/run.js';
import type { ConversionMode } from '../workflow/convert/run.js';
import type { ConversionDeps, ConversionReport } from '../workflow/convert/types.js';
import { TaskSets } from '../workflow/tasks/task-set.js';
import { openTracker } from '../workflow/tracker-auto.js';
import { lifecycleFor } from './lifecycle-registry.js';

export interface RepoConvertParams {
	readonly repo?: string;
	readonly mode?: ConversionMode;
}

const MIGRATION_ACTOR: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };

/** `repo.convert`: a preview or an apply; `{ error }` says why nothing was attempted or why the conversion stopped. */
export async function handleRepoConvert(params: unknown, repoEnv: string | undefined): Promise<ConversionReport | { error: string }> {
	const p = (params ?? {}) as RepoConvertParams;
	const repoPath = p.repo !== undefined && p.repo.length > 0 ? p.repo : repoEnv;
	if (repoPath === undefined || repoPath.length === 0) return { error: 'repo is required (or set INSRC_REPO)' };
	const mode = p.mode ?? 'preview';
	if (mode !== 'preview' && mode !== 'apply') return { error: `unknown mode ${String(mode)}: use 'preview' or 'apply'` };
	if (!existsSync(repoPath) || !statSync(repoPath).isDirectory()) return { error: `${repoPath} is not a repository directory` };
	try {
		// a preview opens no store and no sidecar: opening them creates files, and a preview writes nothing
		if (mode === 'preview') return { mode, plan: await planConversion(repoPath, { rules: CONVERSION_RULES }) };
		const entry = lifecycleFor(repoPath);
		const history = new History(createFileSidecarStore(repoPath));
		const gate = openTracker(repoPath);
		const deps: ConversionDeps = {
			store: entry.store, history, now: () => new Date(), actor: MIGRATION_ACTOR,
			taskSets: new TaskSets({ repoPath, store: entry.store, service: entry.service, history }),
			...('port' in gate ? { tracker: gate.port } : {}),
		};
		return await runConversion(repoPath, mode, deps);
	} catch (err) {
		return { error: (err as Error).message };
	}
}
