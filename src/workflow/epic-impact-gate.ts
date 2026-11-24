/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The synthesize-time rule of ISSUE-1b3caadf04023d33 (LLD s1): a later Story of an Epic (one with a non-null built-state digest)
 * must carry a real Epic impact analysis into its LLD and PLAN. The analysis is the controller's, recorded at the first step; the
 * daemon carries it from there verbatim, so the synthesizing model cannot lose or change it. A model-supplied copy is used only
 * when the first step has none.
 */

import { buildEpicBuiltStateDigest } from './epic-built-state.js';
import { epicImpactProblem, isEpicImpactAnalysis, type EpicImpactAnalysis } from './artifacts/epic-impact.js';

export type EpicImpactResolution =
	| { readonly ok: true; readonly epicImpact: EpicImpactAnalysis | undefined }
	| { readonly ok: false; readonly reason: string };

export function resolveEpicImpact(
	repoPath:    string,
	epicHash:    unknown,
	storyId:     unknown,
	stepOutputs: Readonly<Record<string, unknown>>,
	authored:    unknown,
): EpicImpactResolution {
	const s1 = stepOutputs['s1'];
	const fromStep = typeof s1 === 'object' && s1 !== null ? (s1 as Record<string, unknown>)['epicImpact'] : undefined;
	const stepAnalysis = isEpicImpactAnalysis(fromStep) ? fromStep : undefined;
	const authoredAnalysis = isEpicImpactAnalysis(authored) ? authored : undefined;
	const digestPresent = typeof epicHash === 'string' && typeof storyId === 'string' && buildEpicBuiltStateDigest(repoPath, epicHash, storyId) !== null;
	// The first step's analysis is carried verbatim when it is acceptable now. Applicability is decided at synthesize against the current
	// records, so an analysis made before a sibling Story's BUILD was approved (applies:false) can have become stale: then a current one
	// supplied in the synthesized body takes over, so the run is never stranded.
	const stepProblem = epicImpactProblem(digestPresent, stepAnalysis);
	if (stepProblem === undefined) return { ok: true, epicImpact: stepAnalysis ?? authoredAnalysis };
	const authoredProblem = epicImpactProblem(digestPresent, authoredAnalysis);
	if (authoredProblem === undefined && authoredAnalysis !== undefined) return { ok: true, epicImpact: authoredAnalysis };
	const stale = stepAnalysis !== undefined && !stepAnalysis.applies
		? ' The first step recorded that the analysis does not apply, but the Epic has a built Story now: supply a current analysis in body.epicImpact.'
		: '';
	return { ok: false, reason: `${authoredAnalysis !== undefined ? authoredProblem : stepProblem}${stale}` };
}
