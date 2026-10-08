/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Measuring a stored entity from inside a lookup (LLD-b9d5c5c40df5a574-s1).
 *
 * `measureItem` needs the hash the indexer recorded on the item's FILE
 * entity, to tell a file that is still the indexed one from a file that has
 * changed. This module finds that hash in the graph and remembers it for the
 * length of one lookup, so several items of one file cost one read.
 */

import type { DbClient } from '../../db/client.js';
import { getEntity } from '../../db/entities.js';
import { makeEntityId } from '../../indexer/parser/base.js';
import type { Entity } from '../../shared/types.js';
import type { PartlyReadItem } from '../completeness.js';
import { INDEXER_CUT_MARKER, measureItem, partlyReadEntry } from '../item-length.js';
import type { ItemMeasure, MeasuredEntity } from '../item-length.js';

/** What is needed of an entity to measure it: its pointer, its stored body and its repo. */
export type StoredItem = MeasuredEntity & { readonly repo: string };

export interface ItemMeasurer {
	/** The item's full length from its file, and whether the indexer cut the stored body. */
	measure(entity: StoredItem): Promise<ItemMeasure>;
	/**
	 * The `partlyRead` entry for an item of whose stored body `readChars`
	 * characters were used, or undefined when nothing shows the item is
	 * longer than that. It IS longer when the stored body is longer than
	 * what was used, when the indexer cut the stored body, or when the file
	 * shows a greater length. A file that changed since it was indexed
	 * establishes no length; the entry then carries a null total, and is
	 * made only when one of the first two holds.
	 */
	partlyRead(what: string, entity: StoredItem, readChars: number): Promise<PartlyReadItem | undefined>;
}

/**
 * The `partlyRead` entry for a document whose SUMMARY is being used. The
 * summariser gives the model the first `summariserCut` characters of the
 * stored body, so a longer document was summarised from that much of it.
 * Undefined when the summary rests on the whole document.
 */
export function summarisedFrom(
	measurer:      ItemMeasurer,
	entity:        StoredItem,
	summariserCut: number,
): Promise<PartlyReadItem | undefined> {
	const stored = entity.body.endsWith(INDEXER_CUT_MARKER) ? entity.body.length - INDEXER_CUT_MARKER.length : entity.body.length;
	return measurer.partlyRead(entity.file, entity, Math.min(summariserCut, stored));
}

/** One measurer per lookup run. `entities`, when the lookup already holds the repo's entities, saves the graph reads. */
export function createItemMeasurer(db: DbClient, entities?: readonly Entity[]): ItemMeasurer {
	const hashByFile = new Map<string, string | undefined>();
	if (entities !== undefined) {
		for (const e of entities) {
			if (e.kind === 'file' && !hashByFile.has(e.file)) hashByFile.set(e.file, e.hash);
		}
	}

	async function recordedHash(entity: StoredItem): Promise<string | undefined> {
		const file = entity.file;
		if (hashByFile.has(file)) return hashByFile.get(file);
		// Every parser keys a file's own entity the same way: (repo, file, 'file', file).
		const fileEntity = await getEntity(db, makeEntityId(entity.repo, file, 'file', file));
		const hash = fileEntity?.hash;
		hashByFile.set(file, hash);
		return hash;
	}

	async function measure(entity: StoredItem): Promise<ItemMeasure> {
		return measureItem(entity, { recordedFileHash: await recordedHash(entity) });
	}

	return {
		measure,
		async partlyRead(what, entity, readChars) {
			const m = await measure(entity);
			const longer = readChars < m.storedChars || m.cutByIndexer
				|| (m.totalChars !== null && m.totalChars > readChars);
			return longer ? partlyReadEntry(what, readChars, m) : undefined;
		},
	};
}
