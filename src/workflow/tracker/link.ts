/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Framework-owned doc↔issue linkage — a pure local file op shared by
 * BOTH tracker paths (deterministic auto-push + LLM coarse-handoff).
 * Given the refs an Epic push produced, it binds each issue to its unit's
 * head (the EPIC head, a STORY head) and re-renders each doc's markdown so
 * the human-facing doc carries a `**Tracker:** owner/repo#N` link, read from
 * that binding. Never delegated to an LLM.
 *
 * Best-effort per doc: a missing/unreadable artifact is skipped, not
 * fatal.
 */

import { getLogger } from '../../shared/logger.js';
import { readDefineArtifact, readDefinitionHead, readHldArtifact } from '../gates.js';
import { readLldArtifact } from '../artifacts/lld-io.js';
import { renderDefineMarkdown } from '../artifacts/define.js';
import { renderHldMarkdown } from '../artifacts/hld.js';
import { renderLldMarkdown } from '../artifacts/lld.js';
import { renderIssueMarkdown, type IssueArtifact } from '../artifacts/issue.js';
import { defineArtifactPaths, hldArtifactPaths, issueArtifactPaths, lldArtifactPaths, requireEpicAnchor, workItemAnchorCreatedAt, workItemKindOf, writeAtomic } from '../storage.js';
import { bindArtifact } from './binding.js';
import { trackerRefLine, type UnitRef } from './refs.js';
import { ensureUnitHead, unitHeadId, unitIssueOf } from './unit-head.js';

const log = getLogger('workflow:tracker-link');

export interface EpicRefs {
	readonly epicRef?:   string;
	readonly storyRefs?: Readonly<Record<string, string>>;
}

/** Bind `issue` on the unit's head, making the head when it has none. False when it could not be bound. */
export function bindUnitIssue(unit: UnitRef, issue: string): boolean {
	const id = unitHeadId(unit);
	if (id === undefined || !ensureUnitHead(unit)) { log.warn({ unit: unit.unit, issue }, 'tracker-link: the unit has no head to bind its issue on'); return false; }
	const bound = bindArtifact(unit.repoPath, id, issue);
	if (!bound.ok) log.warn({ id, issue, why: bound.kind, reason: bound.reason }, 'tracker-link: the unit issue was not bound');
	return bound.ok;
}

/** Link the Epic's docs to their issues: bind the Epic's issue and each Story's, then re-render HLD.md + Define.md (the Epic's) and each LLD.md (its Story's). */
export function linkDocsToIssues(repoPath: string, epicHash: string, epicSlug: string, refs: EpicRefs): void {
	// Epic docs — keyed on the Epic's anchor (sc2), all 'epic'. A work item with none fails here, before any doc is touched.
	const anchor = requireEpicAnchor(repoPath, epicHash);
	// ISSUE-5f9d4ab4c90c0b4c s1/t4+t7: an ISSUE-anchored work item has no DEF/HLD;
	// its root doc is ISSUE.md under docs/standalone. Bind the EPIC head and
	// re-render ISSUE.md with the tracker line; HLD/Define relinks are skipped.
	const head = readDefinitionHead(repoPath, epicHash);
	if (head?.kind === 'issue') {
		const issue = head.artifact as IssueArtifact;
		const kind = workItemKindOf(issue.meta);
		if (typeof refs.epicRef === 'string' && refs.epicRef.length > 0) {
			bindUnitIssue({ unit: 'epic', repoPath, epicHash }, refs.epicRef);
			const paths = issueArtifactPaths(repoPath, epicHash, workItemAnchorCreatedAt(issue.meta), kind, epicSlug);
			relinkDoc(paths, () => {
				const body = renderIssueMarkdown(issue);
				const ref = unitIssueOf(repoPath, epicHash) ?? refs.epicRef;
				return ref !== undefined ? trackerRefLine(ref) + '\n' + body : body;
			});
		}
		for (const [storyId, storyRef] of Object.entries(refs.storyRefs ?? {})) {
			if (typeof storyRef !== 'string' || storyRef.length === 0) continue;
			bindUnitIssue({ unit: 'story', repoPath, epicHash, storyId }, storyRef);
			try {
				relinkDoc(lldArtifactPaths(repoPath, epicHash, storyId, anchor, kind, epicSlug), () => renderLldMarkdown(readLldArtifact(repoPath, epicHash, storyId)));
			} catch (err) {
				log.warn({ storyId, err: (err as Error).message }, 'ISSUE work item: LLD relink skipped');
			}
		}
		return;
	}
	if (typeof refs.epicRef === 'string' && refs.epicRef.length > 0) {
		bindUnitIssue({ unit: 'epic', repoPath, epicHash }, refs.epicRef);
		relinkDoc(hldArtifactPaths(repoPath, epicHash, anchor, 'epic', epicSlug), () => renderHldMarkdown(readHldArtifact(repoPath, epicHash)));
		relinkDoc(defineArtifactPaths(repoPath, epicHash, anchor, 'epic', epicSlug), () => renderDefineMarkdown(readDefineArtifact(repoPath, epicHash)));
	}
	for (const [storyId, storyRef] of Object.entries(refs.storyRefs ?? {})) {
		if (typeof storyRef !== 'string' || storyRef.length === 0) continue;
		bindUnitIssue({ unit: 'story', repoPath, epicHash, storyId }, storyRef);
		relinkDoc(lldArtifactPaths(repoPath, epicHash, storyId, anchor, 'epic', epicSlug), () => renderLldMarkdown(readLldArtifact(repoPath, epicHash, storyId)));
	}
}

function relinkDoc(paths: { json: string; md: string }, render: () => string): void {
	try {
		writeAtomic(paths.md, render());
	} catch (err) {
		log.warn({ md: paths.md, err: (err as Error).message }, 'doc→issue linkage skipped');
	}
}
