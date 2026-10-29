import { connectionTestSupervisor } from './db/draft-test.js';
import { connectionSessionRuntime } from './connection-session-rpc.js';
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
import { buildHandlerRuntime, inDaemonOnlyHandlers } from './handler-runtime.js';
import { openManagedRoot } from './db/management-startup.js';
import { managementMarkerExists } from './db/managed-store.js';
import { connectionsPath } from './db/config.js';
import { initChatHandlers, disposeChatHandlers } from './chat-handler.js';
// Phase 1 cleanup: handoff-stream, meta-task-stream, gate-handlers, orphan-handlers,
// the chat agent-flow exports (chatReply, chatRedirect, brainstormAddIdea, chatSend,
// chatResume + variants), and handoff/orphan-cleanup detectOrphans all return
// `backend offline` via the inline helpers below. Their backing files get deleted
// in Phase 2-3.

import { createInDaemonClient, installStepDaemonClient } from './steps/daemon-client.js';

import { writePid, isAlreadyRunning, bootstrapEmbeddingModel, getModelState } from './lifecycle.js';
import { readInstalledCommit } from './installed-commit.js';
import { ThreadServices, currentLmdbFileSizeMb, maintenanceConfig, sessionIdleMs, threadsEnabled } from './threads/main-services.js';
import type { SessionPool } from './threads/session-pool.js';
import { startSessionRouting } from './threads/session-routing.js';
import { lazyForward } from './threads/lazy-runtime.js';
import { setRunBoard } from './workflow-run-registry.js';
import { MaintenanceController } from './threads/maintenance.js';
import { inDaemonTarget, methodClasses } from './threads/method-class.js';
import { Router } from './threads/router.js';
import { IndexingPortClient } from './threads/indexing-port.js';
import type { HandlerRuntime, RuntimeIndexer, RuntimeQueue } from './handler-runtime.js';
import type { ForwardRequest } from './server.js';
import { Supervisor } from './threads/supervisor.js';
import { startIndexingWorkers } from './threads/indexing-workers.js';
import { setIndexRunSource } from '../indexer/run-record.js';
import type { MethodClass } from './threads/channel.js';
import { getActiveEmbedderBackend } from '../indexer/embedder.js';
import { schedulePruneTimer } from './prune-timer.js';
// Cleanup: plan-store + Plan / PlanStepStatus dropped with the legacy planner.
import { ConfigStore } from '../config/store.js';
import { reconcileConfigFile } from '../config/reconcile-io.js';
import { prunedRepoTiers } from '../config/reconcile.js';
import { buildConfigCatalog } from '../config/config-catalog.js';
import { resetLocalProviderConfigCache } from '../config/local.js';
import { resetAnalyzeConfigCache } from '../config/analyze.js';
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

	// 2a. Validate the model definitions file (Epic ce99b720 s1) BEFORE the
	//     settings reconcile, any worker or the listener: a missing, malformed or
	//     rule-breaking file is a fail-fast startup refusal
	//     (ModelCatalogValidationError re-raises to the top-level fatal handler),
	//     so the daemon never reconciles settings, starts a worker or listens
	//     with a bad file.
	const { validateModelCatalog } = await import('./model-catalog.js');
	const modelDefinitions = validateModelCatalog();

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
		// The catalog's model defaults come from the validated definitions.
		const outcome = reconcileConfigFile({ catalog: buildConfigCatalog(modelDefinitions) });
		if (outcome.kind === 'written') {
			for (const { repo, tier } of prunedRepoTiers(outcome.result.pruned)) {
				log.warn({ repo, tier }, 'removed a per-repo model tier: tiers are set globally; a repo only picks a tier for a role (models.byRepo[repo].tasks / coreFloor)');
			}
		}
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
	// Drop the settings read before the reconcile (e.g. at module load) so every
	// later read — this thread's and every worker's — sees the reconciled file.
	resetLocalProviderConfigCache();
	resetAnalyzeConfigCache();
	try {
		// The local tool-loop model as the reconciled settings choose it (diagnostic).
		const { localToolLoopModel } = await import('../analyze/context/driver.js');
		const { loadAnalyzeConfig } = await import('../config/analyze.js');
		log.info(localToolLoopModel(loadAnalyzeConfig()), 'local tool-loop model');
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'local tool-loop model: could not be resolved');
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
	// Idle maintenance (graph compaction), made once the workers are (below).
	let maintenance: MaintenanceController | undefined;
	const threadServices = threadsEnabled()
		? new ThreadServices(() => ({
			startedAt,
			modelState: getModelState(),
			installedCommit: readInstalledCommit(),
			lmdbFileSizeMb: currentLmdbFileSizeMb(),
			maintenance: maintenance?.status(),
		}))
		: undefined;
	if (threadServices !== undefined) {
		log.info('daemon threads enabled');
		// tools.config.set is served here; each change reaches every worker (Story 5d393a4b).
		const { onToolSettingsChange } = await import('./tools/config.js');
		onToolSettingsChange(settings => threadServices.setToolSettings(settings));
	}

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
	const { compactGraphStore, getGraphStore, getStoreHealth, graphStoreReclaimable, runReaderCheck, startPeriodicReaderCheck } = await import('../db/graph/store.js');
	await getGraphStore();   // ensure env is open
	runReaderCheck('startup');

	// 4. Bootstrap embedding model (async, non-blocking)
	void bootstrapEmbeddingModel()
		.then(() => threadServices?.setEmbedderBackend(getActiveEmbedderBackend()))
		.catch(() => { /* the bootstrap logs its own failures */ });

	// 5. Load repos, start indexer: on this thread, or, with daemon threads
	//    (Epic 86197ac6 s2), on the code-indexing worker, which this thread
	//    reaches through the indexing port. The router is made here because the
	//    port asks the worker through it; its local tables come later.
	const configStore = new ConfigStore(db);
	const routed = new Set<MethodClass>();
	let localForward: ForwardRequest | undefined;
	const router = threadServices !== undefined
		? new Router({
			// Test hooks (INSRC_TEST_HOOKS=1) are session work, served on a session worker.
			classOf: method => process.env['INSRC_TEST_HOOKS'] === '1' && method.startsWith('test.') ? 'session' : methodClasses.classOf(method),
			registry: threadServices.registry, routed, local: (request, deliver) => localForward!(request, deliver),
			// What each worker thread is serving, for daemon.status's threads list (s4).
			board: threadServices.board,
			// Every request is activity for idle maintenance (admin polls and subscriptions excepted).
			onRequest: (method, cls) => maintenance?.requestArrived(method, cls) ?? (() => {}),
		})
		: undefined;
	let queue: RuntimeQueue;
	let indexer: RuntimeIndexer;
	let startQueue: () => Promise<void>;
	let stopIndexing: () => void;
	// The daemon's shutdown, once it is made below; a worker supervisor's fatal before then ends the process.
	let shutdownDaemon: (reason: string) => void = reason => { exitRespectingStoreHealth(1, reason); };
	let supervisor: Supervisor | undefined;
	let sessionPool: SessionPool | undefined;
	if (threadServices !== undefined && router !== undefined) {
		const port = new IndexingPortClient((method, params) => router.request('indexing', method, params), threadServices.board);
		queue = port;
		indexer = port;
		routed.add('indexing');
		const workers = new Supervisor({ services: threadServices, router, shutdown: reason => shutdownDaemon(reason) });
		supervisor = workers;
		// The full index runs on the code-indexing worker: its run records come from the board.
		setIndexRunSource(repoPath => threadServices.board.indexRun(repoPath));
		const testHoldMs = process.env['INSRC_TEST_HOOKS'] === '1' ? Number(process.env['INSRC_TEST_MAINTENANCE_HOLD_MS'] ?? 0) : 0;
		maintenance = new MaintenanceController({
			config: maintenanceConfig(),
			lanesIdle: () => threadServices.board.snapshot().indexing.idle,
			laneActivityAt: () => threadServices.board.lastLaneActivityAt(),
			healthy: () => getStoreHealth().state === 'ok',
			reclaimable: graphStoreReclaimable,
			// The session pool's workers too (s4): each holds its own graph handle, and the supervisor's created
			// count includes them, so compaction renames only once every one of them has closed it.
			workers: { live: () => [...workers.liveWorkers(), ...(sessionPool?.liveWorkers() ?? [])], created: () => workers.createdCount() },
			compact: opts => compactGraphStore(opts),
			// Test-only (INSRC_TEST_HOOKS=1): hold the lock a while before compacting.
			...(testHoldMs > 0 ? { onGranted: () => new Promise<void>(r => setTimeout(r, testHoldMs)) } : {}),
		});
		const controller = maintenance;
		threadServices.onMaintenance(() => controller.runNow());
		controller.start();
		// Code indexing and document summaries, each on a worker of its own.
		const indexingWorkers = startIndexingWorkers(workers, threadServices.indexingBlock, threadServices.board);
		// The queue lives on the code-indexing worker: "done" is the current one's
		// report that it drained after the stop (or its exit).
		let drained: () => void = () => {};
		const queueStopped = new Promise<void>(resolve => { drained = resolve; });
		startQueue = () => queueStopped;
		stopIndexing = () => { void indexingWorkers.stop().then(drained); };
	} else {
		const repos = await listRepos(db);
		const watcher = new Watcher();
		const indexQueue = new IndexQueue();
		const indexerService = new IndexerService(db, indexQueue, watcher, configStore);
		await indexerService.start(repos);
		queue = indexQueue;
		indexer = indexerService;
		startQueue = () => indexQueue.start(job => indexerService.processJob(job));
		stopIndexing = () => { indexQueue.stop(); void watcher.close(); };
	}

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
	const queueDone = startQueue();

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
	const connectionOwners: { close: () => Promise<void> }[] = [];
	for (const registered of await listRepos(db)) {
		if (!await managementMarkerExists(connectionsPath(registered.path))) continue;
		try {
			connectionOwners.push(await openManagedRoot(registered.path, {
				isRegistered: async root => (await listRepos(db)).some(repo => repo.path === root),
			}));
		} catch { log.warn({ repo: registered.path }, 'connection management disabled: maintenance or recovery required'); }
	}
	// Built at boot without daemon threads; with them, only when the first request that must stay
	// on this thread arrives (s4), so a daemon that never sees one never builds the handler tables here.
	let understandingRoutes: HandlerRuntime['understandingRoutes'] | undefined;
	const buildRuntime = (): ForwardRequest => {
		const runtime = buildHandlerRuntime({
			db, configStore, queue, indexer, startedAt,
			shutdown: reason => shutdown(reason),
			attachedClients: () => server.attachedClients(),
			understandingService: () => understandingService,
			// With daemon threads the session purge reaches the chat pool and todos bus through a nested call (s3).
			...(router !== undefined ? { nestedCall: (method: string, params: unknown) => inDaemon.request(method, params) } : {}),
		});
		// A step handler's nested call goes to the worker inDaemonTarget names (an admin or indexing
		// method to its class's worker; a shared-state method to the shared-state worker once session
		// work is routed); anything else runs here, as before.
		const inDaemon = createInDaemonClient(runtime.rpcHandlers, runtime.streamHandlers, {
			inDaemonOnly: inDaemonOnlyHandlers(),
			...(router !== undefined ? { route: {
				targetOf: (method: string) => inDaemonTarget(method, { routed, onSharedWorker: false }),
				request: (cls: MethodClass, method: string, params: unknown, opts?: { readonly shared?: true | undefined }) => router.request(cls, method, params, opts),
			} } : {}),
		});
		installStepDaemonClient(inDaemon);
		understandingRoutes = runtime.understandingRoutes;
		return directDispatch(runtime.rpcHandlers, runtime.streamHandlers);
	};
	// With daemon threads, the router is the server's forward (Epic 86197ac6
	// s2): routed classes go to their workers, everything else runs here.
	const local = router !== undefined ? lazyForward(buildRuntime).forward : buildRuntime();
	localForward = local;
	const server = new IpcServer(connectionSessionRuntime.forward(router?.forward ?? local));
	server.onConnectionClose(context => connectionSessionRuntime.disconnect(context));
	connectionOwners.push({ close: () => connectionSessionRuntime.close() });
	if (threadServices !== undefined && router !== undefined) {
		server.onRegistryChange(clients => threadServices.board.publishClients(clients));
		threadServices.onShutdown(reason => shutdown(reason));
		// Admin methods go to the admin worker; a request arriving before it is
		// ready is held for it (at most 30 s). A first start that fails is replaced
		// like an exit (rate-limited; past the limit the daemon shuts down).
		routed.add('admin');
		void supervisor!.startOrReplace({
			name: 'admin', cls: 'admin', script: 'admin-worker',
			started: w => log.info({ threadId: w.threadId }, 'admin worker ready'),
		});
		// Session work (s3): each client session on a worker of its own, requests with no client
		// identity on the unattributed worker, chat/todos/understanding on the shared-state worker.
		routed.add('session');
		sessionPool = startSessionRouting(threadServices, router, sessionIdleMs(), supervisor);
		sessionPool.startSweeping();
		// A detached run started here (a connection-scoped request) is polled from the board like any other.
		setRunBoard(threadServices.board);
	}

	// The chat session pool, the understanding service and the todos retention sweep are one
	// process-wide copy each: hosted here unless session work is routed to workers, when the
	// shared-state worker hosts them (Epic 86197ac6 s3).
	const hostsSharedState = !routed.has('session');
	if (hostsSharedState) initChatHandlers();

	await server.listen();
	// The shared-state worker starts now, after the socket listens (its understanding service is a client
	// of it), so the todos retention sweep runs at boot as it does here without daemon threads.
	if (sessionPool !== undefined) {
		void sessionPool.sharedWorker().catch((err: unknown) => log.warn({ err: err instanceof Error ? err.message : String(err) }, 'the shared-state worker did not start; the next chat, todos or understanding request starts it'));
	}
	if (hostsSharedState) {
		try {
			understandingService = await UnderstandingService.open(PATHS.sockFile);
		} catch { log.warn('understanding service unavailable: initialization checks failed'); }
	}
	log.info('ready');

	// Phase 1 cleanup: orphan-handoff worktree scan stripped along with
	// handoff/orphan-cleanup. Daemon no longer manages handoffs.

	// 8. Nightly pruning job — runs every 24 hours (under the maintenance lock with daemon threads)
	const pruneTimer = schedulePruneTimer(db);

	// 8b. Todos retention sweep (plans/todo-framework.md Phase 2).
	// Fires once at boot and every 24 h; drops archived todo lists
	// untouched for 90 days.
	const stopTodosRetention = hostsSharedState ? todosRpc.scheduleTodosRetention(db) : () => {};

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
	let reviewOperationsClosing: Promise<void> | undefined;
	const shutdown = createShutdown({
		log,
		stopBackgroundWork: () => {
			connectionSessionRuntime.stopAdmission();
			void connectionTestSupervisor.shutdown();
			understandingService?.stop();
			understandingRoutes?.stop();
			clearInterval(pruneTimer);
			clearInterval(readerCheckTimer);
			stopTodosRetention();
			sessionPool?.stopSweeping();
			// No new maintenance; one still waiting for its lock gives up (one compacting is waited for below).
			void maintenance?.stop();
			stopIndexing();
			if (hostsSharedState) void disposeChatHandlers();
   reviewOperationsClosing = (async () => { await (await import('./code-review-operations.js')).codeReviewOperations.close(); })();
			void server.close();
		},
		queueDone,
		closeStores: async () => {
			await connectionTestSupervisor.shutdown();
   await reviewOperationsClosing;
			await server.flushPendingWrites(1000);
			server.disconnectClients();
			// closeDb() is a no-op post-LMDB migration (kept for
			// caller back-compat). The in-memory DuckDB pool +
			// per-source analyzer pools still hold connections that
			// need to drain. The LMDB env + Lance connection close
			// alongside via closeGraphStore / closeLanceConn.
			const { closeGraphStore } = await import('../db/graph/store.js');
			const { closeLanceConn  } = await import('../db/lance/conn.js');
			// With daemon threads the workers exit before this thread closes the
			// stores (the code-indexing worker has drained by now).
			if (supervisor !== undefined) {
				// A compaction under way finishes first (or the hard-exit backstop ends the process; the next open recovers).
				await maintenance?.stop();
				await sessionPool?.close();
				await supervisor.terminateAll();
				log.info('shutdown: the daemon\'s workers exited');
			}
			const closedOwners = await Promise.allSettled(connectionOwners.map(owner => Promise.resolve().then(() => owner.close())));
			if (closedOwners.some(result => result.status === 'rejected')) throw new Error('Connection cleanup is pending.');
			await closeDb();
			await closeDuckDB();
			await closeGraphStore();
			await closeLanceConn();
			log.info('shutdown: stores closed');
		},
	});
	shutdownDaemon = shutdown;

	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch(err => {
	log.fatal({ err }, 'fatal error');
	exitRespectingStoreHealth(1, 'a failed start');
});
