/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The approve pipeline at the daemon (Story s10): what follows an approval, step by step, each reported as a follow-on entry.
 *
 *   1. the Task reconciliation of a plan ('tasks-sync')
 *      -- withTracker false stops here --
 *   2. publishing the approved document to the tracker ('tracker-push')
 *   3. the check-in commit ('artifact-commit')
 *   4. attaching the approved document to its unit's issue ('document-attach') and the commit that records it ('attach-commit')
 *
 * A step stopped by a denied tool call (ToolDenied) is reported with ok false and the denial, and no later step runs for that artifact.
 * A denial is caught only here, at a step boundary; an ordinary failure keeps its old handling inside the step.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { getLogger } from '../shared/logger.js';
import type { ApprovalResult, FollowOnOutcome, WorkflowApproveResult } from '../workflow/gates.js';
import { resolveGithubConfig } from '../workflow/config/github.js';
import { FileSidecarStore } from '../workflow/artifact-core/sidecar-store.js';
import {
	ARTIFACTS_DIR, defineArtifactPaths, hldArtifactPaths, lldArtifactPaths, planArtifactPaths, workItemAnchorCreatedAt, workItemKindOf,
} from '../workflow/storage.js';
import { autoPushEpicOnHld, autoPushStoryOnLld, autoPushTasksOnPlan, openTracker } from '../workflow/tracker-auto.js';
import type { AutoPushResult } from '../workflow/tracker-auto.js';
import { attachApprovedDocument } from '../workflow/tracker/attach-unit.js';
import type { AttachUnitResult } from '../workflow/tracker/attach-unit.js';
import { commitAndPush } from '../workflow/tracker/commit-and-push-registry.js';
import type { CommitArtifactsResult } from '../workflow/tracker/github.js';
import { isToolDenied } from '../workflow/tracker/tool-denied.js';
import { unitHeadId } from '../workflow/tracker/unit-head.js';
import { isPlanJson, reconcilePlanFollowOn } from './tasks-sync.js';

const log = getLogger('approve-pipeline');

/** Commit + push the artifact files this approval wrote/patched, so the chain
 *  is portable (anyone who pulls has the canonical JSON + MD the next stage
 *  reads). Gated on the github tracker being enabled with `commitArtifacts`
 *  (default true); best-effort — a git failure never breaks the approval. */
export async function commitApprovedArtifacts(approval: ApprovalResult): Promise<CommitArtifactsResult | undefined> {
	let meta: { repoPath?: string; epicHash?: string; epicSlug?: string; storyId?: string; createdAt?: string; epicCreatedAt?: string; standalone?: boolean };
	try { meta = ((JSON.parse(readFileSync(approval.path, 'utf8')) as { meta?: typeof meta }).meta) ?? {}; }
	catch { return undefined; }
	const { repoPath, epicHash, epicSlug, storyId } = meta;
	if (typeof repoPath !== 'string' || typeof epicHash !== 'string') return undefined;

	const cfg = await resolveGithubConfig(repoPath);
	if (cfg.type !== 'github' || cfg.commitArtifacts === false) return undefined;

	// sc2 folder args from the approved artifact's own meta — its epicCreatedAt
	// anchor is the Epic's define createdAt, so the Define (added alongside on
	// epic/story approvals) resolves to the same work-item folder.
	const anchor = workItemAnchorCreatedAt(meta);
	const kind = workItemKindOf(meta);

	// The files this approval touched: the approved artifact, the Define on epic/story approvals, and the sidecar
	// log of each head written, plus the head of the unit whose issue the push bound (the EPIC or STORY head).
	const files = new Set<string>();
	const add = (p: { md: string; json: string }) => { files.add(p.md); files.add(p.json); };
	const addHead = (id: string | undefined): void => { if (id !== undefined) for (const f of headFiles(repoPath, id)) files.add(f); };
	if (approval.workflow === 'design.epic') { add(hldArtifactPaths(repoPath, epicHash, anchor, kind, epicSlug)); add(defineArtifactPaths(repoPath, epicHash, anchor, kind, epicSlug)); }
	else if (approval.workflow === 'design.story' && typeof storyId === 'string') { add(lldArtifactPaths(repoPath, epicHash, storyId, anchor, kind, epicSlug)); add(defineArtifactPaths(repoPath, epicHash, anchor, kind, epicSlug)); }
	else if (approval.workflow === 'plan' && typeof storyId === 'string') { add(planArtifactPaths(repoPath, epicHash, storyId, anchor, kind, epicSlug)); }
	else { add(defineArtifactPaths(repoPath, epicHash, anchor, kind, epicSlug)); }

	addHead(basename(approval.path).replace(/\.json$/, ''));
	addHead(unitHeadOf(approval.workflow, epicHash, storyId));
	const result = await commitAndPush(repoPath, [...files], `chore(workflow): ${approval.workflow} approved — check in artifacts + tracker refs`);
	log.info({ workflow: approval.workflow, committed: result.committed, pushed: result.pushed, reason: result.reason }, 'approve: artifact check-in');
	return result;
}

/** The files of the head `id` that exist: its json and its change log and feedback lines. */
function headFiles(repoPath: string, id: string): string[] {
	const sidecar = new FileSidecarStore(repoPath);
	return [`${ARTIFACTS_DIR}/${id}.json`, sidecar.filesOf(id).log, sidecar.filesOf(id).feedback].map(rel => join(repoPath, rel)).filter(f => existsSync(f));
}

/** The head of the unit an approval belongs to: the EPIC head for a design.epic approval or an Epic-level one, else the STORY head. */
function unitHeadOf(workflow: string, epicHash: string, storyId: unknown): string | undefined {
	return unitHeadId({ unit: workflow === 'design.epic' || typeof storyId !== 'string' ? 'epic' : 'story', epicHash, ...(typeof storyId === 'string' ? { storyId } : {}) });
}

/** After the check-in commit the approved files are clean, so their permalinks name that commit: attach the approved document (and its
 *  companions) to the unit's issue, then commit the unit head that records the attachments, in a second commit. Without a commit
 *  there is nothing to link to, and the reason is stated. */
export async function attachApprovedDocuments(approval: ApprovalResult, commit: CommitArtifactsResult | undefined): Promise<{ attach: AttachUnitResult | { skipped: string }; commit?: CommitArtifactsResult } | undefined> {
	if (approval.workflow !== 'design.epic' && approval.workflow !== 'design.story' && approval.workflow !== 'plan') return undefined;
	let meta: { repoPath?: string; epicHash?: string; epicSlug?: string; storyId?: string; epicCreatedAt?: string; createdAt?: string; standalone?: boolean };
	try { meta = ((JSON.parse(readFileSync(approval.path, 'utf8')) as { meta?: typeof meta }).meta) ?? {}; }
	catch { return undefined; }
	const { repoPath, epicHash, epicSlug, storyId } = meta;
	if (typeof repoPath !== 'string' || typeof epicHash !== 'string') return undefined;
	if (commit === undefined) return { attach: { skipped: 'attachments skipped: the artifacts are not committed' } };
	const gate = await openTracker(repoPath);
	if ('skip' in gate) return undefined;
	const result = await attachApprovedDocument(approval.workflow, { repoPath, epicHash, ...(storyId !== undefined ? { storyId } : {}) }, gate.port);
	if ('error' in result || result.attached.length + result.reconciled.length === 0) return { attach: result };
	// the attachments are recorded on the unit's head
	const headId = unitHeadOf(approval.workflow, epicHash, storyId);
	if (headId === undefined) return { attach: result };
	// the head, and the log and feedback lines recording the attachment on it
	const second = await commitAndPush(repoPath, headFiles(repoPath, headId), `chore(workflow): ${approval.workflow} approved — record the attached documents`);
	log.info({ workflow: approval.workflow, committed: second.committed, pushed: second.pushed, reason: second.reason }, 'approve: attachment records check-in');
	return { attach: result, commit: second };
}


const DESIGN_WORKFLOWS = new Set(['design.epic', 'design.story', 'plan']);

/** The published-document step of one approved artifact: epic, story or Task issues, by what was approved. */
async function publish(approval: ApprovalResult): Promise<AutoPushResult | undefined> {
	if (approval.workflow === 'design.epic')  return await autoPushEpicOnHld(approval.path);
	if (approval.workflow === 'design.story') return await autoPushStoryOnLld(approval.path);
	if (approval.workflow === 'plan')         return await autoPushTasksOnPlan(approval.path);
	return undefined;
}

const deniedEntry = (kind: FollowOnOutcome['kind'], artifactPath: string, step: string, err: { toolId: string; reason: string }): FollowOnOutcome => ({
	kind, artifactPath, ok: false, denied: { toolId: err.toolId, reason: err.reason },
	note: `${step} stopped: ${err.toolId} was denied (${err.reason}); repeat the approval to finish it`,
});

/**
 * The pipeline after an approval, for every approved artifact: Task reconciliation of a plan, then (with `withTracker`) publication,
 * the check-in commit and the attachment. Never throws for a denial or an ordinary failure; each is the step's entry.
 */
export async function approvePipelineFollowOn(approved: WorkflowApproveResult['approved'], opts: { readonly withTracker: boolean }): Promise<FollowOnOutcome[]> {
	const out: FollowOnOutcome[] = [];
	for (const { path, result } of approved) {
		if (!DESIGN_WORKFLOWS.has(result.workflow)) continue;
		if (isPlanJson(path)) {
			const r = await reconcilePlanFollowOn(path);
			out.push(r.entry);
			if (r.stop) continue;
		}
		if (!opts.withTracker) continue;

		let tracker: AutoPushResult | undefined;
		try { tracker = await publish(result); }
		catch (err) {
			if (!isToolDenied(err)) throw err;
			out.push(deniedEntry('tracker-push', path, 'the publication', err));
			continue;
		}
		if (tracker !== undefined) out.push({ kind: 'tracker-push', artifactPath: path, ok: tracker.status !== 'failed', tracker, ...(tracker.status === 'failed' ? { note: tracker.reason } : {}) });

		// Commit + push AFTER the tracker push, so the checked-in MD carries the re-rendered `**Tracker:**` link and the issue bodies link the committed blob.
		let commit: CommitArtifactsResult | undefined;
		try { commit = await commitApprovedArtifacts(result); }
		catch (err) {
			if (!isToolDenied(err)) throw err;
			out.push(deniedEntry('artifact-commit', path, 'the check-in commit', err));
			continue;
		}
		if (commit !== undefined) out.push({ kind: 'artifact-commit', artifactPath: path, ok: commit.committed || /nothing to commit/.test(commit.reason ?? ''), commit, ...(commit.reason !== undefined ? { note: commit.reason } : {}) });

		let attached: { attach: AttachUnitResult | { skipped: string }; commit?: CommitArtifactsResult } | undefined;
		try { attached = await attachApprovedDocuments(result, commit); }
		catch (err) {
			if (isToolDenied(err)) { out.push(deniedEntry('document-attach', path, 'the attachment', err)); continue; }
			log.warn({ workflow: result.workflow, err: (err as Error).message }, 'approve: attaching the approved document failed');
			attached = { attach: { error: (err as Error).message } };
		}
		if (attached === undefined) continue;
		const failed = 'error' in attached.attach || ('failed' in attached.attach && attached.attach.failed.length > 0);
		out.push({ kind: 'document-attach', artifactPath: path, ok: !failed, attach: attached.attach, ...('error' in attached.attach ? { note: attached.attach.error } : 'skipped' in attached.attach && typeof attached.attach.skipped === 'string' ? { note: attached.attach.skipped } : {}) });
		if (attached.commit !== undefined) out.push({ kind: 'attach-commit', artifactPath: path, ok: attached.commit.committed || /nothing to commit/.test(attached.commit.reason ?? ''), commit: attached.commit, ...(attached.commit.reason !== undefined ? { note: attached.commit.reason } : {}) });
	}
	return out;
}
