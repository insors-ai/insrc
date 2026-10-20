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
import { HistoryEntryError, HistoryReadError } from './types.js';
import type { ChangeLogEntry, Feedback, Operation } from './types.js';
import type { SidecarIo, SidecarFile } from './sidecar.js';

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
	if (!isObject(e['actor']) || !nonEmpty(e['actor']['id'])) throw new HistoryEntryError(`${what} ${String(e['id'])} has no actor`);
	if (!nonEmpty(e['timestamp'])) throw new HistoryEntryError(`${what} ${String(e['id'])} has no timestamp`);
}

function validateLogEntry(e: ChangeLogEntry): void {
	validateCommon(e as unknown as Record<string, unknown>, 'change log entry');
	if (!(OPERATIONS as readonly unknown[]).includes(e.operation)) {
		throw new HistoryEntryError(`change log entry ${e.id} names an unknown operation '${String(e.operation)}'`);
	}
}

function validateFeedback(f: Feedback): void {
	validateCommon(f as unknown as Record<string, unknown>, 'feedback');
	if (typeof f.text !== 'string' || f.text.trim().length === 0) throw new HistoryEntryError(`feedback ${f.id} has no text`);
	if (!(FEEDBACK_KINDS as readonly unknown[]).includes(f.kind)) throw new HistoryEntryError(`feedback ${f.id} has an unknown kind '${String(f.kind)}'`);
	const a = f.anchor;
	if (a === undefined) return;
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

/** When an entry happened, as a number; unparseable stamps sort first. */
function at(timestamp: string): number {
	const t = Date.parse(timestamp);
	return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
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

	/** The feedback no later log entry addresses (by listing its id, or with `all`). */
	async openFeedback(id: string): Promise<Feedback[]> {
		const feedback = await this.feedback(id);
		const log = await this.log(id);
		return feedback.filter(f => !log.some(e =>
			at(e.timestamp) > at(f.timestamp)
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
