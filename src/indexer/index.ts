import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';
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
import { Watcher, IGNORE_DIRS } from './watcher.js';
import { IndexQueue } from '../daemon/queue.js';

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

const IGNORE_SET = new Set(IGNORE_DIRS);

function* walkFiles(dir: string): Iterable<string> {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    if (IGNORE_SET.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full);
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
    this.watcher.onEvents(events => {
      for (const e of events) {
        if (this.supported.has(extname(e.path).toLowerCase())) {
          this.queue.enqueue({ kind: 'file', filePath: e.path, event: e.type });
        }
      }
    });

    for (const repo of repos) {
      await this.watcher.addRepo(repo.path);
      if (repo.status === 'pending') {
        this.queue.enqueue({ kind: 'full', repoPath: repo.path });
      }
    }
  }

  /** Add a repo: start watching + enqueue full index. */
  async addRepo(repoPath: string): Promise<void> {
    await this.watcher.addRepo(repoPath);
    this.queue.enqueue({ kind: 'full', repoPath });
  }

  /** Remove a repo: stop watching. (DB cleanup handled by repos.removeRepo caller.) */
  async removeRepo(repoPath: string): Promise<void> {
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
    await updateRepoStatus(this.db, repoPath, 'indexing');

    try {
      for (const filePath of walkFiles(repoPath)) {
        if (!this.supported.has(extname(filePath).toLowerCase())) continue;
        await this.indexFile(filePath, repoPath, false);
      }

      // Emit DEPENDS_ON edges from repo manifest
      await this.indexManifest(repoPath);

      await updateRepoStatus(this.db, repoPath, 'ready', new Date().toISOString());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateRepoStatus(this.db, repoPath, 'error', undefined, msg);
      throw err;
    }
  }

  private async fileEvent(
    filePath: string,
    event:    'create' | 'update' | 'delete',
  ): Promise<void> {
    if (event === 'delete') {
      await deleteRelationsForFile(this.db, filePath);
      await deleteEntitiesForFile(this.db, filePath);
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
    if (entities.length === 0) return;

    await embedEntities(entities, { force: true });

    const ollama = new Ollama();
    void ollama; // suppress unused warning — embedEntities uses the module-level instance

    for (const e of entities) {
      if (e.embedding.length > 0) {
        await updateEmbedding(this.db, e.id, e.embedding, EMBEDDING_MODEL);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Core indexing pipeline: parse → resolve → embed → upsert
  // -------------------------------------------------------------------------

  private async indexFile(
    filePath:   string,
    repoPath:   string,
    cleanFirst: boolean,
  ): Promise<void> {
    const parser = getParser(filePath);
    if (!parser) return;

    let source: string;
    try { source = readFileSync(filePath, 'utf8'); }
    catch { return; } // file disappeared between event and read

    const hash = contentHash(source);

    // Skip if unchanged (handles editor save-without-change)
    if (!cleanFirst) {
      const existing = await getEntity(this.db, makeEntityId(repoPath, filePath, 'file', filePath));
      if (existing?.hash === hash) return;
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
    const resolved = resolveRelations(result.relations, filePath, repoPath);

    // Embed entities (no-op if Ollama is unavailable)
    await embedEntities(result.entities);

    // Persist
    await upsertEntities(this.db, result.entities);
    await upsertRelations(this.db, resolved);
  }

  private async indexManifest(repoPath: string): Promise<void> {
    const deps = parseManifest(repoPath);
    if (deps.length === 0) return;

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
