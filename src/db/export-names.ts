/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s1 — the names a file re-exports (export_names sub-DB).
 *
 * Keyed (re-exporting file entity u64, exported name) -> dupsort target entity
 * id. `export { f as g } from './b'` is the entry (barrel, 'g') -> f;
 * `export * from './b'` is (barrel, '*') -> b.ts's file entity id. Written by
 * the cross-file pass in the same transaction as the EXPORTS edge (see
 * promoteResolvedBatch); an entry whose target is not stored is ignored by its
 * readers.
 */

import { encodeEntityKey } from './graph/keys.js';
import { getGraphStore, type GraphStore } from './graph/store.js';
import { entityIdsByU64s } from './entities.js';

/** The export_names key of (file entity u64, exported name). */
export function exportNameKey(fileU64: bigint, name: string): Buffer {
	return Buffer.concat([encodeEntityKey(fileU64), Buffer.from(name, 'utf8')]);
}

/** Write one entry inside a write transaction. */
export function putExportNameInTxn(s: GraphStore, fileU64: bigint, name: string, targetId: string): void {
	s.exportNames.put(exportNameKey(fileU64, name), Buffer.from(targetId, 'utf8'));
}

/** Every entry, as file entity id -> exported name -> target entity ids. One scan of the sub-DB. */
export async function listExportNames(): Promise<Map<string, Map<string, Set<string>>>> {
	const store = await getGraphStore();
	const raw: { fileU64: bigint; name: string; target: string }[] = [];
	for (const { key, value } of store.exportNames.getRange()) {
		const k = key as Buffer;
		raw.push({ fileU64: k.readBigUInt64BE(0), name: k.subarray(8).toString('utf8'), target: (value as Buffer).toString('utf8') });
	}
	const ids = await entityIdsByU64s([...new Set(raw.map(r => r.fileU64))]);
	const out = new Map<string, Map<string, Set<string>>>();
	for (const { fileU64, name, target } of raw) {
		const fileId = ids.get(fileU64);
		if (fileId === undefined) continue;
		let names = out.get(fileId);
		if (names === undefined) { names = new Map(); out.set(fileId, names); }
		let targets = names.get(name);
		if (targets === undefined) { targets = new Set(); names.set(name, targets); }
		targets.add(target);
	}
	return out;
}
