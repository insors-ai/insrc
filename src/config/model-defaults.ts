/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Display and fill-in defaults derived from the shipped model definitions
 * (Epic ce99b72065d03b1b, Story s3).
 *
 * The shipped definitions file is imported as a JSON module, so a
 * syntactically broken file fails tsc; its structure is checked by the build
 * gate (scripts/check-model-definitions.mjs) and, at run time, by the daemon's
 * validateModelCatalog(). This module only DERIVES defaults from it — the
 * settings catalog rows, local.ts's coreModel default and the temporary
 * DEFAULT_TIERS / TIER_EFFORTS exports — and the derivation never throws: a
 * missing field yields '' or no default. Every run-time model decision in the
 * daemon goes through the validated registry instead.
 *
 * Imports only the JSON and type-only modules (no logger, no registry, no
 * file I/O), so the settings catalog's import chain stays loadable at module
 * load in the daemon, the TUI and the VS Code bundle.
 */

import SHIPPED_JSON from '../assets/models/cloud-model-catalog.json' with { type: 'json' };
import type { ModelDefinitionsFile } from '../daemon/model-catalog.js';
import type { TierName } from './analyze.js';

/** The shipped definitions file, as imported (not validated). */
export const SHIPPED_DEFINITIONS = SHIPPED_JSON as unknown as ModelDefinitionsFile;

/** One tier's defaults; '' where the definitions name nothing. */
export interface DerivedTierDefault {
	readonly runner: string;
	readonly model:  string;
	readonly effort: string;
}

export interface DerivedModelDefaults {
	/** The family ids, in file order. */
	readonly familyIds:     readonly string[];
	readonly defaultFamily: string;
	/** The default family's tier defaults. */
	readonly tiers:         Readonly<Record<TierName, DerivedTierDefault>>;
	/** The de-duplicated efforts of every shipped model, in file order. */
	readonly efforts:       readonly string[];
	/** The ollama family's tool-loop model. */
	readonly toolLoopModel: string;
}

const TIERS: readonly TierName[] = ['core', 'mid', 'cheap'];

const str = (x: unknown): string => (typeof x === 'string' ? x : '');
const list = (x: unknown): readonly unknown[] => (Array.isArray(x) ? x : []);
const obj = (x: unknown): Record<string, unknown> =>
	(typeof x === 'object' && x !== null && !Array.isArray(x) ? x as Record<string, unknown> : {});

/** Derive the defaults from a definitions file. Never throws. */
export function deriveModelDefaults(defs: ModelDefinitionsFile): DerivedModelDefaults {
	const file = obj(defs);
	const families = list(file['families']).map(obj);
	const familyIds = families.map(f => str(f['id'])).filter(id => id !== '');
	const defaultFamily = str(file['defaultFamily']);
	const def = families.find(f => str(f['id']) === defaultFamily) ?? {};
	const tierDefaults = obj(def['tierDefaults']);

	const tiers = {} as Record<TierName, DerivedTierDefault>;
	for (const tier of TIERS) {
		const t = obj(tierDefaults[tier]);
		tiers[tier] = { runner: defaultFamily, model: str(t['model']), effort: str(t['effort']) };
	}

	const efforts: string[] = [];
	for (const f of families) {
		for (const m of list(f['models'])) {
			for (const e of list(obj(m)['efforts'])) {
				if (typeof e === 'string' && e !== '' && !efforts.includes(e)) efforts.push(e);
			}
		}
	}

	// The local family: the one without a CLI kind.
	const local = families.find(f => f['cliKind'] === undefined && str(f['id']) !== '') ?? {};
	return { familyIds, defaultFamily, tiers, efforts, toolLoopModel: str(local['toolLoopModel']) };
}

/** The shipped definitions' defaults. */
export const SHIPPED_MODEL_DEFAULTS: DerivedModelDefaults = deriveModelDefaults(SHIPPED_DEFINITIONS);
