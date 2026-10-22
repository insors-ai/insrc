/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The migration write: how a converted head replaces a legacy one. It is not `ArtifactStore.write`: the store's content write
 * moves `meta.revision` and returns the head to draft when the content hash changes, and the conversion changes the body (it
 * strips `body.feedback`) without changing what a person approved.
 *
 * Under the artifact's lock, each migrated log entry whose id is not yet in the log is appended (stamp and review entries first,
 * the revision-bearing entry last), and only then is the head replaced atomically. The head write appends nothing, so a head has
 * each migrated entry once however often this runs, and a crash between the two steps is finished by running it again.
 */

import { existsSync, readFileSync } from 'node:fs';

import { artifactJsonPath, writeAtomic } from '../storage.js';
import { legacyDeliveryView } from './legacy-view.js';
import { ConversionIncomplete } from './types.js';
import type { ConversionDeps, ConvertedHead } from './types.js';

/** Test seam: called between the appended entries and the head replace (a crash there is what the rerun repairs). */
export interface MigratedHeadSeams {
	readonly beforeHeadWrite?: (() => void) | undefined;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseOrUndefined(text: string): Obj | undefined {
	try { const v = JSON.parse(text) as unknown; return isObj(v) ? v : undefined; }
	catch { return undefined; }
}

/** Why the converted head would change what was stored (its revision number, status or approval), or undefined when it does not. */
function changedWhatWasStored(artifactId: string, stored: Obj, converted: Obj): string | undefined {
	const sMeta = isObj(stored['meta']) ? stored['meta'] : {};
	const cMeta = isObj(converted['meta']) ? converted['meta'] : {};
	if (sMeta['revision'] !== cMeta['revision']) return `meta.revision would change from ${String(sMeta['revision'])} to ${String(cMeta['revision'])}`;
	const cLife = isObj(cMeta['lifecycle']) ? cMeta['lifecycle'] : undefined;
	const sLife = isObj(sMeta['lifecycle']) ? sMeta['lifecycle'] : undefined;
	if (cLife === undefined) return 'the converted head has no lifecycle';
	const cRevision = isObj(cLife['revision']) ? cLife['revision']['number'] : undefined;
	const sRevision = sLife !== undefined && isObj(sLife['revision']) ? sLife['revision']['number'] : typeof sMeta['revision'] === 'number' ? sMeta['revision'] : 0;
	if (cRevision !== sRevision) return `the revision number would change from ${String(sRevision)} to ${String(cRevision)}`;
	if (sLife !== undefined && sLife['status'] !== cLife['status']) {
		// a draft lifecycle may become approved or rejected by the stamps the head still carries; nothing else may move
		const stamped = legacyDeliveryView([{ artifactId, json: stored }])[0]?.approval;
		const expected = stamped === 'approved' ? 'approved' : stamped === 'rejected' ? 'rejected' : undefined;
		if (!(sLife['status'] === 'draft' && cLife['status'] === expected)) return `the status would change from ${String(sLife['status'])} to ${String(cLife['status'])}`;
	}
	if (sLife === undefined) {
		const stamped = legacyDeliveryView([{ artifactId, json: stored }])[0]?.approval;
		const expected = stamped === 'approved' ? 'approved' : stamped === 'rejected' ? 'rejected' : 'draft';
		if (stamped !== undefined && cLife['status'] !== expected) return `the status ${String(cLife['status'])} does not follow the stored ${stamped} stamp`;
	}
	if (sLife !== undefined && isObj(sLife['approval']) && JSON.stringify(sLife['approval']) !== JSON.stringify(cLife['approval'])) return 'the approval would change';
	return undefined;
}

export async function writeMigratedHead(repo: string, converted: ConvertedHead, deps: ConversionDeps, seams: MigratedHeadSeams = {}): Promise<'written' | 'unchanged'> {
	const id = converted.artifactId;
	const path = artifactJsonPath(repo, id);
	return deps.store.exclusive(id, async () => {
		const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
		const stored = current === undefined ? undefined : parseOrUndefined(current);
		const next = parseOrUndefined(converted.bytes);
		if (stored === undefined || next === undefined) throw new ConversionIncomplete(`${id} cannot be converted: the stored head or the converted head is not a JSON object`, [{ artifactId: id, reason: 'not a JSON object' }]);

		// A head that is already the converted one is only checked against the log below; any other must keep what was stored.
		if (current !== converted.bytes) {
			const reason = changedWhatWasStored(id, stored, next);
			if (reason !== undefined) throw new ConversionIncomplete(`${id} was not converted: ${reason}`, [{ artifactId: id, reason }]);
		}

		let changed = false;
		const have = new Set((await deps.history.log(id)).map(e => e.id));
		for (const entry of converted.entries) {
			if (have.has(entry.id)) continue;
			await deps.history.appendLog(id, entry);
			have.add(entry.id);
			changed = true;
		}
		seams.beforeHeadWrite?.();
		if (current !== converted.bytes) {
			writeAtomic(path, converted.bytes);
			changed = true;
		}
		return changed ? 'written' : 'unchanged';
	});
}
