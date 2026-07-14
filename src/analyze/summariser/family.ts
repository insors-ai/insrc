/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Path-based `DocFamily` inference.
 *
 * plans/docs-module.md Section 6.1. First pattern that matches wins;
 * order is: design > plans > docs > adr > rfc > spec > changelog >
 * readme > other. The LLM in the summariser prompt can override
 * this in the emitted `family` field when the prose contradicts
 * the path (e.g. a `README.md` under `plans/` that's actually a
 * plans index).
 *
 * The inference is deliberately conservative: exact basename
 * matches for CHANGELOG/HISTORY, path-segment matches for the rest.
 * No fuzzy filename similarity.
 */

import { basename } from 'node:path';

import type { DocFamily } from '../../shared/analyze-types.js';

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/**
 * Ordered list of (family, matcher). First match wins. The matcher
 * receives the file path (as stored in the entity -- typically
 * repo-relative or absolute) + the basename. Return true to claim
 * the file for this family.
 *
 * Order matters: `design/` and `plans/` win over `docs/`, so a doc
 * at `docs/design/foo.md` classifies as `design`. This matches
 * user intent when a repo nests one under the other.
 */
type FamilyMatcher = (file: string, base: string) => boolean;

const PATTERNS: ReadonlyArray<{ family: DocFamily; match: FamilyMatcher }> = [
	{
		family: 'design',
		// Match `design/` OR `designs/` (plural). Real repos use both
		// spellings (e.g. insors-extraction has `docs/designs/*.html`).
		match:  (file) => /(^|\/)designs?(\/|$)/i.test(file),
	},
	{
		family: 'plans',
		// Match `plan/` OR `plans/` -- both idioms appear in the wild.
		match:  (file) => /(^|\/)plans?(\/|$)/i.test(file),
	},
	{
		family: 'adr',
		match:  (file, base) =>
			/(^|\/)adr(\/|$)/i.test(file) ||
			/^adr-.+\.md$/i.test(base),
	},
	{
		family: 'rfc',
		match:  (file, base) =>
			/(^|\/)rfc(\/|$)/i.test(file) ||
			/^rfc-.+\.md$/i.test(base),
	},
	{
		family: 'spec',
		match:  (file, base) =>
			/(^|\/)spec(\/|$)/i.test(file) ||
			/^spec-.+\.md$/i.test(base),
	},
	{
		family: 'docs',
		match:  (file) => /(^|\/)docs?(\/|$)/i.test(file),
	},
	{
		family: 'changelog',
		match:  (_file, base) =>
			base === 'CHANGELOG.md' ||
			base === 'CHANGES.md' ||
			base === 'HISTORY.md',
	},
	{
		family: 'readme',
		match:  (_file, base) => /^readme(\..*)?$/i.test(base),
	},
];

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Classify a doc entity's file path into a `DocFamily`. Returns
 * `'other'` when no pattern matches.
 *
 * The file path may be absolute (from `Entity.file`) or repo-
 * relative -- both work. Basename fallback catches
 * `LICENSE.md` / `CHANGELOG.md` / `RFC-042.md` regardless of
 * their containing directory.
 */
export function inferDocFamily(file: string): DocFamily {
	if (typeof file !== 'string' || file.length === 0) return 'other';
	const norm = file.replace(/\\/g, '/');
	const base = basename(norm);
	for (const { family, match } of PATTERNS) {
		if (match(norm, base)) return family;
	}
	return 'other';
}
