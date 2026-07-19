/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD question-resolution persistence + rendering for `insrc_build_step`.
 *
 * A resolution lands in `LLD.meta.questionResolutions[questionId]`. The LLD
 * JSON + re-rendered markdown are written back to disk, committed + pushed, and
 * a summary is posted on the Story issue. All tracker side effects are
 * best-effort — a resolution is recorded locally even when git/gh is
 * unavailable.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import { renderCitationBlock } from '../../workflow/synthesizer.js';
import { renderLldMarkdown, type LldArtifact, type QuestionResolution } from '../../workflow/artifacts/lld.js';
import { lldArtifactPaths, writeAtomic } from '../../workflow/storage.js';
import { resolveGithubConfig } from '../../workflow/config/github.js';
import { commitAndPushArtifacts, ghComment } from '../../workflow/tracker/github.js';

const log = getLogger('mcp:build-step:resolutions');

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** The `{{resolvedDecisions}}` block injected into the implement prompt. Lists
 *  every resolution matching a current open question: a `'resolved'` question
 *  carries its decision; an `'ignored'` one is left to implementer judgment. */
export function renderResolvedDecisions(lld: LldArtifact): string {
	const resolutions = lld.meta.questionResolutions ?? {};
	const lines: string[] = [];
	for (const [, r] of Object.entries(resolutions)) {
		if (r.status === 'ignored') {
			lines.push(`- **${r.question}** — left to implementer judgment${r.rationale ? ` (${r.rationale})` : ''}.`);
		} else {
			lines.push(`- **${r.question}** — ${r.choice ?? '(no choice recorded)'}${r.rationale ? ` (${r.rationale})` : ''}.`);
		}
	}
	return lines.join('\n');
}

/** The "## Resolved questions" markdown section appended to the LLD md. */
export function renderResolvedQuestionsSection(resolutions: Readonly<Record<string, QuestionResolution>>): string {
	const entries = Object.entries(resolutions);
	if (entries.length === 0) return '';
	const lines: string[] = ['', '## Resolved questions', ''];
	for (const [id, r] of entries) {
		const decision = r.status === 'ignored'
			? 'left to implementer judgment'
			: (r.choice ?? '(no choice)');
		lines.push(`- \`${id}\` — ${r.question}`);
		lines.push(`  - **${r.status}**: ${decision}${r.rationale ? ` — ${r.rationale}` : ''} _(${r.resolvedAt})_`);
	}
	lines.push('');
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export interface PersistResult {
	readonly lld:      LldArtifact;
	readonly jsonPath: string;
	readonly mdPath:   string;
}

/** Record a resolution into the LLD meta on disk, re-render the md (with the
 *  "## Resolved questions" section), and return the updated artifact + paths.
 *  Reads the RAW LLD JSON (no gate) so the resolution is additive to whatever
 *  is on disk. */
export function persistResolution(
	repoPath:   string,
	epicHash:   string,
	storyId:    string,
	epicSlug:   string,
	questionId: string,
	resolution: QuestionResolution,
): PersistResult {
	const paths = lldArtifactPaths(repoPath, epicHash, storyId, epicSlug);
	const lld = JSON.parse(readFileSync(paths.json, 'utf8')) as LldArtifact;
	const nextResolutions: Record<string, QuestionResolution> = {
		...(lld.meta.questionResolutions ?? {}),
		[questionId]: resolution,
	};
	const next: LldArtifact = { ...lld, meta: { ...lld.meta, questionResolutions: nextResolutions } };
	writeAtomic(paths.json, JSON.stringify(next, null, 2) + '\n');
	const md = renderLldMarkdown(next) + renderResolvedQuestionsSection(nextResolutions) + renderCitationBlock(next.citations);
	writeAtomic(paths.md, md);
	return { lld: next, jsonPath: paths.json, mdPath: paths.md };
}

/** Best-effort commit+push of the LLD artifacts + a Story-issue comment. Never
 *  throws — a missing git tree, an unconfigured tracker, or a `gh` failure just
 *  leaves the resolution recorded locally. */
export function commitAndCommentResolution(
	repoPath: string,
	paths:    PersistResult,
	storyRef: string | undefined,
	summary:  string,
): void {
	try {
		commitAndPushArtifacts(repoPath, [paths.jsonPath, paths.mdPath], summary);
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'resolution: commit/push failed (best-effort)');
	}
	if (storyRef === undefined || !storyRef.includes('#')) return;
	try {
		const cfg = resolveGithubConfig(repoPath);
		if (cfg.type !== 'github') return;
		ghComment(cfg.owner, cfg.repo, storyRef, summary);
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'resolution: story-issue comment failed (best-effort)');
	}
}
