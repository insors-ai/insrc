/**
 * Daemon entry point.
 *
 * Startup sequence:
 *  1. Check for existing daemon (stale PID cleanup)
 *  2. Ensure ~/.insrc/ directories exist
 *  3. Open Kuzu + LanceDB and run schema migrations
 *  4. Bootstrap embedding model (non-blocking)
 *  5. Load registered repos, start watcher + queue
 *  6. Write PID file
 *  7. Start IPC server
 *  8. Handle SIGTERM / SIGINT for graceful shutdown
 */

import { mkdirSync } from 'node:fs';
import { PATHS } from '../shared/paths.js';
import { getDb, initDb, closeDb } from '../db/client.js';
import { listRepos, addRepo, removeRepo, updateRepoStatus } from '../db/repos.js';
import { Watcher } from '../indexer/watcher.js';
import { IndexQueue } from './queue.js';
import { IndexerService } from '../indexer/index.js';
import { IpcServer } from './server.js';
import { writePid, clearPid, isAlreadyRunning, bootstrapEmbeddingModel, getModelState } from './lifecycle.js';
import { resolveClosure, searchEntities, findCallers, findCallees } from '../db/search.js';
import { embedQuery } from '../indexer/embedder.js';
import {
  saveTurn, closeSession, seedFromPrior, deleteSessionsForRepo, pruneConversations,
  type TurnRecord,
} from '../db/conversations.js';
import type { RegisteredRepo, DaemonStatus, Entity } from '../shared/types.js';
import { basename } from 'node:path';

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // 1. Check for existing daemon
  if (isAlreadyRunning()) {
    console.error('[daemon] already running — exiting');
    process.exit(1);
  }

  // 2. Ensure directories
  mkdirSync(PATHS.graph,  { recursive: true });
  mkdirSync(PATHS.lance,  { recursive: true });
  mkdirSync(PATHS.logDir, { recursive: true });

  // 3. Open DB
  const db = await getDb();
  await initDb(db);
  console.log('[daemon] database ready');

  // 4. Bootstrap embedding model (async, non-blocking)
  void bootstrapEmbeddingModel();

  // 5. Load repos, start indexer
  const repos   = await listRepos(db);
  const watcher = new Watcher();
  const queue   = new IndexQueue();
  const indexer = new IndexerService(db, queue, watcher);

  await indexer.start(repos);

  // Run queue in background (never awaited until shutdown)
  const queueDone = queue.start(job => indexer.processJob(job));

  // 6. Write PID
  writePid();
  const startedAt = Date.now();

  // 7. Start IPC server
  const server = new IpcServer({
    'repo.add': async (params) => {
      const { path } = params as { path: string };
      const repo: RegisteredRepo = {
        path,
        name:     basename(path),
        addedAt:  new Date().toISOString(),
        status:   'pending',
      };
      await addRepo(db, repo);
      await indexer.addRepo(path);
      return { ok: true };
    },

    'repo.remove': async (params) => {
      const { path } = params as { path: string };
      await indexer.removeRepo(path);
      await removeRepo(db, path);
      return { ok: true };
    },

    'repo.list': async () => {
      return listRepos(db);
    },

    'daemon.status': async () => {
      const modelState = getModelState();
      const status: DaemonStatus = {
        uptime:            Math.floor((Date.now() - startedAt) / 1000),
        repos:             await listRepos(db),
        queueDepth:        queue.depth,
        embeddingsPending: queue.depth, // approximate
        modelPullStatus:   modelState.status === 'pulling' ? 'pulling' : 'ready',
        ...(modelState.pct !== undefined && { modelPullPct: modelState.pct }),
      };
      return status;
    },

    'search.query': async (params) => {
      const { text, limit } = params as { text: string; limit?: number };
      const queryVec = await embedQuery(text);
      // Use all registered repos as the default closure scope
      const repos = (await listRepos(db)).map(r => r.path);
      return searchEntities(db, queryVec, repos, limit ?? 10) as Promise<Entity[]>;
    },

    'search.closure': async (params) => {
      const { repoPath } = params as { repoPath: string };
      return resolveClosure(db, repoPath);
    },

    'search.callers': async (params) => {
      const { entityId } = params as { entityId: string };
      return findCallers(db, entityId) as Promise<Entity[]>;
    },

    'search.callees': async (params) => {
      const { entityId } = params as { entityId: string };
      return findCallees(db, entityId) as Promise<Entity[]>;
    },

    // ----- Session lifecycle (Phase 5) -----

    'session.save': async (params) => {
      const turn = params as TurnRecord;
      await saveTurn(db, turn);
      return { ok: true };
    },

    'session.close': async (params) => {
      const { id, repo, summary, seenEntities, summaryVector } = params as {
        id: string; repo: string; summary: string; seenEntities: string[]; summaryVector: number[];
      };
      await closeSession(db, { id, repo, summary, seenEntities }, summaryVector);
      return { ok: true };
    },

    'session.seed': async (params) => {
      const { repo, queryVector, limit } = params as {
        repo: string; queryVector: number[]; limit?: number;
      };
      return seedFromPrior(db, repo, queryVector, limit);
    },

    'session.forget': async (params) => {
      const { repo } = params as { repo: string };
      await deleteSessionsForRepo(db, repo);
      return { ok: true };
    },

    'session.prune': async () => {
      return pruneConversations(db);
    },

    'daemon.shutdown': async () => {
      console.log('[daemon] shutdown requested');
      shutdown();
      return { ok: true };
    },
  });

  await server.listen();
  console.log('[daemon] ready');

  // 8. Nightly pruning job — runs every 24 hours
  const PRUNE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  const pruneTimer = setInterval(async () => {
    try {
      const result = await pruneConversations(db);
      if (result.expired > 0 || result.capped > 0) {
        console.log(`[daemon] pruned ${result.expired} expired + ${result.capped} capped sessions`);
      }
    } catch (err) {
      console.error('[daemon] pruning error:', err);
    }
  }, PRUNE_INTERVAL);

  // 9. Graceful shutdown on signals
  function shutdown(): void {
    console.log('[daemon] shutting down...');
    clearInterval(pruneTimer);
    queue.stop();
    void watcher.close();
    void server.close();
    void queueDone.finally(async () => {
      await closeDb();
      clearPid();
      console.log('[daemon] bye');
      process.exit(0);
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}

main().catch(err => {
  console.error('[daemon] fatal:', err);
  process.exit(1);
});
