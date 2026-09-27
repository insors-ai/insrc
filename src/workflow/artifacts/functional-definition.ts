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
