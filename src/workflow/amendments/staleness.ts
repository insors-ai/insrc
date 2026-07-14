/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD staleness scan — Phase E (post-hash migration).
 *
 * Given an Epic (by hash), walk every LLD under
 * `.insrc/artifacts/LLD-<epicHash>-<storyId>.json`, read the meta,
 * and compare each LLD's stored `hldEffectiveHash` against the
 * current effective hash.
 *
 * Staleness reasons (workflow-design.md §11.6):
 *   - `hld-rerun`         — the base HLD was re-run
 *   - `amendment-<id>`   — a specific amendment landed
 *   - `up-to-date`        — no staleness (returned as `stale=false`)
 *
 * "amendment-<id>" identifies the FIRST approved amendment whose
 * id isn't in the LLD's `hldAmendmentsApplied` list. In practice
 * this points at the change the LLD needs to catch up on.
 *
 * The scanner is READ-ONLY. It does not mutate LLD artifacts.
 * The caller (`insrc workflow status`) uses the result to
 * present + suggest actions.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { HldArtifact } from '../artifacts/hld.js';
import type { LldArtifact } from '../artifacts/lld.js';
import { computeHldEffectiveHash } from '../artifacts/lld.js';
import { amendmentsRootDir, lldFilenamePrefix } from '../storage.js';
import { listApprovedAmendments } from './store.js';

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export interface StaleLldEntry {
	readonly path:              string;      // absolute path to the LLD json
	readonly storyId:           string;
	readonly stale:             boolean;
	readonly staleReason?:      string;
	readonly currentEffective:  string;
	readonly storedEffective:   string;
	readonly ackedStale?:       { readonly at: string; readonly reason: string };
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/** Scan every LLD under `.insrc/artifacts/LLD-<epicHash>-*.json`
 *  and return one entry per LLD.
 *
 *  Does not throw when an LLD is missing metadata; instead marks
 *  it stale with `reason='malformed'`. */
export function scanLldStaleness(
	repoPath: string,
	epicHash: string,
	baseHld:  HldArtifact,
): readonly StaleLldEntry[] {
	const dir = amendmentsRootDir(repoPath);   // same root as amendments
	if (!existsSync(dir)) return [];
	const prefix = lldFilenamePrefix(epicHash);
	const amendments = listApprovedAmendments(repoPath, epicHash);
	const currentEffective = computeHldEffectiveHash(baseHld.meta.runId, amendments.map(a => a.id));

	const out: StaleLldEntry[] = [];
	for (const name of readdirSync(dir)) {
		if (!name.endsWith('.json')) continue;
		if (!name.startsWith(prefix)) continue;
		const storyIdFromName = name.slice(prefix.length, -'.json'.length);
		const path = join(dir, name);
		let raw: string;
		try {
			raw = readFileSync(path, 'utf8');
		} catch { continue; }
		let doc: unknown;
		try {
			doc = JSON.parse(raw);
		} catch {
			out.push({ path, storyId: storyIdFromName, stale: true, staleReason: 'malformed', currentEffective, storedEffective: '' });
			continue;
		}
		const artifact = doc as LldArtifact;
		if (typeof artifact !== 'object' || artifact === null || typeof artifact.meta !== 'object' || artifact.meta === null) {
			out.push({ path, storyId: storyIdFromName, stale: true, staleReason: 'malformed', currentEffective, storedEffective: '' });
			continue;
		}
		const meta = artifact.meta;
		if (typeof meta.hldEffectiveHash !== 'string' || typeof meta.hldBaseRunId !== 'string') {
			out.push({ path, storyId: meta.storyId ?? storyIdFromName, stale: true, staleReason: 'malformed', currentEffective, storedEffective: '' });
			continue;
		}
		const storyId = meta.storyId ?? storyIdFromName;
		const metaExt = meta as unknown as { staleAckedAt?: string; staleAckedReason?: string };
		const ackedStale = metaExt.staleAckedAt !== undefined
			? { at: metaExt.staleAckedAt, reason: metaExt.staleAckedReason ?? '' }
			: undefined;

		if (meta.hldEffectiveHash === currentEffective) {
			out.push({ path, storyId, stale: false, currentEffective, storedEffective: meta.hldEffectiveHash, ...(ackedStale !== undefined ? { ackedStale } : {}) });
			continue;
		}
		let reason: string;
		if (meta.hldBaseRunId !== baseHld.meta.runId) {
			reason = 'hld-rerun';
		} else {
			const applied = new Set(meta.hldAmendmentsApplied ?? []);
			const missing = amendments.find(a => !applied.has(a.id));
			reason = missing !== undefined ? `amendment-${missing.id}` : 'unknown';
		}
		out.push({ path, storyId, stale: true, staleReason: reason, currentEffective, storedEffective: meta.hldEffectiveHash, ...(ackedStale !== undefined ? { ackedStale } : {}) });
	}
	return out;
}

// ---------------------------------------------------------------------------
// Ack helpers
// ---------------------------------------------------------------------------

/** Record a staleness override on the LLD artifact meta. Returns
 *  the record shape written into `meta.staleAckedAt` +
 *  `meta.staleAckedReason` so the CLI can print a receipt. */
export interface StaleAck {
	readonly staleAckedAt:      string;
	readonly staleAckedReason:  string;
}

export function makeStaleAck(reason: string): StaleAck {
	if (typeof reason !== 'string' || reason.trim().length === 0) {
		throw new Error(`ack-stale reason is required`);
	}
	return { staleAckedAt: new Date().toISOString(), staleAckedReason: reason };
}
