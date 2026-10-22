/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * On-disk store for HLD amendments.
 *
 * Layout:
 *   .insrc/artifacts/AMD-<epicHash>-<n>.json     — one head per amendment
 *
 * An amendment is a head like every other artifact: `{ meta, body, citations }`, with the proposal in the body (`amendment`,
 * `rationale`, `proposedBy`, `proposedAt`, `hldBaseRunId`, `epicSlug`, `sideEffects`) and its decision in the lifecycle. The
 * {@link AmendmentRecord} the rest of the system reads is a VIEW of that head: its `status` is the lifecycle's (a draft is
 * `pending`), `approvedAt` and `approvedBy` are the lifecycle approval's, and the reason a rejection was given is the 'reject'
 * entry of the amendment's log.
 *
 * The proposal is immutable. The head is written once, when proposed; a decision is a lifecycle step (approve or reject) that
 * leaves the content alone, and a decided amendment is never decided again. A rejected id is dead.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ArtifactIds } from '../artifact-ids.js';
import { approvalStateOf, approvedAtOf, lifecycleOfMeta } from '../artifact-core/approval-view.js';
import { createRepoLifecycle } from '../artifact-core/repo-lifecycle.js';
import { FileSidecarStore } from '../artifact-core/sidecar-store.js';
import type { LifecycleService } from '../artifact-core/lifecycle-service.js';
import type { Actor, ChangeLogEntry } from '../artifact-core/types.js';
import {
	amendmentArtifactPath,
	amendmentFilenamePrefix,
	amendmentsRootDir,
} from '../storage.js';
import { isAmendmentRecord } from './types.js';
import type { AmendmentRecord, AmendmentStatus } from './types.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What a decision is made through: the repository's lifecycle service, or one built over its files. */
export interface AmendmentDecisionOptions {
	readonly lifecycle?: LifecycleService | undefined;
}

const serviceFor = (repoPath: string, opts: AmendmentDecisionOptions | undefined): LifecycleService =>
	opts?.lifecycle ?? createRepoLifecycle(repoPath).service;

/** The actor a decision names: a namespaced id as it is, any other name as `local:<name>` carrying the name it was given. */
function personOf(who: string): Actor {
	if (/^[a-z][a-z0-9-]*:\S+$/.test(who) && who === who.toLowerCase()) return { id: who, kind: 'person', properties: {} };
	const slug = who.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
	return { id: `local:${slug.length > 0 ? slug : 'unknown'}`, kind: 'person', name: who, properties: {} };
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Path to a single amendment's canonical JSON. */
export function amendmentPath(repoPath: string, amendmentId: string): string {
	return amendmentArtifactPath(repoPath, amendmentId);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AmendmentNotFoundError extends Error {
	constructor(msg: string) { super(msg); this.name = 'AmendmentNotFoundError'; }
}

export class AmendmentImmutabilityError extends Error {
	constructor(msg: string) { super(msg); this.name = 'AmendmentImmutabilityError'; }
}

export class AmendmentIdConflictError extends Error {
	constructor(msg: string) { super(msg); this.name = 'AmendmentIdConflictError'; }
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Mint the next amendment id for an Epic. Scans the existing records
 *  to find the highest `AMD-<epicHash>-<n>` counter. */
export function nextAmendmentId(repoPath: string, epicHash: string): string {
	const dir = amendmentsRootDir(repoPath);
	const prefix = amendmentFilenamePrefix(epicHash);
	if (!existsSync(dir)) return ArtifactIds.make({ kind: 'AMD', epicHash, seq: 1 });
	let max = 0;
	for (const name of readdirSync(dir)) {
		if (!name.endsWith('.json')) continue;
		if (!name.startsWith(prefix)) continue;
		const rest = name.slice(prefix.length, -'.json'.length);
		const n = Number(rest);
		if (Number.isInteger(n) && n > max) max = n;
	}
	return ArtifactIds.make({ kind: 'AMD', epicHash, seq: max + 1 });
}

// ---------------------------------------------------------------------------
// The head and its view
// ---------------------------------------------------------------------------

/** The body of an amendment's head: the proposal, which never changes. */
function bodyOf(record: AmendmentRecord): Obj {
	return {
		id: record.id, epicSlug: record.epicSlug, hldBaseRunId: record.hldBaseRunId,
		amendment: record.amendment, rationale: record.rationale, proposedBy: record.proposedBy, proposedAt: record.proposedAt,
		...(record.sideEffects !== undefined ? { sideEffects: record.sideEffects } : {}),
	};
}

/** The latest 'reject' entry of an amendment's log: when, and the reason given. */
function rejectionOf(repoPath: string, id: string): { readonly at: string; readonly reason: string } | undefined {
	try {
		const entry = [...new FileSidecarStore(repoPath).readRecordsSync<ChangeLogEntry>('log', id)].reverse().find(e => e.operation === 'reject');
		return entry === undefined ? undefined : { at: entry.timestamp, reason: entry.outcome?.summary ?? '' };
	} catch { return undefined; }
}

/**
 * The record a head is, or undefined when the file is not a converted amendment head (a flat record from before the s9
 * conversion has no `meta`). The epic hash is the id's, so it needs nothing the head does not carry.
 */
export function amendmentOfHead(repoPath: string, raw: unknown): AmendmentRecord | undefined {
	if (!isObj(raw) || !isObj(raw['meta']) || !isObj(raw['body'])) return undefined;
	const meta = raw['meta'];
	const body = raw['body'];
	const id = typeof body['id'] === 'string' ? body['id'] : undefined;
	const epicHash = typeof meta['epicHash'] === 'string' ? meta['epicHash'] : undefined;
	if (id === undefined || epicHash === undefined) return undefined;
	const state = approvalStateOf(meta);
	const approvedAt = approvedAtOf(meta);
	const approval = lifecycleOfMeta(meta)?.['approval'];
	const actor = isObj(approval) && isObj(approval['by']) ? approval['by'] : undefined;
	const by = typeof actor?.['name'] === 'string' ? actor['name'] : typeof actor?.['id'] === 'string' ? actor['id'] : undefined;
	const approvedBy = by ?? (typeof body['approvedBy'] === 'string' ? body['approvedBy'] : undefined);
	const rejection = state === 'rejected' ? rejectionOf(repoPath, id) : undefined;
	const rec: unknown = {
		id, epicHash,
		epicSlug:     typeof meta['epicSlug'] === 'string' ? meta['epicSlug'] : typeof body['epicSlug'] === 'string' ? body['epicSlug'] : '',
		hldBaseRunId: body['hldBaseRunId'],
		amendment:    body['amendment'],
		rationale:    body['rationale'],
		citations:    Array.isArray(raw['citations']) ? raw['citations'] : [],
		proposedBy:   body['proposedBy'],
		proposedAt:   body['proposedAt'],
		...(body['sideEffects'] !== undefined ? { sideEffects: body['sideEffects'] } : {}),
		status:       (state === 'approved' ? 'approved' : state === 'rejected' ? 'rejected' : 'pending') satisfies AmendmentStatus,
		...(approvedAt !== undefined ? { approvedAt } : {}),
		...(approvedBy !== undefined && state === 'approved' ? { approvedBy } : {}),
		...(rejection !== undefined ? { rejectedAt: rejection.at, rejectedReason: rejection.reason } : {}),
	};
	return isAmendmentRecord(rec) ? rec : undefined;
}

function readHead(repoPath: string, path: string): AmendmentRecord | undefined {
	try { return amendmentOfHead(repoPath, JSON.parse(readFileSync(path, 'utf8'))); } catch { return undefined; }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Propose an amendment: write its head, a draft. Fails if an amendment with the same id already exists on disk. */
export async function proposeAmendment(repoPath: string, record: AmendmentRecord, opts?: AmendmentDecisionOptions): Promise<void> {
	const path = amendmentPath(repoPath, record.id);
	if (existsSync(path)) {
		throw new AmendmentIdConflictError(
			`amendment '${record.id}' already exists at ${path}; ids are single-use`,
		);
	}
	if (record.status !== 'pending') {
		throw new AmendmentImmutabilityError(
			`proposeAmendment: status must be 'pending' at write time (got '${record.status}')`,
		);
	}
	const proposer: Actor = { id: `insrc:${record.proposedBy.workflow}`, kind: 'agent', properties: {} };
	await serviceFor(repoPath, opts).updateContent(
		record.id, proposer, { body: bodyOf(record), citations: record.citations }, { create: true },
	);
}

/** Approve an amendment. Refuses if it's already resolved. */
export async function approveAmendment(
	repoPath:    string,
	amendmentId: string,
	approvedBy:  string,
	opts?:       AmendmentDecisionOptions,
): Promise<AmendmentRecord> {
	const prev = readAmendment(repoPath, amendmentId);
	if (prev.status !== 'pending') {
		throw new AmendmentImmutabilityError(
			`amendment '${amendmentId}' is ${prev.status}; cannot transition to approved`,
		);
	}
	await serviceFor(repoPath, opts).apply(amendmentId, 'approve', personOf(approvedBy));
	return readAmendment(repoPath, amendmentId);
}

/** Reject an amendment. Refuses if it's already resolved. */
export async function rejectAmendment(
	repoPath:    string,
	amendmentId: string,
	reason:      string,
	opts?:       AmendmentDecisionOptions & { readonly rejectedBy?: string | undefined },
): Promise<AmendmentRecord> {
	if (typeof reason !== 'string' || reason.trim().length === 0) {
		throw new Error(`rejectAmendment: reason is required`);
	}
	const prev = readAmendment(repoPath, amendmentId);
	if (prev.status !== 'pending') {
		throw new AmendmentImmutabilityError(
			`amendment '${amendmentId}' is ${prev.status}; cannot transition to rejected`,
		);
	}
	await serviceFor(repoPath, opts).apply(amendmentId, 'reject', personOf(opts?.rejectedBy ?? 'insrc:amendments'), { reason });
	return readAmendment(repoPath, amendmentId);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function readAmendment(repoPath: string, amendmentId: string): AmendmentRecord {
	const path = amendmentPath(repoPath, amendmentId);
	if (!existsSync(path)) {
		throw new AmendmentNotFoundError(`amendment '${amendmentId}' not found at ${path}`);
	}
	const rec = amendmentOfHead(repoPath, JSON.parse(readFileSync(path, 'utf8')));
	if (rec === undefined) {
		throw new Error(`file at ${path} is not a valid amendment head (a flat record has to be converted by the s9 conversion)`);
	}
	return rec;
}

export function listAmendments(
	repoPath: string,
	epicHash: string,
): readonly AmendmentRecord[] {
	const dir = amendmentsRootDir(repoPath);
	if (!existsSync(dir)) return [];
	const prefix = amendmentFilenamePrefix(epicHash);
	const out: AmendmentRecord[] = [];
	for (const name of readdirSync(dir)) {
		if (!name.endsWith('.json')) continue;
		if (!name.startsWith(prefix)) continue;
		const rec = readHead(repoPath, join(dir, name));
		if (rec !== undefined) out.push(rec);
	}
	// Deterministic order: `AMD-<hash>-<n>` sorted by n ascending.
	return out.sort((a, b) => amendmentSuffixNum(a.id) - amendmentSuffixNum(b.id));
}

/** Filter to only-approved amendments, sorted by approvedAt (rising).
 *  Same order the applier consumes them in. */
export function listApprovedAmendments(
	repoPath: string,
	epicHash: string,
): readonly AmendmentRecord[] {
	return approvedInApplyOrder(listAmendments(repoPath, epicHash));
}

/** The approved amendments among `records` in the order the applier and the
 *  effective-HLD hash use them: numeric id suffix, then a stable sort by rising
 *  approvedAt. Pure; shared with readers that hold the records in memory. */
export function approvedInApplyOrder(records: readonly AmendmentRecord[]): AmendmentRecord[] {
	return records
		.filter(a => a.status === 'approved' && typeof a.approvedAt === 'string')
		.sort((a, b) => amendmentSuffixNum(a.id) - amendmentSuffixNum(b.id))
		.sort((a, b) => (a.approvedAt ?? '').localeCompare(b.approvedAt ?? ''));
}

function amendmentSuffixNum(id: string): number {
	const m = /-(\d+)$/.exec(id);
	if (m === null) return 0;
	return Number(m[1]) || 0;
}
