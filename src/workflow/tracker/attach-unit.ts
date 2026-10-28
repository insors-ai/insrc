/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Which documents of a unit are attached to its issue (s6), and the three ways they get there: the approve flow attaches the
 * document it just approved, the daemon's `tracker.attach` method attaches whatever of a unit is committed, and the BUILD
 * approval's follow-on attaches the Story's build, review and test records. All three go through attachDocuments, so a file that
 * is not committed is refused (and attached by a later call), never linked.
 */

import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';

import {
	artifactJsonPath, buildArtifactId, buildArtifactPaths, codeReviewArtifactId, codeReviewArtifactPaths, defineArtifactId, defineArtifactPaths,
	hldArtifactId, hldArtifactPaths, lldArtifactId, lldArtifactPaths, planArtifactId, planArtifactPaths, testsArtifactId, testsArtifactPaths,
	resolveEpicAnchor, workItemKindOf,
} from '../storage.js';
import { attachDocuments, unitArtifactId, unitDocumentId } from './attach.js';
import type { AttachOutcome, AttachTarget } from './attach.js';
import { readBinding } from './binding.js';
import type { TrackerPort } from './port.js';
import type { UnitRef } from './refs.js';

/** The documents of a unit (`documents`), the Story's build, review and test records (`records`), or both (`all`). */
export type AttachScope = 'documents' | 'records' | 'all';

interface Folder { readonly anchor: string; readonly kind: ReturnType<typeof workItemKindOf>; readonly slug: string }

/** The work item's folder arguments, read from the unit's own document (the Define or the LLD). */
function folderOf(unit: UnitRef): Folder | { readonly error: string } {
	try {
		const own = unitDocumentId(unit);
		if (own === undefined) return { error: `a ${unit.unit} unit has no documents of its own to attach yet` };
		const meta = (JSON.parse(readFileSync(artifactJsonPath(unit.repoPath, own), 'utf8')) as { meta?: { epicCreatedAt?: string; standalone?: boolean; epicSlug?: string } }).meta ?? {};
		const anchor = meta.epicCreatedAt ?? resolveEpicAnchor(unit.repoPath, unit.epicHash);
		if (anchor === undefined) return { error: `the work item of ${own} has no creation time to locate its folder` };
		return { anchor, kind: workItemKindOf(meta), slug: meta.epicSlug ?? unit.epicHash };
	} catch (err) { return { error: `cannot read the head of the unit's artifact: ${(err as Error).message}` }; }
}

/** The companion files (diagrams, mocks) an artifact's body lists, repo-relative. */
function companionsOf(repoPath: string, artifactId: string): string[] {
	try {
		const body = (JSON.parse(readFileSync(artifactJsonPath(repoPath, artifactId), 'utf8')) as { body?: { companions?: Array<{ relPath?: unknown }> } }).body;
		return (body?.companions ?? []).map(c => c.relPath).filter((r): r is string => typeof r === 'string' && r.length > 0);
	} catch { return []; }
}

/** The files of the unit to attach, only those that exist on disk. */
export function attachTargetsOf(unit: UnitRef, scope: AttachScope): { readonly targets: AttachTarget[] } | { readonly error: string } {
	const f = folderOf(unit);
	if ('error' in f) return f;
	const repo = unit.repoPath;
	const out: AttachTarget[] = [];
	const add = (artifactId: string, abs: string): void => { if (existsSync(abs)) out.push({ artifactId, relPath: relative(repo, abs) }); };
	const withCompanions = (artifactId: string): void => { for (const rel of companionsOf(repo, artifactId)) if (existsSync(`${repo}/${rel}`)) out.push({ artifactId, relPath: rel }); };
	const docs = scope !== 'records';
	const records = scope !== 'documents';
	if (unit.unit === 'epic') {
		if (!docs) return { targets: [] };
		add(hldArtifactId(unit.epicHash), hldArtifactPaths(repo, unit.epicHash, f.anchor, f.kind, f.slug).md); withCompanions(hldArtifactId(unit.epicHash));
		add(defineArtifactId(unit.epicHash), defineArtifactPaths(repo, unit.epicHash, f.anchor, f.kind, f.slug).md);
		return { targets: out };
	}
	const story = unit.storyId;
	if (unit.unit !== 'story' || story === undefined) return { error: `a ${unit.unit} unit has no documents of its own to attach yet` };
	if (docs) {
		add(lldArtifactId(unit.epicHash, story), lldArtifactPaths(repo, unit.epicHash, story, f.anchor, f.kind, f.slug).md); withCompanions(lldArtifactId(unit.epicHash, story));
		add(planArtifactId(unit.epicHash, story), planArtifactPaths(repo, unit.epicHash, story, f.anchor, f.kind, f.slug).md);
	}
	if (records) {
		add(buildArtifactId(unit.epicHash, story), buildArtifactPaths(repo, unit.epicHash, story, f.anchor, f.kind, f.slug).md);
		add(codeReviewArtifactId(unit.epicHash, story), codeReviewArtifactPaths(repo, unit.epicHash, story, f.anchor, f.kind, f.slug).md);
		add(testsArtifactId(unit.epicHash, story), testsArtifactPaths(repo, unit.epicHash, story, f.anchor, f.kind, f.slug).md);
	}
	return { targets: out };
}

/** The result of attaching a unit: the outcome, or why nothing was attempted. */
export type AttachUnitResult = AttachOutcome | { readonly error: string };

/**
 * Attach the unit's files (`scope`) to its issue. An error (nothing attempted) for a unit with no binding, or when the tracker
 * cannot be used; otherwise the outcome, which names every file refused (uncommitted, untracked) with its reason.
 */
export async function attachUnit(unit: UnitRef, scope: AttachScope, port: TrackerPort): Promise<AttachUnitResult> {
	const own = unitArtifactId(unit);
	if (own === undefined) return { error: `a ${unit.unit} unit has no artifact of its own to hold attachments yet` };
	try { if (readBinding(unit.repoPath, own) === undefined) return { error: `the ${unit.unit} is not bound to an issue yet (approve its document first)` }; }
	catch (err) { return { error: (err as Error).message }; }
	const found = attachTargetsOf(unit, scope);
	if ('error' in found) return found;
	return await attachDocuments(unit, port, found.targets);
}

/** The unit and the artifact ids an approved document of `workflow` puts on its issue: the HLD to the Epic, the LLD and the plan to the Story. */
export function approvedDocumentUnit(workflow: string, meta: { repoPath: string; epicHash: string; storyId?: string }): { readonly unit: UnitRef; readonly artifactId: string } | undefined {
	const { repoPath, epicHash, storyId } = meta;
	if (workflow === 'design.epic') return { unit: { unit: 'epic', repoPath, epicHash }, artifactId: hldArtifactId(epicHash) };
	if (storyId === undefined) return undefined;
	if (workflow === 'design.story') return { unit: { unit: 'story', repoPath, epicHash, storyId }, artifactId: lldArtifactId(epicHash, storyId) };
	if (workflow === 'plan') return { unit: { unit: 'story', repoPath, epicHash, storyId }, artifactId: planArtifactId(epicHash, storyId) };
	return undefined;
}

/** Attach just the document an approval approved (and its companions) to its unit's issue. */
export async function attachApprovedDocument(workflow: string, meta: { repoPath: string; epicHash: string; storyId?: string }, port: TrackerPort): Promise<AttachUnitResult> {
	const a = approvedDocumentUnit(workflow, meta);
	if (a === undefined) return { error: `a ${workflow} approval has no document to attach` };
	const own = unitArtifactId(a.unit);
	if (own === undefined) return { error: 'the unit has no artifact of its own to hold attachments yet' };
	try { if (readBinding(a.unit.repoPath, own) === undefined) return { error: `the ${a.unit.unit} is not bound to an issue yet` }; }
	catch (err) { return { error: (err as Error).message }; }
	const found = attachTargetsOf(a.unit, 'documents');
	if ('error' in found) return found;
	return await attachDocuments(a.unit, port, found.targets.filter(t => t.artifactId === a.artifactId));
}
