/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Approval / rejection gates for workflow chains.
 *
 * The gate helpers READ from artifact JSONs on disk and refuse
 * downstream work when the upstream artifact isn't approved. This
 * is the trust boundary between workflows — a downstream workflow
 * MUST call the corresponding gate before consuming an upstream
 * artifact.
 *
 * All Epic-scoped reads take the 16-char epicHash. The display slug
 * lives in `meta.epicSlug` and surfaces in error messages via the
 * artifact's own meta.
 */

import { existsSync, readFileSync } from 'node:fs';

import { getEffectiveHld } from './amendments/effective.js';
import { makeStaleAck } from './amendments/staleness.js';
import type { DefineArtifact } from './artifacts/define.js';
import type { HldArtifact }    from './artifacts/hld.js';
import { defineArtifactPaths, hldArtifactPaths, writeAtomic } from './storage.js';

// ---------------------------------------------------------------------------
// Read + require-approved helpers
// ---------------------------------------------------------------------------

export class ArtifactMissingError extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'ArtifactMissingError';
	}
}

export class ArtifactNotApprovedError extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'ArtifactNotApprovedError';
	}
}

/** Read the canonical Define JSON from disk. */
export function readDefineArtifact(repoPath: string, epicHash: string): DefineArtifact {
	const paths = defineArtifactPaths(repoPath, epicHash);
	if (!existsSync(paths.json)) {
		throw new ArtifactMissingError(
			`Define artifact not found at ${paths.json}. Run \`insrc_workflow_step\` ` +
			`workflow='define' focus='...' first.`,
		);
	}
	const raw = readFileSync(paths.json, 'utf8');
	return JSON.parse(raw) as DefineArtifact;
}

/** Same as `readDefineArtifact` but refuses when the artifact is
 *  not approved. Downstream runners (`design.epic` s1) call this. */
export function requireApprovedEpic(repoPath: string, epicHash: string): DefineArtifact {
	const define = readDefineArtifact(repoPath, epicHash);
	const label  = define.meta.epicSlug ?? epicHash;
	if (define.meta.approvedAt === undefined || define.meta.approvedAt.length === 0) {
		const path = defineArtifactPaths(repoPath, epicHash).md;
		throw new ArtifactNotApprovedError(
			`Epic '${label}' (${epicHash}) is not approved. ` +
			`Run \`insrc workflow approve ${path}\` before starting design.epic.`,
		);
	}
	if (define.meta.rejectedAt !== undefined && define.meta.rejectedAt.length > 0) {
		throw new ArtifactNotApprovedError(
			`Epic '${label}' (${epicHash}) was rejected on ${define.meta.rejectedAt}. ` +
			`Re-run define with --reopen first.`,
		);
	}
	return define;
}

/** Read the canonical HLD JSON from disk. */
export function readHldArtifact(repoPath: string, epicHash: string): HldArtifact {
	const paths = hldArtifactPaths(repoPath, epicHash);
	if (!existsSync(paths.json)) {
		throw new ArtifactMissingError(
			`HLD not found at ${paths.json}. Run design.epic before design.story.`,
		);
	}
	const raw = readFileSync(paths.json, 'utf8');
	return JSON.parse(raw) as HldArtifact;
}

/** Same as `readHldArtifact` but refuses when the artifact is not
 *  approved AND returns the EFFECTIVE HLD (base + approved
 *  amendments). Downstream workflows must go through this — they
 *  never see the raw base directly.
 *
 *  Amendments are only applied when the base is approved; a
 *  pending or rejected base short-circuits with
 *  `ArtifactNotApprovedError` as before. */
export function requireApprovedHld(repoPath: string, epicHash: string): HldArtifact {
	const hld   = readHldArtifact(repoPath, epicHash);
	const label = hld.meta.epicSlug ?? epicHash;
	if (hld.meta.approvedAt === undefined || hld.meta.approvedAt.length === 0) {
		const path = hldArtifactPaths(repoPath, epicHash).md;
		throw new ArtifactNotApprovedError(
			`HLD for Epic '${label}' (${epicHash}) is not approved. ` +
			`Run \`insrc workflow approve ${path}\` before starting design.story.`,
		);
	}
	return getEffectiveHld(repoPath, epicHash, hld);
}

/** Read the BASE HLD (no amendments applied). Used by amendment
 *  approval CLI + the effective-hash calculator + the staleness
 *  scanner. Downstream workflows should call `requireApprovedHld`
 *  instead. */
export function readBaseHld(repoPath: string, epicHash: string): HldArtifact {
	return readHldArtifact(repoPath, epicHash);
}

// ---------------------------------------------------------------------------
// Stale-ack helper
// ---------------------------------------------------------------------------

/** Record a stale-ack override on an LLD artifact meta. Reads
 *  `<lldJsonPath>`, adds `staleAckedAt` + `staleAckedReason`,
 *  writes atomically. */
export function ackStaleArtifact(jsonPath: string, reason: string): { readonly path: string; readonly ackedAt: string; readonly reason: string } {
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(`No artifact at ${jsonPath}`);
	}
	const raw = readFileSync(jsonPath, 'utf8');
	const artifact = JSON.parse(raw) as { meta?: Record<string, unknown> };
	if (typeof artifact.meta !== 'object' || artifact.meta === null) {
		throw new Error(`Artifact at ${jsonPath} has no meta`);
	}
	const ack = makeStaleAck(reason);
	const next = { ...artifact, meta: { ...artifact.meta, ...ack } };
	writeAtomic(jsonPath, JSON.stringify(next, null, 2) + '\n');
	return { path: jsonPath, ackedAt: ack.staleAckedAt, reason: ack.staleAckedReason };
}

// ---------------------------------------------------------------------------
// Approve / reject helpers (mutate artifact meta)
// ---------------------------------------------------------------------------

export interface ApprovalResult {
	readonly workflow:  string;
	readonly path:      string;
	readonly approvedAt: string;
}

/** Mark an artifact approved by writing `meta.approvedAt` into its
 *  JSON. Works generically for any workflow — the artifact's JSON
 *  path is passed in verbatim. */
export function approveArtifactByJsonPath(jsonPath: string): ApprovalResult {
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(`No artifact at ${jsonPath}`);
	}
	const raw = readFileSync(jsonPath, 'utf8');
	const artifact = JSON.parse(raw) as { meta?: { workflow?: string; approvedAt?: string; rejectedAt?: string; rejectReason?: string } };
	if (typeof artifact.meta !== 'object' || artifact.meta === null) {
		throw new Error(`Artifact at ${jsonPath} has no meta`);
	}
	const approvedAt = new Date().toISOString();
	const nextMeta = { ...artifact.meta, approvedAt };
	// Clear any prior rejection if we're re-approving.
	delete nextMeta.rejectedAt;
	delete nextMeta.rejectReason;
	const next = { ...artifact, meta: nextMeta };
	writeAtomic(jsonPath, JSON.stringify(next, null, 2) + '\n');
	return { workflow: nextMeta.workflow ?? 'unknown', path: jsonPath, approvedAt };
}

export interface RejectionResult {
	readonly workflow:    string;
	readonly path:        string;
	readonly rejectedAt:  string;
	readonly rejectReason: string;
}

/** Same as `approveArtifactByJsonPath` but records a rejection. */
export function rejectArtifactByJsonPath(jsonPath: string, reason: string): RejectionResult {
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(`No artifact at ${jsonPath}`);
	}
	if (typeof reason !== 'string' || reason.trim().length === 0) {
		throw new Error(`reject requires a non-empty --reason`);
	}
	const raw = readFileSync(jsonPath, 'utf8');
	const artifact = JSON.parse(raw) as { meta?: { workflow?: string; approvedAt?: string; rejectedAt?: string; rejectReason?: string } };
	if (typeof artifact.meta !== 'object' || artifact.meta === null) {
		throw new Error(`Artifact at ${jsonPath} has no meta`);
	}
	const rejectedAt = new Date().toISOString();
	const nextMeta = { ...artifact.meta, rejectedAt, rejectReason: reason };
	delete nextMeta.approvedAt;
	const next = { ...artifact, meta: nextMeta };
	writeAtomic(jsonPath, JSON.stringify(next, null, 2) + '\n');
	return { workflow: nextMeta.workflow ?? 'unknown', path: jsonPath, rejectedAt, rejectReason: reason };
}

/** Given an md path (which the CLI accepts), resolve the sibling
 *  .json. Users almost always have the md path handy. With the hash
 *  layout, md lives under `docs/` and json under `.insrc/artifacts/`,
 *  so we swap the parent directory as well as the extension. */
export function jsonPathForMd(mdPath: string): string {
	if (mdPath.endsWith('.json')) return mdPath;
	if (!mdPath.endsWith('.md')) {
		throw new Error(`Expected a .md or .json path, got '${mdPath}'`);
	}
	const swapped = swapDocsToArtifacts(mdPath);
	return swapped.slice(0, -3) + '.json';
}

/** `.../docs/defines/DEF-<h>.md` → `.../.insrc/artifacts/DEF-<h>.md`.
 *  Only the first matching `docs/{defines,designs}/` segment gets
 *  swapped. If no such segment is present, the path is returned as-
 *  is (older layouts / non-standard callers). */
function swapDocsToArtifacts(p: string): string {
	for (const seg of ['/docs/defines/', '/docs/designs/']) {
		const i = p.indexOf(seg);
		if (i >= 0) {
			return p.slice(0, i) + '/.insrc/artifacts/' + p.slice(i + seg.length);
		}
	}
	// `docs/stub/*` files keep md + json side by side; no swap.
	return p;
}
