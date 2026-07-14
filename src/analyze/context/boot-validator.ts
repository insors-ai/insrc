/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Boot-time validator -- asserts every shaper's prompt file exists +
 * is non-empty before the daemon starts serving requests.
 *
 * Failure mode: the daemon refuses to start. We throw a typed error
 * so the caller (daemon/index.ts main loop) can log + exit cleanly
 * instead of bumping into the missing file later, at runtime, when a
 * shaper invocation tries to load it.
 *
 * The rationale: a missing prompt makes the affected shaper unusable.
 * Detecting this at boot turns a runtime "scope not analyzable" error
 * into a startup-refusal log line, which is easier to triage.
 *
 * Tests: src/insrc/analyze/context/__tests__/boot-validator.test.ts
 * Wiring: src/insrc/daemon/index.ts (between tool registration and
 * accepting requests).
 */

import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	CLASSIFY_PROMPT_PATH,
	SCOPE_PICKER_PROMPT_PATH,
} from '../classifier/index.js';
import { PLANNER_PROMPT_PATH } from '../planner/index.js';
import { DOC_SUMMARISER_PROMPT_PATH } from '../summariser/index.js';
import { DECOMPOSE_PROMPT_PATH } from './decomposer.js';
import {
	SYNTHESIZE_ADHERENCE_PROMPT_PATH,
	SYNTHESIZE_CAPABILITY_PROMPT_PATH,
	SYNTHESIZE_CODE_PROMPT_PATH,
	SYNTHESIZE_DATA_PROMPT_PATH,
	SYNTHESIZE_DOCS_PROMPT_PATH,
	SYNTHESIZE_INFRA_PROMPT_PATH,
} from './synthesizer.js';
import { CAPABILITY_REUSE_CHECK_PROMPT_PATH } from '../explore/index.js';
import { CODE_AGGREGATE_PROMPT_PATH    } from '../runtimes/code/index.js';
import { DATA_AGGREGATE_PROMPT_PATH    } from '../runtimes/data/index.js';
import { INFRA_AGGREGATE_PROMPT_PATH   } from '../runtimes/infra/index.js';
import { GENERIC_AGGREGATE_PROMPT_PATH } from '../runtimes/generic/index.js';
import {
	DOCS_AGGREGATE_PROMPT_PATH,
	DOCS_CONSTRAINT_ENUMERATE_PROMPT_PATH,
	DOCS_DECISION_TRACE_PROMPT_PATH,
} from '../runtimes/docs/index.js';
import { getLogger } from '../../shared/logger.js';

import { PROMPT_PATHS } from './index.js';

const log = getLogger('analyze:context:boot-validator');

/**
 * Identifier for a prompt component the validator checks. Wide
 * `string` rather than the narrow ShaperId so non-shaper prompts
 * (the classifier, future planner, ...) participate in the same
 * boot-time check without per-component validators duplicating
 * the file-stat / empty-body logic.
 */
export type AnalyzePromptComponentId = string;

export interface AnalyzePromptFailure {
	readonly componentId: AnalyzePromptComponentId;
	readonly path:        string;
	readonly reason:      string;
}

export class AnalyzePromptValidationError extends Error {
	readonly missing: readonly AnalyzePromptFailure[];

	constructor(missing: AnalyzePromptFailure[]) {
		const list = missing
			.map(m => `  - ${m.componentId}: ${m.path} (${m.reason})`)
			.join('\n');
		super(
			`analyze: prompt validation failed:\n${list}\n` +
				'Fix: ensure every prompts/analyze/<component>.system.md exists and is non-empty.',
		);
		this.name = 'AnalyzePromptValidationError';
		this.missing = missing;
	}
}

/**
 * Validate every prompt file declared in PROMPT_PATHS.
 *
 * Returns silently on success. Throws AnalyzePromptValidationError
 * listing every failure on the first failed shaper.
 *
 * Implementation:
 *   - Resolve the relative path against the insrc root (same resolver
 *     the driver uses at request time -- single source of truth for
 *     where prompts live).
 *   - stat -> readFileSync. ENOENT, empty body (length 0 after trim),
 *     and read errors are all collected into `missing` so the user
 *     gets the full picture in one go.
 *   - Successful prompts are debug-logged so the daemon log carries
 *     a record of which prompts loaded cleanly.
 */
/**
 * Every analyze-framework prompt the daemon validates at boot.
 * Shaper prompts come from PROMPT_PATHS (one per shaper id);
 * the classifier prompt is a single additional component.
 *
 * Add new component prompts (planner, etc.) here as they land --
 * the validator picks them up automatically.
 */
function collectComponentPrompts(): ReadonlyArray<{ componentId: string; relPath: string }> {
	const out: { componentId: string; relPath: string }[] = [];
	for (const [shaperId, relPath] of Object.entries(PROMPT_PATHS)) {
		out.push({ componentId: shaperId, relPath });
	}
	out.push({ componentId: 'classifier',        relPath: CLASSIFY_PROMPT_PATH });
	out.push({ componentId: 'scope-picker',      relPath: SCOPE_PICKER_PROMPT_PATH });
	out.push({ componentId: 'planner',           relPath: PLANNER_PROMPT_PATH });
	out.push({ componentId: 'doc-summariser',    relPath: DOC_SUMMARISER_PROMPT_PATH });
	out.push({ componentId: 'decomposer',            relPath: DECOMPOSE_PROMPT_PATH        });
	out.push({ componentId: 'synthesize.code',       relPath: SYNTHESIZE_CODE_PROMPT_PATH       });
	out.push({ componentId: 'synthesize.docs',       relPath: SYNTHESIZE_DOCS_PROMPT_PATH       });
	out.push({ componentId: 'synthesize.adherence',  relPath: SYNTHESIZE_ADHERENCE_PROMPT_PATH  });
	out.push({ componentId: 'synthesize.capability', relPath: SYNTHESIZE_CAPABILITY_PROMPT_PATH });
	out.push({ componentId: 'synthesize.data',       relPath: SYNTHESIZE_DATA_PROMPT_PATH       });
	out.push({ componentId: 'synthesize.infra',      relPath: SYNTHESIZE_INFRA_PROMPT_PATH      });
	out.push({ componentId: 'capability.reuse-check', relPath: CAPABILITY_REUSE_CHECK_PROMPT_PATH });
	out.push({ componentId: 'code.aggregate.report',    relPath: CODE_AGGREGATE_PROMPT_PATH    });
	out.push({ componentId: 'data.aggregate.report',    relPath: DATA_AGGREGATE_PROMPT_PATH    });
	out.push({ componentId: 'infra.aggregate.report',   relPath: INFRA_AGGREGATE_PROMPT_PATH   });
	out.push({ componentId: 'generic.aggregate.report', relPath: GENERIC_AGGREGATE_PROMPT_PATH });
	out.push({ componentId: 'docs.aggregate.report',        relPath: DOCS_AGGREGATE_PROMPT_PATH             });
	out.push({ componentId: 'docs.decision.trace',          relPath: DOCS_DECISION_TRACE_PROMPT_PATH        });
	out.push({ componentId: 'docs.constraint.enumerate',    relPath: DOCS_CONSTRAINT_ENUMERATE_PROMPT_PATH  });
	return out;
}

export function validateAnalyzePrompts(): void {
	const failures: AnalyzePromptFailure[] = [];
	const components = collectComponentPrompts();

	for (const { componentId, relPath } of components) {
		const abs = isAbsolute(relPath) ? relPath : resolveRelativeToInsrcRoot(relPath);

		try {
			statSync(abs);
		} catch (err) {
			failures.push({
				componentId,
				path:   abs,
				reason: (err as NodeJS.ErrnoException).code === 'ENOENT'
					? 'file not found'
					: `stat failed: ${(err as Error).message}`,
			});
			continue;
		}

		let body: string;
		try {
			body = readFileSync(abs, 'utf8');
		} catch (err) {
			failures.push({
				componentId,
				path:   abs,
				reason: `read failed: ${(err as Error).message}`,
			});
			continue;
		}

		if (body.trim().length === 0) {
			failures.push({ componentId, path: abs, reason: 'file is empty' });
			continue;
		}

		log.debug({ componentId, path: abs, bytes: body.length }, 'analyze prompt loaded');
	}

	if (failures.length > 0) {
		throw new AnalyzePromptValidationError(failures);
	}

	log.info({ count: components.length }, 'analyze prompts validated');
}

function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	// .../analyze/context/boot-validator.js -> ... -> .../insrc
	const insrcRoot = resolve(thisFile, '..', '..', '..');
	return resolve(insrcRoot, relativePath);
}
