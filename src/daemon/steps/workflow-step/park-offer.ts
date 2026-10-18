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

import { resolve } from 'node:path';

import { authorUnitOf } from '../../../workflow/team/author-gate.js';
import { registerParkOfferProvider } from '../../../workflow/team/gate.js';
import { unitDraftFiles } from '../../../workflow/team/handoff.js';
import type { UnitRef } from '../../../workflow/tracker/refs.js';
import type { WorkflowIntent } from '../../../workflow/types.js';
import { listStates } from './state-store.js';

const sameLogin = (a: string | undefined, b: string): boolean => a !== undefined && a.toLowerCase() === b.toLowerCase();

/** Does a stored run change this unit? */
function runIsForUnit(intent: Pick<WorkflowIntent, 'workflow' | 'repoPath' | 'params'>, unit: UnitRef): boolean {
	const u = authorUnitOf(intent);
	return u !== undefined
		&& resolve(u.repoPath) === resolve(unit.repoPath)
		&& u.unit === unit.unit
		&& u.epicHash === unit.epicHash
		&& (u.storyId ?? undefined) === (unit.storyId ?? undefined);
}

/** True when the actor owns a live run for the unit or has an uncommitted draft artifact of it. Never throws. */
export function hasUnparkedWork(repo: string, unit: UnitRef, actor: string): boolean {
	try {
		if (listStates().some(e => sameLogin(e.meta?.owner, actor) && runIsForUnit(e.payload.intent, { ...unit, repoPath: repo }))) return true;
		return unit.unit !== 'task' && unitDraftFiles(repo, unit).length > 0;
	} catch { return false; }
}

/** Register the provider with the gate; the daemon does this when it builds its step tools. Idempotent. */
export function registerParkOffer(): void {
	registerParkOfferProvider(hasUnparkedWork);
}
