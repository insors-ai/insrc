/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * SpecArtifact — the durable, inspectable output of the `brainstorm`
 * stage (Epic `frame-epic-new-pre-workflow-brainstorm`, S006 / sc1).
 *
 * The `elicit` runner converges a rough one-line idea into a confirmed
 * working statement plus the forks decided along the way. S006 turns that
 * converged elicit output into a persisted artifact — one this epic's
 * downstream stages consume as `focus`: `define` (S008) and standalone
 * `design.story` (S009). It is a peer of `DefineArtifact` in shape and
 * persistence; it just carries the spec body rather than an Epic body.
 *
 * The body is a straight structuring of the confirmed elicit output:
 *   - `intent` + `scopeBoundary` — the two halves of the converged
 *     `workingStatement` (what the request IS, and where it stops);
 *   - `decisions[]` — each fork the user resolved, with the alternatives
 *     ruled out and the reasoning captured (never just the final wording);
 *   - `nonGoals[]` — the explicit exclusions (every ruled-out direction
 *     survives here, guaranteed by the elicit `ruled-out-not-recorded` gate);
 *   - `openItems[]` — deferred gaps carried forward (a confirmed spec keeps
 *     this empty by the `convergence-incomplete` gate, but the shape allows
 *     an intermediate render).
 *
 * The renderer mirrors `renderDefineMarkdown`: an artifact-id marker header
 * (so a slug-named `.md` maps back to its hash-named `.json`), then one
 * section per body field.
 */

import { artifactIdMarker, specArtifactId } from '../storage.js';
import type { Citation, WorkflowArtifact } from '../types.js';
import type { BrainstormCategory } from '../../shared/brainstorm-classes.js';

// ---------------------------------------------------------------------------
// Body shape
// ---------------------------------------------------------------------------

/** One fork the user resolved during elicitation. `chosen` matches the
 *  elicit schema's `decisions[].chosen`; every `ruledOut` direction is
 *  also carried into `SpecArtifactBody.nonGoals`. */
export interface SpecDecision {
	readonly chosen:   string;
	readonly ruledOut: readonly string[];
	readonly reason:   string;
}

export interface SpecArtifactBody {
	/** The request category, from the shared BrainstormCategory vocabulary
	 *  (reused, never invented — c33). */
	readonly category:      BrainstormCategory;
	/** What the request IS — the converged intent (from workingStatement). */
	readonly intent:        string;
	/** Where the request stops — the scope boundary (from workingStatement). */
	readonly scopeBoundary: string;
	/** Explicit exclusions. Includes every `SpecDecision.ruledOut` direction. */
	readonly nonGoals:      readonly string[];
	/** The forks resolved during elicitation, reasoning preserved. */
	readonly decisions:     readonly SpecDecision[];
	/** Deferred gaps carried forward. Empty on a confirmed spec. */
	readonly openItems:     readonly string[];
}

export type SpecArtifact = WorkflowArtifact<SpecArtifactBody>;

export const SPEC_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderSpecMarkdown(artifact: SpecArtifact): string {
	const { body } = artifact;
	const lines: string[] = [];
	const specHash = artifact.meta.specHash;
	if (typeof specHash === 'string' && specHash.length > 0) {
		lines.push(artifactIdMarker(specArtifactId(specHash)));
		lines.push('');
	}
	lines.push(`# Spec: ${firstSentence(body.intent)}`);
	lines.push('');
	lines.push(`**Category:** ${body.category}`);
	lines.push('');

	lines.push('## Intent');
	lines.push('');
	lines.push(body.intent);
	lines.push('');

	lines.push('## Scope boundary');
	lines.push('');
	lines.push(body.scopeBoundary);
	lines.push('');

	if (body.nonGoals.length > 0) {
		lines.push('## Non-goals');
		lines.push('');
		for (const ng of body.nonGoals) {
			lines.push(`- ${ng}`);
		}
		lines.push('');
	}

	if (body.decisions.length > 0) {
		lines.push('## Decisions');
		lines.push('');
		for (const d of body.decisions) {
			lines.push(`- **${d.chosen}** — ${d.reason}`);
			if (d.ruledOut.length > 0) {
				lines.push(`  - Ruled out: ${d.ruledOut.map(r => `_${r}_`).join(', ')}`);
			}
		}
		lines.push('');
	}

	if (body.openItems.length > 0) {
		lines.push('## Open items');
		lines.push('');
		for (const q of body.openItems) {
			lines.push(`- ${q}`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

function firstSentence(s: string): string {
	const m = /^(.+?[.!?])\s/.exec(s);
	if (m !== null) return m[1]!;
	return s.length > 80 ? s.slice(0, 77) + '...' : s;
}

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

const CATEGORY_IDS: ReadonlySet<string> =
	new Set(['requirements', 'design', 'implementation', 'testing', 'general']);

function isStringArray(v: unknown): v is readonly string[] {
	return Array.isArray(v) && v.every(x => typeof x === 'string');
}

function isSpecDecision(v: unknown): v is SpecDecision {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (typeof r['chosen'] !== 'string' || r['chosen'].length === 0) return false;
	if (typeof r['reason'] !== 'string' || r['reason'].length === 0) return false;
	if (!isStringArray(r['ruledOut'])) return false;
	return true;
}

export function isSpecBody(v: unknown): v is SpecArtifactBody {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (typeof r['category'] !== 'string' || !CATEGORY_IDS.has(r['category'])) return false;
	if (typeof r['intent'] !== 'string' || r['intent'].length === 0) return false;
	if (typeof r['scopeBoundary'] !== 'string' || r['scopeBoundary'].length === 0) return false;
	if (!isStringArray(r['nonGoals'])) return false;
	if (!isStringArray(r['openItems'])) return false;
	if (!Array.isArray(r['decisions']) || !r['decisions'].every(isSpecDecision)) return false;
	return true;
}

export function isCitationArray(v: unknown): v is Citation[] {
	if (!Array.isArray(v)) return false;
	for (const c of v) {
		if (typeof c !== 'object' || c === null) return false;
		const r = c as Record<string, unknown>;
		if (typeof r['id'] !== 'string')   return false;
		if (typeof r['kind'] !== 'string') return false;
		if (typeof r['ref'] !== 'string')  return false;
	}
	return true;
}
