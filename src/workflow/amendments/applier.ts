/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Amendment applier — pure + deterministic. Given a base HLD body
 * and an ordered list of approved amendments, return a new body
 * with every amendment applied in order.
 *
 * Every amendment type has:
 *   1. A pre-condition invariant (target exists, no duplicates, etc.).
 *   2. A mechanical transformation.
 *
 * A failing invariant throws `AmendmentApplyError` with the offending
 * amendment id — the caller (approver / effective-HLD reader) is
 * responsible for surfacing that to the user. In practice the
 * approval CLI dry-runs the applier first, so we never store an
 * amendment that would break the applier.
 */

import type { HldBody, RolloutPhase, SharedContract, StoryBoundary } from '../artifacts/hld.js';
import type {
	Amendment,
	AmendmentRecord,
	NonFunctionalRetarget,
	RolloutMergePhases,
	RolloutReorder,
	RolloutSplitPhase,
	SharedContractFieldAdd,
	SharedContractFieldRemove,
	SharedContractMethodAdd,
	SharedContractRename,
	StoryBoundaryAddConsumer,
	StoryBoundaryAddStory,
	StoryBoundaryReassignOwnership,
} from './types.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AmendmentApplyError extends Error {
	readonly amendmentId: string;
	constructor(amendmentId: string, msg: string) {
		super(`${amendmentId}: ${msg}`);
		this.amendmentId = amendmentId;
		this.name = 'AmendmentApplyError';
	}
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/** Apply an ordered list of approved amendments to `base`. Pure
 *  and deterministic — same inputs, same output. */
export function applyAmendments(
	base: HldBody,
	amendments: readonly AmendmentRecord[],
): HldBody {
	let current = base;
	for (const rec of amendments) {
		current = applyOne(current, rec);
	}
	return current;
}

function applyOne(body: HldBody, rec: AmendmentRecord): HldBody {
	const a = rec.amendment;
	switch (a.type) {
		case 'sharedContract.fieldAdd':          return applyFieldAdd(body, a, rec.id);
		case 'sharedContract.fieldRemove':       return applyFieldRemove(body, a, rec.id);
		case 'sharedContract.rename':            return applyRename(body, a, rec.id);
		case 'sharedContract.methodAdd':         return applyMethodAdd(body, a, rec.id);
		case 'storyBoundary.reassignOwnership':  return applyReassignOwnership(body, a, rec.id);
		case 'storyBoundary.addConsumer':        return applyAddConsumer(body, a, rec.id);
		case 'storyBoundary.addStory':           return applyAddStory(body, a, rec.id);
		case 'nonFunctional.retarget':           return applyNonFunctional(body, a, rec.id);
		case 'rollout.reorder':                  return applyRolloutReorder(body, a, rec.id);
		case 'rollout.splitPhase':               return applyRolloutSplit(body, a, rec.id);
		case 'rollout.mergePhases':              return applyRolloutMerge(body, a, rec.id);
		default: {
			const _exhaustive: never = a;
			throw new AmendmentApplyError(rec.id, `unknown amendment type '${(a as { type: string }).type}'`);
		}
	}
}

// ---------------------------------------------------------------------------
// sharedContract.fieldAdd — append a doc line to interfaceSketch
// ---------------------------------------------------------------------------

function applyFieldAdd(body: HldBody, a: SharedContractFieldAdd, id: string): HldBody {
	const sc = findContract(body, a.contractId, id);
	// The interfaceSketch is opaque prose in the general case; the
	// mechanical transformation appends a documented field line.
	// Deep validation lives in the LLD (which references the field).
	const marker = `\n  // + ${a.field.name}${a.field.optional ? '?' : ''}: ${a.field.type};  // ${a.field.purpose} (amend:${id})`;
	if (memberInSketch(sc.interfaceSketch, a.field.name)) {
		throw new AmendmentApplyError(id, `contract '${a.contractId}' already declares member '${a.field.name}'`);
	}
	return replaceContract(body, {
		...sc,
		interfaceSketch: sc.interfaceSketch + marker,
	});
}

// ---------------------------------------------------------------------------
// sharedContract.fieldRemove
// ---------------------------------------------------------------------------

function applyFieldRemove(body: HldBody, a: SharedContractFieldRemove, id: string): HldBody {
	if (a.breaking !== true) {
		throw new AmendmentApplyError(id, `fieldRemove must be marked breaking=true`);
	}
	if (a.migrationCue.length === 0) {
		throw new AmendmentApplyError(id, `fieldRemove requires a non-empty migrationCue`);
	}
	const sc = findContract(body, a.contractId, id);
	if (!memberInSketch(sc.interfaceSketch, a.fieldName)) {
		throw new AmendmentApplyError(id, `contract '${a.contractId}' has no member '${a.fieldName}'`);
	}
	// Same principle as fieldAdd: append a documented removal note.
	const marker = `\n  // - ${a.fieldName}  removed; ${a.migrationCue} (amend:${id})`;
	return replaceContract(body, {
		...sc,
		interfaceSketch: sc.interfaceSketch + marker,
	});
}

// ---------------------------------------------------------------------------
// sharedContract.rename
// ---------------------------------------------------------------------------

function applyRename(body: HldBody, a: SharedContractRename, id: string): HldBody {
	if (a.breaking !== true) {
		throw new AmendmentApplyError(id, `rename must be marked breaking=true`);
	}
	if (a.migrationCue.length === 0) {
		throw new AmendmentApplyError(id, `rename requires a non-empty migrationCue`);
	}
	const sc = findContract(body, a.contractId, id);
	if (sc.name !== a.oldName) {
		throw new AmendmentApplyError(id, `contract '${a.contractId}' has name '${sc.name}', not '${a.oldName}'`);
	}
	const otherNames = body.sharedContracts.filter(c => c.id !== a.contractId).map(c => c.name);
	if (otherNames.includes(a.newName)) {
		throw new AmendmentApplyError(id, `contract name '${a.newName}' already used by another contract`);
	}
	return replaceContract(body, { ...sc, name: a.newName });
}

// ---------------------------------------------------------------------------
// sharedContract.methodAdd
// ---------------------------------------------------------------------------

function applyMethodAdd(body: HldBody, a: SharedContractMethodAdd, id: string): HldBody {
	const sc = findContract(body, a.contractId, id);
	if (/\breturn\b/.test(a.method.signature) || /=>\s*\{/.test(a.method.signature)) {
		throw new AmendmentApplyError(id, `method signature must be TYPE-level only (no function body)`);
	}
	if (memberInSketch(sc.interfaceSketch, a.method.name)) {
		throw new AmendmentApplyError(id, `contract '${a.contractId}' already declares member '${a.method.name}'`);
	}
	const marker = `\n  // + ${a.method.signature};  // ${a.method.purpose} (amend:${id})`;
	return replaceContract(body, {
		...sc,
		interfaceSketch: sc.interfaceSketch + marker,
	});
}

// ---------------------------------------------------------------------------
// storyBoundary.reassignOwnership
// ---------------------------------------------------------------------------

function applyReassignOwnership(body: HldBody, a: StoryBoundaryReassignOwnership, id: string): HldBody {
	const sc = findContract(body, a.contractId, id);
	if (sc.ownedByStory !== a.oldOwner) {
		throw new AmendmentApplyError(id, `contract '${a.contractId}' owned by '${sc.ownedByStory}', not '${a.oldOwner}'`);
	}
	if (a.oldOwner === a.newOwner) {
		throw new AmendmentApplyError(id, `oldOwner and newOwner are the same '${a.oldOwner}'`);
	}
	const newStory = body.storyBoundaries.find(sb => sb.storyId === a.newOwner);
	if (newStory === undefined) {
		throw new AmendmentApplyError(id, `newOwner '${a.newOwner}' is not a Story in the HLD`);
	}
	const contracts = body.sharedContracts.map(c =>
		c.id === a.contractId ? { ...c, ownedByStory: a.newOwner } : c,
	);
	const boundaries = body.storyBoundaries.map(sb => {
		if (sb.storyId === a.oldOwner) return { ...sb, owns: sb.owns.filter(x => x !== a.contractId) };
		if (sb.storyId === a.newOwner) return { ...sb, owns: sb.owns.includes(a.contractId) ? sb.owns : [...sb.owns, a.contractId] };
		return sb;
	});
	return { ...body, sharedContracts: contracts, storyBoundaries: boundaries };
}

// ---------------------------------------------------------------------------
// storyBoundary.addConsumer
// ---------------------------------------------------------------------------

function applyAddStory(body: HldBody, a: StoryBoundaryAddStory, id: string): HldBody {
	if (body.storyBoundaries.some(sb => sb.storyId === a.storyId)) {
		throw new AmendmentApplyError(id, `story '${a.storyId}' already has a boundary in the HLD`);
	}
	// Any contracts it consumes must already exist (owns is usually empty
	// for an extending Story — it consumes the Epic's shared framework).
	for (const c of a.depends ?? []) findContract(body, c, id);
	const boundary: StoryBoundary = {
		storyId:  a.storyId,
		owns:     [...(a.owns ?? [])],
		depends:  [...(a.depends ?? [])],
		internal: a.internal,
	};
	return { ...body, storyBoundaries: [...body.storyBoundaries, boundary] };
}

function applyAddConsumer(body: HldBody, a: StoryBoundaryAddConsumer, id: string): HldBody {
	const sc = findContract(body, a.contractId, id);
	if (a.consumer === sc.ownedByStory) {
		throw new AmendmentApplyError(id, `consumer '${a.consumer}' is already the owner of '${a.contractId}'`);
	}
	if (sc.consumedByStories.includes(a.consumer)) {
		throw new AmendmentApplyError(id, `consumer '${a.consumer}' already listed on contract '${a.contractId}'`);
	}
	const contracts = body.sharedContracts.map(c =>
		c.id === a.contractId ? { ...c, consumedByStories: [...c.consumedByStories, a.consumer] } : c,
	);
	const boundaries = body.storyBoundaries.map(sb =>
		sb.storyId === a.consumer && !sb.depends.includes(a.contractId)
			? { ...sb, depends: [...sb.depends, a.contractId] }
			: sb,
	);
	return { ...body, sharedContracts: contracts, storyBoundaries: boundaries };
}

// ---------------------------------------------------------------------------
// nonFunctional.retarget
// ---------------------------------------------------------------------------

function applyNonFunctional(body: HldBody, a: NonFunctionalRetarget, id: string): HldBody {
	const current = body.nonFunctional[a.property];
	if (current === undefined) {
		throw new AmendmentApplyError(id, `nonFunctional.${a.property} is not set on the HLD; cannot retarget`);
	}
	if (current !== a.oldTarget) {
		throw new AmendmentApplyError(id, `nonFunctional.${a.property} is '${current}', not '${a.oldTarget}'`);
	}
	return {
		...body,
		nonFunctional: { ...body.nonFunctional, [a.property]: a.newTarget },
	};
}

// ---------------------------------------------------------------------------
// rollout.reorder
// ---------------------------------------------------------------------------

function applyRolloutReorder(body: HldBody, a: RolloutReorder, id: string): HldBody {
	const existing = body.rolloutOverview.phases.map(p => p.name);
	if (a.newPhaseOrder.length !== existing.length) {
		throw new AmendmentApplyError(id, `newPhaseOrder length (${a.newPhaseOrder.length}) != existing phases (${existing.length})`);
	}
	const existingSet = new Set(existing);
	const newSet = new Set(a.newPhaseOrder);
	if (existingSet.size !== newSet.size || [...existingSet].some(n => !newSet.has(n))) {
		throw new AmendmentApplyError(id, `newPhaseOrder must be a permutation of existing phase names`);
	}
	const byName: Record<string, RolloutPhase> = {};
	for (const p of body.rolloutOverview.phases) byName[p.name] = p;
	const newPhases = a.newPhaseOrder.map(n => byName[n]!);
	return {
		...body,
		rolloutOverview: { ...body.rolloutOverview, phases: newPhases },
	};
}

// ---------------------------------------------------------------------------
// rollout.splitPhase
// ---------------------------------------------------------------------------

function applyRolloutSplit(body: HldBody, a: RolloutSplitPhase, id: string): HldBody {
	const idx = body.rolloutOverview.phases.findIndex(p => p.name === a.phase);
	if (idx < 0) {
		throw new AmendmentApplyError(id, `phase '${a.phase}' not found`);
	}
	const original = body.rolloutOverview.phases[idx]!;
	const unionNew = new Set<string>();
	for (const p of a.newPhases) for (const s of p.includesStories) unionNew.add(s);
	const originalSet = new Set(original.includesStories);
	if (unionNew.size !== originalSet.size || [...originalSet].some(s => !unionNew.has(s))) {
		throw new AmendmentApplyError(id, `splitPhase: union of newPhases must equal original phase's stories`);
	}
	const newPhases: RolloutPhase[] = a.newPhases.map(np => ({
		name:            np.name,
		includesStories: np.includesStories,
		rationale:       `${original.rationale} (split from '${a.phase}' by ${id})`,
		backwardCompat:  original.backwardCompat,
		featureFlag:     original.featureFlag,
	}));
	const phases = [
		...body.rolloutOverview.phases.slice(0, idx),
		...newPhases,
		...body.rolloutOverview.phases.slice(idx + 1),
	];
	return { ...body, rolloutOverview: { ...body.rolloutOverview, phases } };
}

// ---------------------------------------------------------------------------
// rollout.mergePhases
// ---------------------------------------------------------------------------

function applyRolloutMerge(body: HldBody, a: RolloutMergePhases, id: string): HldBody {
	if (a.phases.length < 2) {
		throw new AmendmentApplyError(id, `mergePhases requires at least 2 phases`);
	}
	const phaseSet = new Set(a.phases);
	const existing = body.rolloutOverview.phases;
	// The phases must be a CONTIGUOUS run in the existing order — merging
	// non-adjacent phases is more subtle and out of scope for Phase E.
	let start = -1;
	let end   = -1;
	for (let i = 0; i < existing.length; i += 1) {
		if (phaseSet.has(existing[i]!.name)) {
			if (start === -1) start = i;
			end = i;
		}
	}
	if (start === -1) {
		throw new AmendmentApplyError(id, `none of the phases in mergePhases were found`);
	}
	// contiguous?
	for (let i = start; i <= end; i += 1) {
		if (!phaseSet.has(existing[i]!.name)) {
			throw new AmendmentApplyError(id, `mergePhases must target a contiguous run of phases`);
		}
	}
	if ((end - start + 1) !== a.phases.length) {
		throw new AmendmentApplyError(id, `mergePhases mismatch between phase names and contiguous run`);
	}
	const stories: string[] = [];
	const seen = new Set<string>();
	for (let i = start; i <= end; i += 1) {
		for (const s of existing[i]!.includesStories) {
			if (!seen.has(s)) { seen.add(s); stories.push(s); }
		}
	}
	const merged: RolloutPhase = {
		name:            a.newPhase.name,
		includesStories: stories,
		rationale:       `merged from ${a.phases.join(' + ')} by ${id}`,
		backwardCompat:  '',
		featureFlag:     null,
	};
	const phases = [
		...existing.slice(0, start),
		merged,
		...existing.slice(end + 1),
	];
	return { ...body, rolloutOverview: { ...body.rolloutOverview, phases } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check whether a member `name` appears in an interface-sketch as
 *  either a field (`name:` or `name?:`) or a method (`name(`).
 *  Word-boundary matched so partial name overlaps don't false-hit. */
function memberInSketch(sketch: string, name: string): boolean {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(`\\b${escaped}\\??\\s*[:(]`);
	return re.test(sketch);
}

function findContract(body: HldBody, id: string, amendId: string): SharedContract {
	const sc = body.sharedContracts.find(c => c.id === id);
	if (sc === undefined) {
		throw new AmendmentApplyError(amendId, `shared contract '${id}' not found`);
	}
	return sc;
}

function replaceContract(body: HldBody, sc: SharedContract): HldBody {
	return {
		...body,
		sharedContracts: body.sharedContracts.map(c => (c.id === sc.id ? sc : c)),
	};
}

// Kept as an unused-import guard so consumers can pull `Amendment`
// + `AmendmentRecord` from one place if they only use the applier.
export type { Amendment, AmendmentRecord };
export type { StoryBoundary };
