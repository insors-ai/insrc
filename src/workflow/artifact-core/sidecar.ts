/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The sidecar line primitive (sc3) and the port History reads and appends
 * through. s2 owns only the one-line append and an in-memory implementation for
 * tests; the framing and the size cap are s4's, and so are ordering, de-duplication
 * and repair behind {@link SidecarIo} (sc5's SidecarStore).
 */

import { appendFileSync, closeSync, fstatSync, mkdirSync, openSync, readSync } from 'node:fs';
import { dirname } from 'node:path';

import { HistoryEntryError } from './types.js';
import type { SidecarRecord } from './types.js';

/** The largest serialised record, in bytes, that a line file or the journal accepts. */
export const MAX_SIDECAR_ENTRY_BYTES = 256 * 1024;

/** The two append-only line files of an artifact that History uses. */
export type SidecarFile = 'log' | 'feedback';

/** Where History appends and reads records. Implemented durably by s4. */
export interface SidecarIo {
	appendRecord<E>(file: SidecarFile, record: SidecarRecord<E>): Promise<void>;
	/** The entries of one artifact in reader order (filtered, ordered, de-duplicated). */
	readRecords<E>(file: SidecarFile, artifactId: string): Promise<E[]>;
}

/** The serialised record, refused with HistoryEntryError when it is over {@link MAX_SIDECAR_ENTRY_BYTES}. Shared with the journal's size check. */
export function checkSidecarEntrySize(record: SidecarRecord<unknown>): string {
	const json = JSON.stringify(record);
	const bytes = Buffer.byteLength(json, 'utf8');
	if (bytes > MAX_SIDECAR_ENTRY_BYTES) {
		throw new HistoryEntryError(`the entry of ${record.artifactId} is ${bytes} bytes, over the ${MAX_SIDECAR_ENTRY_BYTES} byte limit`);
	}
	return json;
}

/** One framed line: `<byte length of the json>` TAB `<json>` NEWLINE. The length counts bytes, so a reader can tell a complete frame from a torn one. */
export function frameSidecarLine(record: SidecarRecord<unknown>): string {
	const json = checkSidecarEntrySize(record);
	return `${Buffer.byteLength(json, 'utf8')}\t${json}\n`;
}

/** True when `path` exists, is not empty and its last byte is not a newline (a torn append). */
function endsMidLine(path: string): boolean {
	let fd: number;
	try { fd = openSync(path, 'r'); } catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false; throw err; }
	try {
		const size = fstatSync(fd).size;
		if (size === 0) return false;
		const last = Buffer.alloc(1);
		readSync(fd, last, 0, 1, size - 1);
		return last[0] !== 0x0a;
	} finally { closeSync(fd); }
}

/**
 * Append one framed record to `path`, creating its directory, in one append-mode
 * write. A file whose last line has no newline (a torn append) gets a newline
 * first, so the fragment stays a line of its own. The one place a sidecar line is written.
 */
export function appendSidecarLine(path: string, record: SidecarRecord<unknown>): void {
	const line = frameSidecarLine(record);
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, (endsMidLine(path) ? '\n' : '') + line, 'utf8');
}

/** An in-memory reader and appender, for tests. Keeps every appended record in order. */
export function createMemorySidecar(): SidecarIo & { readonly records: readonly { readonly file: SidecarFile; readonly record: SidecarRecord<unknown> }[] } {
	const records: { file: SidecarFile; record: SidecarRecord<unknown> }[] = [];
	return {
		records,
		appendRecord: <E>(file: SidecarFile, record: SidecarRecord<E>): Promise<void> => {
			records.push({ file, record });
			return Promise.resolve();
		},
		// Like a durable reader, de-duplicate by entry id: appending the same entry twice is harmless.
		readRecords: <E>(file: SidecarFile, artifactId: string): Promise<E[]> => {
			const seen = new Set<unknown>();
			const out: E[] = [];
			for (const r of records) {
				if (r.file !== file || r.record.artifactId !== artifactId) continue;
				const entryId = (r.record.entry as { id?: unknown } | null)?.id;
				if (entryId !== undefined) { if (seen.has(entryId)) continue; seen.add(entryId); }
				out.push(r.record.entry as E);
			}
			return Promise.resolve(out);
		},
	};
}
