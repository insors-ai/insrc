/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Framework-owned doc↔issue linkage — a pure local file op shared by
 * BOTH tracker paths (deterministic auto-push + LLM coarse-handoff).
 * Given the refs an Epic push produced, it patches each doc's
 * `meta.tracker` and re-renders its markdown so the human-facing doc
 * carries a `**Tracker:** owner/repo#N` link. Never delegated to an LLM.
 *
 * Best-effort per doc: a missing/unreadable artifact is skipped, not
 * fatal.
 */

import { getLogger } from '../../shared/logger.js';
import { readDefineArtifact, readHldArtifact } from '../gates.js';
import { readLldArtifact } from '../artifacts/lld-io.js';
import { renderDefineMarkdown } from '../artifacts/define.js';
import { renderHldMarkdown } from '../artifacts/hld.js';
import { renderLldMarkdown } from '../artifacts/lld.js';
import { defineArtifactPaths, hldArtifactPaths, lldArtifactPaths, writeAtomic } from '../storage.js';
import { patchTrackerMeta } from './refs.js';

const log = getLogger('workflow:tracker-link');

export interface EpicRefs {
	readonly epicRef?:   string;
	readonly storyRefs?: Readonly<Record<string, string>>;
}

/** Link the Epic's docs to their issues: HLD.md + Define.md → epicRef,
 *  each LLD.md → its storyRef. Patches `meta.tracker` then re-renders. */
export function linkDocsToIssues(repoPath: string, epicHash: string, epicSlug: string, refs: EpicRefs): void {
	if (typeof refs.epicRef === 'string' && refs.epicRef.length > 0) {
		const epicRef = refs.epicRef;
		relinkDoc(hldArtifactPaths(repoPath, epicHash, epicSlug), { epicRef }, () => renderHldMarkdown(readHldArtifact(repoPath, epicHash)));
		relinkDoc(defineArtifactPaths(repoPath, epicHash, epicSlug), { epicRef }, () => renderDefineMarkdown(readDefineArtifact(repoPath, epicHash)));
	}
	for (const [storyId, storyRef] of Object.entries(refs.storyRefs ?? {})) {
		if (typeof storyRef !== 'string' || storyRef.length === 0) continue;
		relinkDoc(lldArtifactPaths(repoPath, epicHash, storyId, epicSlug), { storyRef }, () => renderLldMarkdown(readLldArtifact(repoPath, epicHash, storyId)));
	}
}

function relinkDoc(paths: { json: string; md: string }, patch: { epicRef?: string; storyRef?: string }, render: () => string): void {
	try {
		patchTrackerMeta(paths.json, patch);
		writeAtomic(paths.md, render());
	} catch (err) {
		log.warn({ md: paths.md, err: (err as Error).message }, 'doc→issue linkage skipped');
	}
}
