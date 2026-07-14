/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compact comment-body renderers for `tracker.post`.
 *
 * Each returns a short markdown body suitable for a GitHub issue
 * comment. The LLM invokes `gh issue comment --body-file` with
 * this string; it should not need to reshape it.
 */

import type { AmendmentRecord } from '../../amendments/types.js';
import type { HldArtifact } from '../../artifacts/hld.js';
import type { LldArtifact } from '../../artifacts/lld.js';

/** HLD comment on the Epic issue. Highlights the chosen framework,
 *  the shared contracts, the rollout phases, and — critically — the
 *  effective HLD hash so reviewers can spot stale-vs-fresh. */
export function renderTrackerHldSummary(hld: HldArtifact): string {
	const b = hld.body;
	const lines: string[] = [];
	lines.push(`## HLD — ${b.frameworkSummary}`);
	lines.push('');
	lines.push(`**Chosen alternative:** \`${b.chosenAlternative}\``);
	lines.push('');
	lines.push('### Shared contracts');
	for (const sc of b.sharedContracts) {
		lines.push(`- \`${sc.id}\` **${sc.name}** — owned by \`${sc.ownedByStory}\``);
	}
	lines.push('');
	lines.push('### Rollout phases');
	for (const p of b.rolloutOverview.phases) {
		lines.push(`- **${p.name}** — Stories: ${p.includesStories.join(', ')}`);
	}
	if (b.openQuestions.length > 0) {
		lines.push('');
		lines.push('### Open questions');
		for (const q of b.openQuestions) lines.push(`- ${q}`);
	}
	lines.push('');
	lines.push(`_HLD base run: \`${hld.meta.runId}\`_`);
	return lines.join('\n');
}

/** LLD comment on the corresponding Story issue. Names the
 *  effective HLD hash it anchored to so reviewers can spot drift. */
export function renderTrackerLldSummary(lld: LldArtifact): string {
	const b = lld.body;
	const lines: string[] = [];
	lines.push(`## LLD — Story ${lld.meta.storyId}`);
	lines.push('');
	lines.push(`**Chosen alternative:** \`${b.chosenAlternative}\``);
	lines.push('');
	lines.push('### Contract');
	lines.push(`- Surface level: \`${b.contractDetails.surfaceLevel}\``);
	for (const a of b.contractDetails.api) {
		lines.push(`- \`${a.name}\`: \`${a.signature}\``);
	}
	lines.push('');
	lines.push('### Test strategy');
	lines.push(`- Framework: \`${b.testStrategy.testFramework}\``);
	for (const tl of b.testStrategy.testLevels) {
		lines.push(`- **${tl.level}** — ${tl.purpose}`);
	}
	if (b.migration !== undefined) {
		lines.push('');
		lines.push(`### Migration`);
		lines.push(`- Zero downtime: ${b.migration.zeroDowntime ? 'yes' : 'no'}`);
		lines.push(`- Data rewrite: ${b.migration.dataRewriteRequired ? 'yes' : 'no'}`);
	}
	lines.push('');
	lines.push(`_HLD effective hash: \`${lld.meta.hldEffectiveHash.slice(0, 12)}...\`_`);
	return lines.join('\n');
}

/** Amendment approval comment on the Epic issue. */
export function renderTrackerAmendmentSummary(rec: AmendmentRecord): string {
	const lines: string[] = [];
	lines.push(`## Amendment approved: \`${rec.amendment.type}\``);
	lines.push('');
	lines.push(`**Id:** \`${rec.id}\``);
	if (rec.approvedAt !== undefined) lines.push(`**Approved at:** ${rec.approvedAt}`);
	if (rec.approvedBy !== undefined) lines.push(`**Approved by:** ${rec.approvedBy}`);
	lines.push('');
	lines.push('**Rationale:**');
	lines.push(rec.rationale);
	lines.push('');
	lines.push('**Amendment payload:**');
	lines.push('```json');
	lines.push(JSON.stringify(rec.amendment, null, 2));
	lines.push('```');
	return lines.join('\n');
}
