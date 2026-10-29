/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ModelRegistry and the approved-model store — the sc2 contract (Epic
 * ce99b72065d03b1b, Story s1).
 *
 * The in-process view every daemon consumer asks about models, built from the
 * validated definitions file (validateModelCatalog) plus the per-user
 * approved-model store (PATHS.approvedModels), on the first call in a thread and
 * cached for the thread's life — like settings. A change on disk is seen only by
 * a thread that loads later, or after a restart.
 *
 * The store is read-only here (s4 writes it). A missing store is empty; an
 * unreadable / malformed store, or a bad entry, is logged and ignored. For each
 * (family, modelId) only the profile with the latest decidedAt counts; an
 * approved profile for a model the file already lists is shadowed (the shipped
 * definition wins).
 *
 * resolveTier applies decision A: a tier set to a model its family does not
 * list (or has rejected) falls back to the tier's default; it logs nothing —
 * callers (s3) log.
 */

import { readFileSync } from 'node:fs';

import type { TierName } from '../config/analyze.js';
import type { StepClient } from '../shared/step-context.js';
import { PATHS } from '../shared/paths.js';
import { getLogger } from '../shared/logger.js';
import {
	validateModelCatalog,
	_resetModelCatalogForTests,
	type CliFamilyId,
	type EffortLevel,
	type FamilyDefinition,
	type FamilyId,
	type InputLimit,
	type ModelDefinition,
	type ModelDefinitionsFile,
	type TierDefault,
} from './model-catalog.js';

const log = getLogger('daemon:model-registry');

/** One entry of the per-user approved-model store. */
export interface ApprovedProfile {
	readonly family:      CliFamilyId;
	readonly modelId:     string;
	readonly status:      'approved' | 'rejected';
	/** Approved only: the checked AND approved levels. */
	readonly efforts:     readonly EffortLevel[];
	readonly inputLimit?: InputLimit | undefined;
	readonly decidedAt:   string;
	readonly cliVersion:  string;
}

export interface ResolvedModel extends ModelDefinition {
	readonly family: FamilyId;
	readonly source: 'shipped' | 'user-approved';
}

export type FallbackReason = 'unlisted-model' | 'rejected-model';

export interface TierResolution {
	readonly family:         FamilyId;
	readonly model:          ResolvedModel;
	readonly effort?:        EffortLevel | undefined;
	readonly droppedEffort?: EffortLevel | undefined;
	readonly fallback?:      { readonly reason: FallbackReason; readonly requested: string } | undefined;
}

export interface TierSetting {
	readonly runner:  FamilyId;
	readonly model:   string;
	readonly effort?: EffortLevel | undefined;
}

export interface ModelRegistry {
	families(): readonly FamilyDefinition[];
	defaultFamily(): CliFamilyId;
	/** Listed models (file order) then effective approved profiles (decidedAt order). */
	models(family: FamilyId): readonly ResolvedModel[];
	/** Ids of effective rejected profiles. */
	rejected(family: CliFamilyId): readonly string[];
	/** Case-sensitive id or alias match within the family. */
	find(family: FamilyId, idOrAlias: string): ResolvedModel | undefined;
	tierDefault(family: CliFamilyId, tier: TierName): TierDefault;
	summariserModel(family: CliFamilyId): ResolvedModel;
	toolLoopModel(): ResolvedModel;
	cliKind(family: FamilyId): 'claude' | 'codex' | 'vibe' | undefined;
	/** De-duplicated union of every served model's efforts, by first appearance. */
	effortLevels(): readonly EffortLevel[];
	resolveTier(tier: TierName, setting: TierSetting): TierResolution;
}

/**
 * The family a calling client's identity implies (Claude Code → the family whose
 * cliKind is 'claude', Codex → 'codex'): the default family when its CLI kind
 * matches, else the first such family in file order; undefined for no client or
 * one no family runs. Daemon-owned: client processes forward only the identity.
 */
export function familyForClient(client: StepClient | undefined, registry: ModelRegistry = getModelRegistry()): FamilyId | undefined {
	if (client === undefined) return undefined;
	if (registry.cliKind(registry.defaultFamily()) === client) return registry.defaultFamily();
	return registry.families().find(f => f.cliKind === client)?.id;
}

let storePathOverride: string | undefined;
/** Test-only: read the store from another path (unit tests; workers use HOME). */
export function _setApprovedModelsPathForTests(path?: string): void { storePathOverride = path; registry = undefined; }
function storePath(): string { return storePathOverride ?? PATHS.approvedModels; }

/** This thread's registry — undefined until getModelRegistry() first succeeds. */
let registry: ModelRegistry | undefined;
/** Test-only: drop this thread's registry AND definitions file, standing in for a restart. */
export function _resetModelRegistryForTests(): void { registry = undefined; _resetModelCatalogForTests(); }

/**
 * This thread's ModelRegistry: built on the first call from validateModelCatalog()
 * plus the approved-model store, then cached. Throws ModelCatalogValidationError
 * (propagated) when the definitions file is bad; a bad store never throws.
 */
export function getModelRegistry(): ModelRegistry {
	if (registry === undefined) registry = buildModelRegistry(validateModelCatalog(), readStore(storePath()));
	return registry;
}

// ── the store reader ─────────────────────────────────────────────────────────

function isStringList(v: unknown): v is string[] {
	return Array.isArray(v) && v.every(x => typeof x === 'string');
}

/** Why an entry is not a valid ApprovedProfile, or undefined when it is. The
 *  store writer (model-check.ts) validates a new profile with the same rule. */
export function profileProblem(e: unknown): string | undefined {
	if (typeof e !== 'object' || e === null || Array.isArray(e)) return 'not an object';
	const p = e as Record<string, unknown>;
	if (p['family'] !== 'cli-claude' && p['family'] !== 'cli-codex' && p['family'] !== 'cli-vibe') return `unknown family '${String(p['family'])}'`;
	if (typeof p['modelId'] !== 'string' || p['modelId'].length === 0) return 'missing modelId';
	if (p['status'] !== 'approved' && p['status'] !== 'rejected') return `status '${String(p['status'])}' is not approved | rejected`;
	if (!isStringList(p['efforts'])) return 'efforts is not a list of strings';
	if (typeof p['decidedAt'] !== 'string' || Number.isNaN(Date.parse(p['decidedAt']))) return 'decidedAt is not a date';
	if (typeof p['cliVersion'] !== 'string') return 'missing cliVersion';
	const limit = p['inputLimit'];
	if (limit !== undefined) {
		const l = limit as Record<string, unknown>;
		if (typeof limit !== 'object' || limit === null || (l['unit'] !== 'chars' && l['unit'] !== 'tokens')
			|| typeof l['max'] !== 'number' || !(l['max'] > 0)) {
			return 'inputLimit is not { unit, max }';
		}
	}
	return undefined;
}

/** Read the store: the valid profiles in file order. Missing = []; anything bad is logged and skipped. */
function readStore(path: string): ApprovedProfile[] {
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch (err) {
		const e = err as NodeJS.ErrnoException;
		if (e.code !== 'ENOENT') log.warn({ path, reason: `unreadable: ${e.message}` }, 'approved-model store ignored');
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		log.warn({ path, reason: `malformed JSON: ${(err as Error).message}` }, 'approved-model store ignored');
		return [];
	}
	const root = parsed as Record<string, unknown> | null;
	if (typeof parsed !== 'object' || root === null || Array.isArray(parsed)
		|| typeof root['version'] !== 'number' || !Array.isArray(root['profiles'])) {
		log.warn({ path, reason: 'not { version, profiles[] }' }, 'approved-model store ignored');
		return [];
	}
	const out: ApprovedProfile[] = [];
	(root['profiles'] as unknown[]).forEach((entry, index) => {
		const problem = profileProblem(entry);
		if (problem !== undefined) {
			log.warn({ path, index, reason: problem }, 'approved-model store entry ignored');
			return;
		}
		out.push(entry as ApprovedProfile);
	});
	return out;
}

// ── the registry ─────────────────────────────────────────────────────────────

function nameMatches(m: ModelDefinition, name: string): boolean {
	return m.id === name || (m.aliases ?? []).includes(name);
}

/** The registry over a definitions file and approved-model profiles (pure: no
 *  file I/O). getModelRegistry builds it over the validated file and the store. */
export function buildModelRegistry(file: ModelDefinitionsFile, profiles: readonly ApprovedProfile[]): ModelRegistry {
	const familyOf = (id: FamilyId): FamilyDefinition => file.families.find(f => f.id === id)!;

	// Effective profiles: per (family, modelId) the latest decidedAt wins (a tie
	// goes to the later entry); every other profile for that model is ignored.
	const effective = new Map<string, ApprovedProfile>();
	for (const p of profiles) {
		const key = `${p.family}\u0000${p.modelId}`;
		const prev = effective.get(key);
		if (prev !== undefined) {
			const keepNew = Date.parse(p.decidedAt) >= Date.parse(prev.decidedAt);
			const ignored = keepNew ? prev : p;
			log.info({ family: p.family, modelId: p.modelId, ignoredDecidedAt: ignored.decidedAt },
				'approved-model profile superseded by a later decision');
			if (!keepNew) continue;
		}
		effective.set(key, p);
	}
	const byDecision = [...effective.values()].sort((a, b) => Date.parse(a.decidedAt) - Date.parse(b.decidedAt));

	const served = new Map<FamilyId, ResolvedModel[]>();
	const rejectedIds = new Map<CliFamilyId, string[]>([['cli-claude', []], ['cli-codex', []], ['cli-vibe', []]]);
	for (const f of file.families) {
		served.set(f.id, f.models.map(m => Object.freeze({ ...m, family: f.id, source: 'shipped' as const })));
	}
	for (const p of byDecision) {
		if (p.status === 'rejected') { rejectedIds.get(p.family)!.push(p.modelId); continue; }
		if (familyOf(p.family).models.some(m => nameMatches(m, p.modelId))) {
			log.info({ family: p.family, modelId: p.modelId }, 'approved profile shadowed by the shipped definition');
			continue;
		}
		served.get(p.family)!.push(Object.freeze({
			id:      p.modelId,
			efforts: Object.freeze([...p.efforts]),
			...(p.inputLimit !== undefined ? { inputLimit: Object.freeze({ ...p.inputLimit }) } : {}),
			family:  p.family,
			source:  'user-approved' as const,
		}));
	}
	for (const [id, list] of served) served.set(id, Object.freeze(list) as ResolvedModel[]);
	for (const [id, list] of rejectedIds) rejectedIds.set(id, Object.freeze(list) as string[]);

	const efforts: EffortLevel[] = [];
	for (const f of file.families) {
		for (const m of served.get(f.id)!) for (const e of m.efforts) if (!efforts.includes(e)) efforts.push(e);
	}
	Object.freeze(efforts);

	const models = (family: FamilyId): readonly ResolvedModel[] => served.get(family) ?? [];
	const find = (family: FamilyId, idOrAlias: string): ResolvedModel | undefined =>
		models(family).find(m => nameMatches(m, idOrAlias));
	const tierDefault = (family: CliFamilyId, tier: TierName): TierDefault => familyOf(family).tierDefaults![tier];
	const rejected = (family: CliFamilyId): readonly string[] => rejectedIds.get(family) ?? [];

	return Object.freeze({
		families: () => file.families,
		defaultFamily: () => file.defaultFamily,
		models,
		rejected,
		find,
		tierDefault,
		summariserModel: (family: CliFamilyId) => find(family, familyOf(family).summariserModel!)!,
		toolLoopModel: () => find('ollama', familyOf('ollama').toolLoopModel!)!,
		cliKind: (family: FamilyId) => familyOf(family).cliKind,
		effortLevels: () => efforts,
		resolveTier(tier: TierName, setting: TierSetting): TierResolution {
			const found = find(setting.runner, setting.model);
			if (found !== undefined) {
				const effort = setting.effort;
				if (effort === undefined) return { family: setting.runner, model: found };
				return found.efforts.includes(effort)
					? { family: setting.runner, model: found, effort }
					: { family: setting.runner, model: found, droppedEffort: effort };
			}
			// Only a vendor CLI family carries rejected ids / tier defaults; the
			// local and Ollama-hosted families fall back to the default family.
			const runner = setting.runner;
			const vendorCli = runner === 'cli-claude' || runner === 'cli-codex' || runner === 'cli-vibe' ? runner : undefined;
			const reason: FallbackReason =
				vendorCli !== undefined && rejected(vendorCli).includes(setting.model) ? 'rejected-model' : 'unlisted-model';
			const fbFamily: CliFamilyId = vendorCli ?? file.defaultFamily;
			const def = tierDefault(fbFamily, tier);
			return {
				family: fbFamily,
				model:  find(fbFamily, def.model)!,
				...(def.effort !== undefined ? { effort: def.effort } : {}),
				fallback: { reason, requested: setting.model },
			};
		},
	});
}
