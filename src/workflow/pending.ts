/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (Epic ide-artifact-review-panel-jetbrains-plugin, sc1) — the daemon-side
 * enumeration of PENDING-APPROVAL workflow artifacts.
 *
 * `listPendingArtifacts` is a pure filesystem scan of the canonical artifact
 * store (`.insrc/artifacts/<KIND>-<hash>.json`): it keeps every artifact whose
 * approval state is pending — meta.approvedAt absent AND meta.rejectedAt absent
 * (the exact fields the approve/reject path stamps) — and whose KIND is a
 * reviewer-approvable kind, mapping each to the sc1 `PendingArtifact` descriptor.
 * It reads the single source of truth, so the IDE's pending list can never
 * disagree with real approval state (k1/k5), and it does one bounded directory
 * scan per call — no DB, no embedding, no event emitter (k7). The daemon
 * `workflow.pending` IPC handler (src/daemon/index.ts) wraps this; the plugin
 * only renders + transports.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getLogger } from '../shared/logger.js';
import { ARTIFACTS_DIR } from './storage.js';
import { deriveWorkItemIdentity } from './id.js';
import { resolveArtifactMdPath, type ArtifactKind, type WorkItemKind } from './path-scheme.js';

const log = getLogger('workflow-pending');

// ---------------------------------------------------------------------------
// sc1 contract types
// ---------------------------------------------------------------------------

/** The reviewer-approvable artifact kinds the pending list surfaces. BUILD /
 *  EXTEND / STUB / AMD are deliberately excluded — they are not artifacts a
 *  reviewer approves in the review panel. */
export const PENDING_KINDS = ['SPEC', 'DEF', 'HLD', 'LLD', 'PLAN', 'ISSUE', 'CR'] as const;
export type PendingKind = typeof PENDING_KINDS[number];

export interface PendingArtifact {
	readonly artifactId:        string;    // canonical file identity, e.g. 'LLD-<hash>-s5' / 'DEF-<hash>'
	readonly kind:              PendingKind;
	readonly title:             string;
	readonly mdPath:            string;    // rendered .md path under docs/ (best-effort; '' when unresolvable)
	readonly workItemId?:       string;    // canonical E…:S…:T… when derivable
	readonly openQuestionCount: number;
	readonly state:             'pending'; // approvedAt absent AND rejectedAt absent
}

export interface WorkflowPendingRequest { readonly repo: string }
export interface WorkflowPendingResult { readonly artifacts: readonly PendingArtifact[] }

/** A structured failure the daemon relays verbatim — repo-unresolved or a store
 *  the scanner could not read. DISTINCT from an empty `{ artifacts: [] }` (an
 *  all-approved / absent store), which is a success (ac2/ac3). */
export interface WorkflowPendingError { readonly error: string }

/**
 * The `workflow.pending` IPC core (S001 / t2): resolve the repo (params.repo,
 * else the passed INSRC_REPO fallback), scan, and map any failure to a
 * structured `{ error }` — NEVER a silent empty list. Extracted from the daemon
 * handler so the repo-resolution + error-mapping contract is integration-tested
 * without booting the daemon (like `approveWorkflowTarget`).
 */
export function handleWorkflowPending(
	params: { repo?: string } | undefined,
	repoEnv: string | undefined,
): WorkflowPendingResult | WorkflowPendingError {
	const p = params ?? {};
	const repoPath = (p.repo !== undefined && p.repo.length > 0 ? p.repo : repoEnv) ?? '';
	if (repoPath.length === 0) {
		return { error: 'workflow.pending: `repo` is required' };
	}
	try {
		return { artifacts: listPendingArtifacts(repoPath) };
	} catch (err) {
		return { error: `workflow.pending: ${(err as Error).message}` };
	}
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

const PENDING_KIND_SET: ReadonlySet<string> = new Set(PENDING_KINDS);

interface ArtifactShape {
	readonly meta?: Record<string, unknown>;
	readonly body?: Record<string, unknown>;
}

/** The KIND prefix of an artifact filename (`LLD-<hash>-s5.json` -> `LLD`). */
function kindFromFilename(filename: string): string {
	const dash = filename.indexOf('-');
	return dash < 0 ? filename.replace(/\.json$/, '') : filename.slice(0, dash);
}

/** Scan `.insrc/artifacts` and return the pending descriptors. Pure over the
 *  filesystem (no DB / daemon state). Returns [] when the store is absent; a
 *  single malformed file is skipped (logged) rather than failing the scan.
 *
 *  @throws only when the store directory itself cannot be read (the caller maps
 *          that to an { error } result — never a silent empty list). */
export function listPendingArtifacts(repoPath: string): readonly PendingArtifact[] {
	const dir = join(repoPath, ARTIFACTS_DIR);
	if (!existsSync(dir)) return [];

	const files = readdirSync(dir).filter(f => f.endsWith('.json'));
	const out: PendingArtifact[] = [];

	for (const file of files) {
		const kind = kindFromFilename(file);
		if (!PENDING_KIND_SET.has(kind)) continue;   // non-reviewer-approvable kind

		let art: ArtifactShape;
		try {
			art = JSON.parse(readFileSync(join(dir, file), 'utf8')) as ArtifactShape;
		} catch (err) {
			log.warn({ file, err: (err as Error).message }, 'workflow.pending: skipping malformed artifact file');
			continue;   // one bad file must not drop the rest
		}

		const meta = art.meta ?? {};
		// Pending = neither stamped: the SAME fields approve/reject write (k5).
		if (typeof meta['approvedAt'] === 'string' && meta['approvedAt'].length > 0) continue;
		if (typeof meta['rejectedAt'] === 'string' && meta['rejectedAt'].length > 0) continue;

		out.push(toDescriptor(repoPath, file, kind as PendingKind, art));
	}
	return out;
}

function toDescriptor(repoPath: string, file: string, kind: PendingKind, art: ArtifactShape): PendingArtifact {
	const artifactId = file.replace(/\.json$/, '');
	const meta = art.meta ?? {};
	const body = art.body ?? {};

	const workItemId = deriveWorkItemId(meta);
	const openQuestions = body['openQuestions'];
	const openQuestionCount = Array.isArray(openQuestions) ? openQuestions.length : 0;

	const descriptor: {
		artifactId: string; kind: PendingKind; title: string; mdPath: string;
		workItemId?: string; openQuestionCount: number; state: 'pending';
	} = {
		artifactId,
		kind,
		title:  deriveTitle(kind, meta, body, workItemId, artifactId),
		mdPath: deriveMdPath(repoPath, kind, meta),
		openQuestionCount,
		state:  'pending',
	};
	if (workItemId !== undefined) descriptor.workItemId = workItemId;
	return descriptor;
}

/** Canonical E…:S…:T… identity when the meta carries the hash + createdAt
 *  anchor; undefined otherwise (e.g. a legacy artifact missing the anchor). */
function deriveWorkItemId(meta: Record<string, unknown>): string | undefined {
	const hash = str(meta['epicHash']) ?? str(meta['specHash']) ?? str(meta['issueHash']);
	const createdAt = str(meta['epicCreatedAt']) ?? str(meta['createdAt']);
	if (hash === undefined || createdAt === undefined) return undefined;
	try {
		const identity = deriveWorkItemIdentity(hash, createdAt, str(meta['storyId']));
		return identity.canonical;
	} catch {
		return undefined;
	}
}

/** A short human label for the list. Prefers the artifact body's own title
 *  (SPEC/ISSUE), else the canonical work-item id, else the file identity. */
function deriveTitle(
	kind: PendingKind, meta: Record<string, unknown>, body: Record<string, unknown>,
	workItemId: string | undefined, artifactId: string,
): string {
	const bodyTitle = str(body['title']);
	if (bodyTitle !== undefined) return bodyTitle;
	if (workItemId !== undefined) return `${kind} ${workItemId}`;
	return artifactId;
}

/** Best-effort rendered .md path under docs/. Returns '' when the meta lacks
 *  the fields needed to resolve it (the list still shows kind + title). */
function deriveMdPath(repoPath: string, kind: PendingKind, meta: Record<string, unknown>): string {
	const hash = str(meta['epicHash']) ?? str(meta['specHash']) ?? str(meta['issueHash']);
	const createdAt = str(meta['epicCreatedAt']) ?? str(meta['createdAt']);
	if (hash === undefined || createdAt === undefined) return '';
	const workItemKind: WorkItemKind = meta['standalone'] === true ? 'standalone' : 'epic';
	const slug = str(meta['epicSlug']) ?? hash;
	try {
		const identity = deriveWorkItemIdentity(hash, createdAt, str(meta['storyId']));
		return resolveArtifactMdPath(repoPath, identity, kind as ArtifactKind, workItemKind, slug);
	} catch {
		return '';
	}
}

function str(v: unknown): string | undefined {
	return typeof v === 'string' && v.length > 0 ? v : undefined;
}
