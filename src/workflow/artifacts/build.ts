/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * BuildArtifact — the `build` workflow (5th in the chain).
 *
 * One artifact per Story: the approved Story plan (a PlanArtifact of
 * ordered Tasks) in → each Task implemented into code out. Renders to
 * `docs/builds/BUILD-<epic-slug>-<story-id>.md`; canonical JSON at
 * `.insrc/artifacts/BUILD-<epic-hash>-<story-id>.json`.
 *
 * Mirrors `artifacts/plan.ts` in shape, reusing the parent module's
 * `hash.ts` / `slug.ts` / `storage.ts` writers rather than adding new
 * persistence machinery.
 *
 * s1 SCOPE: this is the SKELETON only. The body is intentionally
 * minimal (a `summary` + a `taskOutcomes[]` placeholder). The real
 * per-Task edit/test/repair outcomes, the deterministic cross-artifact
 * validators, and the finalize seam grow in Story s5 — see the
 * `TODO(s5)` markers here and in `orchestrator.finalizeBuild`.
 */

import { renderCitationBlock } from '../synthesizer.js';
import { artifactIdMarker, buildArtifactId } from '../storage.js';
import type { ArtifactMetaBase, Citation } from '../types.js';

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

/** One Task's implementation outcome. s1 keeps this minimal; s5 grows
 *  it (diff stats, test run result, repair attempts, …). */
export interface BuildTaskOutcome {
	readonly taskId:   string;                        // the PlanTask id (`t1`, `t2`, …)
	readonly status:   'pending' | 'implemented' | 'failed';
	readonly summary?: string;                        // one-line human note
}

export interface BuildBody {
	readonly summary:      string;                    // human-facing run summary
	readonly taskOutcomes: readonly BuildTaskOutcome[]; // one per implemented Task (empty in the s1 skeleton)
}

// ---------------------------------------------------------------------------
// Meta + artifact
// ---------------------------------------------------------------------------

export interface BuildMeta extends ArtifactMetaBase {
	readonly epicHash:  string;
	readonly epicSlug:  string;
	readonly storyId:   string;
	readonly planRunId: string;                       // the PlanArtifact this build implemented
}

export interface BuildArtifact {
	readonly meta:      BuildMeta;
	readonly body:      BuildBody;
	readonly citations: readonly Citation[];
}

export const BUILD_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderBuildMarkdown(artifact: BuildArtifact): string {
	const { body, meta, citations } = artifact;
	const lines: string[] = [];
	lines.push(artifactIdMarker(buildArtifactId(meta.epicHash, meta.storyId)));
	lines.push('');
	lines.push(`# Build: ${meta.storyId}`);
	lines.push('');
	lines.push(`**Epic:** \`${meta.epicSlug}\``);
	lines.push(`**Plan run:** \`${meta.planRunId}\``);
	lines.push('');

	lines.push('## Summary');
	lines.push('');
	lines.push(body.summary);
	lines.push('');

	if (body.taskOutcomes.length > 0) {
		lines.push('## Task outcomes');
		lines.push('');
		lines.push('| Task | Status | Notes |');
		lines.push('| :--- | :--- | :--- |');
		for (const o of body.taskOutcomes) {
			const note = o.summary !== undefined ? escapePipes(o.summary) : '—';
			lines.push(`| \`${o.taskId}\` | ${o.status} | ${note} |`);
		}
		lines.push('');
	}

	// Shared citation footer (same envelope every artifact renderer uses).
	return lines.join('\n') + renderCitationBlock(citations);
}

function escapePipes(s: string): string { return s.replace(/\|/g, '\\|'); }

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

export function isBuildBody(v: unknown): v is BuildBody {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (typeof r['summary'] !== 'string') return false;
	if (!Array.isArray(r['taskOutcomes'])) return false;
	return true;
}

export function isCitationArray(v: unknown): v is Citation[] {
	if (!Array.isArray(v)) return false;
	for (const c of v) {
		if (typeof c !== 'object' || c === null) return false;
		const r = c as Record<string, unknown>;
		if (typeof r['id'] !== 'string' || typeof r['kind'] !== 'string' || typeof r['ref'] !== 'string') return false;
	}
	return true;
}
