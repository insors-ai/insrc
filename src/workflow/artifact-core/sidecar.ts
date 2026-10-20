/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The sidecar line primitive (sc3) and the port History reads and appends
 * through. s2 owns only the one-line append and an in-memory implementation for
 * tests; which path a record goes to, ordering, de-duplication and repair are
 * s4's, behind {@link SidecarIo} (sc5's SidecarStore).
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { SidecarRecord } from './types.js';

/** The two append-only line files of an artifact that History uses. */
export type SidecarFile = 'log' | 'feedback';

/** Where History appends and reads records. Implemented durably by s4. */
export interface SidecarIo {
	appendRecord<E>(file: SidecarFile, record: SidecarRecord<E>): Promise<void>;
	/** The entries of one artifact in reader order (filtered, ordered, de-duplicated). */
	readRecords<E>(file: SidecarFile, artifactId: string): Promise<E[]>;
}

/** Append one record as one JSON line to `path`, creating its directory. The one place a sidecar line is written. */
export function appendSidecarLine(path: string, record: SidecarRecord<unknown>): void {
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, JSON.stringify(record) + '\n', 'utf8');
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
		readRecords: <E>(file: SidecarFile, artifactId: string): Promise<E[]> =>
			Promise.resolve(records.filter(r => r.file === file && r.record.artifactId === artifactId).map(r => r.record.entry as E)),
	};
}
