import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, extname, resolve } from 'node:path';
import type { DbClient } from '../db/client.js';
import type { RegisteredRepo, IndexJob } from '../shared/types.js';
import { upsertEntities } from '../db/entities.js';
import { upsertRelations, deleteRelationsForFile } from '../db/relations.js';
import { deleteEntitiesForFile, getEntity } from '../db/entities.js';
import { updateRepoStatus } from '../db/repos.js';
import { embedEntities } from './embedder.js';
import { parseManifest } from './manifest.js';
import { resolveRelations } from './resolver.js';
import { getParser, supportedExtensions } from './parser/registry.js';
import { makeEntityId } from './parser/base.js';
// Side-effect imports — registers parsers so getParser() can find them
import './parser/typescript.js';
import './parser/python.js';
import './parser/go.js';
import './parser/artifact.js';
import { basenameParser } from './parser/artifact.js';
import { Watcher, IGNORE_DIRS } from './watcher.js';
import { IndexQueue } from '../daemon/queue.js';
import { getLogger } from '../shared/logger.js';

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
function listRepoFiles(repoPath: string): string[] {
  if (!existsSync(join(repoPath, '.git'))) {
    log.debug({ repo: repoPath }, 'not a git repo, using directory walker');
    return [...walkFilesLegacy(repoPath)];
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
    const files = stdout.split('\0').filter(Boolean).map(f => resolve(repoPath, f));
    log.info({ repo: repoPath, files: files.length }, 'git ls-files');
    return files;
  } catch (err) {
    log.warn({ repo: repoPath, err: String(err) }, 'git ls-files failed, falling back to directory walker');
    return [...walkFilesLegacy(repoPath)];
  }
}

/** Legacy directory walker — used as fallback for non-git repos. */
function* walkFilesLegacy(dir: string): Iterable<string> {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    if (IGNORE_SET.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFilesLegacy(full);
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

  constructor(db: DbClient, queue: IndexQueue, watcher: Watcher) {
    this.db        = db;
    this.queue     = queue;
    this.watcher   = watcher;
    this.supported = new Set(supportedExtensions());
  }

  /**
   * Called once on daemon startup.
   * Starts watching all repos and enqueues full-index for pending ones.
   */
  async start(repos: RegisteredRepo[]): Promise<void> {
    log.info({ repos: repos.length }, 'indexer starting');
    this.watcher.onEvents(events => {
      for (const e of events) {
        if (this.supported.has(extname(e.path).toLowerCase()) || basenameParser.handles(e.path)) {
          this.queue.enqueue({ kind: 'file', filePath: e.path, event: e.type });
        }
      }
    });

    for (const repo of repos) {
      await this.watcher.addRepo(repo.path);
      if (repo.status === 'pending') {
        log.info({ repo: repo.path }, 'enqueuing full index (pending)');
        this.queue.enqueue({ kind: 'full', repoPath: repo.path });
      }
    }
  }

  /** Add a repo: start watching + enqueue full index. */
  async addRepo(repoPath: string): Promise<void> {
    log.info({ repo: repoPath }, 'repo added, enqueuing full index');
    await this.watcher.addRepo(repoPath);
    this.queue.enqueue({ kind: 'full', repoPath });
  }

  /** Remove a repo: stop watching. (DB cleanup handled by repos.removeRepo caller.) */
  async removeRepo(repoPath: string): Promise<void> {
    log.info({ repo: repoPath }, 'repo removed');
    await this.watcher.removeRepo(repoPath);
  }

  /** Process a single IndexJob — called by the queue worker loop. */
  async processJob(job: IndexJob): Promise<void> {
    switch (job.kind) {
      case 'full':   await this.fullIndex(job.repoPath);            break;
      case 'file':   await this.fileEvent(job.filePath, job.event); break;
      case 'reembed': await this.reembed(job.repoPath);             break;
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
      const t0 = Date.now();

      for (const filePath of listRepoFiles(repoPath)) {
        const ext = extname(filePath).toLowerCase();
        const hasParser = this.supported.has(ext) || basenameParser.handles(filePath);
        if (!hasParser) continue;
        const indexed = await this.indexFile(filePath, repoPath, false);
        if (indexed) fileCount++; else skipped++;
      }

      // Emit DEPENDS_ON edges from repo manifest
      await this.indexManifest(repoPath);

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      log.info({ repo: repoPath, fileCount, skipped, elapsed: `${elapsed}s` }, 'full index complete');
      await updateRepoStatus(this.db, repoPath, 'ready', new Date().toISOString());
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
    if (event === 'delete') {
      await deleteRelationsForFile(this.db, filePath);
      await deleteEntitiesForFile(this.db, filePath);
      log.info({ file: filePath }, 'file deleted from index');
      return;
    }
    // create or update
    await this.indexFile(filePath, this.repoForFile(filePath), true);
  }

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
    }

    // Parse
    const result = parser.parse(filePath, source, repoPath);

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

    const now      = new Date().toISOString();
    const repoId   = makeEntityId(repoPath, '', 'repo', repoPath);

    for (const dep of deps) {
      const moduleId = makeEntityId('', '', 'module', dep.name);
      await upsertEntities(this.db, [{
        id: moduleId, kind: 'module', name: dep.name, language: 'typescript',
        repo: '', file: '', startLine: 0, endLine: 0,
        body: '', embedding: [], indexedAt: now,
      }]);
      await upsertRelations(this.db, [{
        kind: 'DEPENDS_ON', from: repoId, to: moduleId, resolved: true,
      }]);
    }
  }

  // Infer repo root from a file path (walks up to find package.json / go.mod / .git)
  private repoForFile(filePath: string): string {
    let dir = filePath;
    while (true) {
      const parent = join(dir, '..');
      if (parent === dir) return dir;
      dir = parent;
      try {
        const entries = readdirSync(dir);
        if (entries.some(e => ['.git', 'package.json', 'go.mod', 'pyproject.toml'].includes(e))) {
          return dir;
        }
      } catch { continue; }
    }
  }
}
