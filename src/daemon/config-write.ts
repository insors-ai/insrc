/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The model rules of `config.write` (Epic ce99b72065d03b1b, Story s3 · sc5).
 *
 * The write is applied to a candidate copy of config.json first. It is refused
 * when a tier whose runner or model the write changed — by a model leaf, a
 * runner leaf, a whole-tier object or a parent object such as `models` — names
 * a model the user rejected in that tier's family and the family does not serve
 * (a rejected model a later definitions file lists is accepted, as resolution
 * and models.definitions treat it). An accepted write reports restartRequired
 * when a restart-sensitive model setting differs between the config before and
 * the candidate after.
 *
 * Tiers are global (k6): a write is also refused when it adds or changes a
 * per-repo tier (models.byRepo.<repo>.tiers) — directly or through a parent
 * object — naming each such key. Per-repo tiers already in config.json are left
 * alone (the next boot's reconcile prunes them), and removing one is accepted.
 * Pure: no file I/O.
 */

import { setConfigAtPath } from '../config/write-path.js';
import type { CliFamilyId, FamilyId } from './model-catalog.js';
import type { ModelRegistry } from './model-registry.js';

export type ConfigWriteResult =
	| { readonly ok: true; readonly restartRequired?: boolean | undefined }
	| { readonly ok: false; readonly reason?: 'invalid-path' | 'rejected-model' | 'per-repo-tier' | undefined; readonly detail?: string | undefined };

const TIERS = ['core', 'mid', 'cheap'] as const;

/** The settings a running daemon reads once: changing one takes a restart. */
const RESTART_SENSITIVE: readonly (readonly string[])[] = [
	['models', 'tiers'],
	['models', 'tasks'],
	['models', 'coreFloor'],
	['models', 'byRepo'],
	['models', 'local', 'coreModel'],
];

function at(root: unknown, keys: readonly string[]): unknown {
	let v = root;
	for (const k of keys) {
		if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
		v = (v as Record<string, unknown>)[k];
	}
	return v;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The per-repo tier keys a write adds or changes (removing one is not a change here). */
function perRepoTierChanges(before: unknown, after: unknown): string[] {
	const repos = (root: unknown): string[] => {
		const byRepo = at(root, ['models', 'byRepo']);
		return typeof byRepo === 'object' && byRepo !== null && !Array.isArray(byRepo) ? Object.keys(byRepo) : [];
	};
	return [...new Set([...repos(before), ...repos(after)])].filter(repo => {
		const next = at(after, ['models', 'byRepo', repo, 'tiers']);
		// undefined / null (config unset writes null) = the tier was removed, which is accepted.
		return next !== undefined && next !== null && !same(at(before, ['models', 'byRepo', repo, 'tiers']), next);
	}).map(repo => `models.byRepo.${repo}.tiers`);
}

/** The model a tier names when it is effectively rejected in its family, else undefined. */
function rejectedIn(registry: ModelRegistry, tier: unknown): { family: FamilyId; model: string } | undefined {
	const runner = at(tier, ['runner']);
	const model = at(tier, ['model']);
	if (typeof runner !== 'string' || typeof model !== 'string') return undefined;
	const family = registry.families().find(f => f.id === runner);
	// Only a vendor CLI family (a CLI kind and no host) carries rejected ids.
	if (family === undefined || registry.cliKind(family.id) === undefined || registry.host(family.id) !== undefined) return undefined;
	const rejected = registry.rejected(family.id as CliFamilyId).includes(model);
	return rejected && registry.find(family.id, model) === undefined ? { family: family.id, model } : undefined;
}

/**
 * Apply one write to a copy of `config`. Returns the candidate to persist with
 * the result, or the refusal (the caller writes nothing).
 */
export function applyConfigWrite(
	config:   Record<string, unknown>,
	path:     string | readonly string[],
	value:    unknown,
	registry: ModelRegistry,
): { readonly result: ConfigWriteResult; readonly candidate?: Record<string, unknown> | undefined } {
	const candidate = structuredClone(config);
	try {
		setConfigAtPath(candidate, path, value);
	} catch (err) {
		return { result: { ok: false, reason: 'invalid-path', detail: (err as Error).message } };
	}

	const repoTiers = perRepoTierChanges(config, candidate);
	if (repoTiers.length > 0) {
		return { result: { ok: false, reason: 'per-repo-tier', detail: `tiers are global (models.tiers); per-repo settings take only tasks and coreFloor — refused: ${repoTiers.join(', ')}` } };
	}

	for (const tier of TIERS) {
		const before = at(config, ['models', 'tiers', tier]);
		const after = at(candidate, ['models', 'tiers', tier]);
		const changed = !same(at(before, ['runner']), at(after, ['runner'])) || !same(at(before, ['model']), at(after, ['model']));
		const hit = changed ? rejectedIn(registry, after) : undefined;
		if (hit !== undefined) {
			return { result: { ok: false, reason: 'rejected-model', detail: `models.tiers.${tier}: model '${hit.model}' is rejected in ${hit.family}` } };
		}
	}

	const restartRequired = RESTART_SENSITIVE.some(keys => !same(at(config, keys), at(candidate, keys)));
	return { result: restartRequired ? { ok: true, restartRequired: true } : { ok: true }, candidate };
}
