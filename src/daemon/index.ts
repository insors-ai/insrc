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
import * as lancedb from '@lancedb/lancedb';
import { PATHS } from '../shared/paths.js';
import { setLogMode, getLogger } from '../shared/logger.js';

setLogMode('daemon');
const log = getLogger('daemon');
import { getDb, initDb, closeDb } from '../db/client.js';
import { listRepos, addRepo, removeRepo, updateRepoStatus } from '../db/repos.js';
import { Watcher } from '../indexer/watcher.js';
import { IndexQueue } from './queue.js';
import { IndexerService } from '../indexer/index.js';
import { IpcServer } from './server.js';
import { writePid, clearPid, isAlreadyRunning, bootstrapEmbeddingModel, getModelState } from './lifecycle.js';
import { resolveClosure, searchEntities, findCallers, findCallees, findDefinedIn } from '../db/search.js';
import { embedQuery } from '../indexer/embedder.js';
import {
  saveTurn, closeSession, seedFromPrior, deleteSessionsForRepo, pruneConversations,
  type TurnRecord,
} from '../db/conversations.js';
import {
  savePlan, getPlan, getActivePlan, updateStepState, getNextStep, deletePlan, resetStaleLocks,
} from '../agent/tasks/plan-store.js';
import type { RegisteredRepo, DaemonStatus, Entity, Plan, PlanStepStatus, ConfigScope, ConfigSearchOpts, TemplateQuery } from '../shared/types.js';
import { basename, dirname } from 'node:path';
import { ConfigStore } from '../config/store.js';
import { searchConfig, resolveTemplate } from '../config/search.js';
import { formatScope } from '../config/paths.js';

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // 1. Check for existing daemon
  if (isAlreadyRunning()) {
    log.error('already running — exiting');
    process.exit(1);
  }

  // 2. Ensure directories
  // Kuzu creates the DB directory itself — only ensure the parent exists
  mkdirSync(dirname(PATHS.graph), { recursive: true });
  mkdirSync(PATHS.lance,       { recursive: true });
  mkdirSync(PATHS.configStore, { recursive: true });
  mkdirSync(PATHS.templates,   { recursive: true });
  mkdirSync(PATHS.feedback,    { recursive: true });
  mkdirSync(PATHS.conventions, { recursive: true });
  mkdirSync(PATHS.logDir,      { recursive: true });

  // 3. Open DB
  const db = await getDb();
  await initDb(db);
  log.info('database ready');

  // 4. Bootstrap embedding model (async, non-blocking)
  void bootstrapEmbeddingModel();

  // 5. Load repos, start indexer
  const configLance = await lancedb.connect(PATHS.configStore);
  const configStore = new ConfigStore(configLance);

  const repos   = await listRepos(db);
  const watcher = new Watcher();
  const queue   = new IndexQueue();
  const indexer = new IndexerService(db, queue, watcher, configStore);

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
      const { text, limit, filter } = params as { text: string; limit?: number; filter?: string };
      const searchFilter = (filter === 'code' || filter === 'artifact') ? filter : 'all';
      log.debug({ query: text.slice(0, 120), limit: limit ?? 10, filter: searchFilter }, 'search.query request');
      const queryVec = await embedQuery(text);
      // Use all registered repos as the default closure scope
      const repos = (await listRepos(db)).map(r => r.path);
      const results = await searchEntities(db, queryVec, repos, limit ?? 10, searchFilter) as Entity[];
      log.debug({ query: text.slice(0, 60), hits: results.length, names: results.slice(0, 5).map(e => `${e.kind}:${e.name}`) }, 'search.query response');
      return results;
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

    // ----- Graph context helpers (Phase 7) -----

    'search.by_file': async (params) => {
      const { filePath } = params as { filePath: string };
      // Search LanceDB for all entities in this file
      const table = await (async () => {
        const names = await db.lance.tableNames();
        if (!names.includes('entities')) return null;
        return db.lance.openTable('entities');
      })();
      if (!table) return [];
      const rows = await table.query()
        .where(`file = '${filePath.replace(/'/g, "''")}'`)
        .toArray();
      return rows as Entity[];
    },

    'search.callers_nhop': async (params) => {
      const { entityId, hops } = params as { entityId: string; hops?: number };
      const maxHops = Math.min(hops ?? 1, 3); // cap at 3 to prevent explosion
      // For 1-hop, use the existing findCallers
      if (maxHops <= 1) return findCallers(db, entityId) as Promise<Entity[]>;

      // Multi-hop: BFS caller traversal
      const seen = new Set<string>();
      let frontier = [entityId];
      const allCallers: Entity[] = [];

      for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
        const nextFrontier: string[] = [];
        for (const eid of frontier) {
          if (seen.has(eid)) continue;
          seen.add(eid);
          const callers = await findCallers(db, eid);
          for (const c of callers) {
            if (!seen.has(c.id)) {
              allCallers.push(c);
              nextFrontier.push(c.id);
            }
          }
        }
        frontier = nextFrontier;
      }

      return allCallers;
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

    // ----- Plan graph (Phase 6) -----

    'plan.save': async (params) => {
      const plan = params as Plan;
      await savePlan(db, plan);
      return { ok: true };
    },

    'plan.get': async (params) => {
      const { planId, repoPath } = params as { planId?: string; repoPath?: string };
      if (planId) return getPlan(db, planId);
      if (repoPath) return getActivePlan(db, repoPath);
      return null;
    },

    'plan.step_update': async (params) => {
      const { stepId, status, note } = params as {
        stepId: string; status: PlanStepStatus; note?: string;
      };
      return updateStepState(db, stepId, status, note);
    },

    'plan.next_step': async (params) => {
      const { planId } = params as { planId: string };
      return getNextStep(db, planId);
    },

    'plan.delete': async (params) => {
      const { planId } = params as { planId: string };
      await deletePlan(db, planId);
      return { ok: true };
    },

    // Underscore aliases — match tool names from registry (LLM tool calls)
    'plan_get': async (params) => {
      const { repo } = params as { repo?: string };
      if (repo) return getActivePlan(db, repo);
      return null;
    },

    'plan_step_update': async (params) => {
      const { step_id, status, note } = params as {
        step_id: string; status: PlanStepStatus; note?: string;
      };
      return updateStepState(db, step_id, status, note);
    },

    'plan_next_step': async (params) => {
      const { planId } = params as { planId: string };
      return getNextStep(db, planId);
    },

    'plan.reset_stale': async (params) => {
      const { planId } = params as { planId: string };
      const count = await resetStaleLocks(db, planId);
      return { reset: count };
    },

    // ----- File re-index (Phase 7) -----

    'index.file': async (params) => {
      const { filePath, event } = params as { filePath: string; event?: 'create' | 'update' | 'delete' };
      queue.enqueue({ kind: 'file', filePath, event: event ?? 'update' });
      return { ok: true };
    },

    // ----- Config management -----

    'config.enqueue': async (params) => {
      const { filePath, scope, event } = params as {
        filePath: string; scope: ConfigScope; event: 'create' | 'update' | 'delete';
      };
      queue.enqueue({ kind: 'config-file', filePath, scope, event });
      return { ok: true };
    },

    'config.reindex': async (params) => {
      const { scope } = params as { scope: ConfigScope };
      queue.enqueue({ kind: 'config-reindex', scope });
      return { ok: true };
    },

    'config.search': async (params) => {
      const opts = params as ConfigSearchOpts;
      const queryVec = await embedQuery(opts.query);
      const results = await searchConfig(configStore, queryVec, opts);
      return results;
    },

    'config.list': async (params) => {
      const { namespace, category, scope } = params as {
        namespace?: string; category?: string; scope?: string;
      };
      return configStore.listEntries({ namespace, category, scope });
    },

    'config.resolveTemplate': async (params) => {
      const opts = params as TemplateQuery;
      const queryVec = await embedQuery(opts.name);
      return resolveTemplate(configStore, queryVec, opts);
    },

    'daemon.shutdown': async () => {
      log.info('shutdown requested');
      shutdown();
      return { ok: true };
    },
  });

  await server.listen();
  log.info('ready');

  // 8. Nightly pruning job — runs every 24 hours
  const PRUNE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  const pruneTimer = setInterval(async () => {
    try {
      const result = await pruneConversations(db);
      if (result.expired > 0 || result.capped > 0) {
        log.info(`pruned ${result.expired} expired + ${result.capped} capped sessions`);
      }
    } catch (err) {
      log.error({ err }, 'pruning error');
    }
  }, PRUNE_INTERVAL);

  // 9. Graceful shutdown on signals
  function shutdown(): void {
    log.info('shutting down...');
    clearInterval(pruneTimer);
    queue.stop();
    void watcher.close();
    void server.close();
    void queueDone.finally(async () => {
      await closeDb();
      clearPid();
      log.info('bye');
      process.exit(0);
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}

main().catch(err => {
  log.fatal({ err }, 'fatal error');
  process.exit(1);
});
