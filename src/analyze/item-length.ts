/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * An item's full length, measured from its file (LLD-b9d5c5c40df5a574-s1).
 *
 * The index keeps a POINTER to an item (its file, start line and end line)
 * and a stored body. For a non-code file the indexer cuts that body to 8,192
 * characters and appends a marker line, so the stored body is a snippet and
 * the item is in the file. A result that says how much of an item was read
 * takes the item's full length from here, never from the stored body.
 *
 * Nothing is written: the index is not changed by measuring.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { Entity } from '../shared/types.js';
import type { PartlyReadItem } from './completeness.js';

/** The line the indexer appends to a stored body it cut (indexer/parser/artifact.ts `truncate`). */
export const INDEXER_CUT_MARKER = '\n… (truncated)';

/** The entity kinds whose item is the whole file. Every other kind is its line range. */
const WHOLE_FILE_KINDS: ReadonlySet<string> = new Set(['document', 'file', 'config']);

export type MeasuredEntity = Pick<Entity, 'kind' | 'file' | 'startLine' | 'endLine' | 'body'>;

export interface ItemMeasure {
	/** The item's full length in characters; null when it could not be established. */
	readonly totalChars:   number | null;
	/** Why `totalChars` is null. Absent when it is established. */
	readonly reason?:      string | undefined;
	/** The stored body's length, without the indexer's marker line. */
	readonly storedChars:  number;
	/** The stored body is shorter than the item: the indexer cut it. */
	readonly cutByIndexer: boolean;
}

export interface MeasureItemOptions {
	/**
	 * The content hash the indexer recorded on the item's FILE entity. When
	 * the file's hash differs, its lines may no longer be the entity's, so no
	 * length is established.
	 */
	readonly recordedFileHash: string | undefined;
	/** Test seam. Defaults to reading the file as UTF-8. */
	readonly readFile?: ((path: string) => string) | undefined;
}

/** The indexer's file hash (indexer/index.ts `contentHash`): SHA-256, hex, first 16 characters. */
export function indexerFileHash(source: string): string {
	return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

/**
 * Measure an item from its file: the file's length for a document, file or
 * config entity; the length of its lines, start line to end line, for any
 * other entity.
 *
 * Never throws: a file that is gone, unreadable or changed since it was
 * indexed gives `totalChars: null` with the reason.
 */
export function measureItem(entity: MeasuredEntity, opts: MeasureItemOptions): ItemMeasure {
	const body        = entity.body ?? '';
	const hasMarker   = body.endsWith(INDEXER_CUT_MARKER);
	const storedChars = hasMarker ? body.length - INDEXER_CUT_MARKER.length : body.length;
	const unknown = (reason: string): ItemMeasure =>
		({ totalChars: null, reason, storedChars, cutByIndexer: hasMarker });

	let source: string;
	try {
		source = (opts.readFile ?? ((p: string) => readFileSync(p, 'utf8')))(entity.file);
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		return unknown(code === 'ENOENT'
			? 'the file no longer exists'
			: `the file could not be read (${code ?? (err instanceof Error ? err.message : String(err))})`);
	}

	if (opts.recordedFileHash === undefined || opts.recordedFileHash === '') {
		return unknown('no hash was recorded for the file when it was indexed');
	}
	if (indexerFileHash(source) !== opts.recordedFileHash) {
		return unknown('the file changed since it was indexed');
	}

	const totalChars = WHOLE_FILE_KINDS.has(entity.kind)
		? source.length
		: source.split('\n').slice(entity.startLine - 1, entity.endLine).join('\n').length;

	// An empty stored body (the artifact parser's file entity) is nothing stored, not a cut.
	return { totalChars, storedChars, cutByIndexer: hasMarker || (storedChars > 0 && totalChars > storedChars) };
}

/** The `partlyRead` entry for an item of which `readChars` characters were read. */
export function partlyReadEntry(what: string, readChars: number, measure: ItemMeasure): PartlyReadItem {
	return {
		what,
		readChars,
		totalChars: measure.totalChars,
		...(measure.totalChars === null && measure.reason !== undefined ? { totalNote: measure.reason } : {}),
	};
}
