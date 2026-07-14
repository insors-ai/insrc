/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Public entry for the amendments subsystem. Callers import from
 * this module rather than pulling from the internals directly.
 */

export * from './types.js';
export {
	AmendmentIdConflictError,
	AmendmentImmutabilityError,
	AmendmentNotFoundError,
	amendmentPath,
	approveAmendment,
	listAmendments,
	listApprovedAmendments,
	nextAmendmentId,
	proposeAmendment,
	readAmendment,
	rejectAmendment,
} from './store.js';
export {
	AmendmentApplyError,
	applyAmendments,
} from './applier.js';
export {
	getEffectiveHld,
	getEffectiveHash,
	computeHldEffectiveHash,
} from './effective.js';
export {
	makeStaleAck,
	scanLldStaleness,
	type StaleAck,
	type StaleLldEntry,
} from './staleness.js';
