/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Synthetic single-story context for a STANDALONE `design.story` run — a
 * triage-routed Feature/Small with no parent Epic/HLD. Its story spec comes
 * from the triage scope statement (`params.storyTitle` / `params.storySpec`)
 * and its HLD slice is a minimal "no parent HLD" placeholder.
 *
 * This is the ONE definition, shared by every consumer that would otherwise
 * read an approved Epic + HLD: the step runners (`readUpstream`) AND the
 * synthesizer prompt builder (`designStorySynthesizer`). Keeping it in one
 * place is load-bearing — a drift between the two produced the dogfood bug
 * where the steps ran standalone but synthesize still demanded an HLD.
 * See `plans/feature-triage-router.md`.
 */

import type { DefineConstraint, DefineFlavor, DefineStory } from '../../artifacts/define.js';
import type { HldContextSlice } from '../../artifacts/lld.js';

export interface StandaloneStoryContext {
	readonly flavor:      DefineFlavor;
	readonly constraints: readonly DefineConstraint[];
	readonly story:       DefineStory;
	readonly hldSlice:    HldContextSlice;
}

/** True when this run was routed here by triage as a standalone feature. */
export function isStandaloneParams(params: Readonly<Record<string, unknown>>): boolean {
	return params['standalone'] === true;
}

function strParam(params: Readonly<Record<string, unknown>>, key: string): string | undefined {
	const v = params[key];
	return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Build the synthetic story context from the triage params + the run focus.
 *  `flavor` defaults to `enhancement` (be careful about existing behaviour);
 *  override via `params.flavor`. */
export function standaloneStoryContext(
	params: Readonly<Record<string, unknown>>,
	focus:  string,
): StandaloneStoryContext {
	const storyId = strParam(params, 'storyId') ?? 'S001';
	const title   = strParam(params, 'storyTitle') ?? focus;
	const spec    = strParam(params, 'storySpec')  ?? focus;
	const flavorParam = strParam(params, 'flavor');
	const flavor: DefineFlavor = flavorParam === 'new-capability' ? 'new-capability' : 'enhancement';

	const story: DefineStory = {
		id:    storyId,
		title,
		userValue: spec,
		acceptanceCriteria: [],
	};
	const hldSlice: HldContextSlice = {
		frameworkSummary:
			'Standalone feature — no parent HLD. Design directly against the repo, ' +
			'grounded on the s1 analyze passes. There are no HLD shared contracts to honour.',
		ownedContracts:    [],
		consumedContracts: [],
		boundary:          { storyId, owns: [], depends: [], internal: title },
		rolloutPhase:      'standalone',
		nonFunctional:     {},
	};
	return { flavor, constraints: [], story, hldSlice };
}
