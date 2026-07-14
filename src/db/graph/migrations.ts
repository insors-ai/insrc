/**
 * Forward-migration runner for the LMDB graph env.
 *
 * Phase 7.2 of plans/storage-migration-lmdb-lance.md. Scaffolding +
 * empty registry. v1 is the first schema version, so there are no
 * registered migrations yet -- the file ships as a wired-up no-op
 * that activates the moment a v2 (or beyond) migration is added.
 *
 * Design:
 *
 *   - Each migration is `{ from, to, description, run(store) }`. The
 *     `run` body executes inside the calling write txn (callers
 *     control the txn boundary so a multi-step path runs in
 *     individual atomic steps, not one big txn that could blow the
 *     transaction-size limit).
 *
 *   - The runner walks `from -> ... -> target` by repeatedly picking
 *     a migration whose `from === current` (greedy; the registry is
 *     expected to define the canonical path). If the registry has
 *     parallel paths, the runner takes the one with the largest
 *     `to` (longest jump first).
 *
 *   - Each step advances `meta.schema_version` to its `to` BEFORE
 *     the next step runs. A crash mid-migration leaves the env at
 *     a coherent intermediate version; re-open replays remaining
 *     steps.
 *
 *   - Empty registry + stored == expected = no-op (the common path).
 *
 *   - Path-not-found throws `MigrationPathError`. Daemon boot
 *     surfaces this; user must restore from backup or accept
 *     data-loss reset.
 */

import { createHash } from 'node:crypto';

import { getLogger } from '../../shared/logger.js';
import {
	SHARED_MODULES_NAME,
	SHARED_MODULES_NAMESPACE_BY_LANG,
	SHARED_MODULES_REPO_ID,
	type SharedModulesNamespace,
} from '../../shared/repo-namespaces.js';
import {
	decodeEntityKey,
	encodeEntityKey,
	encodeNameIndexKey,
	encodeRepoKey,
	ENTITY_KIND_BYTE,
} from './keys.js';
import {
	decodeEntityRow,
	decodeRepoRow,
	encodeEntityRow,
	encodeRepoRow,
	type EntityRow,
	type RepoRow,
} from './codec.js';
import type { GraphStore } from './store.js';

const log = getLogger('graph-migrations');

const META_SCHEMA_VERSION = 'schema_version';

export interface Migration {
	readonly from:        number;
	readonly to:          number;
	readonly description: string;
	run(store: GraphStore): Promise<void> | void;
}

export class MigrationPathError extends Error {
	constructor(stored: number, target: number, lastReached: number) {
		super(
			`No registered migration from schema_version=${lastReached} ` +
			`(starting at ${stored}, target ${target}). ` +
			`Restore from backup or wipe the env to re-index from source.`,
		);
		this.name = 'MigrationPathError';
	}
}

// (Migration registry constant defined further down, after the
// individual Migration values.)
/**
 * v1 → v2: backfill the derived indices that v1 didn't populate.
 *
 *   - `entity_string_by_u64` -- reverse of `entity_id_by_string`.
 *     v1 stored only the forward direction, forcing every reverse
 *     lookup to do a full cursor scan (O(N)). v2 maintains the
 *     mirror on every write; this migration walks the forward
 *     sub-DB once and seeds the reverse one.
 *
 *   - `name_index` -- (repoId, kindByte, name) → u64. Sub-DB
 *     existed in v1 but was never written to, so
 *     `findEntitiesByName` did a full `entity` table scan. This
 *     migration walks `entity` and seeds the index.
 *
 * Both writes are idempotent (re-running the migration would
 * overwrite the same key→value pairs). The migration runs inside
 * a single write txn -- safe at our table sizes (≤ a few million
 * rows; LMDB has no inherent txn-size cap, just the env mapsize).
 */
const MIGRATION_V1_TO_V2: Migration = {
	from: 1,
	to:   2,
	description: 'backfill entity_string_by_u64 + name_index from existing entity rows',
	async run(store: GraphStore): Promise<void> {
		// 1. Backfill the reverse u64→string index from the forward
		//    string→u64 sub-DB. Single cursor pass.
		let reverseSeeded = 0;
		for (const { key, value } of store.entityIdByString.getRange()) {
			const stringId = key as string;
			const v = value as bigint | number;
			const u64 = typeof v === 'bigint' ? v : BigInt(v);
			store.entityStringByU64.put(encodeEntityKey(u64), stringId);
			reverseSeeded++;
		}

		// 2. Backfill name_index from the entity table.
		let nameSeeded = 0;
		for (const { key, value } of store.entity.getRange()) {
			const u64 = (key as Buffer).readBigUInt64BE(0);
			const row = decodeEntityRow(value as Buffer);
			const kindByte = ENTITY_KIND_BYTE[row.kind];
			if (kindByte === undefined) continue;
			store.nameIndex.put(encodeNameIndexKey(row.repoId, kindByte, row.name), encodeEntityKey(u64));
			nameSeeded++;
		}

		log.info(
			{ reverseSeeded, nameSeeded },
			'v1->v2: derived-index backfill done',
		);
	},
};

/**
 * v2 → v3: repo-registry strict contract
 * (plans/repo-registry-strict-contract.md).
 *
 *   1. Provision shared-modules reserved registry rows (one per
 *      `SharedModulesNamespace`) at fixed reserved IDs at the top
 *      of u32 space. Idempotent: skip rows that already exist.
 *
 *   2. Rewire every existing module entity (`kind: 'module'`) to
 *      point at the matching namespace's reserved repoId. Re-derive
 *      the entity's namespace from its `language` field. Re-compute
 *      the string entity ID since module IDs are now namespace-
 *      scoped (`makeEntityId(<namespace>, '', 'module', name)`
 *      instead of `('', '', 'module', name)`). Update both
 *      `entity_id_by_string` ↔ `entity_string_by_u64` indices and
 *      the `name_index` entry (the index key includes repoId).
 *      Out_edge / in_edge mirrors don't need touching: they
 *      reference u64 IDs which are stable.
 *
 *   3. Drop phantom workspace rows whose path is empty / not an
 *      absolute string. Cascade-delete their entities + reverse +
 *      name-index entries; out_edge / in_edge rows tied to those
 *      u64 IDs are also walked. Plan / session / todo / config
 *      entries tied to the phantom path are NOT swept here -- they
 *      survive but are orphaned (the registry no longer has the
 *      row, so listings filter them out). A future cleanup pass
 *      can sweep these as needed; the 2026-05-07 incident shape
 *      (entity-only orphans) doesn't require it.
 *
 *   4. Bump `meta.schema_version` to 3 (handled by the runner
 *      after `run()` returns).
 */
/**
 * Provision all four reserved shared-modules registry rows
 * (`SHARED_MODULES_REPO_ID.{jvm,npm,python,go}`) if absent. Idempotent:
 * existing rows are left untouched, so this is safe to call from both
 * the v2->v3 migration (where it backfills onto a populated env) and
 * the fresh-first-boot path in `getGraphStore()` (where the env is
 * empty and the rows are written for the first time).
 *
 * Returns the count of rows actually written this call (0 when all
 * four already existed).
 *
 * Caller controls the write txn.
 */
export function provisionSharedModulesRows(store: GraphStore): number {
	let provisioned = 0;
	const now = Date.now();
	for (const [namespace, reservedId] of Object.entries(SHARED_MODULES_REPO_ID) as [SharedModulesNamespace, number][]) {
		const existing = store.repo.get(encodeRepoKey(reservedId));
		if (existing !== undefined) continue;
		const row: RepoRow = {
			id:           reservedId,
			kind:         'shared-modules',
			namespace,
			path:         '',
			name:         SHARED_MODULES_NAME[namespace],
			addedAt:      now,
			lastIndexed:  0,
			status:       'ready',
			errorMsg:     '',
		};
		store.repo.put(encodeRepoKey(reservedId), encodeRepoRow(row));
		provisioned++;
	}
	return provisioned;
}

const MIGRATION_V2_TO_V3: Migration = {
	from: 2,
	to:   3,
	description: 'repo-registry strict contract: provision shared-modules rows, rewire module entities, drop phantom workspace rows',
	async run(store: GraphStore): Promise<void> {
		// 1. Provision reserved shared-modules rows. Shared with the
		//    fresh-first-boot path; idempotent.
		const provisioned = provisionSharedModulesRows(store);

		// 2. Rewire module entities. Walk all entity rows looking
		//    for kind='module'; for each, derive the namespace from
		//    the language and rewrite repoId + recompute the string
		//    ID. Two-phase: collect changes first, then apply, so we
		//    don't mutate the cursor we're iterating.
		interface ModuleRewire {
			readonly u64:           bigint;
			readonly oldStringId:   string;
			readonly newStringId:   string;
			readonly oldRow:        EntityRow;
			readonly newRow:        EntityRow;
		}
		const rewires: ModuleRewire[] = [];
		const oldNameIndexKeys: Buffer[] = [];

		for (const { key, value } of store.entity.getRange()) {
			const row = decodeEntityRow(value as Buffer);
			if (row.kind !== 'module') continue;
			const namespace = SHARED_MODULES_NAMESPACE_BY_LANG[row.language];
			if (namespace === undefined) {
				// Language has no module concept (markdown / json /
				// etc.). Skip; these shouldn't exist as kind='module'
				// in practice but tolerate the data shape.
				continue;
			}
			const newRepoId = SHARED_MODULES_REPO_ID[namespace];
			if (row.repoId === newRepoId) continue;  // already migrated

			const u64 = decodeEntityKey(key as Buffer);
			const oldStringId = readStringByU64(store, u64);
			if (oldStringId === undefined) continue;  // dangling row; skip
			const newStringId = makeEntityIdLite(namespace, '', 'module', row.name);
			const newRow: EntityRow = { ...row, repoId: newRepoId };

			rewires.push({ u64, oldStringId, newStringId, oldRow: row, newRow });

			// Cache the OLD name_index key so we can delete it
			// (the new key is computed from newRow.repoId).
			const oldKindByte = ENTITY_KIND_BYTE[row.kind];
			if (oldKindByte !== undefined) {
				oldNameIndexKeys.push(encodeNameIndexKey(row.repoId, oldKindByte, row.name));
			}
		}

		let modulesRewired = 0;
		for (let i = 0; i < rewires.length; i++) {
			const r = rewires[i]!;
			const oldKey = oldNameIndexKeys[i];

			// Update the entity row itself (key is u64; unchanged).
			store.entity.put(encodeEntityKey(r.u64), encodeEntityRow(r.newRow));

			// Swap the string-id indices. Module IDs become
			// namespace-scoped, so the old `('', '', 'module', name)`
			// hash maps away.
			if (r.oldStringId !== r.newStringId) {
				store.entityIdByString.remove(r.oldStringId);
				store.entityIdByString.put(r.newStringId, r.u64);
				store.entityStringByU64.put(encodeEntityKey(r.u64), r.newStringId);
			}

			// Rewire name_index: drop old (oldRepoId, kind, name)
			// dupsort entry; add new (newRepoId, kind, name) entry.
			const kindByte = ENTITY_KIND_BYTE[r.newRow.kind];
			if (kindByte !== undefined) {
				if (oldKey !== undefined) {
					store.nameIndex.remove(oldKey, encodeEntityKey(r.u64));
				}
				store.nameIndex.put(
					encodeNameIndexKey(r.newRow.repoId, kindByte, r.newRow.name),
					encodeEntityKey(r.u64),
				);
			}

			modulesRewired++;
		}

		// 3. Drop phantom workspace rows. Walk every repo row that's
		//    NOT one of the reserved shared-modules rows; if path is
		//    empty / non-absolute, cascade-delete. Same two-phase
		//    pattern (collect first, mutate after).
		interface PhantomDrop {
			readonly repoId:       number;
			readonly path:         string;
			readonly entityCount:  number;
			readonly u64s:         readonly bigint[];
		}
		const phantoms: PhantomDrop[] = [];
		for (const { key, value } of store.repo.getRange()) {
			const row = decodeRepoRow(value as Buffer);
			if (row.kind === 'shared-modules') continue;
			const isPhantom =
				typeof row.path !== 'string' ||
				row.path.length === 0 ||
				!row.path.startsWith('/');
			if (!isPhantom) continue;

			// Collect this repo's entity u64s for cascade delete.
			const u64s: bigint[] = [];
			for (const { value: entVal, key: entKey } of store.entity.getRange()) {
				const entRow = decodeEntityRow(entVal as Buffer);
				if (entRow.repoId !== row.id) continue;
				u64s.push(decodeEntityKey(entKey as Buffer));
			}
			phantoms.push({ repoId: row.id, path: row.path, entityCount: u64s.length, u64s });
			void key;
		}

		let phantomsDropped = 0;
		let phantomEntitiesDropped = 0;
		for (const p of phantoms) {
			for (const u64 of p.u64s) {
				const u64Key = encodeEntityKey(u64);
				const entVal = store.entity.get(u64Key);
				if (entVal !== undefined) {
					const entRow = decodeEntityRow(entVal as Buffer);
					const kindByte = ENTITY_KIND_BYTE[entRow.kind];
					if (kindByte !== undefined) {
						store.nameIndex.remove(
							encodeNameIndexKey(entRow.repoId, kindByte, entRow.name),
							u64Key,
						);
					}
				}
				const stringId = readStringByU64(store, u64);
				if (stringId !== undefined) {
					store.entityIdByString.remove(stringId);
				}
				store.entityStringByU64.remove(u64Key);
				store.entity.remove(u64Key);
				phantomEntitiesDropped++;
			}
			store.repo.remove(encodeRepoKey(p.repoId));
			phantomsDropped++;
		}

		log.info(
			{ provisioned, modulesRewired, phantomsDropped, phantomEntitiesDropped },
			'v2->v3: repo-registry strict contract migration complete',
		);
	},
};

/**
 * Helper that mirrors `indexer/parser/base.ts:makeEntityId` without
 * importing it (the parser layer doesn't depend on db internals
 * and we don't want to introduce a cycle).
 */
function makeEntityIdLite(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

function readStringByU64(store: GraphStore, u64: bigint): string | undefined {
	const v = store.entityStringByU64.get(encodeEntityKey(u64));
	if (v === undefined) return undefined;
	return typeof v === 'string' ? v : (v as Buffer).toString('utf8');
}

/**
 * Production migration registry. Add new entries here as new
 * SCHEMA_VERSION bumps land; never edit or remove an
 * already-shipped entry.
 *
 * Convention: contiguous `from = N`, `to = N+1` per step. Multi-jump
 * migrations (e.g. 1→3 fast path) are allowed but should always have
 * a corresponding 1→2 + 2→3 chain so older clients can step through.
 */
export const MIGRATIONS: readonly Migration[] = [
	MIGRATION_V1_TO_V2,
	MIGRATION_V2_TO_V3,
];

/**
 * Apply registered migrations to advance `stored` → `target`. Each
 * step runs inside its own write txn (`store.root.transaction`) so a
 * multi-step path doesn't pile into one giant txn.
 *
 * Returns the count of migrations applied (0 when stored == target).
 *
 * `registry` defaults to `MIGRATIONS`; tests inject synthetic chains.
 */
export async function runMigrations(
	store:    GraphStore,
	stored:   number,
	target:   number,
	registry: readonly Migration[] = MIGRATIONS,
): Promise<number> {
	if (stored === target) return 0;
	if (stored > target) {
		throw new MigrationPathError(stored, target, stored);
	}

	let current = stored;
	let applied = 0;

	while (current < target) {
		const step = pickStep(registry, current, target);
		if (step === null) {
			throw new MigrationPathError(stored, target, current);
		}

		const t0 = Date.now();
		await store.root.transaction(async () => {
			await step.run(store);
			// Advance the version IN THE SAME TXN so a crash either
			// rolls everything (including the version write) back, or
			// commits everything atomically.
			await store.meta.put(META_SCHEMA_VERSION, step.to);
		});
		applied++;

		log.info(
			{
				from:        step.from,
				to:          step.to,
				description: step.description,
				elapsedMs:   Date.now() - t0,
			},
			'graph migration applied',
		);

		current = step.to;
	}

	return applied;
}

/**
 * Pick the next migration step from `current`, preferring the
 * largest jump that doesn't overshoot `target`. Returns null when no
 * applicable step exists.
 */
function pickStep(
	registry: readonly Migration[],
	current:  number,
	target:   number,
): Migration | null {
	let best: Migration | null = null;
	for (const m of registry) {
		if (m.from !== current) continue;
		if (m.to <= current)    continue; // never go backwards
		if (m.to > target)      continue; // don't overshoot
		if (best === null || m.to > best.to) best = m;
	}
	return best;
}
