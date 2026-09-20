import { statSync } from 'node:fs';
import { join } from 'node:path';

import type { GraphStore } from '../db/graph/store.js';
import { decodeEntityRow } from '../db/graph/codec.js';
import { decodeEntityKey, decodeOutEdgeKey } from '../db/graph/keys.js';
import type {
  EntityKind,
  Language,
  RegisteredRepo,
  RepoStats,
} from '../shared/types.js';
import type { IndexQueue } from './queue.js';

/**
 * Per-repo index statistics (Story add-new-repo-stats-daemon-ipc / S001).
 *
 * `buildRepoStats` is the PURE aggregator: it groups decoded entity rows and
 * pre-resolved relation source-repos per registered repo and fills each
 * `RepoStats` — with all side-effecting reads (on-disk sizing, queue depth)
 * injected via `sizeOf` / `pendingFor`, so the counting/grouping is
 * deterministic and unit-testable off-socket.
 *
 * `collectRepoStats` is the thin store/fs/queue-reading caller the `repo.stats`
 * IPC handler uses: it scans the entity sub-DB once (building a u64→repo map)
 * and the out-edge sub-DB once (attributing each relation to its SOURCE
 * entity's repo), sizes each repo's distinct source files best-effort, reads
 * the per-repo queue depth, and delegates to `buildRepoStats`. Read-only.
 */

/** One decoded entity row, reduced to the fields the aggregator groups by. */
export interface RepoStatsEntity {
  repo:     string; // repo root absolute path
  file:     string; // absolute source-file path
  kind:     EntityKind;
  language: Language;
}

interface Acc {
  files:      Map<string, Set<string>>; // language -> distinct file paths (that language)
  distinct:   Set<string>;              // distinct file paths (any language)
  entities:   number;
  byKind:     Map<string, number>;
  relations:  number;
}

/**
 * The PURE per-repo aggregator. Emits one `RepoStats` per `registeredRepos`
 * entry, in that order; a registered repo with zero entities yields a
 * zero-count `RepoStats` (present, never omitted). Entity rows / relation
 * source-repos whose repo is not a registered repo are ignored (never invents
 * a repo).
 */
export function buildRepoStats(input: {
  entities:            Iterable<RepoStatsEntity>;
  relationSourceRepos: Iterable<string>;
  registeredRepos:     RegisteredRepo[];
  sizeOf:              (repoPath: string, files: ReadonlySet<string>) => number;
  pendingFor:          (repoPath: string) => number;
}): RepoStats[] {
  const { entities, relationSourceRepos, registeredRepos, sizeOf, pendingFor } = input;

  const known = new Set(registeredRepos.map(r => r.path));
  const acc = new Map<string, Acc>();
  for (const path of known) {
    acc.set(path, {
      files:     new Map(),
      distinct:  new Set(),
      entities:  0,
      byKind:    new Map(),
      relations: 0,
    });
  }

  for (const e of entities) {
    const a = acc.get(e.repo);
    if (a === undefined) continue; // row for an unregistered repo — ignore
    a.entities++;
    a.byKind.set(e.kind, (a.byKind.get(e.kind) ?? 0) + 1);
    a.distinct.add(e.file);
    let langFiles = a.files.get(e.language);
    if (langFiles === undefined) { langFiles = new Set(); a.files.set(e.language, langFiles); }
    langFiles.add(e.file);
  }

  for (const repo of relationSourceRepos) {
    const a = acc.get(repo);
    if (a === undefined) continue; // dangling / cross-into-unregistered — ignore
    a.relations++;
  }

  return registeredRepos.map(r => {
    const a = acc.get(r.path)!;
    const filesByLanguage: Record<string, number> = {};
    for (const [lang, files] of a.files) filesByLanguage[lang] = files.size;
    const entityCountByKind: Record<string, number> = {};
    for (const [kind, n] of a.byKind) entityCountByKind[kind] = n;
    return {
      repoPath:          r.path,
      status:            r.status,
      ...(r.lastIndexed !== undefined ? { lastIndexed: r.lastIndexed } : {}),
      addedAt:           r.addedAt,
      ...(r.errorMsg !== undefined && r.errorMsg !== '' ? { errorMsg: r.errorMsg } : {}),
      fileCount:         a.distinct.size,
      filesByLanguage,
      entityCount:       a.entities,
      entityCountByKind,
      relationCount:     a.relations,
      sizeBytes:         sizeOf(r.path, a.distinct),
      pendingJobs:       pendingFor(r.path),
    };
  });
}

/**
 * The thin store/fs/queue-reading caller. One `entity` scan builds the reduced
 * rows + a u64→repo map; one `outEdge` scan resolves each edge's SOURCE u64 to
 * a repo (a dangling source is skipped). Sizing sums `statSync().size` over a
 * repo's distinct files, contributing 0 for a file that vanished since indexing
 * (best-effort — never throws for a readable store). Read-only.
 */
export function collectRepoStats(
  store: GraphStore,
  registeredRepos: RegisteredRepo[],
  queue: IndexQueue,
): RepoStats[] {
  const entities: RepoStatsEntity[] = [];
  const u64ToRepo = new Map<bigint, string>();

  for (const { key, value } of store.entity.getRange()) {
    const row = decodeEntityRow(value as Buffer);
    const repo = row.rootPath;
    const file = join(row.rootPath, row.filePath);
    entities.push({ repo, file, kind: row.kind, language: row.language });
    u64ToRepo.set(decodeEntityKey(key as Buffer), repo);
  }

  // A lazy generator over the out-edges: each edge's SOURCE u64 resolved to its
  // repo (a dangling source not in the map is skipped). Passed straight to
  // buildRepoStats' Iterable<string> so the edge scan streams — no per-edge
  // array is materialized on a large graph.
  function* relationSourceRepos(): Generator<string> {
    for (const { key } of store.outEdge.getRange()) {
      const { from } = decodeOutEdgeKey(key as Buffer);
      const repo = u64ToRepo.get(from);
      if (repo !== undefined) yield repo;
    }
  }

  const sizeOf = (_repoPath: string, files: ReadonlySet<string>): number => {
    let total = 0;
    for (const file of files) {
      try { total += statSync(file).size; } catch { /* deleted since indexing — best-effort 0 */ }
    }
    return total;
  };

  return buildRepoStats({
    entities,
    relationSourceRepos: relationSourceRepos(),
    registeredRepos,
    sizeOf,
    pendingFor: (repoPath) => queue.depthForRepo(repoPath),
  });
}
