/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc1 — the functional-definition record (Epic make-workflow-framework-s-generated-artifact,
 * Story S001). The structured functional-requirement data carried in every artifact JSON
 * body: discrete requirements with stable sequence-numbered ids, doc-level and per-item,
 * from which the human-readable prose is generated (k2). This module declares TYPES ONLY;
 * the id minter/parser lives in `../id.ts` (reusing its padOrdinal/hash8Of/utcDate), and
 * the per-body optional field + renderer section are wired by later Tasks.
 */

import { isFrId } from '../id.js';

/**
 * A stable functional-requirement id, sequence-numbered like stories/tasks (lc1).
 *   - doc-level : `E<YYYYMMDD><hash8>:FR<nnn>`
 *   - per-item  : `E<YYYYMMDD><hash8>:S<nnn>:FR<nnn>`
 * Minted + parsed by `mintFrId` / `parseFrId` in `../id.ts`.
 */
export type FrId = string;

/** One functional requirement — an outcome the work must realize, stated for a reviewer. */
export interface FunctionalRequirement {
	readonly id: FrId;
	/** Outcome-terms, reviewer-facing; the prose is generated from this, never hand-authored (k2). */
	readonly statement: string;
	readonly rationale?: string | undefined;
	/** `doc` = document-level; `item` = bound to a specific story/task via `itemRef`. */
	readonly scope: 'doc' | 'item';
	/** When `scope === 'item'`, the story/task id this requirement belongs to. */
	readonly itemRef?: string | undefined;
}

/** The functional-definition record carried optionally on every artifact body. */
export interface FunctionalDefinition {
	readonly requirements: readonly FunctionalRequirement[];
}

/**
 * Assembly validation for a functional-definition record, run before an artifact
 * is persisted. Absent-safe: `undefined` or an empty `requirements[]` is treated
 * as absent and passes (returns `null`). Otherwise it rejects — with a specific
 * message — a malformed FR id, a duplicate FR id, a per-item requirement missing
 * its `itemRef`, or a per-item `itemRef` that resolves to no known story/task id.
 * (A requirement whose id could not be minted never reaches here — `mintFrId`
 * throws at mint time.) Returns the error string, or `null` when the record is
 * valid/absent.
 *
 * @param knownItemIds the story/task ids a per-item `itemRef` may point at.
 */
export function validateFunctionalDefinition(
	fd: FunctionalDefinition | undefined,
	knownItemIds: ReadonlySet<string> = new Set<string>(),
): string | null {
	if (fd === undefined || fd.requirements.length === 0) return null; // absent-safe
	const seen = new Set<string>();
	for (const r of fd.requirements) {
		if (!isFrId(r.id)) {
			return `functionalDefinition: '${r.id}' is not a valid FR id`;
		}
		if (seen.has(r.id)) {
			return `functionalDefinition: duplicate FR id '${r.id}'`;
		}
		seen.add(r.id);
		if (r.scope === 'item') {
			if (r.itemRef === undefined || r.itemRef.length === 0) {
				return `functionalDefinition: per-item FR '${r.id}' is missing itemRef`;
			}
			if (!knownItemIds.has(r.itemRef)) {
				return `functionalDefinition: FR '${r.id}' has a dangling itemRef '${r.itemRef}'`;
			}
		}
	}
	return null;
}

/**
 * Render the Functional Requirements section as markdown lines, generated from the
 * record (k2 — prose is never hand-authored). ABSENT-SAFE: returns `[]` when the
 * record is undefined or empty, so a caller that spreads the result appends nothing
 * and its output is byte-identical to before. Doc-level requirements list first;
 * per-item requirements are grouped under their referenced story/task id.
 */
export function renderFunctionalRequirementsSection(fd: FunctionalDefinition | undefined): string[] {
	if (fd === undefined || fd.requirements.length === 0) return [];
	const line = (r: FunctionalRequirement): string =>
		`- **${r.id}** — ${r.statement}${r.rationale !== undefined && r.rationale.length > 0 ? ` _(${r.rationale})_` : ''}`;

	const lines: string[] = ['## Functional requirements', ''];
	for (const r of fd.requirements) {
		if (r.scope === 'doc') lines.push(line(r));
	}
	const byItem = new Map<string, FunctionalRequirement[]>();
	for (const r of fd.requirements) {
		if (r.scope !== 'item') continue;
		const key = r.itemRef !== undefined && r.itemRef.length > 0 ? r.itemRef : '(unassigned)';
		const arr = byItem.get(key) ?? [];
		arr.push(r);
		byItem.set(key, arr);
	}
	for (const [item, rs] of byItem) {
		lines.push('', `**${item}:**`, '');
		for (const r of rs) lines.push(line(r));
	}
	lines.push('');
	return lines;
}
