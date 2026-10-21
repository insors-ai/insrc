/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Attach a unit's supporting documents to its issue (sc6, s6): a plan, a design document, a diagram or a build, review or test
 * record becomes a link to the file at the commit that holds it. GitHub has no attachment API, so the tracker port posts one
 * comment holding the link. The link names the last commit that touched the rendered file, so a new revision, once committed,
 * adds a new link and the earlier one stays. A file with uncommitted changes, or not tracked by git, is refused: a link must
 * show what the attachment records.
 *
 * Nothing here is posted twice: a (target, revision) already recorded is skipped, and a link already in the issue's comments
 * (a post whose record was lost) is recorded without posting again. The Attachment records go on the head of the unit's own
 * artifact (the Define for an Epic, the LLD for a Story), the one that holds the binding, through the binding module.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import { ArtifactIds } from '../artifact-ids.js';
import type { Reference } from '../artifact-core/types.js';
import { artifactJsonPath, defineArtifactId, lldArtifactId } from '../storage.js';
import { readAttachments, readBinding, recordAttachment } from './binding.js';
import { gitOriginOwnerRepo } from './github.js';
import type { TrackerComment, TrackerPort } from './port.js';
import type { UnitRef } from './refs.js';

const log = getLogger('workflow:tracker-attach');

/** One file to attach: the attached artifact's id and the repo-relative path of its rendered file. */
export interface AttachTarget {
	readonly artifactId: string;
	readonly relPath:    string;
}

export interface AttachDeps {
	readonly now?: (() => string) | undefined;
	/** The repository's GitHub owner and name; read from the origin remote by default. */
	readonly repoSlug?: ((repoPath: string) => { readonly owner: string; readonly repo: string } | null) | undefined;
}

export interface AttachOutcome {
	/** Links posted by this call. */
	readonly attached:   string[];
	/** Links found already posted and recorded without a second post. */
	readonly reconciled: string[];
	/** Targets whose (target, revision) was already recorded. */
	readonly skipped:    string[];
	readonly failed:     { readonly target: string; readonly reason: string }[];
}

const git = (repoPath: string, args: readonly string[]): string => execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The artifact that holds the unit's binding: the Define for an Epic, the LLD for a Story; a Task has none until s7. */
export function unitArtifactId(unit: UnitRef): string | undefined {
	if (unit.unit === 'epic') return defineArtifactId(unit.epicHash);
	if (unit.unit === 'story' && unit.storyId !== undefined) return lldArtifactId(unit.epicHash, unit.storyId);
	return undefined;
}

/** The link to `relPath` at `sha` on the repository's GitHub host. */
export function permalinkOf(slug: { readonly owner: string; readonly repo: string }, sha: string, relPath: string): string {
	return `https://github.com/${slug.owner}/${slug.repo}/blob/${sha}/${relPath.split('\\').join('/')}`;
}

/** The revision number of an attached artifact's head (lifecycle, else meta.revision), or 0 when it has no head of its own (a companion). */
function revisionOf(repoPath: string, artifactId: string): number {
	try {
		const meta = (JSON.parse(readFileSync(artifactJsonPath(repoPath, artifactId), 'utf8')) as { meta?: { revision?: unknown; lifecycle?: { revision?: { number?: unknown } } } }).meta;
		const n = meta?.lifecycle?.revision?.number ?? meta?.revision;
		return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : 0;
	} catch { return 0; }
}

export function attachDocuments(unit: UnitRef, port: TrackerPort, targets: readonly AttachTarget[], deps: AttachDeps = {}): AttachOutcome {
	const out: AttachOutcome = { attached: [], reconciled: [], skipped: [], failed: [] };
	const failAll = (reason: string): AttachOutcome => { for (const t of targets) out.failed.push({ target: t.relPath, reason }); return out; };
	const now = deps.now ?? (() => new Date().toISOString());
	const repoPath = unit.repoPath;

	const ownerId = unitArtifactId(unit);
	if (ownerId === undefined) return failAll(`a ${unit.unit} unit has no artifact of its own to hold attachments yet`);
	let issue: string;
	let recorded: ReturnType<typeof readAttachments>;
	try {
		const binding = readBinding(repoPath, ownerId);
		if (binding === undefined) return failAll('the unit is not bound to an issue yet');
		issue = binding.reference.entityId;
		recorded = readAttachments(repoPath, ownerId);
	} catch (err) { return failAll((err as Error).message); }
	const slug = (deps.repoSlug ?? gitOriginOwnerRepo)(repoPath);
	if (slug === null) return failAll('the repository has no GitHub origin remote to link to');

	let comments: TrackerComment[] | { readonly failed: string } | undefined;
	const commentsOnce = (): TrackerComment[] | { readonly failed: string } => {
		if (comments === undefined) {
			const listed = port.listComments(issue);
			comments = listed.ok ? listed.value : { failed: `the comments of ${issue} could not be read (${listed.kind}): ${listed.reason}` };
		}
		return comments;
	};

	for (const t of targets) {
		const kind = ArtifactIds.parse(t.artifactId)?.kind ?? 'FILE';
		const target: Reference = { entityId: t.artifactId, type: kind, relation: 'documents', fragment: t.relPath };
		const revision = revisionOf(repoPath, t.artifactId);
		if (recorded.some(a => a.target.entityId === t.artifactId && a.target.fragment === t.relPath && a.revision === revision)) { out.skipped.push(t.relPath); continue; }
		const fail = (reason: string): void => { out.failed.push({ target: t.relPath, reason }); };

		let sha: string;
		try {
			try { git(repoPath, ['ls-files', '--error-unmatch', '--', t.relPath]); }
			catch { fail(`${t.relPath} is not tracked by git: commit the file first`); continue; }
			if (git(repoPath, ['status', '--porcelain', '--', t.relPath]).length > 0) { fail(`${t.relPath} has uncommitted changes: commit the file first`); continue; }
			sha = git(repoPath, ['log', '-1', '--format=%H', '--', t.relPath]);
			if (sha.length === 0) { fail(`${t.relPath} has no commit: commit the file first`); continue; }
		} catch (err) { fail(`git could not be asked about ${t.relPath}: ${(err as Error).message}`); continue; }
		const link = permalinkOf(slug, sha, t.relPath);

		const known = commentsOnce();
		if ('failed' in known) { fail(known.failed); continue; }
		const posted = known.find(c => c.text.includes(link));
		if (posted !== undefined) {
			if (recordAttachment(repoPath, ownerId, { target, revision, at: now(), externalId: posted.externalId })) out.reconciled.push(link);
			else fail(`the link was found on ${issue} but its record was not written; the next call records it`);
			continue;
		}
		const made = port.attach(issue, target, link);
		if (!made.ok) { fail(`the tracker could not attach ${t.relPath} (${made.kind}): ${made.reason}`); continue; }
		if (!recordAttachment(repoPath, ownerId, { target, revision, at: now(), ...(made.value.externalId !== undefined ? { externalId: made.value.externalId } : {}) })) {
			fail(`${t.relPath} was attached but its record was not written; the next call finds the link and records it`);
			continue;
		}
		log.info({ issue, target: t.relPath, link }, 'attached a document to its issue');
		out.attached.push(link);
	}
	return out;
}
