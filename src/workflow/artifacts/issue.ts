/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * IssueArtifact — the durable, inspectable output of the `issue` stage
 * (Epic `add-bugfix-triage-category-insrc-framework`, S002 / sc2).
 *
 * The `issue.capture` runner assembles a defect's reproduction, root cause,
 * and fix intent (grounded against the real code). S002 turns that converged
 * capture output into a persisted, cited, approvable artifact — the FIRST stage
 * of the bugfix flow, and the SINGLE SOURCE OF TRUTH for both the internal
 * chain record AND (later, S005) the GitHub issue body (k4). It is a peer of
 * `SpecArtifact` in shape and persistence; it just carries the defect body.
 *
 * CRUCIAL split (k4): the BODY holds ONLY the human-readable defect prose
 * (title/reproduction/rootCause/fixIntent) — the exact bytes rendered as the
 * GitHub issue body. The routing/linking fields ride on `meta`, NOT the body:
 *   - `meta.magnitude`  — carried from sc1 (read by the s4 router);
 *   - `meta.parentRef`  — stamped by the s3 locator once found (null = standalone);
 *   - `meta.issueHash`  — the canonical identity (peer of specHash);
 *   - `meta.approvedAt` — the standard approve stamp.
 * Keeping them on meta means s3 can stamp `parentRef` without rewriting the
 * reviewed body, and `renderIssueMarkdown` never leaks routing metadata into
 * the GitHub issue body.
 *
 * The renderer mirrors `renderSpecMarkdown`: an artifact-id marker header (so a
 * slug-named `.md` maps back to its hash-named `.json`), then one section per
 * body field.
 */

import { artifactIdMarker, issueArtifactId } from '../storage.js';
import type { Citation, WorkflowArtifact } from '../types.js';

// ---------------------------------------------------------------------------
// Body shape — the GH-body-ready defect prose ONLY (no routing/linking fields)
// ---------------------------------------------------------------------------

export interface IssueArtifactBody {
	/** A short imperative defect title (becomes the GitHub issue title / `# <title>`). */
	readonly title:        string;
	/** How to reproduce it — steps / observed vs expected. */
	readonly reproduction: string;
	/** The diagnosed cause of the defect. */
	readonly rootCause:    string;
	/** What the correction will do (intent, not implementation). */
	readonly fixIntent:    string;
}

export type IssueArtifact = WorkflowArtifact<IssueArtifactBody>;

export const ISSUE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Renderer — the bytes S005 posts as the GitHub issue body (walks BODY only)
// ---------------------------------------------------------------------------

export function renderIssueMarkdown(artifact: IssueArtifact): string {
	const { body } = artifact;
	const lines: string[] = [];
	const issueHash = artifact.meta.issueHash;
	if (typeof issueHash === 'string' && issueHash.length > 0) {
		lines.push(artifactIdMarker(issueArtifactId(issueHash)));
		lines.push('');
	}
	lines.push(`# ${body.title}`);
	lines.push('');

	lines.push('## Reproduction');
	lines.push('');
	lines.push(body.reproduction);
	lines.push('');

	lines.push('## Root cause');
	lines.push('');
	lines.push(body.rootCause);
	lines.push('');

	lines.push('## Fix intent');
	lines.push('');
	lines.push(body.fixIntent);
	lines.push('');

	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
	return typeof v === 'string' && v.length > 0;
}

export function isIssueBody(v: unknown): v is IssueArtifactBody {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (!isNonEmptyString(r['title']))        return false;
	if (!isNonEmptyString(r['reproduction'])) return false;
	if (!isNonEmptyString(r['rootCause']))    return false;
	if (!isNonEmptyString(r['fixIntent']))    return false;
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
