/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The append and read API of an artifact's change log and feedback (sc3).
 * Entries are immutable once appended; openness of feedback is computed on
 * every call and never stored (k4).
 */

import { ArtifactIds, InvalidArtifactKeyError } from '../artifact-ids.js';
import { isActor, isReference } from './decode.js';
import { HistoryEntryError, HistoryReadError } from './types.js';
import type { ChangeLogEntry, Feedback, Operation } from './types.js';
import type { SidecarIo, SidecarFile } from './sidecar.js';
import { compareEntries } from './sidecar-store.js';

const OPERATIONS: readonly Operation[] = [
	'create', 'update', 'delete', 'reparent', 'request-review', 'review', 'approve', 'reject', 'open-signoff',
	'signoff-changes', 'signed-off', 'complete', 'reopen', 'withdraw', 'supersede', 'mark-stale', 'ack-stale',
];
const FEEDBACK_KINDS: readonly Feedback['kind'][] = ['comment', 'suggestion', 'revision-request'];

/** Anchor limits. */
const QUOTE_MAX = 500;
const CONTEXT_MAX = 40;

function requireId(id: string): void {
	if (ArtifactIds.parse(id) === undefined) throw new InvalidArtifactKeyError(`'${id}' is not an artifact id`);
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nonEmpty(v: unknown): v is string {
	return typeof v === 'string' && v.length > 0;
}

function validateCommon(e: Record<string, unknown>, what: string): void {
	if (!nonEmpty(e['id'])) throw new HistoryEntryError(`${what} has no id`);
	if (!isActor(e['actor'])) throw new HistoryEntryError(`${what} ${String(e['id'])} has no valid actor (id, kind and properties)`);
	if (!nonEmpty(e['timestamp'])) throw new HistoryEntryError(`${what} ${String(e['id'])} has no timestamp`);
}

export function validateLogEntry(e: ChangeLogEntry): void {
	validateCommon(e as unknown as Record<string, unknown>, 'change log entry');
	if (!(OPERATIONS as readonly unknown[]).includes(e.operation)) {
		throw new HistoryEntryError(`change log entry ${e.id} names an unknown operation '${String(e.operation)}'`);
	}
	const bad = (field: string): never => { throw new HistoryEntryError(`change log entry ${e.id}: ${field} is malformed`); };
	const text = (v: unknown): boolean => typeof v === 'string';
	if (e.revision !== undefined && !(isObject(e.revision) && Number.isInteger(e.revision.number) && text(e.revision.contentHash))) bad('revision');
	if (e.status !== undefined && !(isObject(e.status) && text(e.status.from) && text(e.status.to))) bad('status');
	if (e.outcome !== undefined && !(isObject(e.outcome) && text(e.outcome.result) && text(e.outcome.summary))) bad('outcome');
	if (e.references !== undefined && !(Array.isArray(e.references) && e.references.every(isReference))) bad('references');
	if (e.addresses !== undefined && e.addresses !== 'all' && !(Array.isArray(e.addresses) && e.addresses.every(text))) bad('addresses');
}

function validateFeedback(f: Feedback): void {
	validateCommon(f as unknown as Record<string, unknown>, 'feedback');
	if (typeof f.text !== 'string' || f.text.trim().length === 0) throw new HistoryEntryError(`feedback ${f.id} has no text`);
	if (!(FEEDBACK_KINDS as readonly unknown[]).includes(f.kind)) throw new HistoryEntryError(`feedback ${f.id} has an unknown kind '${String(f.kind)}'`);
	if (!Array.isArray(f.feedback)) throw new HistoryEntryError(`feedback ${f.id} has no list of replies`);
	for (const reply of f.feedback) {
		if (!isObject(reply)) throw new HistoryEntryError(`feedback ${f.id} has a reply that is not an entry`);
		validateFeedback(reply as unknown as Feedback);
	}
	if (f.revision !== undefined && !Number.isInteger(f.revision)) throw new HistoryEntryError(`feedback ${f.id}: the revision is not an integer`);
	if (f.batchId !== undefined && typeof f.batchId !== 'string') throw new HistoryEntryError(`feedback ${f.id}: the batch id is not text`);
	if (f.source !== undefined && !(isObject(f.source) && nonEmpty(f.source.system) && nonEmpty(f.source.externalId) && (f.source.url === undefined || typeof f.source.url === 'string'))) {
		throw new HistoryEntryError(`feedback ${f.id}: the source needs a system and an external id`);
	}
	const a = f.anchor;
	if (a === undefined) return;
	if (!isObject(a)) throw new HistoryEntryError(`feedback ${f.id}: the anchor is not an object`);
	for (const field of ['quote', 'prefix', 'suffix', 'section'] as const) {
		if (a[field] !== undefined && typeof a[field] !== 'string') throw new HistoryEntryError(`feedback ${f.id}: the anchor ${field} is not text`);
	}
	if (a.quote !== undefined && a.quote.length > QUOTE_MAX) throw new HistoryEntryError(`feedback ${f.id}: the anchor quote is over ${QUOTE_MAX} characters`);
	if (a.prefix !== undefined && a.prefix.length > CONTEXT_MAX) throw new HistoryEntryError(`feedback ${f.id}: the anchor prefix is over ${CONTEXT_MAX} characters`);
	if (a.suffix !== undefined && a.suffix.length > CONTEXT_MAX) throw new HistoryEntryError(`feedback ${f.id}: the anchor suffix is over ${CONTEXT_MAX} characters`);
	if (a.lines !== undefined) {
		const lines: unknown = a.lines;
		if (!Array.isArray(lines) || lines.length !== 2 || !Number.isInteger(lines[0]) || !Number.isInteger(lines[1]) || (lines[0] as number) > (lines[1] as number)) {
			throw new HistoryEntryError(`feedback ${f.id}: the anchor lines are not an ordered pair`);
		}
	}
}

export class History {
	constructor(private readonly io: SidecarIo) {}

	async appendLog(id: string, e: ChangeLogEntry): Promise<void> {
		requireId(id);
		validateLogEntry(e);
		await this.io.appendRecord('log', { artifactId: id, entry: e });
	}

	async appendFeedback(id: string, f: Feedback): Promise<void> {
		requireId(id);
		validateFeedback(f);
		await this.io.appendRecord('feedback', { artifactId: id, entry: f });
	}

	log(id: string): Promise<ChangeLogEntry[]> { return this.read<ChangeLogEntry>('log', id, e => validateLogEntry(e)); }

	async logTail(id: string): Promise<ChangeLogEntry | undefined> {
		const entries = await this.log(id);
		return entries[entries.length - 1];
	}

	feedback(id: string): Promise<Feedback[]> { return this.read<Feedback>('feedback', id, f => validateFeedback(f)); }

	/**
	 * The feedback no later log entry addresses (by listing its id, or with `all`). "Later" is the order the reader
	 * returns entries in: by timestamp, then entry id, so an entry made in the same instant is ordered the same
	 * whichever file is read first.
	 */
	async openFeedback(id: string): Promise<Feedback[]> {
		const feedback = await this.feedback(id);
		const log = await this.log(id);
		return feedback.filter(f => !log.some(e =>
			compareEntries(e, f) > 0
			&& (e.addresses === 'all' || (Array.isArray(e.addresses) && e.addresses.includes(f.id)))));
	}

	private async read<E>(file: SidecarFile, id: string, check: (entry: E) => void): Promise<E[]> {
		requireId(id);
		try {
			const entries = await this.io.readRecords<E>(file, id);
			entries.forEach((e, i) => {
				if (!isObject(e)) throw new Error(`line ${i + 1} is not a record`);
				try { check(e); } catch (err) { throw new Error(`line ${i + 1}: ${(err as Error).message}`); }
			});
			return entries;
		} catch (err) {
			throw new HistoryReadError(`reading the ${file} of ${id} failed: ${(err as Error).message}`);
		}
	}
}
