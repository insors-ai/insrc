/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * shaperFor(mode, target?) -- per-shaper factory.
 *
 * Dispatch:
 *   shaperFor('classification')              -> classification-shaper
 *   shaperFor('run', 'code'   | 'data'
 *                  | 'infra'  | 'generic')   -> per-target run-mode shaper
 *   shaperFor('task', 'code' | 'data' | 'infra') -> per-target task-mode shaper
 *
 * P0: every shaper returned is a stub that throws on call. P3 fills
 * in the real implementation via the shared driver in ./driver.ts;
 * P5 adds the prompt files at prompts/analyze/<shaper>.system.md.
 *
 * See: design/analyze-context-builder.md "Shapers", "Public API"
 *      plans/analyze-context-builder.md Phase 0
 */

import { runShaper } from './driver.js';
import type {
	AnalyzeContextBundle,
	ClassificationShapeInput,
	ClassificationShaper,
	RunShapeInput,
	RunShaper,
	RunTarget,
	ShapeOpts,
	ShaperId,
	TaskShapeInput,
	TaskShaper,
	TaskTarget,
} from './types.js';

/**
 * Resolved prompt-file paths for each shaper.
 *
 * Paths are relative to the insrc root (`src/insrc` in dev,
 * `out/insrc` in compiled, `~/.insrc/daemon/out/insrc` in
 * production); the driver's `resolveRelativeToInsrcRoot` handles
 * the layout differences uniformly. The build script mirrors
 * `*.md` files from `src/insrc/prompts/` to `out/insrc/prompts/`
 * so the same relative path resolves in either tree.
 *
 * The boot-time validator (P5) asserts every entry's file exists
 * + is non-empty before the daemon starts serving requests.
 */
const PROMPT_PATHS: Readonly<Record<ShaperId, string>> = {
	classification: 'prompts/analyze/classification.system.md',
	generic:        'prompts/analyze/generic.system.md',
	code:           'prompts/analyze/code.system.md',
	data:           'prompts/analyze/data.system.md',
	infra:          'prompts/analyze/infra.system.md',
	docs:           'prompts/analyze/docs.system.md',
};

/**
 * Per-shaper legacy prompt paths -- used by the Phase 6 freeform.probe
 * runner so an out-of-catalog intent can still fire the target's
 * existing tool-loop prompt as an escape hatch. Excludes 'classification'
 * because freeform.probe is a run-mode primitive; the classifier has
 * its own bundle-build path.
 */
export function legacyShaperPromptPathFor(
	shaperId: 'code' | 'docs' | 'data' | 'infra' | 'generic',
): string {
	return PROMPT_PATHS[shaperId];
}

function shaperIdForRun(target: RunTarget): ShaperId {
	return target;
}

function shaperIdForTask(target: TaskTarget): ShaperId {
	return target;
}

export function shaperFor(mode: 'classification'): ClassificationShaper;
export function shaperFor(mode: 'run',  target: RunTarget):  RunShaper;
export function shaperFor(mode: 'task', target: TaskTarget): TaskShaper;
export function shaperFor(
	mode:    'classification' | 'run' | 'task',
	target?: RunTarget | TaskTarget,
): ClassificationShaper | RunShaper | TaskShaper {
	if (mode === 'classification') {
		const shaperId: ShaperId = 'classification';
		return {
			buildClassificationBundle: (
				input: ClassificationShapeInput,
				opts:  ShapeOpts,
			): Promise<AnalyzeContextBundle> =>
				runShaper({
					promptPath:     PROMPT_PATHS[shaperId],
					invocationMode: 'classification',
					shaperId,
					inputs:         input,
					opts,
				}),
		};
	}

	if (mode === 'run') {
		if (target === undefined) {
			throw new TypeError("shaperFor(mode='run', target): target is required");
		}
		const shaperId: ShaperId = shaperIdForRun(target as RunTarget);
		return {
			buildRunBundle: (
				input: RunShapeInput,
				opts:  ShapeOpts,
			): Promise<AnalyzeContextBundle> =>
				runShaper({
					promptPath:     PROMPT_PATHS[shaperId],
					invocationMode: 'run',
					shaperId,
					inputs:         input,
					opts,
				}),
		};
	}

	if (target === undefined) {
		throw new TypeError("shaperFor(mode='task', target): target is required");
	}
	if (target === 'generic') {
		throw new TypeError(
			"shaperFor(mode='task', target='generic'): task-level dispatch routes by " +
				'task family namespace; generic is invalid at task scope',
		);
	}
	const shaperId: ShaperId = shaperIdForTask(target as TaskTarget);
	return {
		buildTaskBundle: (
			input: TaskShapeInput,
			opts:  ShapeOpts,
		): Promise<AnalyzeContextBundle> =>
			runShaper({
				promptPath:     PROMPT_PATHS[shaperId],
				invocationMode: 'task',
				shaperId,
				inputs:         input,
				opts,
			}),
	};
}

export { PROMPT_PATHS };
export type * from './types.js';
