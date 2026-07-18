/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The single source of truth for the artificial Epic/Story GitHub
 * conventions — label names, issue-body renderers, the Epic task-list
 * updater, comment summaries, and the sync status map. BOTH tracker
 * paths (deterministic auto-push + LLM coarse-handoff) render from here
 * so a push produces identical issues regardless of who ran it.
 *
 * Doc links use the slug-based md paths from `storage.ts` (fixes the
 * earlier hash-named regression) so issue → doc links always resolve.
 */

import { issueNumber } from './refs.js';
import { defineMdRel, hldMdRel, lldMdRel, planMdRel } from '../storage.js';
import type { DefineArtifact, DefineStory } from '../artifacts/define.js';
import type { HldArtifact } from '../artifacts/hld.js';
import type { LldArtifact } from '../artifacts/lld.js';
import type { PlanTask } from '../artifacts/plan.js';
import type { AmendmentRecord } from '../amendments/types.js';

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Status labels that add nuance over open/closed. */
export const STATUS_LABELS: readonly string[] = ['insrc:in-progress', 'insrc:blocked'];

export function epicMembershipLabel(epicSlug: string): string { return `epic:${epicSlug}`; }

/** Every label the framework expects to exist for an Epic. Created
 *  idempotently on first push. */
export function allTrackerLabels(epicLabel: string, storyLabel: string, epicSlug: string): readonly string[] {
	return [epicLabel, storyLabel, epicMembershipLabel(epicSlug), ...STATUS_LABELS];
}

// ---------------------------------------------------------------------------
// Issue bodies
// ---------------------------------------------------------------------------

/** Epic issue body — problem, non-goals, constraints, a `## Stories`
 *  task-list with placeholders later pushes replace, and slug-based doc
 *  links. */
/** Points a `## Design references` line at the committed artifact. */
export interface RepoRef {
	readonly owner:   string;
	readonly repo:    string;
	readonly branch?: string | undefined;   // default 'main'
}

/** Render one design-reference line. With `repo`, the doc path is a clickable
 *  GitHub blob link (the artifact is committed to the repo on approval, so the
 *  link resolves for anyone who pulls); without it, a bare path (back-compat). */
function docRef(label: string, path: string, repo?: RepoRef): string {
	if (repo === undefined) return `- ${label}: \`${path}\``;
	const branch = repo.branch ?? 'main';
	return `- ${label}: [\`${path}\`](https://github.com/${repo.owner}/${repo.repo}/blob/${branch}/${path})`;
}

export function renderEpicBody(define: DefineArtifact, epicSlug: string, repo?: RepoRef): string {
	const body = define.body;
	const lines: string[] = [];
	lines.push('## Problem', '', body.problem, '');
	if (body.nonGoals.length > 0) {
		lines.push('## Non-goals', '');
		for (const ng of body.nonGoals) lines.push(`- **${ng.text}** — ${ng.rationale}`);
		lines.push('');
	}
	if (body.constraints.length > 0) {
		lines.push('## Constraints', '');
		for (const c of body.constraints) lines.push(`- **${c.id}** (${c.type}): ${c.text}`);
		lines.push('');
	}
	lines.push('## Stories', '');
	for (const s of body.stories) {
		const size = s.sizeEstimate !== undefined ? ` (${s.sizeEstimate})` : '';
		lines.push(`- [ ] ${s.id}: ${s.title}${size}`);
	}
	lines.push('');
	lines.push('## Design references', '');
	lines.push(docRef('HLD', hldMdRel(epicSlug), repo));
	lines.push(docRef('Define', defineMdRel(epicSlug), repo));
	lines.push('');
	lines.push(`_epic slug: ${epicSlug}_`);
	return lines.join('\n');
}

/** Story issue body — Epic back-ref, user value, acceptance criteria,
 *  slug-based LLD link. */
export function renderStoryBody(epicRef: string, story: DefineStory, epicSlug: string, repo?: RepoRef): string {
	const lines: string[] = [];
	lines.push(`**Epic:** #${issueNumber(epicRef)}`, '');
	lines.push('## User value', '', story.userValue, '');
	if (story.acceptanceCriteria.length > 0) {
		lines.push('## Acceptance criteria', '');
		for (const ac of story.acceptanceCriteria) {
			lines.push(`- **${ac.id}:** Given ${ac.given}, when ${ac.when}, then ${ac.then}.`);
		}
		lines.push('');
	}
	lines.push('## Design references', '');
	lines.push(docRef('LLD', lldMdRel(epicSlug, story.id), repo));
	if (story.sizeEstimate !== undefined) {
		lines.push('', `Size: ${story.sizeEstimate}`);
	}
	return lines.join('\n');
}

/** In-place update of the Epic body's task-list line for one Story:
 *  replaces the `- [ ] {storyId}: {title}` placeholder with a
 *  `- [ ] #{n} — {storyId}: {title}` link. Line-anchored + prefix-based;
 *  idempotent (leaves an already-linked line alone); returns the body
 *  unchanged if no placeholder matches. */
export function updateEpicTaskList(currentBody: string, storyId: string, storyRef: string, storyTitle: string): string {
	const num = issueNumber(storyRef);
	const lines = currentBody.split('\n');
	const placeholderPrefix   = `- [ ] ${storyId}: ${storyTitle}`;
	const alreadyLinkedPrefix = `- [ ] #${num} — ${storyId}:`;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i]!;
		if (line.startsWith(alreadyLinkedPrefix)) return currentBody;
		if (line.startsWith(placeholderPrefix)) {
			const suffix = line.slice(placeholderPrefix.length);
			lines[i] = `- [ ] #${num} — ${storyId}: ${storyTitle}${suffix}`;
			return lines.join('\n');
		}
	}
	return currentBody;
}

/** Task issue body — Story back-ref, size, summary, per-Task acceptance
 *  checks + named tests, and a slug-based link to the plan doc. Rendered
 *  for each PlanTask when `pushTasks` is enabled. */
export function renderTaskBody(storyRef: string, storyId: string, task: PlanTask, epicSlug: string, repo?: RepoRef): string {
	const lines: string[] = [];
	lines.push(`**Story:** #${issueNumber(storyRef)} (${storyId})`, '');
	lines.push(`**Size:** ${task.size}`, '');
	lines.push('## Summary', '', task.summary, '');
	if (task.dependsOn.length > 0) {
		lines.push(`**Depends on:** ${task.dependsOn.map(d => `\`${d}\``).join(', ')}`, '');
	}
	if (task.acceptanceChecks.length > 0) {
		lines.push('## Acceptance checks', '');
		for (const ac of task.acceptanceChecks) lines.push(`- [ ] ${ac}`);
		lines.push('');
	}
	if (task.tests.length > 0) {
		lines.push('## Tests', '');
		for (const t of task.tests) lines.push(`- **${t.level}:** ${t.name}`);
		lines.push('');
	}
	lines.push('## Design references', '');
	lines.push(docRef('Plan', planMdRel(epicSlug, storyId), repo));
	lines.push('', `_task: ${storyId}/${task.id}_`);
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Comment summaries (post)
// ---------------------------------------------------------------------------

/** HLD comment on the Epic issue. */
export function renderTrackerHldSummary(hld: HldArtifact): string {
	const b = hld.body;
	const lines: string[] = [];
	lines.push(`## HLD — ${b.frameworkSummary}`, '');
	lines.push(`**Chosen alternative:** \`${b.chosenAlternative}\``, '');
	lines.push('### Shared contracts');
	for (const sc of b.sharedContracts) lines.push(`- \`${sc.id}\` **${sc.name}** — owned by \`${sc.ownedByStory}\``);
	lines.push('', '### Rollout phases');
	for (const p of b.rolloutOverview.phases) lines.push(`- **${p.name}** — Stories: ${p.includesStories.join(', ')}`);
	if (b.openQuestions.length > 0) {
		lines.push('', '### Open questions');
		for (const q of b.openQuestions) lines.push(`- ${q}`);
	}
	lines.push('', `_HLD base run: \`${hld.meta.runId}\`_`);
	return lines.join('\n');
}

/** LLD comment on the corresponding Story issue. */
export function renderTrackerLldSummary(lld: LldArtifact): string {
	const b = lld.body;
	const lines: string[] = [];
	lines.push(`## LLD — Story ${lld.meta.storyId}`, '');
	lines.push(`**Chosen alternative:** \`${b.chosenAlternative}\``, '');
	lines.push('### Contract');
	lines.push(`- Surface level: \`${b.contractDetails.surfaceLevel}\``);
	for (const a of b.contractDetails.api) lines.push(`- \`${a.name}\`: \`${a.signature}\``);
	lines.push('', '### Test strategy');
	lines.push(`- Framework: \`${b.testStrategy.testFramework}\``);
	for (const tl of b.testStrategy.testLevels) lines.push(`- **${tl.level}** — ${tl.purpose}`);
	if (b.migration !== undefined) {
		lines.push('', '### Migration');
		lines.push(`- Zero downtime: ${b.migration.zeroDowntime ? 'yes' : 'no'}`);
		lines.push(`- Data rewrite: ${b.migration.dataRewriteRequired ? 'yes' : 'no'}`);
	}
	lines.push('', `_HLD effective hash: \`${lld.meta.hldEffectiveHash.slice(0, 12)}...\`_`);
	return lines.join('\n');
}

/** Amendment-approval comment on the Epic issue. */
export function renderTrackerAmendmentSummary(rec: AmendmentRecord): string {
	const lines: string[] = [];
	lines.push(`## Amendment approved: \`${rec.amendment.type}\``, '');
	lines.push(`**Id:** \`${rec.id}\``);
	if (rec.approvedAt !== undefined) lines.push(`**Approved at:** ${rec.approvedAt}`);
	if (rec.approvedBy !== undefined) lines.push(`**Approved by:** ${rec.approvedBy}`);
	lines.push('', '**Rationale:**', rec.rationale, '');
	lines.push('**Amendment payload:**', '```json', JSON.stringify(rec.amendment, null, 2), '```');
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Status map (sync)
// ---------------------------------------------------------------------------

export type TrackerStatus = 'open' | 'in-progress' | 'blocked' | 'closed';

/** GitHub issue state + labels → artifact status. Closed overrides. */
export function mapIssueStatus(state: string, labels: readonly string[]): TrackerStatus {
	if (state.toLowerCase() === 'closed') return 'closed';
	if (labels.includes('insrc:blocked')) return 'blocked';
	if (labels.includes('insrc:in-progress')) return 'in-progress';
	return 'open';
}
