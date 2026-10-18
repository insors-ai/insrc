/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The park offer (Story s6, sc4 amendment AMD-315d510cb28100e2-13): the daemon tells the team gate whether the
 * acting user has unparked work for a unit, so a refusal for a stage someone else now holds can offer to park it.
 * Unparked work is a live run the actor owns for the unit, in any stage, or a draft artifact of the unit that is
 * not committed. A run with no recorded owner never counts: it is not known to be the actor's.
 */

import { registerParkOfferProvider } from '../../../workflow/team/gate.js';
import { draftParkOffer, runIsForUnit } from '../../../workflow/team/handoff.js';
import type { UnitRef } from '../../../workflow/tracker/refs.js';
import { listStates } from './state-store.js';

const sameLogin = (a: string | undefined, b: string): boolean => a !== undefined && a.toLowerCase() === b.toLowerCase();

/** True when the actor owns a live run for the unit or has an uncommitted draft artifact of it. Never throws. */
export function hasUnparkedWork(repo: string, unit: UnitRef, actor: string): boolean {
	try {
		if (listStates().some(e => sameLogin(e.meta?.owner, actor) && runIsForUnit(e.payload.intent, { ...unit, repoPath: repo }))) return true;
		return draftParkOffer(repo, unit);
	} catch { return false; }
}

/** Register the provider with the gate; the daemon does this when it builds its step tools. Idempotent. */
export function registerParkOffer(): void {
	registerParkOfferProvider(hasUnparkedWork);
}
