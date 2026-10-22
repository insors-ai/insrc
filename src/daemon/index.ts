import { UnderstandingService } from '../understanding/service.js';
/**
 * Daemon entry point.
 *
 * Startup sequence:
 *  1. Check for existing daemon (stale PID cleanup)
 *  2. Ensure ~/.insrc/ directories exist
 *  3. Open DuckDB and apply the schema (graph + vector tables)
 *  4. Bootstrap embedding model (non-blocking)
 *  5. Load registered repos, start watcher + queue
 *  6. Write PID file
 *  7. Start IPC server
 *  8. Handle SIGTERM / SIGINT for graceful shutdown
 */

import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { runBootSteeringRefresh } from './steering-inject.js';
import { PATHS } from '../shared/paths.js';
import { setLogMode, getLogger } from '../shared/logger.js';

setLogMode('daemon');
const log = getLogger('daemon');

// ---------------------------------------------------------------------------
// Top-level crash handlers
// ---------------------------------------------------------------------------
//
// See ./fatal.ts for what is logged and where. The handler ends the process;
// with the graph store's locks lost it does so without process.exit.
const fatalDeps = { logFatal: (o: object, m: string) => { log.fatal(o, m); } };
process.on('uncaughtException',  (err) =>    reportFatal('uncaughtException',  err, fatalDeps));
process.on('unhandledRejection', (reason) => reportFatal('unhandledRejection', reason, fatalDeps));

import { getDb, initDb, closeDb } from '../db/client.js';
import { closeDuckDB } from './db/duckdb-pool.js';
import { listRepos } from '../db/repos.js';
import { Watcher } from '../indexer/watcher.js';
import { IndexQueue } from './queue.js';
import { IndexerService } from '../indexer/index.js';
import { IpcServer, directDispatch } from './server.js';
import { declareLiveStoreOwner } from '../db/graph/store.js';
import { installStoreFileOpenDiagnostic } from './store-file-open-diagnostic.js';
import { reportFatal } from './fatal.js';
import { createShutdown, exitRespectingStoreHealth } from './shutdown.js';
import { buildHandlerRuntime } from './handler-runtime.js';
import { initChatHandlers, disposeChatHandlers } from './chat-handler.js';
// Phase 1 cleanup: handoff-stream, meta-task-stream, gate-handlers, orphan-handlers,
// the chat agent-flow exports (chatReply, chatRedirect, brainstormAddIdea, chatSend,
// chatResume + variants), and handoff/orphan-cleanup detectOrphans all return
// `backend offline` via the inline helpers below. Their backing files get deleted
// in Phase 2-3.

import { createInDaemonClient, installStepDaemonClient } from './steps/daemon-client.js';

import { writePid, isAlreadyRunning, bootstrapEmbeddingModel, getModelState } from './lifecycle.js';
import { readInstalledCommit } from './installed-commit.js';
import { ThreadServices, currentLmdbFileSizeMb, threadsEnabled } from './threads/main-services.js';
import { embedQuery, getActiveEmbedderBackend } from '../indexer/embedder.js';
import { pruneConversations } from '../db/conversations.js';
import { compactConversations } from '../db/compaction.js';
// Cleanup: plan-store + Plan / PlanStepStatus dropped with the legacy planner.
import { ConfigStore } from '../config/store.js';
import { reconcileConfigFile } from '../config/reconcile-io.js';
import * as todosRpc from './todos-rpc.js';

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	// 0. This process owns the live graph store; every other process is
	//    refused it (Epic c2ba6fa6, Story s4).
	declareLiveStoreOwner();
	// Log any open of the store's own files in this process, with its stack:
	// the code that drops the daemon's lock on the store is not identified.
	installStoreFileOpenDiagnostic();

	// 1. Check for existing daemon
	if (isAlreadyRunning()) {
		log.error('already running — exiting');
		process.exit(1);
	}

	// 2. Ensure directories
	mkdirSync(PATHS.insrc, { recursive: true });

	// One-time cleanup of orphaned legacy on-disk state from prior
	// storage substrates. Idempotent: silently no-ops once the files
	// are gone.
	//
	//   PATHS.graph        -- old Kuzu DB directory (replaced by LMDB)
	//   PATHS.duckdb       -- old file-backed DuckDB consolidation
	//                         experiment (replaced by LMDB + Lance)
	//   PATHS.configStore  -- old Lance config-store directory
	//                         (config vectors now live as a table
	//                         inside PATHS.lance alongside the
	//                         entity / session / turn vectors)
	//
	// PATHS.lance is the ACTIVE Lance store and must NOT be in this
	// list -- a regression that wiped it on every boot landed alongside
	// the DuckDB-storage delete and was caught during the Phase 6.3
	// header sweep.
	for (const stale of [
		PATHS.graph,
		`${PATHS.graph}.wal`,
		`${PATHS.graph}.shadow`,
		PATHS.duckdb,
		`${PATHS.duckdb}.wal`,
		PATHS.configStore,
	]) {
		try {
			if (existsSync(stale)) {
				rmSync(stale, { recursive: true, force: true });
				log.info({ path: stale }, 'removed legacy storage state on post-migration boot');
			}
		} catch (err) {
			log.warn({ path: stale, err: err instanceof Error ? err.message : String(err) },
				'failed to remove legacy storage state -- non-fatal, retry on next boot');
		}
	}

	mkdirSync(PATHS.templates, { recursive: true });
	mkdirSync(PATHS.feedback, { recursive: true });
	mkdirSync(PATHS.conventions, { recursive: true });
	mkdirSync(PATHS.logDir, { recursive: true });

	// 2b. Reconcile config.json against the catalog — the AUTHORITATIVE
	//     reconcile point. UNCONDITIONAL (no existsSync short-circuit): reads
	//     the current config, carries every value it can, and fills/repairs the
	//     rest from catalog defaults, writing at most once and only when
	//     something changed. An absent file reduces EXACTLY to the former
	//     write-defaults behaviour (every former literal key deep-equals its
	//     catalog default — see the boot-reconcile test), so a config that
	//     predates a schema change is brought up to shape on the next boot. It
	//     runs before the DB opens (step 3) and must NEVER abort boot: a failure
	//     is logged (once) and retried on the next boot, mirroring the
	//     legacy-storage sweep above. A ConfigCatalogError (a bug in our own
	//     shipped catalog) is logged distinguishably from a user-config or I/O
	//     failure.
	try {
		const outcome = reconcileConfigFile();
		switch (outcome.kind) {
			case 'first-boot':
				log.info('created default config.json (catalog defaults)');
				break;
			case 'written':
				log.info({ filled: outcome.result.filled.length, repaired: outcome.result.repaired.length, pruned: outcome.result.pruned.length },
					'reconciled config.json against catalog');
				break;
			case 'unchanged':
				break;
			case 'parse-error':
				log.warn({ path: PATHS.config, err: outcome.message, offset: outcome.offset },
					'config.json is not valid JSON -- left untouched, wrote nothing (fix or delete it)');
				break;
			case 'catalog-error':
				log.warn({ catalogPath: outcome.catalogPath, err: outcome.message },
					'SHIPPED-CATALOG BUG: config catalog is self-inconsistent -- config left untouched');
				break;
			case 'read-error':
				log.warn({ path: PATHS.config, errno: outcome.errno, err: outcome.message },
					'could not read config.json -- non-fatal, retry on next boot');
				break;
			case 'write-error':
				log.warn({ path: PATHS.config, err: outcome.message },
					'failed to write reconciled config.json -- non-fatal, retry on next boot');
				break;
			case 'concurrent-modification':
				log.warn({ path: PATHS.config },
					'config.json changed during reconcile -- write abandoned, retry on next boot');
				break;
		}
	} catch (err) {
		// Defensive: reconcileConfigFile is designed never to throw, but boot
		// must survive even a programmer error here.
		log.warn({ err: err instanceof Error ? err.message : String(err) },
			'config reconcile threw -- non-fatal, retry on next boot');
	}

	// 2c. One-shot Phase 0 agent-family rename migration (idempotent).
	// Rewrites any persisted `agentId: 'pair' | 'delegate'` to the new
	// `{ agentId: 'implementation', agentVariant: <prior> }` shape and
	// moves `~/.insrc/<category>/pair|delegate/` dirs under
	// `.../implementation/`. Runs before DB init so downstream loaders
	// see a consistent view.
	// Phase 1 cleanup: agent-family-migration gone with the agent subsystem.

	// 2d. With daemon.threads.enabled, the main thread's services for its
	//     workers (Epic 86197ac6 s2): the shared blocks, installed here before
	//     any store is used, and the hub each worker is served over.
	const threadServices = threadsEnabled()
		? new ThreadServices(() => ({
			startedAt,
			modelState: getModelState(),
			installedCommit: readInstalledCommit(),
			lmdbFileSizeMb: currentLmdbFileSizeMb(),
		}))
		: undefined;
	if (threadServices !== undefined) log.info('daemon threads enabled');

	// 3. Open DB
	const db = await getDb();
	await initDb(db);
	const { initTodosTables } = await import('../db/todos.js');
	await initTodosTables(db);
	log.info('database ready');

	// 3b. LMDB reader-table sweep at boot. Killed daemons leave their
	//     reader-slot occupied, which pins the writer's free-list and
	//     bloats the file until the slot is released. mdb_reader_check
	//     drops slots whose PID no longer exists. Cheap; non-fatal if
	//     it finds anything.
	const { getGraphStore, runReaderCheck, startPeriodicReaderCheck } = await import('../db/graph/store.js');
	await getGraphStore();   // ensure env is open
	runReaderCheck('startup');

	// 4. Bootstrap embedding model (async, non-blocking)
	void bootstrapEmbeddingModel()
		.then(() => threadServices?.setEmbedderBackend(getActiveEmbedderBackend()))
		.catch(() => { /* the bootstrap logs its own failures */ });

	// 5. Load repos, start indexer
	const configStore = new ConfigStore(db);

	const repos = await listRepos(db);
	const watcher = new Watcher();
	const queue = new IndexQueue();
	const indexer = new IndexerService(db, queue, watcher, configStore);

	await indexer.start(repos);

	// 5b. Boot-time steering refresh — re-stamp the insrc:steering skeleton into
	// every registered repo that already carries the markers. This is the single
	// hook that keeps repos current on a LIVE UPDATE: `daemon-ctl.sh` update/restart
	// and the `daemon.update` IPC all terminate in a fresh daemon boot, but only
	// the CLI-TUI update path used to run the refresh — so an updated daemon left
	// registered repos' CLAUDE.md/AGENTS.md stale. Running it here (after the DB
	// registry is loaded) mirrors the boot config-reconcile above: in-process so it
	// owns the LMDB registry, best-effort + idempotent, and NON-BLOCKING so a slow
	// or failing refresh never delays boot-ready. runBootSteeringRefresh never
	// throws (swallows to undefined), so the fire-and-forget is safe.
	void runBootSteeringRefresh().then(report => {
		if (report === undefined) return;   // best-effort skip already logged
		const refreshed = report.filter(o => o.action === 'replaced').length;
		const skipped = report.filter(o => o.action === 'skipped').length;
		if (refreshed > 0 || skipped > 0) {
			log.info({ refreshed, skipped, files: report.length }, 'boot steering refresh complete');
		}
	}).catch(() => { /* wrapper never rejects; belt-and-suspenders so boot can't see an unhandled rejection */ });

	// Run queue in background (never awaited until shutdown)
	const queueDone = queue.start(job => indexer.processJob(job));

	// 6. Write PID
	writePid();
	const startedAt = Date.now();

	// 6b. Register the unified tool set (docs/plans/tools.md stage 5). Covers
	//     git:*, gh:*, file:*, shell:*, web:*, cloud:*, ... and registers
	//     legacy LLM-name aliases (Read, Bash, Grep, graph_search, ...)
	//     onto the canonical unified ids in one pass.
	const { registerBuiltinTools } = await import('./tools/builtins/index.js');
	registerBuiltinTools();

	// 6c. Register data-driver kinds (plans/data-driver.md phase 1).
	//     Drivers self-register at import time; pulling the barrel
	//     once is the bootstrap.
	const { registerBuiltinDataDrivers } = await import('./db/drivers/index.js');
	registerBuiltinDataDrivers();

	// 6d. Validate every analyze-framework shaper prompt exists at boot
	//     (design/analyze-context-builder.md "Per-shaper prompts": missing
	//     file -> daemon refuses to start). The validator throws
	//     AnalyzePromptValidationError listing every failure; we re-raise
	//     so the daemon's top-level fatal handler logs + exits cleanly,
	//     rather than discovering the missing file at the first shaper
	//     invocation.
	const { validateAnalyzePrompts, registerBuiltinTemplates } = await import('../analyze/index.js');
	validateAnalyzePrompts();

	// 6d′. Validate the docgen runtime assets (mermaid + svg-pan-zoom + manifest)
	//      exist + are non-empty in this build (Epic 870ed3dd, s7). Mirrors the
	//      prompt validator: a mis-staged asset in an installed build is a
	//      fail-fast startup refusal (DocgenAssetValidationError re-raises to the
	//      top-level fatal handler) rather than a silent generation-time
	//      fallbackUnavailable.
	const { validateDocgenAssets } = await import('../docgen/asset-validator.js');
	await validateDocgenAssets();

	// 6d‴. Validate the vendored LinkML metamodel schema asset (sc4, S003) the ER
	//      companion validator relies on. Mirrors the docgen validator: a
	//      missing/corrupt schema asset is a fail-fast startup refusal
	//      (LinkmlMetamodelAssetError re-raises to the top-level fatal handler)
	//      rather than a silent skip of ER-model validation at review time.
	const { validateLinkmlMetamodelAsset } = await import('../workflow/artifacts/companion/metamodel.js');
	await validateLinkmlMetamodelAsset();

	// 6d‴′. Validate the vendored Adaptive Cards schema asset (sc4, S004) the UX
	//       companion validator relies on. Mirrors the LinkML metamodel validator:
	//       a missing/corrupt schema asset is a fail-fast startup refusal
	//       (AdaptiveCardsAssetError re-raises to the top-level fatal handler)
	//       rather than a silent skip of UX-model validation at review time.
	const { validateAdaptiveCardsAsset } = await import('../workflow/artifacts/companion/adaptive-cards.js');
	await validateAdaptiveCardsAsset();

	// 6d″. Validate the curated cloud model catalog (cli-claude/cli-codex model
	//      list, Epic ba132c185fe45860, S001). Mirrors the docgen validator: a
	//      missing/malformed catalog asset is a fail-fast startup refusal
	//      (ModelCatalogValidationError re-raises to the top-level fatal handler)
	//      rather than a silent empty cloud model list at first list-models use.
	const { validateModelCatalog } = await import('./model-catalog.js');
	await validateModelCatalog();

	// 6e. Register the analyze framework's task-template catalog
	//     (design/analyze-plan-builder.md "Param resolution from
	//     context"). The Plan Builder picks tasks from this catalog;
	//     INV-3 (templates exist) fires loudly during planning if the
	//     boot didn't populate the registry.
	registerBuiltinTemplates();

	// 6f. Register the executor's per-template RUNTIMES. Each
	//     registered runtime implements the actual analysis behind one
	//     template id; the executor's task walker dispatches leaf
	//     tasks via this registry. Templates without a runtime yet
	//     surface as 'runtime-missing' at task execution time, which
	//     is the correct failure mode while the per-target rollout is
	//     in progress.
	const { registerBuiltinRuntimes } = await import('../analyze/runtimes/bootstrap.js');
	registerBuiltinRuntimes();

	// Phase 1 cleanup: cross-agent / skill registry / prompt writers /
	// substrate runtime / meta-task template registration all stripped.
	// Their backing modules (daemon/cross-agent/, daemon/skills/,
	// daemon/substrate/, agent/prompts/, meta-task/templates/) get
	// deleted in Phase 2-3. Tools + data drivers still register above.

	// The request handler tables (./handler-runtime.ts): the IpcServer serves
	// them over the socket, and the step handlers call the same functions
	// in-process through the in-daemon client (Epic c2ba6fa6, Story s11).
	let understandingService: UnderstandingService | undefined;
	const { rpcHandlers, streamHandlers, understandingRoutes } = buildHandlerRuntime({
		db, configStore, queue, indexer, startedAt,
		shutdown: reason => shutdown(reason),
		attachedClients: () => server.attachedClients(),
		understandingService: () => understandingService,
	});
	installStepDaemonClient(createInDaemonClient(rpcHandlers, streamHandlers));
	const server = new IpcServer(directDispatch(rpcHandlers, streamHandlers));

	// Initialize chat session pool
	initChatHandlers();

	await server.listen();
	try {
		understandingService = await UnderstandingService.open(PATHS.sockFile);
	} catch { log.warn('understanding service unavailable: initialization checks failed'); }
	log.info('ready');

	// Phase 1 cleanup: orphan-handoff worktree scan stripped along with
	// handoff/orphan-cleanup. Daemon no longer manages handoffs.

	// 8. Nightly pruning job — runs every 24 hours
	const PRUNE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
	const pruneTimer = setInterval(async () => {
		try {
			const result = await pruneConversations(db);
			if (result.expired > 0 || result.capped > 0) {
				log.info(`pruned ${result.expired} expired + ${result.capped} capped sessions`);
			}
			// Also run conversation compaction
			const compactResult = await compactConversations(db, async (text) => embedQuery(text));
			const totalCompacted = compactResult.warmCompressed + compactResult.coldMerged + compactResult.archived;
			if (totalCompacted > 0 || compactResult.directives > 0) {
				log.info({ ...compactResult }, 'conversation compaction');
			}
		} catch (err) {
			log.error({ err }, 'pruning/compaction error');
		}
	}, PRUNE_INTERVAL);

	// 8b. Todos retention sweep (plans/todo-framework.md Phase 2).
	// Fires once at boot and every 24 h; drops archived todo lists
	// untouched for 90 days.
	const stopTodosRetention = todosRpc.scheduleTodosRetention(db);

	// 8c. Periodic LMDB reader-table re-check. Defensive sweep every
	//     5 minutes for slots left over from a daemon process that
	//     died between boots without graceful shutdown. Cheap (a
	//     lock-file scan); see docs/plans/storage-migration-lmdb-lance.md
	//     Phase 5.5. The same check probes the store with one read, so a
	//     store that lost its locks is recorded even when no request or
	//     write has met the failure.
	const readerCheckTimer = startPeriodicReaderCheck();

	// 9. Graceful shutdown on signals
	// Shutdown handler. Race between two timelines:
	//
	//   1. `queueDone.finally(...)` cleanly drains the indexer + cross-
	//      file resolver queue, then calls process.exit(0) with pino
	//      having flushed.
	//   2. The hard-exit backstop fires at HARD_EXIT_MS regardless of
	//      queue state. Used to be: queueDone never resolved if a
	//      long-running indexer job was in flight, so SIGTERM left the
	//      process running until the IDE escalated to SIGKILL --
	//      silent death, no flush, no PID cleanup. Live testing
	//      2026-04-29 confirmed every IDE restart that re-pulled the
	//      daemon code produced this signature.
	//
	// HARD_EXIT_MS is intentionally less than the IDE's
	// TERMINATE_GRACE_MS (30 s) so the backstop fires first whenever
	// possible -- the daemon flushes pino + clears its PID before
	// the IDE escalates to SIGKILL.
	//
	// With the graph store's locks lost none of this applies: see
	// ./shutdown.ts, which holds the sequence.
	const shutdown = createShutdown({
		log,
		stopBackgroundWork: () => {
			understandingService?.stop();
			understandingRoutes.stop();
			clearInterval(pruneTimer);
			clearInterval(readerCheckTimer);
			stopTodosRetention();
			queue.stop();
			void disposeChatHandlers();
			void watcher.close();
			void server.close();
		},
		queueDone,
		closeStores: async () => {
			await server.flushPendingWrites(1000);
			server.disconnectClients();
			// closeDb() is a no-op post-LMDB migration (kept for
			// caller back-compat). The in-memory DuckDB pool +
			// per-source analyzer pools still hold connections that
			// need to drain. The LMDB env + Lance connection close
			// alongside via closeGraphStore / closeLanceConn.
			const { closeGraphStore } = await import('../db/graph/store.js');
			const { closeLanceConn  } = await import('../db/lance/conn.js');
			await closeDb();
			await closeDuckDB();
			await closeGraphStore();
			await closeLanceConn();
		},
	});

	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch(err => {
	log.fatal({ err }, 'fatal error');
	exitRespectingStoreHealth(1, 'a failed start');
});
