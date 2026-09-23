/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Curated cloud model catalog — the sc1 CuratedCatalog contract
 * (Epic ba132c185fe45860, Story S001).
 *
 * A maintainer-curated JSON asset (src/assets/models/cloud-model-catalog.json,
 * shipped to out/assets/models/ by copy-assets.mjs's `assets` membership) lists
 * the selectable cli-claude / cli-codex models. It is loaded + validated at boot
 * — modelled on src/docgen/asset-validator.ts (validateDocgenAssets) — so a
 * missing / malformed catalog is a fail-fast startup refusal (the daemon logs +
 * exits) rather than a silent empty cloud model list at first use.
 *
 * Read-only: readFile + JSON.parse + a structural schema check only. NO network,
 * NO cloud REST (k1 — cloud model lists come only from this in-repo asset, never
 * a provider API), NO config.json read/write and NOT part of the CONFIG_CATALOG
 * reconcile system (k5/lc1). ollama is intentionally NOT catalogued here — it is
 * S002's live-query branch; CloudProvider covers only the two cloud runners.
 *
 * The daemon-side accessor S002 consumes is getCuratedCatalog(): after boot
 * validation it serves modelsFor(provider) from the frozen parse with no
 * further I/O.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getLogger } from '../shared/logger.js';

const log = getLogger('daemon:model-catalog');

/** The two cloud providers the curated catalog covers — a subset of the tier
 *  runner enum ['ollama','cli-claude','cli-codex'] (k3). ollama is NOT here. */
export type CloudProvider = 'cli-claude' | 'cli-codex';

/** One catalogued model entry. `id` is the exact model identifier a tier's
 *  `model` field is set to; `displayName` is an optional human label. */
export interface CatalogModel {
	readonly id:           string;
	readonly displayName?: string;
}

/** The on-disk JSON asset shape (the sc1 file contract). */
export interface CloudModelCatalogFile {
	readonly version:   number;
	readonly providers: {
		readonly 'cli-claude': readonly CatalogModel[];
		readonly 'cli-codex':  readonly CatalogModel[];
	};
}

/** The daemon-side accessor S002 consumes over the boot-validated catalog. */
export interface CuratedCatalog {
	/** The curated models for a cloud provider — an empty array when the catalog
	 *  lists none for it (validation requires both provider keys to be present as
	 *  arrays, so "empty" means an explicitly-empty array, not an omitted key). */
	modelsFor(provider: CloudProvider): readonly CatalogModel[];
}

/** Thrown when the curated catalog asset is missing / unreadable / malformed /
 *  schema-invalid. Carries one actionable 'Fix:' line naming the copy-assets
 *  ship step, mirroring DocgenAssetValidationError. */
export class ModelCatalogValidationError extends Error {
	readonly path:   string;
	readonly reason: string;

	constructor(path: string, reason: string) {
		super(
			`model-catalog: cloud model catalog validation failed:\n  - ${path} (${reason})\n` +
				'Fix: rebuild so src/assets/models/cloud-model-catalog.json ships via copy-assets.mjs ' +
				'into out/assets/models/.',
		);
		this.name   = 'ModelCatalogValidationError';
		this.path   = path;
		this.reason = reason;
	}
}

/** The catalog filename under the models asset dir. */
const CATALOG_FILE = 'cloud-model-catalog.json';

/** The default models asset dir: out/assets/models when built, src/assets/models
 *  under tsx — resolved from import.meta.url the same way the docgen resolver is,
 *  so the validator + any reader can never disagree about the location. */
export const MODEL_CATALOG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'models');

let assetDirOverride: string | undefined;
/** Test-only: point the loader at a temp asset dir (mirrors _setDocgenAssetDirForTests). */
export function _setModelCatalogDirForTests(dir?: string): void { assetDirOverride = dir; cached = undefined; }
/** The resolved models asset dir (honouring the test override). */
export function modelCatalogDir(): string { return assetDirOverride ?? MODEL_CATALOG_DIR; }

/** The frozen, boot-validated catalog — undefined until validateModelCatalog runs. */
let cached: CloudModelCatalogFile | undefined;
/** Test-only: drop the cached parse so the next validate re-reads. */
export function _resetModelCatalogForTests(): void { cached = undefined; }

/** Structurally validate an unknown parsed value against CloudModelCatalogFile.
 *  Returns the frozen catalog, or throws ModelCatalogValidationError naming the
 *  first structural failure (short-circuits). Unknown/extra `providers` keys are
 *  currently ignored (only the two cloud-provider keys are read); a stricter
 *  reject-unknown-keys pass can be added when S002 consumes this. */
function validateShape(parsed: unknown, path: string): CloudModelCatalogFile {
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new ModelCatalogValidationError(path, 'catalog is not a JSON object');
	}
	const root = parsed as Record<string, unknown>;
	if (typeof root['version'] !== 'number') {
		throw new ModelCatalogValidationError(path, 'missing or non-numeric `version`');
	}
	const providers = root['providers'];
	if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) {
		throw new ModelCatalogValidationError(path, '`providers` is not an object');
	}
	const provMap = providers as Record<string, unknown>;
	const frozenProviders: Record<CloudProvider, readonly CatalogModel[]> = {
		'cli-claude': [],
		'cli-codex':  [],
	};
	for (const provider of ['cli-claude', 'cli-codex'] as const) {
		const entries = provMap[provider];
		if (!Array.isArray(entries)) {
			throw new ModelCatalogValidationError(path, `\`providers.${provider}\` is not an array`);
		}
		const models: CatalogModel[] = [];
		for (const entry of entries) {
			if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
				throw new ModelCatalogValidationError(path, `an entry in \`providers.${provider}\` is not an object`);
			}
			const e = entry as Record<string, unknown>;
			if (typeof e['id'] !== 'string' || e['id'].length === 0) {
				throw new ModelCatalogValidationError(path, `an entry in \`providers.${provider}\` has a missing or non-string \`id\``);
			}
			if (e['displayName'] !== undefined && typeof e['displayName'] !== 'string') {
				throw new ModelCatalogValidationError(path, `\`displayName\` of \`${e['id']}\` (${provider}) is not a string`);
			}
			const model: CatalogModel =
				typeof e['displayName'] === 'string'
					? { id: e['id'], displayName: e['displayName'] }
					: { id: e['id'] };
			models.push(Object.freeze(model));
		}
		frozenProviders[provider] = Object.freeze(models);
	}
	return Object.freeze({
		version:   root['version'] as number,
		providers: Object.freeze(frozenProviders) as CloudModelCatalogFile['providers'],
	});
}

/**
 * Validate the curated cloud model catalog. Reads the shipped asset, JSON-parses
 * it, structurally validates it against CloudModelCatalogFile, and caches the
 * frozen parse. Returns silently on success; otherwise throws a single
 * ModelCatalogValidationError naming the file + a copy-assets Fix: line (ac1).
 * A missing/unreadable file and a non-JSON / schema-invalid one both throw.
 */
export async function validateModelCatalog(): Promise<void> {
	const path = join(modelCatalogDir(), CATALOG_FILE);

	let raw: string;
	try {
		raw = await readFile(path, 'utf8');
	} catch (err) {
		const e = err as NodeJS.ErrnoException;
		const reason = e.code === 'ENOENT' ? 'file not found' : `unreadable: ${e.message}`;
		throw new ModelCatalogValidationError(path, reason);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		throw new ModelCatalogValidationError(path, `malformed JSON: ${(err as Error).message}`);
	}

	cached = validateShape(parsed, path);
	log.info(
		{
			dir:       modelCatalogDir(),
			version:   cached.version,
			cliClaude: cached.providers['cli-claude'].length,
			cliCodex:  cached.providers['cli-codex'].length,
		},
		'cloud model catalog validated',
	);
}

/**
 * Get the singleton CuratedCatalog accessor over the boot-validated catalog.
 * Throws when called before validateModelCatalog populated the cache — a
 * boot-ordering bug (distinct from a bad catalog), never reached in correct
 * boot order.
 */
export function getCuratedCatalog(): CuratedCatalog {
	if (cached === undefined) {
		throw new Error(
			'model-catalog: getCuratedCatalog() called before validateModelCatalog() ran at boot ' +
				'(daemon boot-ordering bug).',
		);
	}
	const catalog = cached;
	return {
		modelsFor(provider: CloudProvider): readonly CatalogModel[] {
			return catalog.providers[provider];
		},
	};
}
