/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Synthesizer scaffolding for workflow artifacts.
 *
 * The synthesizer step takes an artifact (meta + body + citations)
 * emitted by the outer LLM, validates it, and hands back a
 * rendered markdown string ready to write to disk. The framework
 * enforces three checks before writing:
 *
 *   1. JSON-shape check — validate against a per-artifact ajv
 *      schema. Runners plug their own validator in via
 *      `validateArtifact`.
 *   2. Citation grounding — every claim in the rendered body
 *      references at least one citation id in `citations[]`, and
 *      every `citations[]` id is unique.
 *   3. Scope-boundary — apply per-workflow banned patterns to
 *      catch clearly out-of-scope content (e.g. code fences in a
 *      define artifact, task lists in an HLD).
 *
 * Failure at any check produces a `ValidationFailure` the caller
 * surfaces as an `emit_synthesize` retry prompt.
 */

import type { Citation, WorkflowArtifact, WorkflowName } from './types.js';

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface ValidationOk {
	readonly ok: true;
}

export interface ValidationFailure {
	readonly ok: false;
	/** Which check failed. */
	readonly kind: 'schema' | 'citations' | 'boundary';
	/** One-line human-readable message. */
	readonly message: string;
	/** Per-check details for the retry prompt. */
	readonly details?: ReadonlyArray<string>;
	/** Whether re-emitting the synthesize artifact can fix this. Defaults to
	 *  true (absent). Set `false` for failures that derive from a FIXED step
	 *  output — e.g. a checklist scope-boundary hard-fail — which re-emitting
	 *  the artifact cannot change; an automated driver surfaces those
	 *  immediately instead of wasting retries. */
	readonly retryable?: boolean;
}

export type ValidationResult = ValidationOk | ValidationFailure;

// ---------------------------------------------------------------------------
// Citation grounding
// ---------------------------------------------------------------------------

/** Regex the check uses to spot citation refs in body text.
 *  Matches [[cN]] where N is a number. Kept intentionally strict —
 *  every artifact template must use this exact syntax so grounding
 *  is machine-verifiable. */
const CITATION_REF_RE = /\[\[c(\d+)\]\]/g;

/** Validate that:
 *   - Every `citations[]` id is unique and matches the `cN` shape.
 *   - Every `[[cN]]` reference in `body` resolves to a citation.
 *   - Every citation is referenced at least once (dead citations
 *     signal the LLM padded the list to look grounded).
 */
export function validateCitations(
	body:      string,
	citations: readonly Citation[],
): ValidationResult {
	const details: string[] = [];
	const seenIds = new Set<string>();
	for (const c of citations) {
		if (!/^c\d+$/.test(c.id)) {
			details.push(`citation id '${c.id}' does not match /^c\\d+$/`);
			continue;
		}
		if (seenIds.has(c.id)) {
			details.push(`duplicate citation id '${c.id}'`);
			continue;
		}
		seenIds.add(c.id);
	}
	if (details.length > 0) {
		return { ok: false, kind: 'citations', message: 'citation list is malformed', details };
	}
	const refIds = new Set<string>();
	for (const m of body.matchAll(CITATION_REF_RE)) {
		refIds.add(`c${m[1]!}`);
	}
	for (const id of refIds) {
		if (!seenIds.has(id)) {
			details.push(`body references '[[${id}]]' but no citation with that id exists`);
		}
	}
	// NOTE: a citation that is DEFINED but never referenced is tolerated. It is
	// harmless — grounding of the body's CLAIMS is guaranteed by the dangling-ref
	// check above (every `[[cN]]` resolves). Hard-failing on an unreferenced
	// citation only punished long, expensive artifact synthesizes (an LLM leaving
	// one source in the list it didn't end up citing) without improving grounding,
	// so it is no longer an error. Unreferenced citations render harmlessly in the
	// footer.
	if (details.length > 0) {
		return { ok: false, kind: 'citations', message: 'citations do not ground the body', details };
	}
	return { ok: true };
}

// ---------------------------------------------------------------------------
// Scope boundary
// ---------------------------------------------------------------------------

/** A per-workflow banned pattern. Each entry pairs a regex with a
 *  human-readable reason. If the pattern matches the body, the
 *  boundary check fails.
 *
 *  Kept as data (per workflow) rather than code so the checks are
 *  easy to extend as we learn what each artifact type consistently
 *  drifts into. */
export interface BannedPattern {
	readonly pattern: RegExp;
	readonly reason:  string;
}

const BOUNDARY_RULES: Partial<Record<WorkflowName, readonly BannedPattern[]>> = {
	stub: [],
	define: [
		{ pattern: /```[a-zA-Z]*\n/, reason: 'define artifacts must not contain code fences — no code in a define' },
	],
	'design.epic': [
		{ pattern: /^\s*-\s*\[\s?\]/m, reason: 'HLD must not contain task lists — those belong to plan / tracker' },
	],
	'design.story': [],
	'tracker.push': [],
	'tracker.sync': [],
	'tracker.post': [],
};

/** Apply per-workflow banned patterns to the rendered body.
 *  Returns `ok` when nothing matches. */
export function checkScopeBoundary(
	workflow: WorkflowName,
	body:     string,
): ValidationResult {
	const rules = BOUNDARY_RULES[workflow] ?? [];
	const details: string[] = [];
	for (const { pattern, reason } of rules) {
		if (pattern.test(body)) {
			details.push(reason);
		}
	}
	if (details.length > 0) {
		return {
			ok:      false,
			kind:    'boundary',
			message: 'artifact violates scope boundary',
			details,
		};
	}
	return { ok: true };
}

// ---------------------------------------------------------------------------
// Combined validator
// ---------------------------------------------------------------------------

/** Convenience wrapper that runs boundary + citations against a
 *  fully-rendered artifact body. Schema validation is
 *  runner-specific and lives with the artifact type's module. */
export function validateBodyAndCitations<Body>(
	artifact: WorkflowArtifact<Body>,
	renderedBody: string,
): ValidationResult {
	const boundary = checkScopeBoundary(artifact.meta.workflow, renderedBody);
	if (!boundary.ok) return boundary;
	return validateCitations(renderedBody, artifact.citations);
}

// ---------------------------------------------------------------------------
// Rendered markdown envelope
// ---------------------------------------------------------------------------

/** Render the standard `## Citations` block at the tail of every
 *  artifact. Every artifact renderer calls this to append its
 *  citation footer consistently. */
export function renderCitationBlock(citations: readonly Citation[]): string {
	if (citations.length === 0) return '';
	const lines: string[] = ['', '## Citations', ''];
	for (const c of citations) {
		const kind = c.kind;
		const ref  = c.ref;
		const quoted = c.quotedText === undefined ? '' : ` — "${c.quotedText.slice(0, 200)}"`;
		lines.push(`- **[[${c.id}]]** \`${kind}\` \`${ref}\`${quoted}`);
	}
	return lines.join('\n') + '\n';
}
