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
	const analysis = isEpicImpactAnalysis(fromStep) ? fromStep : isEpicImpactAnalysis(authored) ? authored : undefined;
	const digestPresent = typeof epicHash === 'string' && typeof storyId === 'string' && buildEpicBuiltStateDigest(repoPath, epicHash, storyId) !== null;
	const problem = epicImpactProblem(digestPresent, analysis);
	return problem === undefined ? { ok: true, epicImpact: analysis } : { ok: false, reason: problem };
}
