/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A security review round's VerificationReceipt record (LLD s1 t4, standalone
 * Story add-securityfinding-capability-family-delegates-framing).
 *
 * The sandbox-verification/mutation-testing checkpoint must produce a durable
 * receipt (what ran, in what isolated environment, with what outcome) for
 * EVERY run, pass or fail, independent of whether any SecurityFinding
 * corroborates it. This mirrors the existing Story TEST RECORD pattern
 * (`../runners/build/test-record.js`) exactly: one entry per receipt, rendered
 * as `RECEIPTS.md` beside the review artifact exactly as `TESTS.md` sits
 * beside `BUILD.md`, reusing the same writeArtifact/writeAtomic (storage.ts)
 * and storeRound/withStoredModel (round-writer.ts) primitives, unmodified.
 *
 * It is a RECORD, not an approvable artifact: it carries no approval stamps
 * and approval of it is refused (gates.ts's isTestRecordJsonPath now also
 * matches the `RECEIPTS-` id prefix, the direct peer of `TESTS-`).
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import { artifactIdMarker, artifactJsonPath, folderIdentityMeta, receiptsArtifactId, receiptsArtifactPaths, storyRecordFolderArgs, writeArtifact, writeAtomic } from '../storage.js';
import type { PathIntent } from '../artifact-ids.js';
import { storeRound, withStoredModel } from '../runners/build/round-writer.js';
import type { RoundWriter } from '../runners/build/round-writer.js';

const log = getLogger('workflow:receipt-record');

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/** One sandbox-verification/mutation-testing checkpoint run, pass or fail,
 *  independent of SecurityFinding (a corroborated SecurityFinding references
 *  a receipt by `id`). */
export interface VerificationReceipt {
	readonly id:          string;
	readonly result:      'pass' | 'fail';
	readonly environment?: string | undefined;
	readonly ranAt:       string;
}

export interface ReceiptRecord {
	readonly meta: {
		readonly workflow:    'receipts';
		readonly epicHash:    string;
		readonly storyId:     string;
		readonly createdAt:   string;
		readonly updatedAt:   string;
		readonly standalone?: boolean | undefined;
		readonly epicSlug?:      string | undefined;
		readonly epicCreatedAt?: string | undefined;
	};
	readonly body: { readonly receipts: readonly VerificationReceipt[] };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is ReceiptRecord {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as { meta?: { epicHash?: unknown; storyId?: unknown; createdAt?: unknown }; body?: { receipts?: unknown } };
	return typeof r.meta?.epicHash === 'string'
		&& typeof r.meta.storyId === 'string'
		&& typeof r.meta.createdAt === 'string'
		&& Array.isArray(r.body?.receipts);
}

export type ReceiptRecordState =
	| { readonly kind: 'absent' }
	| { readonly kind: 'record'; readonly record: ReceiptRecord }
	| { readonly kind: 'unreadable'; readonly reason: string };

/** Read a Story's receipt record, telling an absent one from one that cannot be used. Never throws. */
export function receiptRecordState(repoPath: string, epicHash: string, storyId: string): ReceiptRecordState {
	const jsonPath = artifactJsonPath(repoPath, receiptsArtifactId(epicHash, storyId));
	if (!existsSync(jsonPath)) return { kind: 'absent' };
	try {
		const parsed: unknown = JSON.parse(readFileSync(jsonPath, 'utf8'));
		if (isRecord(parsed)) return { kind: 'record', record: parsed };
		log.warn({ jsonPath }, 'receiptRecordState: the stored record does not have the record\'s shape; treating it as absent');
		return { kind: 'unreadable', reason: 'it does not have the record\'s shape' };
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		log.warn({ jsonPath, err: reason }, 'receiptRecordState: the stored record is unreadable; treating it as absent');
		return { kind: 'unreadable', reason };
	}
}

/** The Story's receipt record, or null when there is none or it cannot be read. */
export function readReceiptRecord(repoPath: string, epicHash: string, storyId: string): ReceiptRecord | null {
	const state = receiptRecordState(repoPath, epicHash, storyId);
	return state.kind === 'record' ? state.record : null;
}

// ---------------------------------------------------------------------------
// Paths + write
// ---------------------------------------------------------------------------

function folderArgsFor(repoPath: string, rec: ReceiptRecord, intent: PathIntent): ReturnType<typeof storyRecordFolderArgs> {
	return storyRecordFolderArgs(repoPath, rec.meta.epicHash, rec.meta.storyId, { standalone: rec.meta.standalone }, intent);
}

function pathsFor(repoPath: string, rec: ReceiptRecord, intent: PathIntent): { md: string; json: string } {
	const fa = folderArgsFor(repoPath, rec, intent);
	return receiptsArtifactPaths(repoPath, rec.meta.epicHash, rec.meta.storyId, fa.epicCreatedAt, fa.workItemKind, fa.epicSlug);
}

/**
 * Append (or, for a matching `id`, replace) one VerificationReceipt into the
 * Story's receipt record: created on the first write, every other entry kept.
 * `createdAt` and the route flag are kept from the first write. Throws on a
 * write failure; the caller decides what that means.
 *
 * Takes no SecurityFinding parameter anywhere: the write is unconditional,
 * for every checkpoint run (pass or fail) regardless of whether anything
 * later corroborates it -- the opposite dependency (a corroborated
 * SecurityFinding references a receipt by id, via SecurityFinding.receiptId)
 * is the only link between the two, and it is optional on the finding's side.
 *
 * Refuses, rather than silently discarding, an existing record this write
 * cannot read: an unreadable record is NOT the same as no record, and treating
 * it as absent would replace it, losing every receipt already in it.
 */
export async function persistVerificationReceipt(
	repoPath: string,
	ident:    { readonly epicHash: string; readonly storyId: string; readonly now: string; readonly standalone?: boolean | undefined },
	receipt:  VerificationReceipt,
	through?: RoundWriter,
): Promise<{ md: string; json: string }> {
	const state = receiptRecordState(repoPath, ident.epicHash, ident.storyId);
	if (state.kind === 'unreadable') {
		throw new ReceiptRecordUnreadableError(ident.epicHash, ident.storyId, state.reason);
	}
	const prior = state.kind === 'record' ? state.record : null;
	const standalone = prior !== null ? prior.meta.standalone === true : ident.standalone === true;
	const kept = (prior?.body.receipts ?? []).filter(r => r.id !== receipt.id);
	const unstamped: ReceiptRecord = {
		meta: {
			workflow:  'receipts',
			epicHash:  ident.epicHash,
			storyId:   ident.storyId,
			createdAt: prior?.meta.createdAt ?? ident.now,
			updatedAt: ident.now,
			...(standalone ? { standalone: true } : {}),
		},
		body: { receipts: [...kept, receipt] },
	};
	const intent: PathIntent = { kind: 'write', root: { createdAt: unstamped.meta.createdAt } };
	const rec: ReceiptRecord = { ...unstamped, meta: { ...unstamped.meta, ...folderIdentityMeta(folderArgsFor(repoPath, unstamped, intent)) } };
	const paths = pathsFor(repoPath, rec, intent);
	if (through !== undefined) await storeRound(through, receiptsArtifactId(ident.epicHash, ident.storyId), paths.json, rec.body, receiptsRoundOutcome(receipt));
	const priorJson = existsSync(paths.json) ? readFileSync(paths.json, 'utf8') : undefined;
	writeArtifact(paths.json, through !== undefined ? withStoredModel(paths.json, rec) : rec, 'content', { replaceUnreadable: true });
	try {
		writeAtomic(paths.md, `${artifactIdMarker(receiptsArtifactId(ident.epicHash, ident.storyId))}\n\n${renderReceiptRecordMd(rec)}`);
	} catch (err) {
		if (through !== undefined) throw err;
		try {
			if (priorJson !== undefined) writeAtomic(paths.json, priorJson);
			else rmSync(paths.json, { force: true });
		} catch (undoErr) {
			log.warn({ json: paths.json, err: undoErr instanceof Error ? undoErr.message : String(undoErr) }, 'persistVerificationReceipt: the json could not be put back after the document failed to write');
			throw new ReceiptRecordInconsistentError(paths.json, err, undoErr);
		}
		throw err;
	}
	return paths;
}

function receiptsRoundOutcome(receipt: VerificationReceipt): { readonly result: string; readonly summary: string } {
	return { result: receipt.result, summary: `RECEIPTS round for ${receipt.id}: sandbox/mutation checkpoint ${receipt.result}` };
}

/** The Story's receipt record exists but could not be read, so persisting a new
 *  receipt was refused rather than risk discarding every receipt already in it. */
export class ReceiptRecordUnreadableError extends Error {
	constructor(readonly epicHash: string, readonly storyId: string, readonly reason: string) {
		super(`the receipt record for ${epicHash}/${storyId} exists but is unreadable (${reason}); refusing to write a new receipt over it`);
		this.name = 'ReceiptRecordUnreadableError';
	}
}

/** The document write failed and the json could not be put back either, so the
 *  RECEIPTS record may hold this turn's json beside an earlier document. */
export class ReceiptRecordInconsistentError extends Error {
	constructor(readonly jsonPath: string, readonly writeError: unknown, readonly restoreError: unknown) {
		super(
			`the RECEIPTS record at ${jsonPath} may be inconsistent: the document could not be written ` +
			`(${writeError instanceof Error ? writeError.message : String(writeError)}) and the earlier json ` +
			`could not be put back (${restoreError instanceof Error ? restoreError.message : String(restoreError)})`,
		);
		this.name = 'ReceiptRecordInconsistentError';
	}
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function renderReceiptRecordMd(rec: ReceiptRecord): string {
	const lines: string[] = [
		`# Receipts: ${rec.meta.epicHash} ${rec.meta.storyId}`,
		'',
		'What the sandbox-verification/mutation-testing checkpoint ran for this security review round, pass or fail. ' +
			'A receipt is recorded for every run, whether or not any SecurityFinding corroborates it.',
		'',
	];
	if (rec.body.receipts.length === 0) {
		lines.push('No receipt has been recorded yet.', '');
		return lines.join('\n');
	}
	lines.push('| Id | Result | Environment | Ran at |', '| :--- | :--- | :--- | :--- |');
	for (const r of rec.body.receipts) {
		lines.push(`| \`${r.id}\` | ${r.result} | ${r.environment ?? ''} | ${r.ranAt} |`);
	}
	lines.push('');
	return lines.join('\n');
}
