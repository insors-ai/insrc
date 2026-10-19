/**
 * Cross-file resolver pass -- the second pass over the graph.
 * See plans/cross-file-references.md §3-§5.
 *
 * Runs after the per-file index settles. Two responsibilities:
 *
 *   Pass 1 (rewireModuleStubImports):
 *     For every file in the active repo with an IMPORTS edge to a
 *     module-stub entity, try to resolve the module name to an in-tree
 *     file via per-language path rules. If it resolves, replace the
 *     stub edge with a (file)-[:IMPORTS]->(target-file) edge. External-
 *     dep stubs (no in-tree match) stay untouched.
 *
 *   Pass 2 (resolveRelations):
 *     Walk UnresolvedRelation rows for the active repo (CALLS,
 *     INHERITS, IMPLEMENTS). Resolve via:
 *       - same-file candidates (best match)
 *       - cross-file candidates filtered by Pass 1's rewired imports
 *       - same-package visibility for Java/Scala
 *     Resolved rows become typed REL edges; ambiguous rows record
 *     `meta.candidates`; no-match stays unresolved.
 *
 * Architectural notes (post-rewrite, per
 * docs/plans/analyzers/code-analyzer.md F7 + the validation perf trip):
 *
 *  - Every read is repo-scoped (`WHERE e.repo = ?`). Multi-repo
 *    workspaces no longer pay for the union of all repos' edges per
 *    pass.
 *  - Pass 1's opening SELECT JOINs the module name + language so we
 *    don't need a per-row getEntity fallback.
 *  - Pass 2 prefetches all (fromFile -> imported file paths) upfront
 *    into an in-memory map. Per-row resolveCall / resolveInheritance
 *    are pure-sync; no DB calls inside the loop.
 *  - Writes go through multi-VALUES INSERT batches of BATCH (=500),
 *    one auto-commit per chunk.
 *  - Helpers in db/relations.ts (promoteResolvedBatch +
 *    updateUnresolvedMetaBatch) flush the accumulated Pass 2 intents.
 *
 * The pre-rewrite version had ~7 in-memory maps + per-row DB fallbacks
 * + memoized read queries. This version drops to 4 maps + 0 in-loop
 * DB calls + a constant number of upfront prefetches.
 */

import { existsSync, statSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { getLogger } from '../shared/logger.js';
import type { DbClient } from '../db/client.js';
import type { Entity, EntityKind, Language, Relation, RelationKind } from '../shared/types.js';
import {
  listEntitiesForRepo,
  listEntitiesByKind,
  entityU64ForId,
  entityIdsByU64s,
} from '../db/entities.js';
import {
  upsertRelations,
  deleteResolvedRelations,
  listUnresolvedRelations,
  promoteResolvedBatch,
  updateUnresolvedMetaBatch,
  type UnresolvedRelation,
} from '../db/relations.js';
import { inNeighbors, outNeighbors } from '../db/graph/edges.js';
import { BOUNDARY_RELATION_KINDS, zeroPending } from '../db/graph/pending-class.js';
import type { PendingClass } from '../db/graph/codec.js';
import { readIndexState } from '../db/index-state.js';
import type { SourceRoots } from './source-roots.js';
import { selectFile } from './file-selection.js';
import { resolveImportPath } from './resolver.js';
import { listExportNames } from '../db/export-names.js';
import { resolveRepoIgnore } from './repo-ignore-config.js';

const log = getLogger('cross-file-resolver');

/** UNWIND chunk size; matches eeae2ef7ac7's batched DETACH DELETE. */
const BATCH_SIZE = 500;

const CALL_TARGET_KINDS: readonly EntityKind[] = ['function', 'method', 'class'];

/**
 * Typed external-boundary relation kinds (sc1 — S001). The code-symbol Pass 2
 * resolver MUST NOT touch these: their `to`/`rawTo` is a raw URL / topic /
 * service string, NOT a code-entity name, so trying to resolve them against the
 * entity index would be meaningless. They are owned by the S003 external-
 * endpoint pass (resolveExternalEndpoints), which reads them straight from the
 * unresolved store. Excluded explicitly here — rather than relying on the
 * `else` fall-through below — so a future `default` handler can never silently
 * mis-resolve a boundary row to a code entity. See external-endpoints.ts.
 */
export { BOUNDARY_RELATION_KINDS };

// ---------------------------------------------------------------------------
// Public surface (unchanged)
// ---------------------------------------------------------------------------

/**
 * Which pending rows the pass works on (Epic c2ba6fa6 s1):
 *   - 'full'       after a full index: rows awaiting ANY entity of the repository
 *                  (from any repository); every row gets a class;
 *   - 'settle'     after file edits: rows awaiting the committed files' entities,
 *                  and the committed files' own rows;
 *   - 'repository' the repository's own rows; sets no class only a full index sets.
 */
export type CrossFileMode = 'full' | 'settle' | 'repository';

export interface CrossFileResolveOpts {
  readonly db:           DbClient;
  readonly repoRoot:     string;
  readonly sourceRoots:  SourceRoots;
  /** Optional: limit Pass 2 to UnresolvedRelation rows for one file. */
  readonly scopeFile?:   string | undefined;
  /** Default 'repository'. */
  readonly mode?:        CrossFileMode | undefined;
  /** Required in 'settle' mode: the files committed since the last settle (absolute paths). */
  readonly committedFiles?: readonly string[] | undefined;
}

export interface CrossFileResolveResult {
  readonly importsRewired:   number;
  readonly resolved:         number;
  readonly ambiguous:        number;
  readonly stillUnresolved:  number;
  /** Rows promoted by Pass 0 because the target they awaited is now stored. */
  readonly completedById:    number;
  /** The repository's pending rows by class after the pass. */
  readonly pendingByClass:   Record<PendingClass, number>;
  readonly elapsedMs:        number;
}

/** Pass 2 resolves these kinds by name; a row of another code-symbol kind is not attempted. */
const PASS2_KINDS: ReadonlySet<RelationKind> = new Set<RelationKind>(['CALLS', 'INHERITS', 'IMPLEMENTS']);

export async function runCrossFileResolver(
  opts: CrossFileResolveOpts,
): Promise<CrossFileResolveResult> {
  const t0 = Date.now();
  log.info({ repo: opts.repoRoot }, 'cross-file resolver starting');

  // -- Setup: load this repo's entities + build a small in-memory index --
  const tLoad = Date.now();
  const entities = await listEntitiesForRepo(opts.db, opts.repoRoot);
  log.info(
    { repo: opts.repoRoot, entities: entities.length, elapsedMs: Date.now() - tLoad },
    'cross-file: loaded entities',
  );

  const tIdx = Date.now();
  const index = buildEntityIndex(entities);
  log.info(
    { repo: opts.repoRoot, elapsedMs: Date.now() - tIdx },
    'cross-file: built entity index',
  );

  const mode = opts.mode ?? 'repository';
  if (mode === 'settle' && opts.committedFiles === undefined) {
    throw new Error('runCrossFileResolver: settle mode needs committedFiles');
  }

  // -- Pass 0: complete rows whose awaited target is now stored --
  const completedById = await runPass0(opts, mode, index);

  // -- Pass 1 --
  const tPass1 = Date.now();
  const importsRewired = await runPass1(opts, index);
  log.info(
    { repo: opts.repoRoot, importsRewired, elapsedMs: Date.now() - tPass1 },
    'cross-file Pass 1 (IMPORTS rewire) complete',
  );

  // -- Pass 1b: re-exports --
  const reExported = await runPass1b(opts, mode, index);

  // -- Pass 2 --
  const tPass2 = Date.now();
  const { resolved, ambiguous, stillUnresolved } = await runPass2(opts, mode, index);
  const pass2ElapsedMs = Date.now() - tPass2;

  // -- Classes only a full index (or a settle, for its own files) sets --
  if (mode !== 'repository') await classifyFileTargets(opts, mode);
  if (mode === 'full') await classifyUnattempted(opts);

  const pendingByClass = (await readIndexState(opts.repoRoot))?.pending ?? zeroPending();
  const elapsedMs = Date.now() - t0;
  log.info(
    { repo: opts.repoRoot, mode, completedById, importsRewired, reExported, resolved, ambiguous, stillUnresolved, pendingByClass, pass2ElapsedMs, elapsedMs },
    'cross-file resolver pass complete',
  );
  return { importsRewired, resolved, ambiguous, stillUnresolved, completedById, pendingByClass, elapsedMs };
}

// ---------------------------------------------------------------------------
// Pass 0: complete rows awaiting a target that is now stored
// ---------------------------------------------------------------------------

/**
 * Promote the code-symbol rows whose awaited target is stored: in 'settle'
 * mode those awaiting an entity of the committed files, in 'full' mode those
 * awaiting any entity of the repository (whichever repository holds them), in
 * 'repository' mode the repository's own awaiting rows.
 */
async function runPass0(opts: CrossFileResolveOpts, mode: CrossFileMode, index: EntityIndex): Promise<number> {
  let rows: UnresolvedRelation[];
  if (mode === 'repository') {
    rows = (await listUnresolvedRelations(opts.db, opts.repoRoot)).filter(r => r.meta['awaitsId'] === true);
  } else {
    const committed = mode === 'settle' ? new Set(opts.committedFiles) : undefined;
    const awaited = [...index.byId.values()]
      .filter(e => committed === undefined || committed.has(e.file))
      .map(e => e.id);
    rows = awaited.length === 0 ? [] : await listUnresolvedRelations(opts.db, opts.repoRoot, undefined, { awaiting: awaited });
  }
  const items: { unresolved: UnresolvedRelation; targetEntityId: string }[] = [];
  for (const row of rows) {
    if (BOUNDARY_RELATION_KINDS.has(row.kind) || row.meta['awaitsId'] !== true) continue;
    if (await entityU64ForId(row.rawTo) === undefined) continue;
    items.push({ unresolved: row, targetEntityId: row.rawTo });
  }
  const result = await promoteResolvedBatch(opts.db, items);
  log.info({ repo: opts.repoRoot, mode, candidates: rows.length, promoted: result.promoted }, 'cross-file Pass 0 (awaited targets) complete');
  return result.promoted;
}

// ---------------------------------------------------------------------------
// Classes only a full index (or a settle, for its own files) sets
// ---------------------------------------------------------------------------

/**
 * Class each row that awaits a FILE whose entity is not stored (the per-file
 * resolver records the file as meta.targetFile) by the full index's own
 * selection rule: a file that is not code is 'no-candidate' ('target-not-code');
 * one the ignore rule excludes, or one selected but not stored, stays awaiting
 * with the reason ('target-excluded-by-ignore' / 'target-not-committed').
 * 'full' mode classes the repository's rows, 'settle' mode the committed files'.
 */
async function classifyFileTargets(opts: CrossFileResolveOpts, mode: CrossFileMode): Promise<void> {
  const ignore = resolveRepoIgnore(opts.repoRoot);
  const updates: { id: string; meta: Record<string, unknown> }[] = [];
  for (const row of await rowsInScope({ ...opts, scopeFile: undefined }, mode)) {
    const target = row.meta['targetFile'];
    if (row.meta['awaitsId'] !== true || typeof target !== 'string') continue;
    if (await entityU64ForId(row.rawTo) !== undefined) continue;
    const selection = selectFile(target, opts.repoRoot, ignore);
    const meta = selection === 'not-code'
      ? { class: 'no-candidate', reason: 'target-not-code' }
      : { class: 'awaiting-target', reason: selection === 'excluded-by-ignore' ? 'target-excluded-by-ignore' : 'target-not-committed' };
    const update = classUpdate(row, meta);
    if (update !== undefined) updates.push(update);
  }
  await updateUnresolvedMetaBatch(opts.db, updates);
  log.info({ repo: opts.repoRoot, mode, classified: updates.length }, 'cross-file: file-target rows classed');
}

/**
 * After a full index: a code-symbol row with no class that awaits no id and that
 * neither Pass 2 nor the endpoint passes attempt (an unresolved IMPORTS) is
 * 'no-candidate'. EXPORTS rows are left for the re-export pass.
 */
async function classifyUnattempted(opts: CrossFileResolveOpts): Promise<void> {
  const updates: { id: string; meta: Record<string, unknown> }[] = [];
  for (const row of await listUnresolvedRelations(opts.db, opts.repoRoot)) {
    if (BOUNDARY_RELATION_KINDS.has(row.kind) || PASS2_KINDS.has(row.kind) || row.kind === 'EXPORTS') continue;
    if (row.meta['awaitsId'] === true || row.meta['class'] !== undefined) continue;
    updates.push({ id: row.id, meta: { class: 'no-candidate', reason: 'not-attempted' } });
  }
  await updateUnresolvedMetaBatch(opts.db, updates);
  log.info({ repo: opts.repoRoot, classified: updates.length }, 'cross-file: unattempted rows classed');
}

// ---------------------------------------------------------------------------
// Pass 1: rewire module-stub IMPORTS to file-target IMPORTS
// ---------------------------------------------------------------------------

export interface Rewire {
  readonly fromId:        string;
  readonly oldModuleId:   string;
  readonly targetFileId:  string;
}

/**
 * The file -> file IMPORTS a Pass 1 rewire writes. It carries the repository
 * and the importing file's absolute path (Epic c2ba6fa6 s1), so a refused or
 * kept-pending rewire is counted against this repository and found by the file.
 */
export function rewireImportRelation(r: Rewire, repoRoot: string, byId: ReadonlyMap<string, Entity>): Relation {
  return {
    kind: 'IMPORTS', from: r.fromId, to: r.targetFileId, resolved: true,
    meta: { repo: repoRoot, file: byId.get(r.fromId)?.file ?? repoRoot },
  };
}

async function runPass1(
  opts:  CrossFileResolveOpts,
  index: EntityIndex,
): Promise<number> {
  // Step 1 -- enumerate every module entity globally. Module stubs have
  // repo='' so they don't appear in listEntitiesForRepo(repo); a single
  // kind-filtered scan over the entity sub-DB is the LMDB equivalent
  // of the old "JOIN entity m ON m.id = r.dst WHERE m.kind='module'".
  const tMatch = Date.now();
  const allModules = await listEntitiesByKind(opts.db, 'module');
  log.info(
    { repo: opts.repoRoot, modules: allModules.length, elapsedMs: Date.now() - tMatch },
    'cross-file Pass 1: enumerated module entities',
  );

  // Step 2 -- for each module, walk IMPORTS in-edges to find files that
  // import it. Filter the predecessor list to this repo's `index.byId`
  // (the LMDB equivalent of the prior in-memory repo-scope check).
  const tEdges = Date.now();
  const scopedRows: { fromId: string; module: Entity }[] = [];
  for (const m of allModules) {
    const moduleU64 = await entityU64ForId(m.id);
    if (moduleU64 === undefined) continue;
    const fromU64s = await inNeighbors(moduleU64, { kindFilter: ['IMPORTS'] });
    if (fromU64s.length === 0) continue;
    const fromIdMap = await entityIdsByU64s(fromU64s);
    for (const fU64 of fromU64s) {
      const fromId = fromIdMap.get(fU64);
      if (fromId === undefined) continue;
      if (!index.byId.has(fromId)) continue;  // not in this repo
      scopedRows.push({ fromId, module: m });
    }
  }
  log.info(
    {
      repo: opts.repoRoot,
      scopedRows: scopedRows.length,
      elapsedMs: Date.now() - tEdges,
    },
    'cross-file Pass 1: collected IMPORTS-to-module edges in repo',
  );
  if (scopedRows.length === 0) return 0;

  // Step 3 -- in-memory resolve. No DB calls in this loop.
  const tResolve = Date.now();
  const rewires: Rewire[] = [];
  for (const row of scopedRows) {
    const targetPath = locateInTreeFile(row.module.name, row.module.language, opts.sourceRoots);
    if (targetPath === null) continue;
    const targetEntity = index.fileEntities.get(targetPath);
    if (targetEntity === undefined) continue;
    rewires.push({ fromId: row.fromId, oldModuleId: row.module.id, targetFileId: targetEntity.id });
  }
  log.info(
    { repo: opts.repoRoot, rewires: rewires.length, elapsedMs: Date.now() - tResolve },
    'cross-file Pass 1: in-memory resolve done',
  );
  if (rewires.length === 0) return 0;

  // Step 4 -- batched DELETE of (file -> module-stub) IMPORTS edges.
  const tDelete = Date.now();
  for (let i = 0; i < rewires.length; i += BATCH_SIZE) {
    const chunk = rewires.slice(i, i + BATCH_SIZE);
    await deleteResolvedRelations(
      opts.db,
      chunk.map(r => ({ from: r.fromId, kind: 'IMPORTS' as const, to: r.oldModuleId })),
    );
  }
  log.info(
    {
      repo: opts.repoRoot,
      batches: Math.ceil(rewires.length / BATCH_SIZE),
      elapsedMs: Date.now() - tDelete,
    },
    'cross-file Pass 1: DELETE complete',
  );

  // Step 5 -- batched INSERT of new (file -> file) IMPORTS edges.
  // upsertRelations is idempotent (LMDB put on the same key is a no-op),
  // matching the prior `ON CONFLICT DO NOTHING` semantics.
  const tMerge = Date.now();
  for (let i = 0; i < rewires.length; i += BATCH_SIZE) {
    const chunk = rewires.slice(i, i + BATCH_SIZE);
    await upsertRelations(opts.db, chunk.map(r => rewireImportRelation(r, opts.repoRoot, index.byId)));
  }
  log.info(
    {
      repo: opts.repoRoot,
      batches: Math.ceil(rewires.length / BATCH_SIZE),
      elapsedMs: Date.now() - tMerge,
    },
    'cross-file Pass 1: MERGE complete',
  );

  return rewires.length;
}

// ---------------------------------------------------------------------------
// Pass 1b: re-exports -> EXPORTS edges + export_names
// ---------------------------------------------------------------------------

/** File entity id -> exported name -> target entity ids: the stored export_names plus this run's. */
type ExportMap = Map<string, Map<string, Set<string>>>;

function addExport(map: ExportMap, fileId: string, name: string, targetId: string): void {
  let names = map.get(fileId);
  if (names === undefined) { names = new Map(); map.set(fileId, names); }
  let targets = names.get(name);
  if (targets === undefined) { targets = new Set(); names.set(name, targets); }
  targets.add(targetId);
}

/**
 * What `name` refers to when it is imported from the file `fileId`: an exported
 * entity of that file with the name, else what the file re-exports under the
 * name, else what its `export *` sources export under it (transitively; the
 * visited set stops a cycle). A target that is not stored is ignored.
 */
function exportedTargets(fileId: string, name: string, index: EntityIndex, exports: ExportMap, visited: Set<string> = new Set()): Entity[] {
  if (visited.has(fileId)) return [];
  visited.add(fileId);
  const file = index.byId.get(fileId);
  if (file === undefined) return [];
  const found = new Map<string, Entity>();
  for (const e of index.byFile.get(file.file) ?? []) {
    if (e.name === name && e.isExported === true) found.set(e.id, e);
  }
  const names = exports.get(fileId);
  for (const id of names?.get(name) ?? []) {
    const e = index.byId.get(id);
    if (e !== undefined) found.set(e.id, e);
  }
  if (found.size > 0) return [...found.values()];
  for (const source of names?.get('*') ?? []) {
    for (const e of exportedTargets(source, name, index, exports, visited)) found.set(e.id, e);
  }
  return [...found.values()];
}

/**
 * Resolve the pending EXPORTS rows: each to the named exported entity of the
 * file its specifier resolves to (or that file entity for `export *`), written
 * as an EXPORTS edge (empty value) with its export_names entry in one
 * transaction. Rows resolve in rounds, so a barrel of a barrel resolves in one
 * pass; a row whose source file is not stored is left for a later pass; a name
 * found through no file (a re-export cycle) is 'no-candidate'.
 */
async function runPass1b(opts: CrossFileResolveOpts, mode: CrossFileMode, index: EntityIndex): Promise<number> {
  let pending = (await rowsInScope({ ...opts, scopeFile: undefined }, mode))
    .filter(r => r.kind === 'EXPORTS' && r.meta['awaitsId'] !== true);
  if (pending.length === 0) return 0;
  const exports = await listExportNames();
  const promotes: { unresolved: UnresolvedRelation; targetEntityId: string; exportName: string }[] = [];
  const classUpdates: { id: string; meta: Record<string, unknown> }[] = [];
  const settle = (row: UnresolvedRelation, meta: Record<string, unknown>): void => {
    const update = classUpdate(row, meta);
    if (update !== undefined) classUpdates.push(update);
  };

  for (let progress = true; progress && pending.length > 0;) {
    progress = false;
    const next: UnresolvedRelation[] = [];
    for (const row of pending) {
      const barrel = index.fileEntities.get(row.fromFile);
      const specifier = row.meta['specifier'];
      if (barrel === undefined || typeof specifier !== 'string') continue;
      const sourcePath = resolveImportPath(row.fromFile, specifier, opts.repoRoot, barrel.language);
      if (sourcePath === null) { settle(row, { class: 'no-candidate', reason: 'target-file-missing' }); continue; }
      const source = index.fileEntities.get(sourcePath);
      if (source === undefined) continue;   // not stored yet: a later pass resolves it
      const exportedAs = typeof row.meta['exportedAs'] === 'string' ? row.meta['exportedAs'] as string : row.rawTo;
      const targets = row.rawTo === '*' ? [source] : exportedTargets(source.id, row.rawTo, index, exports);
      if (targets.length === 1) {
        promotes.push({ unresolved: row, targetEntityId: targets[0]!.id, exportName: exportedAs });
        addExport(exports, barrel.id, exportedAs, targets[0]!.id);
        progress = true;
      } else if (targets.length > 1) {
        settle(row, { class: 'ambiguous', candidates: targets.map(e => e.id) });
      } else {
        next.push(row);
      }
    }
    pending = next;
  }
  for (const row of pending) settle(row, { class: 'no-candidate', reason: 'no-match' });

  const result = await promoteResolvedBatch(opts.db, promotes);
  await updateUnresolvedMetaBatch(opts.db, classUpdates);
  log.info({ repo: opts.repoRoot, mode, promoted: result.promoted, unresolved: pending.length }, 'cross-file Pass 1b (re-exports) complete');
  return result.promoted;
}

// ---------------------------------------------------------------------------
// Pass 2: resolve INHERITS / IMPLEMENTS / CALLS rows
// ---------------------------------------------------------------------------

type ResolveIntent =
  | { readonly kind: 'resolved';   readonly targetId: string }
  | { readonly kind: 'ambiguous';  readonly meta: Record<string, unknown> }
  | { readonly kind: 'unresolved' };

const UNRESOLVED: ResolveIntent = { kind: 'unresolved' };

/** The repository's pending rows a mode works on: in 'settle' mode the committed files' rows. */
async function rowsInScope(opts: CrossFileResolveOpts, mode: CrossFileMode): Promise<UnresolvedRelation[]> {
  if (mode !== 'settle') return listUnresolvedRelations(opts.db, opts.repoRoot, opts.scopeFile);
  const out: UnresolvedRelation[] = [];
  for (const file of opts.committedFiles ?? []) out.push(...await listUnresolvedRelations(opts.db, opts.repoRoot, file));
  return out;
}

/** A class change for a row, or undefined when the row already carries it. */
function classUpdate(row: UnresolvedRelation, meta: Record<string, unknown>): { id: string; meta: Record<string, unknown> } | undefined {
  const same = Object.entries(meta).every(([k, v]) => JSON.stringify(row.meta[k]) === JSON.stringify(v));
  return same ? undefined : { id: row.id, meta };
}

async function runPass2(
  opts:  CrossFileResolveOpts,
  mode:  CrossFileMode,
  index: EntityIndex,
): Promise<{ resolved: number; ambiguous: number; stillUnresolved: number }> {
  // Step 1 -- prefetch UnresolvedRelation rows + the file->file IMPORTS
  // map (one DB read each; per-row helpers below are pure-sync).
  const tList = Date.now();
  const unresolved = await rowsInScope(opts, mode);
  log.info(
    { repo: opts.repoRoot, rows: unresolved.length, elapsedMs: Date.now() - tList },
    'cross-file Pass 2: listUnresolvedRelations done',
  );

  const tImports = Date.now();
  const importsByFile = await prefetchImportsByFile(opts.db, index);
  const exports = await listExportNames();
  log.info(
    { repo: opts.repoRoot, files: importsByFile.size, elapsedMs: Date.now() - tImports },
    'cross-file Pass 2: prefetched file->file imports',
  );

  // Step 2 -- in-memory loop over unresolved rows. Accumulate intents.
  const promotes:         { unresolved: UnresolvedRelation; targetEntityId: string }[] = [];
  // Every attempted row that stays pending gets its class, in every mode.
  const classUpdates:     { id: string; meta: Record<string, unknown> }[]              = [];

  let resolved        = 0;
  let ambiguous       = 0;
  let stillUnresolved = 0;
  let processed       = 0;
  for (const row of unresolved) {
    // External-boundary rows (CALLS_HTTP / PUBLISHES_TO / ...) are owned by the
    // S003 endpoint pass — leave them untouched in the unresolved store so a
    // raw URL is never matched against a code-entity name.
    if (BOUNDARY_RELATION_KINDS.has(row.kind)) {
      processed++;
      continue;
    }
    // A row awaiting an entity id holds that id, not a name: Pass 0 completes it.
    if (!PASS2_KINDS.has(row.kind) || row.meta['awaitsId'] === true) {
      processed++;
      continue;
    }
    const intent: ResolveIntent = row.kind === 'CALLS'
      ? resolveCall(opts, row, index, importsByFile, exports)
      : resolveInheritance(opts, row, index, importsByFile);
    if (intent.kind === 'resolved') {
      promotes.push({ unresolved: row, targetEntityId: intent.targetId });
      resolved++;
    } else if (intent.kind === 'ambiguous') {
      const update = classUpdate(row, { ...intent.meta, class: 'ambiguous' });
      if (update !== undefined) classUpdates.push(update);
      ambiguous++;
    } else {
      // Mostly a call to a builtin or a library function: nothing in the graph to find.
      const update = classUpdate(row, { class: 'no-candidate', reason: 'no-match' });
      if (update !== undefined) classUpdates.push(update);
      stillUnresolved++;
    }
    processed++;
    if (processed % 100 === 0) {
      log.info(
        { repo: opts.repoRoot, processed, total: unresolved.length, resolved, ambiguous },
        'cross-file Pass 2 progress',
      );
    }
  }

  // Step 3 -- batched flush.
  if (promotes.length > 0) {
    const t = Date.now();
    await promoteResolvedBatch(opts.db, promotes);
    log.info(
      { repo: opts.repoRoot, count: promotes.length, elapsedMs: Date.now() - t },
      'cross-file Pass 2: promoted batch flushed',
    );
  }
  if (classUpdates.length > 0) {
    const t = Date.now();
    await updateUnresolvedMetaBatch(opts.db, classUpdates);
    log.info(
      { repo: opts.repoRoot, count: classUpdates.length, elapsedMs: Date.now() - t },
      'cross-file Pass 2: class batch flushed',
    );
  }

  return { resolved, ambiguous, stillUnresolved };
}

/**
 * Build the in-memory Map<fromFileEntityId, Set<importedFilePath>> by
 * walking each file entity's IMPORTS out-edges in LMDB and keeping
 * only the targets that are file entities in this repo's index.
 *
 * Cross-repo targets (not in `index.byId`) are skipped: Pass 2 scope is
 * single-repo; cross-repo CALLS / INHERITS resolution is out of scope.
 */
async function prefetchImportsByFile(
  _db:    DbClient,
  index: EntityIndex,
): Promise<Map<string, Set<string>>> {
  // Collect every (fromFileId, targetU64) pair from out_edge with one
  // pass over each file entity in this repo.
  type Pair = { fromFileId: string; targetU64: bigint };
  const pairs: Pair[] = [];
  for (const [fromId, fromEntity] of index.byId) {
    if (fromEntity.kind !== 'file') continue;
    const fromU64 = await entityU64ForId(fromId);
    if (fromU64 === undefined) continue;
    const tos = await outNeighbors(fromU64, { kindFilter: ['IMPORTS'] });
    for (const toU64 of tos) pairs.push({ fromFileId: fromId, targetU64: toU64 });
  }
  if (pairs.length === 0) return new Map();

  // Bulk reverse-lookup all unique target u64s in one cursor pass.
  const uniqueTargetU64s = [...new Set(pairs.map(p => p.targetU64))];
  const idMap = await entityIdsByU64s(uniqueTargetU64s);

  const map = new Map<string, Set<string>>();
  for (const { fromFileId, targetU64 } of pairs) {
    const targetId = idMap.get(targetU64);
    if (targetId === undefined) continue;
    const targetEntity = index.byId.get(targetId);
    if (targetEntity === undefined || targetEntity.kind !== 'file') continue;
    let set = map.get(fromFileId);
    if (set === undefined) { set = new Set<string>(); map.set(fromFileId, set); }
    set.add(targetEntity.file);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Pass 2 helpers -- pure-sync, in-memory only
// ---------------------------------------------------------------------------

/**
 * Resolve an INHERITS / IMPLEMENTS row.
 * Strategy:
 *   1. Same-file match (`class Foo extends Bar` where Bar is in the
 *      same file -> resolve outright).
 *   2. Cross-file: candidates whose file is reachable via Pass 1's
 *      rewired IMPORTS edges OR is in the same Java/Scala package.
 *   3. None -> stay unresolved.
 */
function resolveInheritance(
  opts:           CrossFileResolveOpts,
  row:            UnresolvedRelation,
  index:          EntityIndex,
  importsByFile:  Map<string, Set<string>>,
): ResolveIntent {
  const fromEntity = (index.byFile.get(row.fromFile) ?? []).find(e => e.id === row.fromEntity)
    ?? index.byId.get(row.fromEntity);
  if (fromEntity === undefined) {
    // Stale row; from-side was deleted. Phase 5 invalidation hooks
    // sweep these eventually.
    return UNRESOLVED;
  }

  const language = fromEntity.language;
  const targetKinds: EntityKind[] = row.kind === 'INHERITS'
    ? ['class', 'interface']  // a class can extend either
    : ['interface', 'class']; // IMPLEMENTS prefers interface; Scala traits may surface as class

  // Same-file
  for (const kind of targetKinds) {
    const sameFile = (index.byFile.get(row.fromFile) ?? [])
      .filter(e => e.language === language && e.kind === kind && e.name === row.rawTo);
    if (sameFile.length === 1) return { kind: 'resolved', targetId: sameFile[0]!.id };
    if (sameFile.length > 1) {
      return { kind: 'ambiguous', meta: { ...row.meta, candidates: sameFile.map(e => e.id) } };
    }
  }

  // Cross-file
  const fileEntity = index.fileEntities.get(row.fromFile);
  const importedFiles = fileEntity ? (importsByFile.get(fileEntity.id) ?? new Set<string>()) : new Set<string>();

  const candidates: Entity[] = [];
  for (const kind of targetKinds) {
    const all = index.byNameKindLang.get(entityKey(language, kind, row.rawTo)) ?? [];
    for (const e of all) {
      if (importedFiles.has(e.file) || isExportedFromSamePackage(fromEntity, e, opts.sourceRoots)) {
        candidates.push(e);
      }
    }
    if (candidates.length > 0) break;
  }

  if (candidates.length === 1) return { kind: 'resolved', targetId: candidates[0]!.id };
  if (candidates.length > 1) {
    return { kind: 'ambiguous', meta: { ...row.meta, candidates: candidates.map(e => e.id) } };
  }
  return UNRESOLVED;
}

/**
 * Resolve a CALLS row. The noisiest kind -- the parser emits one row
 * per invocation that didn't resolve to an in-file entity; this pass
 * matches each call against the in-scope set built from the from-file
 * (its own entities + exported entities from each imported file).
 */
function resolveCall(
  opts:           CrossFileResolveOpts,
  row:            UnresolvedRelation,
  index:          EntityIndex,
  importsByFile:  Map<string, Set<string>>,
  exports:        ExportMap,
): ResolveIntent {
  const fromEntity = (index.byFile.get(row.fromFile) ?? []).find(e => e.id === row.fromEntity)
    ?? index.byId.get(row.fromEntity);
  if (fromEntity === undefined) return UNRESOLVED;
  const language = fromEntity.language;

  // Same-file
  const sameFile = (index.byFile.get(row.fromFile) ?? [])
    .filter(e => e.language === language
              && CALL_TARGET_KINDS.includes(e.kind)
              && e.name === row.rawTo
              && e.id !== row.fromEntity);
  if (sameFile.length === 1) return { kind: 'resolved', targetId: sameFile[0]!.id };
  if (sameFile.length > 1) {
    return { kind: 'ambiguous', meta: { ...row.meta, candidates: sameFile.map(e => e.id) } };
  }

  // Cross-file
  const fileEntity = index.fileEntities.get(row.fromFile);
  const importedFiles = fileEntity ? (importsByFile.get(fileEntity.id) ?? new Set<string>()) : new Set<string>();
  if (importedFiles.size === 0) return UNRESOLVED;

  const found = new Map<string, Entity>();
  for (const kind of CALL_TARGET_KINDS) {
    const all = index.byNameKindLang.get(entityKey(language, kind, row.rawTo)) ?? [];
    for (const e of all) {
      if (!importedFiles.has(e.file)) continue;
      if (e.isExported !== true) continue;
      found.set(e.id, e);
    }
  }
  // Through re-exports: the name as each imported file exports it, alias and `export *` included.
  for (const path of importedFiles) {
    const imported = index.fileEntities.get(path);
    if (imported === undefined) continue;
    for (const e of exportedTargets(imported.id, row.rawTo, index, exports)) {
      if (e.language === language && CALL_TARGET_KINDS.includes(e.kind)) found.set(e.id, e);
    }
  }
  const candidates = [...found.values()];

  if (candidates.length === 1) return { kind: 'resolved', targetId: candidates[0]!.id };
  if (candidates.length > 1) {
    return { kind: 'ambiguous', meta: { ...row.meta, candidates: candidates.map(e => e.id) } };
  }
  return UNRESOLVED;
}

// ---------------------------------------------------------------------------
// Same-package visibility (Java / Scala)
// ---------------------------------------------------------------------------

/**
 * When two Java/Scala files live under the same source-root subtree
 * at the same package depth, the class is implicitly visible without
 * an explicit import. The import map alone misses these.
 */
function isExportedFromSamePackage(
  fromEntity:   Entity,
  candidate:    Entity,
  sourceRoots:  SourceRoots,
): boolean {
  if (fromEntity.language !== candidate.language) return false;
  if (fromEntity.language !== 'java' && fromEntity.language !== 'scala') return false;
  const roots = fromEntity.language === 'java' ? sourceRoots.java : sourceRoots.scala;
  for (const root of roots) {
    const fromUnder = fromEntity.file.startsWith(root + sep);
    const candUnder = candidate.file.startsWith(root + sep);
    if (!fromUnder || !candUnder) continue;
    const fromPkg = packageOf(fromEntity.file, root);
    const candPkg = packageOf(candidate.file, root);
    if (fromPkg === candPkg) return true;
  }
  return false;
}

function packageOf(filePath: string, root: string): string {
  const rel = filePath.slice(root.length + 1);  // strip "<root>/"
  const lastSep = rel.lastIndexOf(sep);
  if (lastSep === -1) return '';
  return rel.slice(0, lastSep).split(sep).join('.');
}

// ---------------------------------------------------------------------------
// Module name -> in-tree file path (per language)
// ---------------------------------------------------------------------------

function locateInTreeFile(
  moduleName:   string,
  language:     Language,
  sourceRoots:  SourceRoots,
): string | null {
  switch (language) {
    case 'java':       return locateJvm(moduleName, sourceRoots.java,  '.java');
    case 'scala':      return locateJvm(moduleName, sourceRoots.scala, '.scala');
    case 'python':     return locatePython(moduleName, sourceRoots.python);
    case 'go':         return locateGo(moduleName, sourceRoots.go);
    case 'typescript':
    case 'javascript':
      return locateTs(moduleName, language === 'typescript' ? sourceRoots.typescript : sourceRoots.javascript);
    default:           return null;
  }
}

/**
 * Java/Scala: a dotted name like `com.example.Foo` maps to
 * `<root>/com/example/Foo.<ext>` under any source root.
 */
function locateJvm(
  moduleName:  string,
  roots:       readonly string[],
  ext:         '.java' | '.scala',
): string | null {
  const parts = moduleName.split('.');
  if (parts.length < 2) return null;
  const relPath = parts.join(sep) + ext;
  for (const root of roots) {
    const candidate = join(root, relPath);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Python: `foo.bar.baz` -> `<root>/foo/bar/baz.py` or
 * `<root>/foo/bar/baz/__init__.py`.
 */
function locatePython(
  moduleName:  string,
  roots:       readonly string[],
): string | null {
  const parts = moduleName.split('.').filter(p => p !== '');
  if (parts.length === 0) return null;
  const relStem = parts.join(sep);
  for (const root of roots) {
    const direct = join(root, relStem + '.py');
    if (existsSync(direct)) return direct;
    const pkgInit = join(root, relStem, '__init__.py');
    if (existsSync(pkgInit)) return pkgInit;
  }
  return null;
}

/**
 * Go: import paths are full URLs (`github.com/foo/bar/pkg`). Strip
 * the module prefix from go.mod and check `<repoRoot>/<remainder>`
 * for any .go file.
 */
function locateGo(
  importPath:  string,
  go:          SourceRoots['go'],
): string | null {
  if (go === null) return null;
  const prefix = go.modulePath + '/';
  if (!importPath.startsWith(prefix) && importPath !== go.modulePath) return null;
  const rel = importPath === go.modulePath ? '' : importPath.slice(prefix.length);
  const dir = rel === '' ? go.repoRoot : join(go.repoRoot, rel);
  if (!existsSync(dir)) return null;
  let entries: string[];
  try {
    if (!statSync(dir).isDirectory()) return dir.endsWith('.go') ? dir : null;
    entries = readdirSync(dir);
  } catch { return null; }
  const goFiles = entries.filter(n => n.endsWith('.go') && !n.endsWith('_test.go'));
  if (goFiles.length === 0) return null;
  return join(dir, goFiles[0]!);
}

/**
 * TS / JS: rewrite `paths` mappings (e.g. `@/foo` -> `./foo`), then
 * probe under baseUrl with the standard extension candidates.
 */
function locateTs(
  specifier:  string,
  ts:         SourceRoots['typescript'],
): string | null {
  if (ts === null) return null;
  const candidates = expandTsPaths(specifier, ts);
  const exts = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  for (const c of candidates) {
    for (const ext of exts) {
      const probe = join(ts.baseUrl, c + (ext.startsWith('/') ? ext : ext));
      if (existsSync(probe)) return probe;
    }
  }
  return null;
}

function expandTsPaths(specifier: string, ts: NonNullable<SourceRoots['typescript']>): readonly string[] {
  const out: string[] = [specifier];
  for (const [pattern, targets] of ts.paths) {
    const star = pattern.indexOf('*');
    if (star === -1) {
      if (pattern === specifier) out.push(...targets);
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (specifier.startsWith(prefix) && specifier.endsWith(suffix) && specifier.length >= prefix.length + suffix.length) {
      const captured = specifier.slice(prefix.length, specifier.length - suffix.length);
      for (const t of targets) {
        out.push(t.replace('*', captured));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entity index -- 4 maps, built once per pass
// ---------------------------------------------------------------------------

interface EntityIndex {
  /** id -> entity. */
  readonly byId:           Map<string, Entity>;
  /** file path -> entities defined in that file (excludes file/module entities). */
  readonly byFile:         Map<string, Entity[]>;
  /** file path -> the file entity itself. */
  readonly fileEntities:   Map<string, Entity>;
  /** `<lang>:<kind>:<name>` -> entities matching that triple. */
  readonly byNameKindLang: Map<string, Entity[]>;
}

function buildEntityIndex(entities: readonly Entity[]): EntityIndex {
  const byId           = new Map<string, Entity>();
  const byFile         = new Map<string, Entity[]>();
  const fileEntities   = new Map<string, Entity>();
  const byNameKindLang = new Map<string, Entity[]>();

  for (const e of entities) {
    byId.set(e.id, e);
    if (e.kind === 'file') {
      fileEntities.set(e.file, e);
      continue;
    }
    if (e.kind === 'module') {
      // Module stubs have repo='' and shouldn't appear in
      // listEntitiesForRepo, but defensively skip if any leak through.
      continue;
    }
    const key = entityKey(e.language, e.kind, e.name);
    let nameArr = byNameKindLang.get(key);
    if (nameArr === undefined) { nameArr = []; byNameKindLang.set(key, nameArr); }
    nameArr.push(e);

    let fileArr = byFile.get(e.file);
    if (fileArr === undefined) { fileArr = []; byFile.set(e.file, fileArr); }
    fileArr.push(e);
  }

  return { byId, byFile, fileEntities, byNameKindLang };
}

function entityKey(lang: Language, kind: EntityKind, name: string): string {
  return `${lang}:${kind}:${name}`;
}

