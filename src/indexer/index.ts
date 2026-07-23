import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, extname, resolve, relative, sep } from 'node:path';
import type { DbClient } from '../db/client.js';
import type { RegisteredRepo, IndexJob, ConfigScope } from '../shared/types.js';
import { upsertEntities } from '../db/entities.js';
import { upsertRelations, deleteRelationsForFile, deleteUnresolvedForFile } from '../db/relations.js';
import { runCrossFileResolver } from './cross-file-resolver.js';
import { detectSourceRoots } from './source-roots.js';
import { deleteEntitiesForFile, getEntity } from '../db/entities.js';
import { updateRepoStatus, lookupRepoId, UnregisteredRepoError } from '../db/repos.js';
import { SHARED_MODULES_REPO_ID } from '../shared/repo-namespaces.js';
import { embedEntities, embedText } from './embedder.js';
import { parseManifest } from './manifest.js';
import { resolveRelations } from './resolver.js';
import { getParser, supportedExtensions } from './parser/registry.js';
import { makeEntityId } from './parser/base.js';
// Side-effect imports — registers parsers so getParser() can find them
import './parser/typescript.js';
import './parser/python.js';
import './parser/go.js';
import './parser/java.js';
import './parser/scala.js';
import './parser/artifact.js';
import { basenameParser } from './parser/artifact.js';
import { Watcher, IGNORE_DIRS } from './watcher.js';
import { resolveRepoIgnore, initRepoIgnore } from './repo-ignore-config.js';
import { IndexQueue } from '../daemon/queue.js';
import { getLogger } from '../shared/logger.js';
import type { ConfigStore } from '../config/store.js';
import {
  parseConfigFrontmatter,
  stripFrontmatter,
} from '../config/frontmatter.js';
import {
  classifyConfigPath,
  configEntryId,
  inferNamespaceFromPath,
  formatScope,
  globalConfigDirs,
  projectConfigBase,
} from '../config/paths.js';

const log = getLogger('indexer');

// ---------------------------------------------------------------------------
// File walker — git-aware (respects .gitignore)
// ---------------------------------------------------------------------------

const IGNORE_SET = new Set(IGNORE_DIRS);

/**
 * List all files in a repo, respecting .gitignore when inside a git repo.
 *
 * Uses `git ls-files` which correctly handles:
 *   - nested .gitignore files
 *   - global gitignore (~/.config/git/ignore)
 *   - .git/info/exclude
 *
 * Falls back to the directory walker for non-git repos.
 */

/**
 * Skip patterns for generated / minified files. These have a parser
 * (e.g. tree-sitter-typescript handles `.mjs`) but indexing them is
 * unhelpful and pathologically expensive: a 1.5MB minified file
 * produces thousands of fake-looking entities, each ~8KB long, and
 * embedding 2548 entities × 16/batch × ~99s/batch on Ollama runs to
 * 4+ hours per file. Better to drop them here than burn the daemon
 * for an entire afternoon on a build artifact the user didn't want
 * indexed in the first place. Tested against:
 *
 *   `pdf.worker.min.mjs`        -> match (.min.mjs)
 *   `vendor.bundle.js`          -> match (.bundle.js)
 *   `react.production.min.js`   -> match (.min.js)
 *   `chunk-AB12CD.js`           -> no match (kept)
 *   `Component.test.ts`         -> no match (kept)
 */
const GENERATED_FILE_PATTERN = /\.(min|bundle|dist|production|prod)\.(js|mjs|cjs|css|html|json)$|[-_]min\.(js|mjs|cjs|css)$/i;

/**
 * @returns true if the file should be skipped because it's a build
 * artifact / minified output rather than source.
 */
function isGeneratedOrMinified(filePath: string): boolean {
  return GENERATED_FILE_PATTERN.test(filePath);
}

/** True when any path segment of `file` (relative to `repoPath`) is in the
 *  ignore set. Applies the ignore list to `git ls-files` output too — the git
 *  walker honours `.gitignore`, but a repo can COMMIT ignore-worthy dirs (e.g.
 *  insrc's own `.insrc/artifacts/*.md`), which `.gitignore` never excludes. */
function hasIgnoredSegment(file: string, repoPath: string, ignoreSet: Set<string>): boolean {
  return relative(repoPath, file).split(sep).some(seg => ignoreSet.has(seg));
}

function listRepoFiles(repoPath: string, ignore: readonly string[] = IGNORE_DIRS): string[] {
  const ignoreSet = new Set(ignore);
  if (!existsSync(join(repoPath, '.git'))) {
    log.debug({ repo: repoPath }, 'not a git repo, using directory walker');
    return [...walkFilesLegacy(repoPath, ignoreSet)];
  }

  try {
    // --cached: tracked files
    // --others: untracked files (new files not yet committed)
    // --exclude-standard: honour .gitignore, .git/info/exclude, global gitignore
    const stdout = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: repoPath, maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' },
    );
    const files = stdout.split('\0').filter(Boolean).map(f => resolve(repoPath, f))
      .filter(f => !hasIgnoredSegment(f, repoPath, ignoreSet));
    log.info({ repo: repoPath, files: files.length }, 'git ls-files');
    return files;
  } catch (err) {
    log.warn({ repo: repoPath, err: String(err) }, 'git ls-files failed, falling back to directory walker');
    return [...walkFilesLegacy(repoPath, ignoreSet)];
  }
}

/** Legacy directory walker — used as fallback for non-git repos. */
function* walkFilesLegacy(dir: string, ignoreSet: Set<string> = IGNORE_SET): Iterable<string> {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    if (ignoreSet.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFilesLegacy(full, ignoreSet);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function contentHash(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// IndexerService
// ---------------------------------------------------------------------------

export class IndexerService {
  private readonly db:      DbClient;
  private readonly queue:   IndexQueue;
  private readonly watcher: Watcher;
  private readonly supported: Set<string>;
  private readonly configStore: ConfigStore | null;
  /** Per-repo settle timer for the cross-file resolver pass (Phase 5).
   *  Each per-file index resets the repo's timer; when 2 s elapses with
   *  no further events for that repo, the cross-file pass runs over the
   *  files touched in the window. */
  private readonly settleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly settleScopeFiles: Map<string, Set<string>> = new Map();

  /**
   * Set of registered repo root paths -- the source of truth for
   * `repoForFile()`. Maintained in lockstep with `watcher.addRepo()`
   * / `removeRepo()`. The earlier `repoForFile()` walked up the
   * filesystem looking for `.git / package.json / go.mod` markers,
   * which silently picked up nested package.json files (e.g.
   * `src/insrc/package.json` under the IDE workspace) and
   * auto-allocated phantom Repo registry entries for the subdir
   * paths. Now we restrict to the explicitly-registered roots.
   */
  private readonly registeredRepos: Set<string> = new Set();

  /** How long to wait after the last file event before kicking the
   *  cross-file pass on the incremental path. Sits *on top of* the
   *  watcher's existing 200 ms event-debounce. */
  private readonly settleWindowMs: number;

  constructor(
    db: DbClient,
    queue: IndexQueue,
    watcher: Watcher,
    configStore?: ConfigStore | undefined,
    settleWindowMs: number = 2000,
  ) {
    this.db             = db;
    this.queue          = queue;
    this.watcher        = watcher;
    this.supported      = new Set(supportedExtensions());
    this.configStore    = configStore ?? null;
    this.settleWindowMs = settleWindowMs;
  }

  /**
   * Called once on daemon startup.
   * Starts watching all repos and enqueues full-index for pending ones.
   */
  async start(repos: RegisteredRepo[]): Promise<void> {
    log.info({ repos: repos.length }, 'indexer starting');
    this.watcher.onEvents(events => {
      for (const e of events) {
        // Check if this is a config file event
        const configScope = classifyConfigPath(e.path);
        if (configScope && e.path.endsWith('.md')) {
          this.queue.enqueue({
            kind: 'config-file',
            filePath: e.path,
            scope: configScope,
            event: e.type,
          });
          continue;
        }

        if (this.supported.has(extname(e.path).toLowerCase()) || basenameParser.handles(e.path)) {
          this.queue.enqueue({ kind: 'file', filePath: e.path, event: e.type });
        }
      }
    });

    for (const repo of repos) {
      // Defense-in-depth: `listRepos()` already filters out
      // `kind: 'shared-modules'` rows, but the indexer is also fed
      // by direct registry pokes (tests, recovery hooks) so we
      // re-check here. shared-modules rows have `path: ''` -- the
      // watcher would fail `subscribe()` on it, and the recovery
      // path would loop trying to `fullIndex()` a non-directory.
      if (repo.kind === 'shared-modules') {
        log.debug({ namespace: repo.namespace }, 'skipping synthetic shared-modules registry row');
        continue;
      }

      this.registeredRepos.add(repo.path);
      // Seed the per-repo ignore config for already-registered repos too
      // (idempotent) so every repo gets the externalized `.insrc` config,
      // not just fresh adds.
      await this.watcher.addRepo(repo.path, initRepoIgnore(repo.path));

      if (
        repo.status === 'pending' ||
        repo.status === 'error' ||
        (repo.status === 'indexing' && !repo.lastIndexed)
      ) {
        // 'pending':                 freshly-added repo, never indexed
        // 'error':                   prior run failed (e.g. resolver exception); retry on
        //                            startup since most error paths are code bugs that
        //                            shipped a fix in the deployed daemon. If the error
        //                            is persistent, operator sees it in the next-run logs.
        // 'indexing' && !lastIndexed: prior run was killed mid-pass before the first
        //                            successful checkpoint.
        log.info({ repo: repo.path, status: repo.status }, 'enqueuing full index (incomplete)');
        this.queue.enqueue({ kind: 'full', repoPath: repo.path });
      } else if (repo.status === 'ready' && repo.lastIndexed) {
        // Delta indexing: find files modified since last index
        const delta = this.detectDelta(repo.path, repo.lastIndexed);
        if (delta.length > 0) {
          log.info({ repo: repo.path, changed: delta.length }, 'delta index on startup');
          for (const filePath of delta) {
            this.queue.enqueue({ kind: 'file', filePath, event: 'update' });
          }
          // Update lastIndexed so next startup doesn't re-scan the same files
          await updateRepoStatus(this.db, repo.path, 'ready', new Date().toISOString());
        } else {
          log.info({ repo: repo.path }, 'no changes since last index');
        }
      }

      // Watch project config dir if it exists
      const projectConfig = projectConfigBase(repo.path);
      if (existsSync(projectConfig)) {
        await this.watcher.addConfigDir(projectConfig);
      }
    }

    // Watch global config dirs and enqueue initial config index
    if (this.configStore) {
      for (const dir of globalConfigDirs()) {
        if (existsSync(dir)) {
          await this.watcher.addConfigDir(dir);
        }
      }
      this.queue.enqueue({ kind: 'config-full', scope: { kind: 'global' } });
    }
  }

  /**
   * Detect files modified since last index using mtime comparison.
   * Returns absolute paths of files that need re-indexing.
   * Content-hash check in indexFile() will skip files that were
   * touched but not actually changed (e.g. `touch` or save-without-edit).
   */
  private detectDelta(repoPath: string, lastIndexed: string): string[] {
    const sinceMs = new Date(lastIndexed).getTime();
    if (Number.isNaN(sinceMs)) return [];

    const allFiles = listRepoFiles(repoPath, resolveRepoIgnore(repoPath));
    const changed: string[] = [];

    for (const filePath of allFiles) {
      const ext = extname(filePath).toLowerCase();
      if (!this.supported.has(ext) && !basenameParser.handles(filePath)) continue;

      try {
        const mtime = statSync(filePath).mtimeMs;
        if (mtime > sinceMs) {
          changed.push(filePath);
        }
      } catch {
        // File may have been deleted between ls-files and stat — skip
      }
    }

    return changed;
  }

  /** Add a repo: start watching + enqueue full index. */
  async addRepo(repoPath: string): Promise<void> {
    log.info({ repo: repoPath }, 'repo added, enqueuing full index');
    this.registeredRepos.add(repoPath);
    // Seed the per-repo .insrc ignore config (idempotent) + watch with it.
    const ignore = initRepoIgnore(repoPath);
    await this.watcher.addRepo(repoPath, ignore);
    this.queue.enqueue({ kind: 'full', repoPath });

    // Watch project config dir if it exists
    const projectConfig = projectConfigBase(repoPath);
    if (existsSync(projectConfig) && this.configStore) {
      await this.watcher.addConfigDir(projectConfig);
      this.queue.enqueue({ kind: 'config-full', scope: { kind: 'project', repoPath } });
    }
  }

  /** Remove a repo: stop watching. (DB cleanup handled by repos.removeRepo caller.) */
  async removeRepo(repoPath: string): Promise<void> {
    log.info({ repo: repoPath }, 'repo removed');
    this.registeredRepos.delete(repoPath);
    await this.watcher.removeRepo(repoPath);
  }

  /** Process a single IndexJob — called by the queue worker loop. */
  async processJob(job: IndexJob): Promise<void> {
    switch (job.kind) {
      case 'full':           await this.fullIndex(job.repoPath);            break;
      case 'file':           await this.fileEvent(job.filePath, job.event); break;
      case 'reembed':        await this.reembed(job.repoPath);             break;
      case 'config-full':    await this.configFullIndex(job.scope);         break;
      case 'config-file':    await this.configFileEvent(job.filePath, job.scope, job.event); break;
      case 'config-reindex': await this.configReindex(job.scope);           break;
      case 'doc-summarise-repo':   await this.docSummariseRepo(job.repoPath);   break;
      case 'doc-summarise-entity': await this.docSummariseEntity(job.entityId); break;
    }
  }

  // -------------------------------------------------------------------------
  // Job handlers
  // -------------------------------------------------------------------------

  private async fullIndex(repoPath: string): Promise<void> {
    log.info({ repo: repoPath }, 'full index started');
    await updateRepoStatus(this.db, repoPath, 'indexing');

    try {
      let fileCount = 0;
      let skipped = 0;
      let total = 0;
      const t0 = Date.now();

      const files = listRepoFiles(repoPath, resolveRepoIgnore(repoPath));
      const supported: string[] = [];
      let skippedGenerated = 0;
      for (const filePath of files) {
        const ext = extname(filePath).toLowerCase();
        const hasParser = this.supported.has(ext) || basenameParser.handles(filePath);
        if (!hasParser) continue;
        if (isGeneratedOrMinified(filePath)) {
          skippedGenerated++;
          continue;
        }
        supported.push(filePath);
      }
      log.info(
        { repo: repoPath, total: files.length, supported: supported.length, skippedGenerated },
        'full index: files to process',
      );

      for (const filePath of supported) {
        total++;
        if (total % 50 === 0 || total === 1) {
          log.info({ repo: repoPath, progress: `${total}/${supported.length}`, fileCount, skipped }, 'full index: progress');
        }
        try {
          const indexed = await this.indexFile(filePath, repoPath, false);
          if (indexed) fileCount++; else skipped++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error({ file: filePath, err: msg }, 'full index: file error (skipping)');
          skipped++;
        }
        // (LMDB substrate: no periodic checkpoint needed -- there's no
        // buffer pool to evict and msync runs at every txn commit.)

        // Periodic Lance compaction. addEntityEmbeddings creates a
        // new transaction + data file per source file; over a long
        // pass the manifest version count grows linearly and per-
        // commit fsync time grows with it. Empirically: Hadoop run
        // degraded from 3.8 to 5.1 s/file by file 2000. Every 500
        // files, run the VACUUM-equivalent so the per-write cost
        // stays flat. Cheap when nothing's accumulated; non-fatal on
        // error.
        if (total % 500 === 0) {
          try {
            const { compactEntityVecTable } = await import('../db/lance/entity-vec.js');
            const r = await compactEntityVecTable();
            log.info({ repo: repoPath, progress: total, ...r }, 'lance entity_vec compacted');
          } catch (err) {
            log.warn({ repo: repoPath, progress: total, err: err instanceof Error ? err.message : String(err) }, 'lance compact failed (non-fatal)');
          }
        }
      }

      // Emit DEPENDS_ON edges from repo manifest
      await this.indexManifest(repoPath);

      // Cross-file resolver: now that every file in the repo has been
      // parsed once, walk the unresolved relations and try to link
      // them up. See plans/cross-file-references.md §3-§5.
      //
      // Failure here is NOT recoverable inline -- the resolver is
      // load-bearing for cross-file analysis (graph_callers /
      // graph_callees / code-analyzer's tool loop all depend on the
      // post-resolve graph state). Letting the error propagate to the
      // outer catch correctly sets `status='error'` on the repo so the
      // next startup re-enqueues a full index instead of treating a
      // half-done index as ready.
      const sourceRoots = detectSourceRoots(repoPath);
      const cf = await runCrossFileResolver({ db: this.db, repoRoot: repoPath, sourceRoots });
      log.info({ repo: repoPath, ...cf }, 'cross-file pass after full index');

      // Build the entity_vec HNSW index now that the bulk-insert
      // phase is done. No-op below the row-count threshold; lazy
      // build above it. Search latency drops from brute-force scan
      // (~860 ms p99 at 1M rows) to ~10-50 ms p99 once this lands.
      try {
        const { optimizeEntityVecIndex } = await import('../db/lance/entity-vec.js');
        const r = await optimizeEntityVecIndex();
        if (r.built) {
          log.info({ repo: repoPath, rowCount: r.rowCount, elapsedMs: r.elapsedMs }, 'entity_vec HNSW index built');
        } else {
          log.debug({ repo: repoPath, rowCount: r.rowCount }, 'entity_vec HNSW index skipped (below threshold or already built)');
        }
      } catch (err) {
        log.warn({ repo: repoPath, err: err instanceof Error ? err.message : String(err) }, 'entity_vec index build failed (non-fatal; falls back to brute-force scan)');
      }

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      log.info({ repo: repoPath, fileCount, skipped, elapsed: `${elapsed}s` }, 'full index complete');
      await updateRepoStatus(this.db, repoPath, 'ready', new Date().toISOString());
      // Post-indexing doc summarisation (plans/docs-module.md Section 8).
      // Enqueued at background priority -- the queue runs it after
      // whatever else is pending. Skip-if-unchanged inside the driver
      // makes re-runs cheap; safe to fire on every full-index.
      this.queue.enqueue({ kind: 'doc-summarise-repo', repoPath });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ repo: repoPath, err: msg }, 'full index failed');
      await updateRepoStatus(this.db, repoPath, 'error', undefined, msg);
      throw err;
    }
  }

  private async fileEvent(
    filePath: string,
    event:    'create' | 'update' | 'delete',
  ): Promise<void> {
    log.debug({ file: filePath, event }, 'file event');
    const repoPath = this.repoForFile(filePath);
    if (repoPath === '') {
      // File isn't inside any registered repo -- skip silently.
      // Most often a stale watcher event after the repo was removed,
      // or a config-dir event the watcher forwarded outside the
      // classifyConfigPath() short-circuit at the top of onEvents().
      log.debug({ file: filePath, event }, 'file event skipped: not in any registered repo');
      return;
    }
    if (event === 'delete') {
      await deleteRelationsForFile(this.db, filePath);
      await deleteEntitiesForFile(this.db, filePath);
      await deleteUnresolvedForFile(this.db, filePath);
      log.info({ file: filePath }, 'file deleted from index');
      this.scheduleSettle(repoPath, filePath);
      return;
    }
    // create or update
    await this.indexFile(filePath, repoPath, true);
    this.scheduleSettle(repoPath, filePath);
    // Doc-summariser follow-up: if the touched file produced doc /
    // section entities, enqueue per-entity summarisation. Queue
    // dedups by entityId so rapid saves collapse; driver skip-if-
    // unchanged means re-fire on unchanged body is a cheap point
    // lookup + hash compare. See plans/docs-module.md Section 8.
    await this.enqueueDocSummarisationForFile(filePath);
  }

  private async enqueueDocSummarisationForFile(filePath: string): Promise<void> {
    const ext = extname(filePath).toLowerCase();
    if (ext !== '.md' && ext !== '.mdx') return;
    try {
      const { findEntitiesByFile } = await import('../db/entities.js');
      const entities = await findEntitiesByFile(this.db, filePath);
      for (const e of entities) {
        if (e.kind === 'document' || e.kind === 'section') {
          this.queue.enqueue({ kind: 'doc-summarise-entity', entityId: e.id });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ file: filePath, err: msg }, 'doc summarisation enqueue failed (non-fatal)');
    }
  }

  /**
   * Reset the repo's settle timer. After settleWindowMs of no further
   * events for the repo, fire the cross-file resolver pass scoped to
   * the files touched in the window. See plans/cross-file-references.md
   * §5.1.
   */
  private scheduleSettle(repoPath: string, filePath: string): void {
    if (repoPath === '') return;  // file outside any registered repo

    let scope = this.settleScopeFiles.get(repoPath);
    if (scope === undefined) {
      scope = new Set<string>();
      this.settleScopeFiles.set(repoPath, scope);
    }
    scope.add(filePath);

    const existing = this.settleTimers.get(repoPath);
    if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.settleTimers.delete(repoPath);
      void this.runSettlePass(repoPath).catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ repo: repoPath, err: msg }, 'settle pass failed');
      });
    }, this.settleWindowMs);
    timer.unref();  // don't keep the daemon alive just for the settle
    this.settleTimers.set(repoPath, timer);
  }

  private async runSettlePass(repoPath: string): Promise<void> {
    const scope = this.settleScopeFiles.get(repoPath);
    this.settleScopeFiles.delete(repoPath);
    if (scope === undefined || scope.size === 0) return;

    const sourceRoots = detectSourceRoots(repoPath);
    let totalResolved = 0, totalAmbiguous = 0, totalRewired = 0;
    for (const file of scope) {
      const result = await runCrossFileResolver({
        db: this.db, repoRoot: repoPath, sourceRoots, scopeFile: file,
      });
      totalResolved  += result.resolved;
      totalAmbiguous += result.ambiguous;
      totalRewired   += result.importsRewired;
    }
    log.info(
      { repo: repoPath, files: scope.size, resolved: totalResolved, ambiguous: totalAmbiguous, importsRewired: totalRewired },
      'cross-file settle pass complete',
    );
  }

  // ---------------------------------------------------------------------------
  // Doc summariser handlers (plans/docs-module.md Section 8)
  // ---------------------------------------------------------------------------

  /**
   * Sweep every doc + section entity in the repo, call the
   * summariser LLM per entity. Sequential (no parallel LLM);
   * skip-if-unchanged in the driver means unchanged bodies short-
   * circuit at a hash compare. Background priority -- the queue
   * runs it after all user-priority jobs drain.
   *
   * Failure of ANY single entity's summarisation is logged +
   * swallowed; the sweep continues so partial progress accumulates
   * even if some docs consistently break.
   */
  private async docSummariseRepo(repoPath: string): Promise<void> {
    const { summariseDoc } = await import('../analyze/summariser/index.js');
    const { listEntitiesForRepo } = await import('../db/entities.js');
    const entities = await listEntitiesForRepo(this.db, repoPath);
    const docs = entities.filter(e => e.kind === 'document' || e.kind === 'section');
    if (docs.length === 0) {
      log.debug({ repo: repoPath }, 'doc summariser: no doc entities in repo');
      return;
    }
    log.info({ repo: repoPath, count: docs.length }, 'doc summariser: sweep started');
    const t0 = Date.now();
    let summarised = 0, skipped = 0, failed = 0;
    for (const entity of docs) {
      try {
        const res = await summariseDoc({ db: this.db, entity });
        if (res.ok) {
          if (res.skipped === 'unchanged') skipped += 1;
          else                             summarised += 1;
        } else {
          failed += 1;
        }
      } catch (err) {
        // summariseDoc is designed not to throw for LLM/schema
        // failures, but a bug or an OOM could still throw. Log +
        // continue so one bad entity doesn't stop the sweep.
        failed += 1;
        log.warn(
          { repo: repoPath, entityId: entity.id, err: err instanceof Error ? err.message : String(err) },
          'doc summariser: entity threw (continuing sweep)',
        );
      }
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log.info(
      { repo: repoPath, summarised, skipped, failed, elapsed: `${elapsed}s` },
      'doc summariser: sweep complete',
    );
  }

  /**
   * Single-entity summarisation. Fired by the file-event handler
   * when a doc file changes. Cheap: driver skip-if-unchanged
   * makes no-op saves collapse to a hash compare.
   */
  private async docSummariseEntity(entityId: string): Promise<void> {
    const { summariseDoc } = await import('../analyze/summariser/index.js');
    const { getEntity } = await import('../db/entities.js');
    const entity = await getEntity(this.db, entityId);
    if (entity === null) {
      log.debug({ entityId }, 'doc summariser: entity gone (deleted between enqueue and run)');
      return;
    }
    try {
      await summariseDoc({ db: this.db, entity });
    } catch (err) {
      log.warn(
        { entityId, err: err instanceof Error ? err.message : String(err) },
        'doc summariser: single-entity threw (non-fatal)',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Reembed
  // ---------------------------------------------------------------------------

  private async reembed(repoPath: string): Promise<void> {
    // Loaded lazily to avoid a circular import with db/entities
    const { listUnembeddedEntities, updateEmbedding } = await import('../db/entities.js');
    const { EMBEDDING_MODEL }                          = await import('./embedder.js');
    const { Ollama }                                   = await import('ollama');

    const entities = await listUnembeddedEntities(this.db, repoPath);
    if (entities.length === 0) {
      log.debug({ repo: repoPath }, 'reembed: no unembedded entities');
      return;
    }

    log.info({ repo: repoPath, count: entities.length }, 'reembed started');
    const t0 = Date.now();
    await embedEntities(entities, { force: true });

    const ollama = new Ollama();
    void ollama; // suppress unused warning — embedEntities uses the module-level instance

    let updated = 0;
    for (const e of entities) {
      if (e.embedding.length > 0) {
        await updateEmbedding(this.db, e.id, e.embedding, EMBEDDING_MODEL);
        updated++;
      }
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log.info({ repo: repoPath, updated, total: entities.length, elapsed: `${elapsed}s` }, 'reembed complete');
  }

  // -------------------------------------------------------------------------
  // Core indexing pipeline: parse → resolve → embed → upsert
  // -------------------------------------------------------------------------

  /** @returns true if the file was indexed, false if skipped (unchanged or no parser). */
  private async indexFile(
    filePath:   string,
    repoPath:   string,
    cleanFirst: boolean,
  ): Promise<boolean> {
    const parser = getParser(filePath) ?? (basenameParser.handles(filePath) ? basenameParser : null);
    if (!parser) return false;

    let source: string;
    try { source = readFileSync(filePath, 'utf8'); }
    catch { return false; } // file disappeared between event and read

    const hash = contentHash(source);

    // Skip if unchanged (handles editor save-without-change)
    if (!cleanFirst) {
      const existing = await getEntity(this.db, makeEntityId(repoPath, filePath, 'file', filePath));
      if (existing?.hash === hash) {
        log.debug({ file: filePath }, 'skipped (unchanged)');
        return false;
      }
    } else {
      await deleteRelationsForFile(this.db, filePath);
      await deleteEntitiesForFile(this.db, filePath);
      await deleteUnresolvedForFile(this.db, filePath);
    }

    // Phase 5.x strict-contract: resolve the repoId once per file
    // and hand it to the parser. Lookup throws if the repo isn't
    // registered -- the indexer should always have called addRepo()
    // for any path it's indexing.
    const repoId = await lookupRepoId(repoPath);
    if (repoId === undefined) {
      throw new UnregisteredRepoError(repoPath);
    }

    // Parse
    const result = parser.parse(filePath, source, repoPath, repoId);

    // Stamp hash on the File entity
    const fileEntity = result.entities.find(e => e.kind === 'file' && e.file === filePath);
    if (fileEntity) fileEntity.hash = hash;

    // Resolve relative imports
    const resolved = resolveRelations(result.relations, filePath, repoPath, result.entities);
    const resolvedCount = resolved.filter(r => r.resolved).length;

    // Embed entities (no-op if Ollama is unavailable)
    await embedEntities(result.entities);

    // Persist
    await upsertEntities(this.db, result.entities);
    await upsertRelations(this.db, resolved);

    log.debug(
      { file: filePath, entities: result.entities.length, relations: resolved.length, resolved: resolvedCount },
      'indexed',
    );
    return true;
  }

  private async indexManifest(repoPath: string): Promise<void> {
    const deps = parseManifest(repoPath);
    if (deps.length === 0) {
      log.debug({ repo: repoPath }, 'no manifest dependencies');
      return;
    }
    log.info({ repo: repoPath, deps: deps.length }, 'indexing manifest dependencies');

    // Phase 5.x strict-contract: resolve the workspace's u32 repoId
    // and the npm namespace's reserved repoId for the module entities.
    // package.json deps are TypeScript / JavaScript ecosystem -> npm.
    const workspaceRepoId = await lookupRepoId(repoPath);
    if (workspaceRepoId === undefined) throw new UnregisteredRepoError(repoPath);

    const now             = new Date().toISOString();
    const repoEntityId    = makeEntityId(repoPath, '', 'repo', repoPath);
    const moduleNamespace = SHARED_MODULES_REPO_ID.npm;

    for (const dep of deps) {
      // Module entities are shared across repos by design (same dep
      // imported from many repos -> single moduleId). They route to
      // the reserved npm-namespace registry row (provisioned by the
      // v2->v3 migration); their `repo: ''` field stays for hash
      // compatibility but `repoId` is the structurally-enforced
      // handle.
      const moduleId = makeEntityId('npm', '', 'module', dep.name);
      await upsertEntities(this.db, [{
        id: moduleId, kind: 'module', name: dep.name, language: 'typescript',
        repoId: moduleNamespace, repo: '', file: '', startLine: 0, endLine: 0,
        body: '', embedding: [], indexedAt: now,
      }]);
      await upsertRelations(this.db, [{
        kind: 'DEPENDS_ON', from: repoEntityId, to: moduleId, resolved: true,
      }]);
    }
    void workspaceRepoId;  // not directly referenced in this loop, but
                           // the lookup serves as the strict-contract
                           // guard for the manifest path.
  }

  // -------------------------------------------------------------------------
  // Config indexing
  // -------------------------------------------------------------------------

  /** Walk config directories for a scope and index each .md file. */
  private async configFullIndex(scope: ConfigScope): Promise<void> {
    if (!this.configStore) return;
    const scopeStr = formatScope(scope);
    log.info({ scope: scopeStr }, 'config full index started');
    const t0 = Date.now();

    const dirs = scope.kind === 'global'
      ? globalConfigDirs()
      : [join(projectConfigBase(scope.repoPath), 'templates'),
         join(projectConfigBase(scope.repoPath), 'feedback'),
         join(projectConfigBase(scope.repoPath), 'conventions')];

    let indexed = 0;
    let skipped = 0;
    for (const dir of dirs) {
      for (const filePath of this.walkConfigDir(dir)) {
        const result = await this.indexConfigFile(filePath, scope);
        if (result) indexed++; else skipped++;
      }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log.info({ scope: scopeStr, indexed, skipped, elapsed: `${elapsed}s` }, 'config full index complete');
  }

  /** Handle a single config file create/update/delete event. */
  private async configFileEvent(
    filePath: string,
    scope: ConfigScope,
    event: 'create' | 'update' | 'delete',
  ): Promise<void> {
    if (!this.configStore) return;
    log.debug({ file: filePath, event, scope: formatScope(scope) }, 'config file event');

    if (event === 'delete') {
      // We need the namespace to compute the ID — infer from path
      const namespace = inferNamespaceFromPath(filePath);
      const id = configEntryId(scope, namespace, filePath);
      await this.configStore.deleteEntry(id);
      log.info({ file: filePath }, 'config entry deleted');
      return;
    }

    await this.indexConfigFile(filePath, scope);
  }

  /** Drop all config entries for a scope, then re-index from scratch. */
  private async configReindex(scope: ConfigScope): Promise<void> {
    if (!this.configStore) return;
    const scopeStr = formatScope(scope);
    log.info({ scope: scopeStr }, 'config reindex: dropping entries');
    await this.configStore.deleteByScope(scopeStr);
    await this.configFullIndex(scope);
  }

  /**
   * Parse, embed, and upsert a single config markdown file.
   * Skips unchanged files (content hash check).
   * @returns true if indexed, false if skipped.
   */
  private async indexConfigFile(filePath: string, scope: ConfigScope): Promise<boolean> {
    if (!this.configStore) return false;
    if (!filePath.endsWith('.md')) return false;

    let content: string;
    try { content = readFileSync(filePath, 'utf8'); }
    catch { return false; }

    const hash = contentHash(content);

    // Parse frontmatter
    let frontmatter;
    try {
      frontmatter = parseConfigFrontmatter(content);
    } catch (err) {
      log.warn({ file: filePath, err: String(err) }, 'config frontmatter parse failed');
      return false;
    }

    const namespace = frontmatter.namespace ?? inferNamespaceFromPath(filePath);
    const id = configEntryId(scope, namespace, filePath);

    // Skip if unchanged
    const existing = await this.configStore.getEntry(id);
    if (existing?.contentHash === hash) {
      log.debug({ file: filePath }, 'config entry skipped (unchanged)');
      return false;
    }

    const body = stripFrontmatter(content);

    // Embed the body text
    const embedding = await embedText(body);

    await this.configStore.upsertEntry({
      id,
      scope,
      namespace,
      category:    frontmatter.category,
      language:    frontmatter.language,
      name:        frontmatter.name,
      filePath,
      body,
      tags:        frontmatter.tags,
      updatedAt:   new Date().toISOString(),
      contentHash: hash,
      embedding,
    });

    log.debug({ file: filePath, namespace, category: frontmatter.category }, 'config entry indexed');
    return true;
  }

  /** Recursively list .md files in a config directory. */
  private walkConfigDir(dir: string): string[] {
    const results: string[] = [];
    if (!existsSync(dir)) return results;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.walkConfigDir(full));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push(full);
        }
      }
    } catch { /* ignore unreadable dirs */ }

    return results;
  }

  /**
   * Return the registered repo root that `filePath` belongs to, or
   * `''` if the file isn't inside any registered repo. Longest-prefix
   * match handles the nested-repo case (rare but legitimate -- e.g.
   * a sub-monorepo registered alongside its parent).
   *
   * Replaces an earlier walk-up-looking-for-markers implementation
   * that incorrectly treated any directory containing
   * `.git / package.json / go.mod / pyproject.toml` as a repo root,
   * silently auto-allocating phantom Repo registry rows for
   * subdirectories like `src/insrc/` that happened to ship their
   * own package.json.
   */
  private repoForFile(filePath: string): string {
    let best = '';
    for (const root of this.registeredRepos) {
      // Match either an exact equality or a strict child path
      // (`<root>/...`) -- not a sibling that shares a prefix
      // (e.g. `/foo` should NOT match `/foobar/x`).
      if (filePath === root || filePath.startsWith(root + '/')) {
        if (root.length > best.length) best = root;
      }
    }
    return best;
  }
}
