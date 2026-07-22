/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_triage` phase='classify'. Validate the controller-emitted TriageResult,
 * map its size class to a workflow entry (`routeForSizeClass`), and hand back
 * the exact next call — pre-filled with the standalone params so a small feature
 * enters as a standalone LLD (or straight to build) rather than climbing the
 * full Epic ladder. See `plans/feature-triage-router.md`.
 */

import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import { CLASSIFY_SCHEMA, routeForSizeClass } from '../../../workflow/triage/classify.js';
import type { TriageResult } from '../../../workflow/triage/types.js';
import { decodeState } from '../state.js';
import type { TriageDone, TriageInputClassify } from '../types.js';

export function handleClassify(input: TriageInputClassify): TriageDone {
	const state = decodeState(input.state);

	const validated = validateAgainstSchema<Omit<TriageResult, 'route'>>(CLASSIFY_SCHEMA, input.result);
	if (!validated.ok) {
		throw new Error(`insrc_triage[classify]: result failed schema — ${validated.errors.join('; ')}`);
	}
	const emitted = validated.value;
	const route = routeForSizeClass(emitted.sizeClass);
	const result: TriageResult = { ...emitted, route };

	const nextCall = buildNextCall(result, state.focus, state.repo);
	const summary = renderSummary(result);

	return { next: 'done', result, route, nextCall, summary };
}

/** Pre-fill the recommended next tool call for the routed entry. */
function buildNextCall(result: TriageResult, focus: string, repo: string): TriageDone['nextCall'] {
	const { route, sizeClass, rationale, storyTitle } = result;
	// Epic → the full chain head, no standalone params.
	if (route.startStage === 'define') {
		return { tool: 'insrc_workflow_run', params: { repo, workflow: 'define', focus } };
	}
	// Trivial → straight to build (no LLD), standalone.
	if (route.startStage === 'build') {
		return {
			tool: 'insrc_build_step',
			params: {
				phase: 'implement',
				repo,
				target: '(standalone-trivial)',
				standalone: { standalone: true, sizeClass, focus, triageRationale: rationale },
			},
		};
	}
	// Feature / Small → a standalone design.story (LLD). Feature then plans;
	// Small goes straight to build after the LLD is approved.
	return {
		tool: 'insrc_workflow_run',
		params: {
			repo, workflow: 'design.story', focus,
			params: {
				standalone: true,
				storyTitle,
				storySpec: focus,
				sizeClass,
				triageRationale: rationale,
			},
		},
	};
}

function renderSummary(result: TriageResult): string {
	const { sizeClass, route } = result;
	const chain = route.startStage === 'define'
		? 'define → epic → story → plan → build'
		: route.startStage === 'build'
			? 'build (no LLD)'
			: route.needsPlan
				? 'standalone LLD → plan → build'
				: 'standalone LLD → build';
	return `Triage: **${sizeClass}** — enter at \`${route.startStage}\` (${chain}).`;
}
