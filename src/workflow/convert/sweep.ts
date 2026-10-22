/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The sweep after the rules have run: every head must decode, hold none of the legacy fields (`meta.rangeBase` is kept on purpose),
 * and pass `checkHeadIntegrity` against its own content and `checkIntegrity` against its log. A head that fails is listed with
 * the reason; the marker is written only when none does.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkHeadIntegrity, checkIntegrity } from '../artifact-core/lifecycle.js';
import { decodeArtifactHead } from '../artifact-core/decode.js';
import type { History } from '../artifact-core/history.js';
import { ARTIFACTS_DIR } from '../storage.js';
import { LEGACY_META_FIELDS } from './backfill.js';

export interface SweepProblem { readonly artifactId: string; readonly reason: string }
export interface SweepReport {
	/** Heads examined. */
	readonly heads:    number;
	readonly problems: readonly SweepProblem[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function sweepHeads(repo: string, history: History): Promise<SweepReport> {
	const dir = join(repo, ARTIFACTS_DIR);
	const names = readdirSync(dir).filter(n => n.endsWith('.json')).sort();
	const problems: SweepProblem[] = [];
	for (const name of names) {
		const artifactId = name.slice(0, -'.json'.length);
		const fail = (reason: string): void => { problems.push({ artifactId, reason }); };
		let text: string;
		try { text = readFileSync(join(dir, name), 'utf8'); } catch (err) { fail(`cannot be read (${(err as Error).message})`); continue; }
		let decoded: ReturnType<typeof decodeArtifactHead>;
		try { decoded = decodeArtifactHead(artifactId, text); } catch (err) { fail(`does not decode (${(err as Error).message})`); continue; }

		const meta = decoded.head.meta as Obj;
		const left = LEGACY_META_FIELDS.filter(f => meta[f] !== undefined);
		if (isObj(decoded.head.body) && (decoded.head.body as Obj)['feedback'] !== undefined && /^(DEF|HLD|LLD|PLAN|EXT|ISSUE|SPEC)-/.test(artifactId)) left.push('body.feedback' as never);
		if (meta['lifecycle'] === undefined || meta['envelope'] === undefined) left.push('lifecycle' as never);
		if (left.length > 0) { fail(`still carries ${left.join(', ')}`); continue; }

		const view = { description: decoded.artifact.description, payload: decoded.artifact.payload, lifecycle: decoded.artifact.lifecycle };
		const own = checkHeadIntegrity(view);
		if (!own.ok) { fail(`fails the integrity check of its own content (${own.reason})`); continue; }
		try {
			const integrity = checkIntegrity(view, await history.log(artifactId));
			if (!integrity.ok) fail(`fails the integrity check against its log (${integrity.reason})`);
		} catch (err) { fail(`its log cannot be read (${(err as Error).message})`); }
	}
	return { heads: names.length, problems };
}
