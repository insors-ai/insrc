/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The command behind `repo.convert`: a preview (the planner alone, which writes nothing) or an apply (the plan, then the rules, the
 * sweep, the marker and the verification). An apply that stopped part-way leaves its progress file; running it again resumes from
 * the files as they are and finishes with the result an uninterrupted run gives.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { applyConversion, CONVERSION_RULES } from './apply.js';
import type { ApplyOptions } from './apply.js';
import { PROGRESS_FILE } from './marker.js';
import { planConversion } from './plan.js';
import type { ConversionDeps, ConversionReport } from './types.js';

export type ConversionMode = 'preview' | 'apply';

export async function runConversion(repo: string, mode: ConversionMode, deps: ConversionDeps, options: ApplyOptions = {}): Promise<ConversionReport> {
	if (mode === 'preview') {
		return { mode, plan: await planConversion(repo, { tracker: deps.tracker, rules: CONVERSION_RULES }) };
	}
	const resuming = existsSync(join(repo, PROGRESS_FILE));
	const plan = await planConversion(repo, { tracker: deps.tracker, rules: CONVERSION_RULES, resume: resuming });
	return { mode, plan, result: await applyConversion(repo, plan, deps, options) };
}
