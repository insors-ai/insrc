/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Model definitions file — the sc1 ModelDefinitionsFile contract (Epic
 * ce99b72065d03b1b, Story s1), grown in place from the curated cloud model
 * catalog (Epic ba132c185fe45860).
 *
 * A maintainer-curated JSON asset (src/assets/models/cloud-model-catalog.json,
 * shipped to out/assets/models/ by copy-assets.mjs's `assets` membership)
 * defines, for each model family (cli-claude, cli-codex, ollama, ollama-claude),
 * its CLI kind, its models with aliases, accepted efforts and input limits, its
 * tier defaults and summariser model, the Ollama tool-loop model and the default
 * family. ollama-claude (Epic b220bb61, Story s1) runs the claude CLI against
 * Ollama: it carries `host: 'ollama'` and marks every model cloud or local.
 *
 * validateModelCatalog() is the one synchronous loader: it reads, parses and
 * fully validates the file once per thread, caches the frozen parse and returns
 * it. A missing / malformed / rule-breaking file throws
 * ModelCatalogValidationError naming the entry — a fail-fast refusal at boot and
 * at worker start. The per-thread registry (model-registry.ts) is built over it.
 *
 * Read-only: readFileSync + JSON.parse + the rule check only. NO network, NO
 * cloud REST, NO config.json read/write.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TierName } from '../config/analyze.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('daemon:model-catalog');

/** The model families: vendor CLI families, ollama, and Ollama-hosted CLI families. */
export type FamilyId = 'cli-claude' | 'cli-codex' | 'cli-vibe' | 'ollama' | 'ollama-claude';
/** The vendor CLI families — the only ones with tier defaults and a summariser. */
export type CliFamilyId = 'cli-claude' | 'cli-codex' | 'cli-vibe';
/** The Ollama-hosted CLI family: runs a vendor CLI against Ollama, no tier defaults. */
export type HostFamilyId = 'ollama-claude';
/** The server a host family's CLI runs against. */
export type FamilyHost = 'ollama';
/** Where a host-family model runs: Ollama's cloud or the local Ollama server. */
export type ModelHosting = 'cloud' | 'local';
/** An effort level name; the file is the authority for level names. */
export type EffortLevel = string;

export interface InputLimit {
	readonly unit: 'chars' | 'tokens';
	readonly max:  number;
}

export interface ModelDefinition {
	readonly id:           string;
	readonly aliases?:     readonly string[] | undefined;
	readonly displayName?: string | undefined;
	/** [] = no effort is passed. */
	readonly efforts:      readonly EffortLevel[];
	/** Required (in tokens) for ollama; absent on a CLI model = the CLI's own refusal decides. */
	readonly inputLimit?:  InputLimit | undefined;
	/** Ollama only, optional: approximate memory (MB) the model needs at its base
	 *  context, for Setup's sizing; absent = the recommender's generic estimate. */
	readonly memoryMb?:    number | undefined;
	/** Required on every model of a host family; absent elsewhere. */
	readonly hosting?:     ModelHosting | undefined;
}

/** `model` is an id or alias of the same family. */
export interface TierDefault {
	readonly model:   string;
	readonly effort?: EffortLevel | undefined;
}

export interface FamilyDefinition {
	readonly id:               FamilyId;
	readonly cliKind?:         'claude' | 'codex' | 'vibe' | undefined;
	/** Present only on a host family: its CLI runs against Ollama. */
	readonly host?:            FamilyHost | undefined;
	readonly displayName:      string;
	readonly models:           readonly ModelDefinition[];
	readonly tierDefaults?:    Readonly<Record<TierName, TierDefault>> | undefined;
	readonly summariserModel?: string | undefined;
	readonly toolLoopModel?:   string | undefined;
}

/** The on-disk JSON asset shape (the sc1 file contract). */
export interface ModelDefinitionsFile {
	readonly version:       number;
	readonly defaultFamily: CliFamilyId;
	/** Exactly one per FamilyId. */
	readonly families:      readonly FamilyDefinition[];
}

/** Thrown when the definitions asset is missing / unreadable / malformed /
 *  breaks a rule; `reason` names the faulty entry. Carries one actionable 'Fix:' line naming the copy-assets
 *  ship step, mirroring DocgenAssetValidationError. */
export class ModelCatalogValidationError extends Error {
	readonly path:   string;
	readonly reason: string;

	constructor(path: string, reason: string) {
		super(
			`model-catalog: model definitions validation failed:\n  - ${path} (${reason})\n` +
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
/** The resolved models asset dir: the in-process test override, else the
 *  test-only INSRC_MODEL_CATALOG_DIR environment value (which worker threads
 *  inherit, unlike the in-process override), else MODEL_CATALOG_DIR. */
export function modelCatalogDir(): string {
	return assetDirOverride ?? process.env['INSRC_MODEL_CATALOG_DIR'] ?? MODEL_CATALOG_DIR;
}

/** This thread's frozen, validated file — undefined until validateModelCatalog succeeds. */
let cached: ModelDefinitionsFile | undefined;
/** Test-only: drop the cached parse so the next validate re-reads. */
export function _resetModelCatalogForTests(): void { cached = undefined; }

const FAMILY_IDS: readonly FamilyId[] = ['cli-claude', 'cli-codex', 'cli-vibe', 'ollama', 'ollama-claude'];
const TIER_NAMES: readonly TierName[] = ['core', 'mid', 'cheap'];

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringList(v: unknown): v is string[] {
	return Array.isArray(v) && v.every(x => typeof x === 'string');
}

/** A vendor CLI family: tier defaults, summariser, no host. */
function isVendorFamily(id: FamilyId): id is CliFamilyId {
	return id === 'cli-claude' || id === 'cli-codex' || id === 'cli-vibe';
}

/** An Ollama-hosted CLI family: cliKind and host, hosting on every model. */
function isHostFamily(id: FamilyId): id is HostFamilyId {
	return id === 'ollama-claude';
}

/** The model a name (id or alias) resolves to within one family's models. */
function resolveName(models: readonly ModelDefinition[], name: string): ModelDefinition | undefined {
	return models.find(m => m.id === name || (m.aliases ?? []).includes(name));
}

/** Check one model entry; returns the frozen model. */
function validateModel(raw: unknown, at: string, fail: (reason: string) => never): ModelDefinition {
	if (!isObject(raw)) fail(`${at} is not an object`);
	const id = raw['id'];
	if (typeof id !== 'string' || id.length === 0) fail(`${at} has a missing or non-string id`);
	const where = `${at} '${id}'`;
	if (raw['aliases'] !== undefined && !isStringList(raw['aliases'])) fail(`${where}: aliases is not a list of strings`);
	if (raw['displayName'] !== undefined && typeof raw['displayName'] !== 'string') fail(`${where}: displayName is not a string`);
	if (!isStringList(raw['efforts'])) fail(`${where} has no efforts list`);
	let inputLimit: InputLimit | undefined;
	const limit = raw['inputLimit'];
	if (limit !== undefined) {
		if (!isObject(limit) || (limit['unit'] !== 'chars' && limit['unit'] !== 'tokens')
			|| typeof limit['max'] !== 'number' || !(limit['max'] > 0)) {
			fail(`${where}: inputLimit is not { unit: 'chars' | 'tokens', max: positive number }`);
		}
		inputLimit = Object.freeze({ unit: limit['unit'], max: limit['max'] });
	}
	const memoryMb = raw['memoryMb'];
	if (memoryMb !== undefined && (typeof memoryMb !== 'number' || !Number.isInteger(memoryMb) || memoryMb <= 0)) {
		fail(`${where}: memoryMb is not a positive whole number of MB`);
	}
	const hosting = raw['hosting'];
	if (hosting !== undefined && hosting !== 'cloud' && hosting !== 'local') fail(`${where}: hosting is not 'cloud' | 'local'`);
	return Object.freeze({
		id,
		...(raw['aliases'] !== undefined ? { aliases: Object.freeze([...raw['aliases'] as string[]]) } : {}),
		...(raw['displayName'] !== undefined ? { displayName: raw['displayName'] as string } : {}),
		efforts: Object.freeze([...raw['efforts']]),
		...(inputLimit !== undefined ? { inputLimit } : {}),
		...(memoryMb !== undefined ? { memoryMb } : {}),
		...(hosting !== undefined ? { hosting } : {}),
	});
}

/** Check one family entry against the sc1 rules; returns the frozen family. */
function validateFamily(raw: Json, index: number, fail: (reason: string) => never): FamilyDefinition {
	const id = raw['id'] as FamilyId;
	const at = `families[${index}] (${id})`;
	if (typeof raw['displayName'] !== 'string') fail(`${at}: displayName is missing or not a string`);
	const cli = isVendorFamily(id);
	const hosted = isHostFamily(id);
	if (cli || hosted) {
		if (raw['cliKind'] !== 'claude' && raw['cliKind'] !== 'codex' && raw['cliKind'] !== 'vibe') fail(`${at}: cliKind is missing or not 'claude' | 'codex' | 'vibe'`);
	}
	if (cli) {
		if (!isObject(raw['tierDefaults'])) fail(`${at}: tierDefaults is missing`);
		if (typeof raw['summariserModel'] !== 'string') fail(`${at}: summariserModel is missing`);
	}
	if (hosted) {
		if (raw['host'] !== 'ollama') fail(`${at}: host is missing or not 'ollama'`);
		if (raw['tierDefaults'] !== undefined) fail(`${at}: tierDefaults is not allowed on an Ollama-hosted family`);
		if (raw['summariserModel'] !== undefined) fail(`${at}: summariserModel is not allowed on an Ollama-hosted family`);
	} else if (raw['host'] !== undefined) {
		fail(`${at}: host is only allowed on an Ollama-hosted family`);
	}
	if (!Array.isArray(raw['models'])) fail(`${at}: models is not a list`);
	const models = (raw['models'] as unknown[]).map((m, i) => validateModel(m, `${at}: models[${i}]`, fail));

	for (const m of models) {
		if (hosted && m.hosting === undefined) fail(`${at}: model '${m.id}' has no hosting ('cloud' | 'local')`);
		if (!hosted && m.hosting !== undefined) fail(`${at}: model '${m.id}' has hosting, which only Ollama-hosted families take`);
		if (hosted && m.memoryMb !== undefined) fail(`${at}: model '${m.id}' has memoryMb, which only Ollama models take`);
	}

	const names = new Set<string>();
	for (const m of models) {
		if (names.has(m.id)) fail(`${at}: duplicate id or alias '${m.id}'`);
		names.add(m.id);
		for (const alias of m.aliases ?? []) {
			if (names.has(alias)) fail(`${at}: duplicate id or alias '${alias}'`);
			names.add(alias);
		}
	}

	let tierDefaults: Readonly<Record<TierName, TierDefault>> | undefined;
	if (cli) {
		const td = raw['tierDefaults'] as Json;
		const out = {} as Record<TierName, TierDefault>;
		for (const tier of TIER_NAMES) {
			const d = td[tier];
			if (!isObject(d) || typeof d['model'] !== 'string') fail(`${at}: tierDefaults.${tier} is missing or has no model`);
			const target = resolveName(models, d['model']);
			if (target === undefined) fail(`${at}: tierDefaults.${tier}.model '${d['model']}' is not a model or alias of ${id}`);
			const effort = d['effort'];
			if (effort !== undefined) {
				if (typeof effort !== 'string' || !target.efforts.includes(effort)) {
					fail(`${at}: tierDefaults.${tier}.effort '${String(effort)}' is not an effort of ${target.id}`);
				}
			}
			out[tier] = Object.freeze({ model: d['model'], ...(effort !== undefined ? { effort } : {}) });
		}
		tierDefaults = Object.freeze(out);
		for (const m of models) {
			if (m.memoryMb !== undefined) fail(`${at}: model '${m.id}' has memoryMb, which only Ollama models take`);
		}
		const summariser = raw['summariserModel'] as string;
		if (resolveName(models, summariser) === undefined) {
			fail(`${at}: summariserModel '${summariser}' is not a model or alias of ${id}`);
		}
	} else if (!hosted) {
		for (const m of models) {
			if (m.inputLimit?.unit !== 'tokens') fail(`${at}: model '${m.id}' has no token inputLimit`);
		}
		const toolLoop = raw['toolLoopModel'];
		if (typeof toolLoop !== 'string' || !models.some(m => m.id === toolLoop)) {
			fail(`${at}: toolLoopModel '${String(toolLoop)}' is not a listed model id of ${id}`);
		}
	}

	return Object.freeze({
		id,
		...(cli || hosted ? { cliKind: raw['cliKind'] as 'claude' | 'codex' | 'vibe' } : {}),
		...(hosted ? { host: 'ollama' as const } : {}),
		displayName: raw['displayName'] as string,
		models: Object.freeze(models),
		...(tierDefaults !== undefined ? { tierDefaults } : {}),
		...(cli ? { summariserModel: raw['summariserModel'] as string } : {}),
		...(!cli && !hosted ? { toolLoopModel: raw['toolLoopModel'] as string } : {}),
	});
}

/** Validate an unknown parsed value against the sc1 rules, in file order; the
 *  first failure throws ModelCatalogValidationError naming the entry and rule.
 *  Returns the frozen file. */
function validateShape(parsed: unknown, path: string): ModelDefinitionsFile {
	const fail = (reason: string): never => { throw new ModelCatalogValidationError(path, reason); };
	if (!isObject(parsed)) fail('the file is not a JSON object');
	const root = parsed as Json;
	if (typeof root['version'] !== 'number') fail('missing or non-numeric `version`');
	const defaultFamily = root['defaultFamily'];
	if (defaultFamily !== 'cli-claude' && defaultFamily !== 'cli-codex' && defaultFamily !== 'cli-vibe') {
		fail(`defaultFamily '${String(defaultFamily)}' is not a CLI family (cli-claude | cli-codex | cli-vibe)`);
	}
	if (!Array.isArray(root['families'])) fail('`families` is not a list');
	const rawFamilies = root['families'] as unknown[];

	const seen = new Set<string>();
	rawFamilies.forEach((f, i) => {
		if (!isObject(f)) fail(`families[${i}] is not an object`);
		const id = (f as Json)['id'];
		if (typeof id !== 'string' || !(FAMILY_IDS as readonly string[]).includes(id)) {
			fail(`families[${i}]: unknown family id '${String(id)}'`);
		}
		if (seen.has(id as string)) fail(`families[${i}]: family '${String(id)}' is repeated`);
		seen.add(id as string);
	});
	for (const id of FAMILY_IDS) {
		if (!seen.has(id)) fail(`families: family '${id}' is missing`);
	}

	const families = rawFamilies.map((f, i) => validateFamily(f as Json, i, fail));
	return Object.freeze({
		version:       root['version'] as number,
		defaultFamily: defaultFamily as CliFamilyId,
		families:      Object.freeze(families),
	});
}

/**
 * Load the model definitions file: read the shipped asset synchronously, parse
 * it, validate every sc1 rule and cache the frozen file for this thread. Later
 * calls in the same thread return the cached file without reading again.
 * Throws ModelCatalogValidationError naming the file and the faulty entry when
 * the file is missing, unreadable, not JSON or breaks a rule; nothing is cached
 * on failure.
 */
export function validateModelCatalog(): ModelDefinitionsFile {
	if (cached !== undefined) return cached;
	const path = join(modelCatalogDir(), CATALOG_FILE);

	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
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

	const file = validateShape(parsed, path);
	cached = file;
	log.info(
		{
			dir:     modelCatalogDir(),
			version: file.version,
			models:  Object.fromEntries(file.families.map(f => [f.id, f.models.length])),
		},
		'model definitions validated',
	);
	return file;
}
