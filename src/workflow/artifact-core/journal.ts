/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The write journal port (sc2). A write stages the prepared head together with
 * its whole change log entry before anything changes, so a retry (or a start-up
 * recovery) can finish the same operation under the same operation id even after
 * the head was already replaced. s2 defines the port and an in-memory
 * implementation; s4 adds the durable one, a pending-head file per artifact under
 * `.insrc/journal/` that is not committed.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { writeAtomic } from '../storage.js';
import type { ChangeLogEntry } from './types.js';
import { checkSidecarEntrySize, isDesignHistoryRecord, sidecarOuterLimit, designHistoryLimit, MAX_DESIGN_HISTORY_BYTES } from './sidecar.js';

export function journalBytes(id: string, op: StagedOperation, designLimit: number = designHistoryLimit()): string {
 checkSidecarEntrySize({artifactId:id,entry:op.entry});
 const raw = JSON.stringify(op);
 const limit = isDesignHistoryRecord({artifactId:id,entry:op.entry}) ? Math.min(designLimit,MAX_DESIGN_HISTORY_BYTES) : MAX_DESIGN_HISTORY_BYTES * 2;
 if (Buffer.byteLength(raw) > limit) throw new Error('Journal envelope exceeds bounded history capacity');
 return raw;
}

/** The repository-relative folder of the durable journal; listed in the ignore file. */
export const JOURNAL_DIR = '.insrc/journal';

/** The hash a staged operation records for a head: of its bytes, or `absent` when the head did not exist yet. */
export function headHashOf(bytes: string | undefined): string {
	return bytes === undefined ? 'absent' : createHash('sha256').update(bytes, 'utf8').digest('hex');
}

export interface StagedOperation {
	/** A hash of the artifact id, the prior revision and the prepared bytes; also the id of the change log entry. */
	readonly operationId:   string;
	readonly priorRevision: number;
	/** {@link headHashOf} the head text the write started from. Recovery replaces a head only when it still has this hash. */
	readonly priorHeadHash: string;
	/** The exact head text the write puts on disk. */
	readonly bytes:         string;
	/** The whole immutable change log entry, actor and timestamp included: recovery appends it as staged. */
	readonly entry:         ChangeLogEntry;
}

export interface WriteJournal {
	stage(id: string, op: StagedOperation): Promise<void>;
	/** The operation staged for `id` and not yet cleared, if any. */
	pending(id: string): Promise<StagedOperation | undefined>;
	clear(id: string, operationId: string): Promise<void>;
}

/** A journal that keeps staged operations in memory: for tests and the named non-durable store. It does not survive a restart. */
export function createMemoryJournal(): WriteJournal {
	const staged = new Map<string, StagedOperation>();
	return {
		stage: (id, op) => { staged.set(id, op); return Promise.resolve(); },
		pending: id => Promise.resolve(staged.get(id)),
		clear: (id, operationId) => {
			if (staged.get(id)?.operationId === operationId) staged.delete(id);
			return Promise.resolve();
		},
	};
}

function isStagedOperation(v: unknown): v is StagedOperation {
	if (typeof v !== 'object' || v === null) return false;
	const o = v as Record<string, unknown>;
	const entry = o['entry'] as Record<string, unknown> | null | undefined;
	return typeof o['operationId'] === 'string' && o['operationId'] !== '' && Number.isInteger(o['priorRevision'])
		&& typeof o['priorHeadHash'] === 'string' && typeof o['bytes'] === 'string'
		&& typeof entry === 'object' && entry !== null && entry['id'] === o['operationId'];
}

/** A journal that keeps one file per artifact, `.insrc/journal/<id>.json`, replaced atomically; it survives a restart. */
export function createFileJournal(repoPath: string): WriteJournal {
	const fileOf = (id: string): string => join(repoPath, JOURNAL_DIR, `${id}.json`);
	const read = (id: string): StagedOperation | undefined => {
		const path = fileOf(id);
		if (!existsSync(path)) return undefined;
  if (statSync(path).size > MAX_DESIGN_HISTORY_BYTES * 2) throw new Error('Journal exceeds absolute capacity');
		let parsed: unknown;
  const raw = readFileSync(path, 'utf8');
		try { parsed = JSON.parse(raw); }
		catch (err) { throw new Error(`the journal file ${path} is not valid JSON (${(err as Error).message})`); }
		if (!isStagedOperation(parsed)) throw new Error(`the journal file ${path} is not a staged operation`);
  journalBytes(id,parsed);
  if (isDesignHistoryRecord({artifactId:id,entry:parsed.entry}) && Buffer.byteLength(raw)>designHistoryLimit()) throw new Error('Journal envelope exceeds actual encoded history capacity');
		return parsed;
	};
	return {
		stage: (id, op) => {
			try { writeAtomic(fileOf(id), journalBytes(id,op)); return Promise.resolve(); }
			catch (err) { return Promise.reject(err instanceof Error ? err : new Error(String(err))); }
		},
		pending: id => {
			try { return Promise.resolve(read(id)); }
			catch (err) { return Promise.reject(err instanceof Error ? err : new Error(String(err))); }
		},
		clear: (id, operationId) => {
			try {
				if (read(id)?.operationId === operationId) rmSync(fileOf(id), { force: true });
				return Promise.resolve();
			} catch (err) { return Promise.reject(err instanceof Error ? err : new Error(String(err))); }
		},
	};
}
