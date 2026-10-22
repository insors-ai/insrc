/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Reads every stored artifact file as the conversion sees it: raw parsed JSON, never passed through the strict decoder (which
 * refuses the legacy shapes the conversion exists to repair). A file that cannot be used is a problem in the result, never a
 * skipped file: the plan lists it and an apply refuses while one is open.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ARTIFACTS_DIR } from '../storage.js';
import type { ConversionProblem, RawHead } from './types.js';

/** The kinds a file name may start with: the delivery kinds, the Story test record, and the kinds the common model added. */
const KINDS: ReadonlySet<string> = new Set([
	'SPEC', 'DEF', 'HLD', 'LLD', 'PLAN', 'BUILD', 'CR', 'ISSUE', 'EXT', 'AMD', 'TESTS', 'EPIC', 'STORY', 'TASK', 'TASKS', 'DIAG',
]);

const CONFLICT_MARKER = /^(<{7}|={7}|>{7})( |$)/m;

export interface RawRead {
	readonly heads:    readonly RawHead[];
	readonly problems: readonly ConversionProblem[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every `.json` head under `.insrc/artifacts`, sorted by file name; line files and other extensions are not heads. */
export function readRawHeads(repo: string): RawRead {
	const dir = join(repo, ARTIFACTS_DIR);
	if (!existsSync(dir)) return { heads: [], problems: [] };
	const heads: RawHead[] = [];
	const problems: ConversionProblem[] = [];
	for (const name of readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
		const file = `${ARTIFACTS_DIR}/${name}`;
		const artifactId = name.slice(0, -'.json'.length);
		const kind = artifactId.split('-')[0] ?? '';
		if (!KINDS.has(kind)) { problems.push({ file, reason: `no artifact kind for the prefix '${kind}'` }); continue; }
		let raw: string;
		try { raw = readFileSync(join(dir, name), 'utf8'); }
		catch (err) { problems.push({ file, reason: `cannot be read (${(err as Error).message})` }); continue; }
		if (CONFLICT_MARKER.test(raw)) { problems.push({ file, reason: 'has merge conflict markers' }); continue; }
		let json: unknown;
		try { json = JSON.parse(raw); }
		catch (err) { problems.push({ file, reason: `is not valid JSON (${(err as Error).message})` }); continue; }
		if (!isObj(json)) { problems.push({ file, reason: 'is not a JSON object' }); continue; }
		// a flat amendment is the one record with no meta and body; every other kind needs both
		const flatAmendment = kind === 'AMD' && !isObj(json['meta']);
		if (!flatAmendment && (!isObj(json['meta']) || !isObj(json['body']))) {
			problems.push({ file, reason: isObj(json['meta']) ? 'has meta but no body object' : 'has no meta and body objects' });
			continue;
		}
		heads.push({ artifactId, json });
	}
	return { heads, problems };
}
