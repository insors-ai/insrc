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

import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync, rmSync } from 'node:fs';
import { injectSteeringBlock, type SteeringSelection } from './steering-inject.js';
import { PATHS } from '../shared/paths.js';
import { setLogMode, getLogger } from '../shared/logger.js';

setLogMode('daemon');
const log = getLogger('daemon');

// ---------------------------------------------------------------------------
// Top-level crash handlers
// ---------------------------------------------------------------------------
//
// Node 20+ kills the process by default on an unhandled rejection /
// uncaught exception. The daemon's pino-roll transport runs in a
// worker thread (async) so any pending log line is lost on
// process.exit -- previously a daemon crash left agent.*.log silent
// past the last successful flush, with no trace of WHY we died.
//
// Capture both shapes here. We log THREE places, each as resilient as
// we can manage given the imminent exit:
//
//   1. stderr (sync fd write) -- captured by the IDE's spawn redirect
//      to /tmp/.insrc/daemon.stderr.log (electron-main side).
//   2. /tmp/.insrc/daemon.crash.log (sync appendFileSync) -- always
//      lands even when stderr isn't redirected (manual launches /
//      tests / detached invocations).
//   3. pino fatal -- best-effort. setImmediate before process.exit
//      gives the worker-thread transport a chance to drain.
//
// All three log the kind (uncaughtException | unhandledRejection)
// + the error message + stack, prefixed with an ISO timestamp so
// post-mortem readers can correlate against agent.*.log lines.
function reportFatal(kind: 'uncaughtException' | 'unhandledRejection', reason: unknown): void {
	const err = reason instanceof Error ? reason : new Error(String(reason));
	const traceText = `[insrc-daemon][${new Date().toISOString()}][${kind}] ${err.message}\n${err.stack ?? '(no stack)'}\n`;
	try { process.stderr.write(traceText); } catch { /* stderr closed */ }
	try {
		mkdirSync(PATHS.logDir, { recursive: true });
		appendFileSync(`${PATHS.logDir}/daemon.crash.log`, traceText);
	} catch { /* fs unavailable */ }
	try { log.fatal({ kind, err: err.message, stack: err.stack }, 'daemon fatal'); } catch { /* logger broken */ }
	// Hard exit on next tick so async writes have a chance to flush.
	// Using setTimeout(0) instead of setImmediate so pino's worker has
	// at least one event-loop turn -- empirically reliable on Node 20.
	setTimeout(() => { process.exit(1); }, 50).unref();
}

process.on('uncaughtException',  (err) =>    reportFatal('uncaughtException',  err));
process.on('unhandledRejection', (reason) => reportFatal('unhandledRejection', reason));

import { getDb, initDb, closeDb } from '../db/client.js';
import { closeDuckDB } from './db/duckdb-pool.js';
import {
	listRepos, addRepo, removeRepo, repoContainingCwd,
	InvalidRepoPathError, validateRepoPath,
} from '../db/repos.js';
import { deleteEntitiesForRepo, findEntitiesByFile, getEntity } from '../db/entities.js';
import { deleteUnresolvedForRepo } from '../db/relations.js';
import { Watcher } from '../indexer/watcher.js';
import { IndexQueue } from './queue.js';
import { IndexerService } from '../indexer/index.js';
import { IpcServer } from './server.js';
import {
	initChatHandlers, disposeChatHandlers, reloadChatConfig,
	chatStart, chatCancel, chatInject, chatClose, chatList, chatStatus, chatRestore,
} from './chat-handler.js';
// Phase 1 cleanup: handoff-stream, meta-task-stream, gate-handlers, orphan-handlers,
// the chat agent-flow exports (chatReply, chatRedirect, brainstormAddIdea, chatSend,
// chatResume + variants), and handoff/orphan-cleanup detectOrphans all return
// `backend offline` via the inline helpers below. Their backing files get deleted
// in Phase 2-3.

import type { RpcHandler, StreamHandler } from './server.js';

const BACKEND_OFFLINE_REASON =
	'backend offline: this RPC was removed during the cleanup. The next backend (Ollama + CLI subprocess) will reinstate the surface.';

function offlineRpc(method: string): RpcHandler {
	return async () => ({ error: `${BACKEND_OFFLINE_REASON} (method=${method})`, recoverable: false });
}

function offlineStream(method: string): StreamHandler {
	return async (_params, send) => {
		// id=0 is a sentinel; the IDE renders the error directly without
		// needing to correlate to a request. Same shape every other
		// StreamHandler used; the `0` is just a placeholder for "no
		// running request to correlate against."
		send({ id: 0, stream: 'error', data: { error: `${BACKEND_OFFLINE_REASON} (method=${method})`, recoverable: false } });
	};
}
import { writePid, clearPid, isAlreadyRunning, bootstrapEmbeddingModel, getModelState } from './lifecycle.js';
import { resolveClosure, searchEntities, findCallers, findCallees, closureEntities, unreachableEntities } from '../db/search.js';
import { embedQuery } from '../indexer/embedder.js';
import { getArtifactById, queryArtifactVec } from '../db/lance/artifact-vec.js';
import { readFile as fsReadFile } from 'node:fs/promises';
import {
	saveTurn, closeSession, saveSession, seedFromPrior, deleteSessionsForRepo, deleteTurnsForRepo, pruneConversations,
	searchTurnsByRepo, getConversationStats, listSessions, getAllTurns,
	type TurnRecord,
} from '../db/conversations.js';
import { compactConversations, type CompactionOpts } from '../db/compaction.js';
// Cleanup: plan-store + Plan / PlanStepStatus dropped with the legacy planner.
import type { RegisteredRepo, DaemonStatus, Entity, ConfigScope, ConfigSearchOpts, TemplateQuery } from '../shared/types.js';
import { basename } from 'node:path';
import { ConfigStore } from '../config/store.js';
import { searchConfig, resolveTemplate } from '../config/search.js';
import * as todosRpc from './todos-rpc.js';

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

	// 2b. Ensure config.json exists with agent defaults
	if (!existsSync(PATHS.config)) {
		writeFileSync(PATHS.config, JSON.stringify({
			logLevel: 'info',
			ollama: { host: 'http://localhost:11434' },
			models: {
				local: 'qwen3-coder:latest',
				embedding: 'qwen3-embedding:0.6b',
				embeddingDim: 1024,
				tiers: { fast: 'claude-haiku-4-5', standard: 'claude-sonnet-4-6', powerful: 'claude-opus-4-6' },
				context: { local: 16384, localMaxOutput: 8192, claude: 200000, claudeMaxOutput: 8192, charsPerToken: 3 },
			},
			permissions: { mode: 'validate' },
			routing: { mode: 'static' },
		}, null, 2), 'utf-8');
		log.info('created default config.json');
	} else {
		// Ensure models.agents exists in config
		try {
			const raw = JSON.parse(readFileSync(PATHS.config, 'utf-8')) as Record<string, unknown>;
			const models = (raw['models'] ?? {}) as Record<string, unknown>;
			if (!models['agents']) {
				log.info('config.json missing models.agents, will be populated on first config.agents call');
			}
		} catch { /* ignore parse errors */ }
	}

	// 2c. One-shot Phase 0 agent-family rename migration (idempotent).
	// Rewrites any persisted `agentId: 'pair' | 'delegate'` to the new
	// `{ agentId: 'implementation', agentVariant: <prior> }` shape and
	// moves `~/.insrc/<category>/pair|delegate/` dirs under
	// `.../implementation/`. Runs before DB init so downstream loaders
	// see a consistent view.
	// Phase 1 cleanup: agent-family-migration gone with the agent subsystem.

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
	const { getGraphStore, runReaderCheck } = await import('../db/graph/store.js');
	await getGraphStore();   // ensure env is open
	runReaderCheck('startup');

	// 4. Bootstrap embedding model (async, non-blocking)
	void bootstrapEmbeddingModel();

	// 5. Load repos, start indexer
	const configStore = new ConfigStore(db);

	const repos = await listRepos(db);
	const watcher = new Watcher();
	const queue = new IndexQueue();
	const indexer = new IndexerService(db, queue, watcher, configStore);

	await indexer.start(repos);

	// Run queue in background (never awaited until shutdown)
	const queueDone = queue.start(job => indexer.processJob(job));

	// 6. Write PID
	writePid();
	const startedAt = Date.now();

	// 6b. Register the unified tool set (plans/tools.md stage 5). Covers
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

	// Shared session-purge pipeline. Used by `agent.discard`,
	// `session.delete`, and `session.deleteBulk` so they don't drift.
	// plans/session-delete.md Phase B.
	//
	// Strictly sessionId-scoped: only rows / files keyed to the given
	// `sessionId` are removed. Cross-session drill-down children stay
	// (their `parentListId` will dangle; renderers tolerate orphans --
	// see plan locked decision 6).
	const purgeSession = async (sessionId: string, opts: { compact: boolean }) => {
		const t0 = Date.now();
		const { readdirSync, unlinkSync, existsSync: existsFs, rmSync } = await import('node:fs');
		const { join } = await import('node:path');
		const { deleteSession } = await import('../db/conversations.js');
		const { dropSessionFromPool } = await import('./chat-handler.js');
		const { deleteSessionFromLance, compactSessionVecTables } = await import('../db/lance/cleanup.js');

		// 1. Pool entry (aborts in-flight agent if any). Drop FIRST so
		//    subsequent deletes don't race with a live run touching the
		//    same rows.
		try {
			dropSessionFromPool(sessionId);
		} catch (err) {
			log.warn({ err: (err as Error).message, sessionId }, 'purgeSession: pool.drop failed');
		}

		// 2. Checkpoint files (match by session-id suffix -- works for
		//    every controller that owns checkpoints under this session).
		let checkpointsDeleted = 0;
		const checkpointDir = join(PATHS.insrc, 'checkpoints');
		if (existsFs(checkpointDir)) {
			const files = readdirSync(checkpointDir).filter(f => f.endsWith(`-${sessionId}.json`));
			for (const f of files) {
				try {
					unlinkSync(join(checkpointDir, f));
					checkpointsDeleted++;
				} catch {
					// Best-effort.
				}
			}
		}

		// 3. Todos framework cascade (`caller: 'system'` authorises the
		//    broad cleanup; `sessionIds: [...]` scopes it strictly).
		let todosListsDeleted = 0;
		let todosItemsDeleted = 0;
		try {
			const cleanupResult = await todosRpc.cleanup(db, {
				caller: 'system',
				sessionIds: [sessionId],
			});
			if (!('error' in cleanupResult)) {
				todosListsDeleted = cleanupResult.deletedListCount;
				todosItemsDeleted = cleanupResult.deletedItemCount;
			} else {
				log.warn({ err: cleanupResult, sessionId }, 'purgeSession: todos cleanup rejected');
			}
		} catch (err) {
			log.warn({ err: (err as Error).message, sessionId }, 'purgeSession: todos cleanup failed');
		}

		// 4. LMDB session row + turn rows.
		let sessionRows = 0;
		let turnRows = 0;
		try {
			const result = await deleteSession(db, sessionId);
			sessionRows = result.sessionRows;
			turnRows = result.turnRows;
		} catch (err) {
			log.warn({ err: (err as Error).message, sessionId }, 'purgeSession: DB delete failed');
		}

		// 5. Lance vector tables.
		let lance = { sessionRows: 0, turnRows: 0, responseSegments: 0, artifacts: 0 };
		try {
			lance = await deleteSessionFromLance(sessionId);
		} catch (err) {
			log.warn({ err: (err as Error).message, sessionId }, 'purgeSession: lance delete failed');
		}

		// 6. Tmp directory at ~/.insrc/tmp/<sessionId>/.
		let tmpFilesDeleted = 0;
		try {
			const tmpDir = join(PATHS.tmp, sessionId);
			if (existsFs(tmpDir)) {
				// Count files (one level deep) for telemetry, then nuke
				// the directory. We don't recurse into subdirs for the
				// count -- the synth-spill / reports layout is flat.
				const files = readdirSync(tmpDir);
				tmpFilesDeleted = files.length;
				rmSync(tmpDir, { recursive: true, force: true });
			}
		} catch (err) {
			log.warn({ err: (err as Error).message, sessionId }, 'purgeSession: tmp dir cleanup failed');
		}

		// 7. Lance compaction (per-session path runs this; bulk defers
		//    to one pass at the end of the loop).
		if (opts.compact) {
			try {
				await compactSessionVecTables();
			} catch (err) {
				log.warn({ err: (err as Error).message, sessionId }, 'purgeSession: compaction failed');
			}
		}

		const counts = {
			checkpointsDeleted,
			todosListsDeleted,
			todosItemsDeleted,
			sessionRows,
			turnRows,
			lance,
			tmpFilesDeleted,
			durationMs: Date.now() - t0,
		};
		log.info({ sessionId, ...counts, compacted: opts.compact }, 'purgeSession complete');
		return counts;
	};

	// 7. Start IPC server
	const server = new IpcServer({
		'repo.add': async (params) => {
			const rawPath = (params as { path?: unknown })?.path;
			let normalisedPath: string;
			try {
				normalisedPath = validateRepoPath(rawPath);
			} catch (err) {
				const reason = err instanceof InvalidRepoPathError
					? err.message
					: `unexpected validation error: ${(err as Error).message}`;
				log.warn(
					{ rawPath, reason, type: typeof rawPath },
					'rejected repo.add: invalid path',
				);
				// Structured error reaches the IDE through the IPC layer;
				// the existing `repoServiceImpl.addRepo` rethrows and the
				// `insrc.addRepo` command handler shows a notification.
				throw new Error(`Cannot add repository: ${reason}`);
			}
			const repo: RegisteredRepo = {
				path: normalisedPath,
				name: basename(normalisedPath),
				addedAt: new Date().toISOString(),
				status: 'pending',
			};
			await addRepo(db, repo);
			await indexer.addRepo(normalisedPath);
			// Optional steering-block injection into the repo's CLAUDE.md /
			// AGENTS.md. Per-file selection comes from the client (which prompts
			// the user); the daemon applies it so BOTH CLI and IDE-fork adds are
			// covered. Guarded — a write failure never fails the add.
			let steering: Awaited<ReturnType<typeof injectSteeringBlock>> | undefined;
			const sel = (params as { steering?: SteeringSelection }).steering;
			if (sel !== undefined && (sel.claude === true || sel.agents === true)) {
				try {
					steering = await injectSteeringBlock(normalisedPath, sel);
				} catch (err) {
					log.warn(
						{ repo: normalisedPath, err: err instanceof Error ? err.message : String(err) },
						'steering injection failed; repo registered regardless',
					);
				}
			}
			return { ok: true, ...(steering !== undefined ? { steering } : {}) };
		},

		'repo.remove': async (params) => {
			const { path } = params as { path: string };
			// Order matters: stop watching first so no new file events arrive
			// during cleanup; delete entities (cascades the typed REL edges)
			// before the unresolved twins; then plans/sessions; then the
			// Repo registry node last.
			await indexer.removeRepo(path);
			await deleteEntitiesForRepo(db, path);
			await deleteUnresolvedForRepo(db, path);
			await deleteSessionsForRepo(db, path);
			await deleteTurnsForRepo(db, path);
			await removeRepo(db, path);
			log.info({ repo: path }, 'repo removed (entities + relations + sessions + turns purged)');
			return { ok: true };
		},

		'repo.list': async () => {
			return await listRepos(db);
		},

		// Session-aware repo resolution: given a session CWD, return the
		// registered repo whose path contains it (most-specific on nesting), or
		// null. Keeps the CWD→repo containment match daemon-side, next to the
		// registry that owns the paths — the MCP resolver is a thin caller.
		'repo.resolveForCwd': async (params) => {
			const { cwd } = (params ?? {}) as { cwd?: unknown };
			if (typeof cwd !== 'string' || cwd.length === 0) {
				return { error: 'repo.resolveForCwd: `cwd` (non-empty string) required' };
			}
			const repos = await listRepos(db);
			return { path: repoContainingCwd(repos, cwd) ?? null };
		},

		// In-CLI, controller-driven approval: stamp approvedAt (enforcing the
		// review block-verdict via approveArtifactByJsonPath) for a single
		// artifact by path, or batch every still-pending artifact under an epic.
		// Non-lossy — review-blocked artifacts come back in `skipped[]`.
		'workflow.approve': async (params) => {
			const p = (params ?? {}) as { repo?: string; artifactPath?: string; epicHash?: string; overrideReview?: string };
			const repoPath = (p.repo !== undefined && p.repo.length > 0 ? p.repo : process.env['INSRC_REPO']) ?? '';
			// repo is only needed to locate the epic's artifacts dir for a batch;
			// a single artifactPath is an absolute, repo-independent path.
			if (p.epicHash !== undefined && repoPath.length === 0) {
				return { error: 'workflow.approve: `repo` is required for an epicHash batch' };
			}
			const { approveWorkflowTarget } = await import('../workflow/gates.js');
			return approveWorkflowTarget({
				repoPath,
				...(p.artifactPath !== undefined ? { artifactPath: p.artifactPath } : {}),
				...(p.epicHash !== undefined ? { epicHash: p.epicHash } : {}),
				...(p.overrideReview !== undefined ? { overrideReview: p.overrideReview } : {}),
			});
		},

		'repo.reindex': async (params) => {
			const { path: repoPath } = params as { path: string };
			const repos = await listRepos(db);
			const repo = repos.find(r => r.path === repoPath);
			if (!repo) { return { error: 'repo not found' }; }
			queue.enqueue({ kind: 'full', repoPath });
			return { ok: true };
		},

		'session.list': async (params) => {
			const { repo, limit } = (params ?? {}) as { repo?: string; limit?: number };
			const sessions = await listSessions(db, repo);
			return limit ? sessions.slice(0, limit) : sessions;
		},

		'session.history': async (params) => {
			const { sessionId, repo, limit } = (params ?? {}) as { sessionId?: string; repo?: string; limit?: number };
			const allTurns = await getAllTurns(db);

			let targetSessionId = sessionId;

			// When loading by repo (no sessionId), find the most recent session
			if (!targetSessionId && repo) {
				const repoTurns = allTurns.filter(t => t.repo === repo);
				let latestDate = '';
				for (const t of repoTurns) {
					const date = t.createdAt ?? '';
					if (date > latestDate) {
						latestDate = date;
						targetSessionId = t.sessionId;
					}
				}
			}

			const filtered = allTurns.filter(t => {
				if (targetSessionId) return t.sessionId === targetSessionId;
				return true;
			});

			return filtered
				.sort((a, b) => {
					const dateA = a.createdAt ?? '';
					const dateB = b.createdAt ?? '';
					if (dateA !== dateB) return dateA.localeCompare(dateB);
					return a.idx - b.idx;
				})
				.slice(0, limit ?? 30)
				.map(t => ({
					sessionId: t.sessionId,
					idx: t.idx,
					user: t.user,
					assistant: t.assistant,
					repo: t.repo,
					type: t.type ?? 'turn',
					tier: t.tier ?? 'hot',
					createdAt: t.createdAt,
					format: t.format,
				}));
		},

		'agent.list': async () => {
			// Phase 2 of plans/session-lifecycle.md: the DB is authoritative
			// for session identity + metadata (agent/category/status/repo).
			// Checkpoint presence is a secondary signal used only to peek at
			// the lastStep label for the sidebar. Sessions without a live
			// checkpoint (status='completed') are filtered out -- they're
			// not resumable. Discarded sessions are filtered likewise.
			//
			// agent='chat' rows are excluded -- plain chat sessions belong in
			// the dedicated Sessions sidebar, not Runs. Runs is for agent
			// pipelines (brainstorm, designer, planner, ...). A session only
			// earns an agent stamp after classification picks a controller;
			// everything else stays 'chat' and stays out of this list.
			const { listSessionRecords } = await import('../db/conversations.js');
			const { existsSync, readFileSync: readFs } = await import('node:fs');
			const { join } = await import('node:path');

			const all = await listSessionRecords(db, { statuses: ['active', 'paused'] });
			const sessions = all.filter(s => s.agent && s.agent !== 'chat');
			const checkpointDir = join(PATHS.insrc, 'checkpoints');

			const runs: Array<{
				id: string; agent: string; status: string;
				step?: string; repo?: string; createdAt: string; summary?: string;
			}> = [];

			for (const s of sessions) {
				const file = join(checkpointDir, `${s.agent}-${s.id}.json`);
				const hasCheckpoint = existsSync(file);

				// Peek only the lastStep field; don't pay a full JSON parse
				// cost for the whole checkpoint just to render a label.
				let step: string | undefined;
				if (hasCheckpoint) {
					try {
						const raw = JSON.parse(readFs(file, 'utf-8')) as {
							state?: { brainstormState?: { lastStep?: string } };
						};
						step = raw.state?.brainstormState?.lastStep;
					} catch {
						// Corrupt / in-flight write; no step, still show the row.
					}
				}

				// Status mapping:
				//   'active'  -> DB says session in flight, checkpoint may or
				//                may not exist yet (covers the window between
				//                chat.start and the first persisted task).
				//   'paused'  -> checkpoint present, pipeline exited, awaiting
				//                resume. Resumable.
				// When a checkpoint is missing for a 'paused' session, the
				// checkpoint was manually removed or never flushed -- surface
				// as 'crashed' so the user knows discard is the only option.
				let reportedStatus: string = s.status;
				if (s.status === 'paused' && !hasCheckpoint) reportedStatus = 'crashed';

				const entry: {
					id: string; agent: string; status: string;
					step?: string; repo?: string; createdAt: string; summary?: string;
				} = {
					id: s.id,
					agent: s.agent || 'unknown',
					status: reportedStatus,
					createdAt: s.lastActivityAt || s.createdAt,
				};
				if (step !== undefined) entry.step = step;
				if (s.repo) entry.repo = s.repo;
				if (s.summary) entry.summary = s.summary;
				runs.push(entry);
			}

			return runs;
		},

		// Phase 1 cleanup: agent.resume returned a checkpoint-validity
		// signal for the chat.resumeFromCheckpoint stream. Both surfaces
		// are gone with the agent framework; the RPC returns offline.
		'agent.resume': offlineRpc('agent.resume'),

		'agent.discard': async (params) => {
			const { id } = params as { id: string };
			// Now a thin caller of the session-purge path (plans/session-delete.md
			// Phase B.3). The semantic shift -- agent.discard now also deletes
			// Lance vectors and the session's tmp directory -- matches user
			// expectation: discarding an agent run shouldn't leave its
			// embedding traces behind. Compaction is deferred here since
			// individual agent discards aren't a heavy enough event to
			// justify the optimize pass on its own.
			const counts = await purgeSession(id, { compact: false });
			return {
				ok: true,
				checkpointsDeleted: counts.checkpointsDeleted,
				todosListsDeleted:  counts.todosListsDeleted,
				todosItemsDeleted:  counts.todosItemsDeleted,
				sessionRows:        counts.sessionRows,
				turnRows:           counts.turnRows,
				// New fields (additive; old clients ignore):
				lance:              counts.lance,
				tmpFilesDeleted:    counts.tmpFilesDeleted,
			};
		},

		'session.delete': async (params) => {
			// plans/session-delete.md Phase B.1. Single-session purge of
			// every byte of session-keyed data. Runs the per-session
			// pipeline and then compacts Lance.
			const { sessionId } = params as { sessionId: string };
			if (typeof sessionId !== 'string' || sessionId.length === 0) {
				return { deleted: false, reason: 'invalid-input', message: 'sessionId required' };
			}
			const counts = await purgeSession(sessionId, { compact: true });
			return { deleted: true, counts };
		},

		'session.deleteBulk': async (params) => {
			// plans/session-delete.md Phase B.2. Loops over the per-
			// session path but defers compaction; runs ONE optimize pass
			// at the end of the loop (compaction is the expensive part
			// and bulk delete is the time it most matters to amortize).
			// Each session iteration is independent -- a failure in one
			// doesn't abort the rest; per-session errors aggregate into
			// the response.
			const { sessionIds } = params as { sessionIds: readonly string[] };
			if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
				return { deleted: 0, failed: 0, errors: [] };
			}
			const errors: { sessionId: string; reason: string }[] = [];
			let deleted = 0;
			for (const id of sessionIds) {
				if (typeof id !== 'string' || id.length === 0) {
					errors.push({ sessionId: String(id), reason: 'invalid-id' });
					continue;
				}
				try {
					await purgeSession(id, { compact: false });
					deleted++;
				} catch (err) {
					errors.push({ sessionId: id, reason: (err as Error).message });
				}
			}
			// One compact pass at the end -- amortizes the optimize cost.
			try {
				const { compactSessionVecTables } = await import('../db/lance/cleanup.js');
				await compactSessionVecTables();
			} catch (err) {
				log.warn({ err: (err as Error).message }, 'session.deleteBulk: compaction failed (best-effort, continuing)');
			}
			log.info({ deleted, failed: errors.length }, 'session.deleteBulk complete');
			return { deleted, failed: errors.length, errors };
		},

		'daemon.status': async () => {
			const modelState = getModelState();
			const status: DaemonStatus = {
				uptime: Math.floor((Date.now() - startedAt) / 1000),
				repos: await listRepos(db),
				queueDepth: queue.depth,
				embeddingsPending: queue.depth, // approximate
				modelPullStatus: modelState.status === 'pulling' ? 'pulling' : 'ready',
				...(modelState.pct !== undefined && { modelPullPct: modelState.pct }),
			};
			// LMDB env file size for compact-when-needed surfacing.
			try {
				const { existsSync, statSync } = await import('node:fs');
				if (existsSync(PATHS.lmdb)) {
					status.lmdbFileSizeMb = Math.round(statSync(PATHS.lmdb).size / 1024 / 1024);
				}
			} catch { /* best-effort; status should never throw */ }
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

		// ----- entity.* IPCs (added for the MCP server's `insrc_entity_*` tools) -----
		// These wrap existing db/search.ts and db/entities.ts functions so the
		// out-of-process MCP server subprocess can reach the same data without
		// re-implementing the graph layer. See plans/external-agent-integration.md
		// Phase 1 Day 2.

		'entity.summary': async (params) => {
			const { entityId } = params as { entityId: string };
			return getEntity(db, entityId);
		},

		'entity.closure': async (params) => {
			const { rootIds, edgeKind, direction, maxDepth } = params as {
				rootIds:    readonly string[];
				edgeKind?:  string;
				direction?: 'in' | 'out';
				maxDepth?:  number;
			};
			const opts: { kindFilter?: ['DEFINES'|'IMPORTS'|'CALLS'|'INHERITS'|'IMPLEMENTS'|'DEPENDS_ON'|'EXPORTS'|'REFERENCES']; direction?: 'in'|'out'; maxDepth?: number } = {};
			if (edgeKind !== undefined) {
				opts.kindFilter = [edgeKind as 'DEFINES'|'IMPORTS'|'CALLS'|'INHERITS'|'IMPLEMENTS'|'DEPENDS_ON'|'EXPORTS'|'REFERENCES'];
			}
			if (direction !== undefined) opts.direction = direction;
			if (maxDepth !== undefined)  opts.maxDepth  = maxDepth;
			return closureEntities(db, rootIds, opts) as Promise<Entity[]>;
		},

		'entity.unreachable': async (params) => {
			const { rootIds, candidateKinds, edgeKind, maxDepth } = params as {
				rootIds:         readonly string[];
				candidateKinds:  readonly string[];
				edgeKind?:       string;
				maxDepth?:       number;
			};
			const opts: { kindFilter?: ['DEFINES'|'IMPORTS'|'CALLS'|'INHERITS'|'IMPLEMENTS'|'DEPENDS_ON'|'EXPORTS'|'REFERENCES']; maxDepth?: number } = {};
			if (edgeKind !== undefined) {
				opts.kindFilter = [edgeKind as 'DEFINES'|'IMPORTS'|'CALLS'|'INHERITS'|'IMPLEMENTS'|'DEPENDS_ON'|'EXPORTS'|'REFERENCES'];
			}
			if (maxDepth !== undefined) opts.maxDepth = maxDepth;
			return unreachableEntities(
				db,
				rootIds,
				candidateKinds as readonly ('repo'|'file'|'module'|'function'|'method'|'class'|'interface'|'type')[],
				opts,
			) as Promise<Entity[]>;
		},

		// ----- artifact.* IPCs (MCP server's `insrc_artifact_*` tools) -----
		// Read prior skill-call outputs by id (with raw spill body) or via
		// per-session ANN search.  Session-scoping is enforced by the MCP
		// server's session-token check before these IPCs are reached;
		// the daemon trusts the sessionId in params.

		'artifact.get': async (params) => {
			const { artifactId } = params as { artifactId: string };
			const hit = await getArtifactById(artifactId);
			if (hit === null) return null;
			let raw: string | null = null;
			try {
				raw = await fsReadFile(hit.path, 'utf8');
			} catch (err) {
				log.warn({ artifactId, path: hit.path, err: (err as Error).message },
					'artifact.get: spill body unreadable; returning metadata only');
			}
			return { ...hit, raw };
		},

		'artifact.search': async (params) => {
			const { query, sessionId, limit, intent } = params as {
				query:     string;
				sessionId: string;
				limit?:    number;
				intent?:   string;
			};
			const queryVec = await embedQuery(query);
			const opts: { sessionId: string; k: number; intent?: string } = {
				sessionId,
				k: limit ?? 10,
			};
			if (intent !== undefined) opts.intent = intent;
			return queryArtifactVec(queryVec, opts);
		},

		// ----- repo.* IPCs (MCP server's `insrc_repo_*` tools) -----
		// Richer cross-repo helpers than the existing search.closure
		// (which returns bare repo paths). The MCP layer needs name +
		// transitive flag, and a cross-repo ANN search.

		'repo.depends_on': async (params) => {
			const { repoId } = params as { repoId: string };
			const closurePaths = await resolveClosure(db, repoId);
			const allRepos = await listRepos(db);
			const byPath = new Map(allRepos.map(r => [r.path, r.name] as const));
			// resolveClosure's documented fallback returns [repoPath] even
			// when the root isn't in the graph (e.g. unregistered repo);
			// don't leak that into the MCP surface -- an honest answer for
			// a non-existent repo is the empty closure.
			return closurePaths
				.filter(path => byPath.has(path))
				.map(path => ({
					repoId:     path,
					name:       byPath.get(path)!,
					path,
					transitive: path !== repoId,
				}));
		},

		'repo.search_cross_repo': async (params) => {
			const { query, repoId, limit } = params as {
				query:  string;
				repoId: string;
				limit?: number;
			};
			const closurePaths = await resolveClosure(db, repoId);
			const queryVec     = await embedQuery(query);
			return searchEntities(db, queryVec, closurePaths, limit ?? 10, 'code') as Promise<Entity[]>;
		},

		// ----- Graph context helpers (Phase 7) -----

		'search.by_file': async (params) => {
			const { filePath } = params as { filePath: string };
			return findEntitiesByFile(db, filePath);
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

		'session.search_turns': async (params) => {
			const { repo, queryVector, limit } = params as {
				repo: string; queryVector: number[]; limit?: number;
			};
			return searchTurnsByRepo(db, repo, queryVector, limit ?? 20);
		},

		// ----- Conversation management -----

		'conversation.saveTurn': async (params) => {
			const turn = params as TurnRecord;
			// Generate embedding for the turn (user + assistant text)
			const text = `${turn.user}\n${turn.assistant}`.slice(0, 1000);
			turn.vector = await embedQuery(text);
			await saveTurn(db, turn);
			return { ok: true };
		},

		'conversation.saveSession': async (params) => {
			const { id, repo, summary, seenEntities, vector } = params as {
				id: string; repo: string; summary: string; seenEntities?: string[]; vector?: number[];
			};
			if (seenEntities && vector) {
				// Full close with entities and embedding
				await closeSession(db, { id, repo, summary, seenEntities }, vector);
			} else {
				// Lightweight upsert (create/update title)
				await saveSession(db, { id, repo, summary });
			}
			return { ok: true };
		},

		'conversation.compact': async (params) => {
			const opts = params as CompactionOpts;
			return compactConversations(db, async (text) => embedQuery(text), opts);
		},

		'conversation.stats': async (params) => {
			const { repo } = params as { repo?: string };
			return getConversationStats(db, repo);
		},

		// ----- Plan graph -----
		// Phase 1 cleanup: legacy plan-store + plan.* RPCs gone with the
		// planner agent. All return `backend offline`.
		'plan.save':         offlineRpc('plan.save'),
		'plan.get':          offlineRpc('plan.get'),
		'plan.step_update':  offlineRpc('plan.step_update'),
		'plan.next_step':    offlineRpc('plan.next_step'),
		'plan.delete':       offlineRpc('plan.delete'),
		'plan_get':          offlineRpc('plan_get'),
		'plan_step_update':  offlineRpc('plan_step_update'),
		'plan_next_step':    offlineRpc('plan_next_step'),
		'plan.reset_stale':  offlineRpc('plan.reset_stale'),

		// ----- File re-index (Phase 7) -----

		'index.file': async (params) => {
			const { filePath, event } = params as { filePath: string; event?: 'create' | 'update' | 'delete' };
			queue.enqueue({ kind: 'file', filePath, event: event ?? 'update' });
			return { ok: true };
		},

		// ----- Config management -----

		'system.info': async () => {
			const { getSystemInfo } = await import('../shared/system-info.js');
			return getSystemInfo();
		},

		'system.recommend': async () => {
			const { getSystemInfo } = await import('../shared/system-info.js');
			const { recommendModels, toConfig } = await import('../shared/model-recommender.js');
			const info = getSystemInfo();
			const recommendation = recommendModels(info);
			const config = toConfig(recommendation);
			return { system: info, recommendation, config };
		},

		// Ollama model management
		'ollama.list': async () => {
			const { Ollama } = await import('ollama');
			const config = JSON.parse(readFileSync(PATHS.config, 'utf-8')) as Record<string, unknown>;
			const ollamaConfig = (config['ollama'] ?? {}) as Record<string, unknown>;
			const host = (ollamaConfig['host'] as string) ?? 'http://localhost:11434';
			const ollama = new Ollama({ host });
			const { models } = await ollama.list();
			return models.map(m => ({
				name: m.name,
				size: m.size,
				parameterSize: m.details?.parameter_size,
				quantization: m.details?.quantization_level,
				family: m.details?.family,
			}));
		},

		'ollama.search': async (params) => {
			const { query } = params as { query: string };
			const { request } = await import('undici');
			const { body } = await request(`https://ollama.com/search?q=${encodeURIComponent(query)}`, {
				headers: { 'Accept': 'application/json' },
			});
			const data = await body.json() as Record<string, unknown>;
			return data['models'] ?? [];
		},

		// Claude model listing
		'claude.models': async () => {
			const { getKey } = await import('../shared/keystore.js');
			const key = await getKey('ANTHROPIC_API_KEY');
			if (key) {
				try {
					const Anthropic = (await import('@anthropic-ai/sdk')).default;
					const client = new Anthropic({ apiKey: key });
					const models = await client.models.list();
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					return models.data.map((m: any) => ({
						id: m.id,
						displayName: m.display_name ?? m.id,
						createdAt: m.created_at ?? '',
					}));
				} catch (err) {
					log.warn({ error: String(err) }, 'failed to list Claude models via API');
				}
			}
			// Fallback: static catalog
			return [
				{ id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5', createdAt: '' },
				{ id: 'claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5', createdAt: '' },
				{ id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', createdAt: '' },
				{ id: 'claude-opus-4-6', displayName: 'Claude Opus 4.6', createdAt: '' },
			];
		},

		// Phase 1 cleanup: agent step bindings RPC gone with the agent
		// framework. IDE Model Providers pane no longer surfaces per-step
		// overrides under the cleanup.
		'config.agents': offlineRpc('config.agents'),

		'config.show': async () => {
			try {
				const raw = readFileSync(PATHS.config, 'utf-8');
				return JSON.parse(raw) as Record<string, unknown>;
			} catch {
				return {};
			}
		},

		'config.write': async (params) => {
			const { path: dotPath, value } = params as { path: string; value: unknown };
			let config: Record<string, unknown> = {};
			try {
				config = JSON.parse(readFileSync(PATHS.config, 'utf-8')) as Record<string, unknown>;
			} catch { /* start fresh */ }

			// Set value at dotted path (e.g. 'models.agents.pair.propose')
			const keys = dotPath.split('.');
			let obj: Record<string, unknown> = config;
			for (let i = 0; i < keys.length - 1; i++) {
				const key = keys[i]!;
				if (typeof obj[key] !== 'object' || obj[key] === null) {
					obj[key] = {};
				}
				obj = obj[key] as Record<string, unknown>;
			}
			obj[keys[keys.length - 1]!] = value;

			writeFileSync(PATHS.config, JSON.stringify(config, null, 2), 'utf-8');
			await reloadChatConfig();
			log.info({ path: dotPath, value }, 'config.write');
			return { ok: true };
		},

		'config.reload': async () => {
			const reloaded = await reloadChatConfig();
			log.info({ reloaded }, 'config reloaded for active sessions');
			return { ok: true, reloaded };
		},

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

		'keys.set': async (params) => {
			const { name, value } = params as { name: string; value: string };
			const { setKey } = await import('../shared/keystore.js');
			await setKey(name, value);
			return { ok: true };
		},

		'keys.get': async (params) => {
			const { name } = params as { name: string };
			const { getKey, maskKey } = await import('../shared/keystore.js');
			const value = await getKey(name);
			return value ? { name, masked: maskKey(value), exists: true } : { name, exists: false };
		},

		'keys.delete': async (params) => {
			const { name } = params as { name: string };
			const { deleteKey } = await import('../shared/keystore.js');
			await deleteKey(name);
			return { ok: true };
		},

		'keys.list': async () => {
			const { listKeys, getKey, maskKey } = await import('../shared/keystore.js');
			const names = await listKeys();
			const entries = await Promise.all(names.map(async (name) => {
				const value = await getKey(name);
				return { name, masked: value ? maskKey(value) : '(empty)' };
			}));
			return entries;
		},

		'daemon.shutdown': async () => {
			log.info('shutdown requested');
			shutdown('daemon.shutdown RPC');
			return { ok: true };
		},

		'daemon.backup': async (params) => {
			const { path } = params as { path: string };
			if (typeof path !== 'string' || path.length === 0) {
				throw new Error('daemon.backup: target path required');
			}
			const { backupAll } = await import('./backup.js');
			return await backupAll(path);
		},

		'daemon.compact': async () => {
			// Refuse if the indexer queue is busy. Compact closes +
			// reopens the env, so any in-flight indexer write loses its
			// state. The user is expected to wait until the daemon is
			// idle (queue depth 0, no job processing) before triggering.
			if (queue.depth > 0 || queue.isProcessing) {
				throw new Error(
					`daemon.compact: indexer is busy (queue=${queue.depth}, ` +
					`processing=${queue.isProcessing}). Wait for indexing to ` +
					`drain before compacting.`,
				);
			}
			const { compactGraphStore } = await import('../db/graph/store.js');
			const result = await compactGraphStore();
			log.info({ ...result }, 'lmdb env compacted');
			return result;
		},

		// Per-workspace data-analyzer DB introspection + reset. Backing
		// pool lives at <workspaceRoot>/.insrc/data-analyzer.db. Status
		// never lazy-inits the pool (read-only stat); reset closes the
		// pool + deletes the .db + .db.wal so the next analyzer call
		// recreates an empty DB.
		'analyzer.status': offlineRpc('analyzer.status'),
		'analyzer.reset':  offlineRpc('analyzer.reset'),

		// Tool settings snapshot -- pushed by the IDE on connect and on
		// settings changes. Daemon holds the snapshot in memory; tools
		// and the tool-loop read via getToolSettings().
		'tools.config.set': async (params) => {
			const { updateToolSettings } = await import('./tools/config.js');
			const next = updateToolSettings((params ?? {}) as Record<string, unknown>);
			return { ok: true, settings: next };
		},

		'tools.config.get': async () => {
			const { getToolSettings } = await import('./tools/config.js');
			return getToolSettings();
		},

		// ---- Providers RPC ----
		// Phase 1 cleanup: daemon/providers.ts gone with the 4 cloud
		// REST providers + multi-provider config. The Models pane in the
		// IDE gets a slimmer surface in Phase 6 (Ollama + claude/codex
		// CLI auth status). Until then these return offline so the pane
		// shows a clean error and the user can switch panes.
		'providers.listModels': offlineRpc('providers.listModels'),
		'providers.testKey':    offlineRpc('providers.testKey'),
		'providers.getConfig':  offlineRpc('providers.getConfig'),
		'providers.setConfig':  offlineRpc('providers.setConfig'),
		'providers.check':      offlineRpc('providers.check'),

		// Chat session management (standard handlers). Transport-only after
		// Phase 1 cleanup -- chat.start/cancel/inject/close/list/status/restore
		// stay live as session-pool plumbing. chat.reply / chat.redirect /
		// brainstorm.addIdea wired into the agent routing layer, which is
		// gone; they return `backend offline`.
		'chat.start': chatStart,
		'chat.reply':       offlineRpc('chat.reply'),
		'chat.cancel': chatCancel,
		'chat.inject': chatInject,
		'chat.redirect':    offlineRpc('chat.redirect'),
		'brainstorm.addIdea': offlineRpc('brainstorm.addIdea'),
		'chat.close': chatClose,
		'chat.list': chatList,
		'chat.status': chatStatus,
		'chat.restore': chatRestore,

		// Todos framework (plans/todo-framework.md). Standard RPCs --
		// caller authorization happens inside each handler, stream
		// events land on the in-process bus and get flushed via
		// 'todos.subscribe' below.
		'todos.listForSession': (params) => todosRpc.listForSession(db, params),
		'todos.create': (params) => todosRpc.create(db, params),
		'todos.update': (params) => todosRpc.update(db, params),
		'todos.archive': (params) => todosRpc.archive(db, params),
		'todos.unarchive': (params) => todosRpc.unarchive(db, params),
		'todos.deleteList': (params) => todosRpc.deleteList(db, params),
		'todos.transfer': (params) => todosRpc.transfer(db, params),
		'todos.reparent': (params) => todosRpc.reparent(db, params),
		'todos.addItem': (params) => todosRpc.addItem(db, params),
		'todos.updateItem': (params) => todosRpc.updateItem(db, params),
		'todos.reorderItem': (params) => todosRpc.reorderItem(db, params),
		'todos.removeItem': (params) => todosRpc.removeItem(db, params),
		'todos.clearCompleted': (params) => todosRpc.clearCompleted(db, params),
		'todos.cleanup': (params) => todosRpc.cleanup(db, params),
		'todos.addComment': (params) => todosRpc.addComment(db, params),
		'todos.editComment': (params) => todosRpc.editComment(db, params),
		'todos.deleteComment': (params) => todosRpc.deleteCommentRpc(db, params),
		'todos.ackComment': (params) => todosRpc.ackComment(db, params),
		'todos.forwardToAgent': (params) => todosRpc.forwardToAgent(db, params),

		// Artifact template commands (plans/artifact-tasks.md §2.3).
		// Standard RPCs backing the workbench palette commands --
		// listTemplates / edit / reset -- so the workbench doesn't
		// need to know the daemon's install path.
		'artifacts.listTemplates': async (params) => {
			const mod = await import('./artifacts-rpc.js');
			return mod.listTemplatesRpc(params);
		},
		'artifacts.ensureUserTemplate': async (params) => {
			const mod = await import('./artifacts-rpc.js');
			return mod.ensureUserTemplateRpc(params);
		},
		'artifacts.resetUserTemplate': async (params) => {
			const mod = await import('./artifacts-rpc.js');
			return mod.resetUserTemplateRpc(params);
		},
		'db.listConnections': async (params) => {
			const mod = await import('./db-rpc.js');
			return mod.listConnectionsRpc(params as { repoRoot?: unknown });
		},
		'db.listDriverKinds': async () => {
			const mod = await import('./db-rpc.js');
			return mod.listDriverKindsRpc();
		},
		'db.saveConnection': async (params) => {
			const mod = await import('./db-rpc.js');
			return mod.saveConnectionRpc(params as { repoRoot?: unknown; config?: unknown });
		},
		'db.deleteConnection': async (params) => {
			const mod = await import('./db-rpc.js');
			return mod.deleteConnectionRpc(params as { repoRoot?: unknown; id?: unknown });
		},
		'db.testConnection': async (params) => {
			const mod = await import('./db-rpc.js');
			return mod.testConnectionRpc(params as { repoRoot?: unknown; config?: unknown });
		},

		// ----- analyze.context.* IPCs (analyze framework Context Builder) -----
		// design/analyze-context-builder.md "Public API"
		// plans/analyze-context-builder.md Phase 7
		// Each handler returns a tagged union AnalyzeRpcResponse so typed
		// shaper errors (ScopeNotIndexedError, ShaperLlmUnavailable, ...)
		// surface with stable error codes instead of generic string errors.
		'analyze.context.buildClassification': async (params) => {
			const mod = await import('./analyze-rpc.js');
			return mod.buildClassification(params);
		},
		'analyze.context.buildRun': async (params) => {
			const mod = await import('./analyze-rpc.js');
			return mod.buildRun(params);
		},
		'analyze.context.buildTask': async (params) => {
			const mod = await import('./analyze-rpc.js');
			return mod.buildTask(params);
		},
		// Classifier (LLM-driven ClassifiedIntent producer). Tagged
		// union response with `intent` (not `bundle`) on success;
		// shared error-payload shape with analyze.context.* so the
		// orchestrator dispatches uniformly. ClassifierValidationExhausted
		// is unwrapped at the wire: error.code carries the inner
		// failure code (scope-ref-unresolved or
		// scope-ref-kind-target-mismatch) directly.
		'analyze.classify': async (params) => {
			const mod = await import('./analyze-rpc.js');
			return mod.classify(params);
		},
		// Plan Builder. Internally builds the run-level context bundle
		// + calls runPlanner. Tagged union: ok:true carries `plan`,
		// ok:false carries the typed planner error (plan-invariant-failed
		// with the inner invariant id in `data`, max-plan-depth-exceeded,
		// etc.). Shaper-side errors from the pre-step bundle build
		// surface with the shaper's stable codes.
		'analyze.plan.build': async (params) => {
			const mod = await import('./analyze-rpc.js');
			return mod.plan(params);
		},
		// Read-only lookup of <runRoot>/run.json. Returns
		// ok:false/code:invalid-input when the runId has no on-disk
		// record. Used by IDE polling + by resume callers.
		'analyze.run.status': async (params) => {
			const mod = await import('./analyze-rpc.js');
			return mod.runStatus(params);
		},
		// Remove a run's on-disk artifacts (plan.json + plan.attempts/
		// + tasks/ + run.json + context cache). Default refuses on
		// status='in-progress'; pass `force: true` to override.
		// Idempotent: purged=false when the run dir didn't exist.
		'analyze.run.purge': async (params) => {
			const mod = await import('./analyze-rpc.js');
			return mod.runPurge(params);
		},

		// Async (start/poll/abort) lifecycle for `workflow.run`. The
		// streaming `workflow.run` handler holds the socket for the whole
		// 5–20 min run; these three let a controller START a detached run
		// (returns a runId immediately), POLL for new progress frames +
		// the terminal result via a cursor, and ABORT mid-run. See
		// daemon/workflow-run-registry.ts.
		'workflow.run.start': async (params) => {
			const mod = await import('./workflow-run-registry.js');
			return mod.startWorkflowRun(params);
		},
		'workflow.run.poll': async (params) => {
			const mod = await import('./workflow-run-registry.js');
			const p = (params ?? {}) as { runId?: string; cursor?: number };
			return mod.pollWorkflowRun(String(p.runId ?? ''), p.cursor ?? 0);
		},
		'workflow.run.abort': async (params) => {
			const mod = await import('./workflow-run-registry.js');
			const p = (params ?? {}) as { runId?: string };
			return mod.abortWorkflowRun(String(p.runId ?? ''));
		},

		// Phase 1 cleanup: access RPCs + skill RPCs are gone with their
		// backing files (substrate-coupled access store, skill registry).
		// Both surfaces return `backend offline` to the workbench panes.
		'access.snapshot':     offlineRpc('access.snapshot'),
		'access.revoke':       offlineRpc('access.revoke'),
		'access.revokePrefix': offlineRpc('access.revokePrefix'),
		'skill.list':          offlineRpc('skill.list'),
		'skill.feasibility':   offlineRpc('skill.feasibility'),
		'skill.invoke':        offlineRpc('skill.invoke'),
		'skill.audit':         offlineRpc('skill.audit'),
		'artifacts.getOfflineBundleStatus': async () => {
			const mod = await import('./artifacts-rpc.js');
			return mod.getOfflineBundleStatusRpc();
		},
		'artifacts.downloadOfflineBundle': async () => {
			const mod = await import('./artifacts-rpc.js');
			return mod.downloadOfflineBundleRpc();
		},
		'artifacts.removeOfflineBundle': async () => {
			const mod = await import('./artifacts-rpc.js');
			return mod.removeOfflineBundleRpc();
		},

		// Phase 1 cleanup: analyzer caches/diffs + handoff gates +
		// preferences all return `backend offline`. Their backing files
		// disappear in Phase 2.
		'dataAnalyzer.clearCache': offlineRpc('dataAnalyzer.clearCache'),
		'dataAnalyzer.diffRuns':   offlineRpc('dataAnalyzer.diffRuns'),
		'codeAnalyzer.diffRuns':   offlineRpc('codeAnalyzer.diffRuns'),
		'gate.resolve':            offlineRpc('gate.resolve'),
		'handoff.mode-a.resolve':  offlineRpc('handoff.mode-a.resolve'),
		'handoff.list-orphans':    offlineRpc('handoff.list-orphans'),
		'handoff.discard-orphan':  offlineRpc('handoff.discard-orphan'),
		'handoff.cleanup':         offlineRpc('handoff.cleanup'),
		'prefs.list':              offlineRpc('prefs.list'),
		'prefs.edit':              offlineRpc('prefs.edit'),
		'prefs.discard':           offlineRpc('prefs.discard'),
		'prefs.confirm.list':      offlineRpc('prefs.confirm.list'),
		'prefs.confirm.resolve':   offlineRpc('prefs.confirm.resolve'),
	}, {
		// Streaming handlers. All agent-driven streams (chat.send, the
		// chat.resume variants, handoff.run, meta-task.run, gate.request-
		// permission) emit a single `error` event and close. `todos.subscribe`
		// + `ollama.pull` remain live.
		'handoff.run':                 offlineStream('handoff.run'),
		'meta-task.run':               offlineStream('meta-task.run'),
		'gate.request-permission':     offlineStream('gate.request-permission'),
		'chat.send':                   offlineStream('chat.send'),
		'chat.resume':                 offlineStream('chat.resume'),
		'chat.resumeFromCheckpoint':   offlineStream('chat.resumeFromCheckpoint'),
		'chat.resumeCodeAnalysis':     offlineStream('chat.resumeCodeAnalysis'),
		'chat.resumeDataAnalysis':     offlineStream('chat.resumeDataAnalysis'),
		'todos.subscribe': todosRpc.subscribe,
		// Orchestrator end-to-end. Drives the full pipeline
		// (classify -> buildRunBundle -> plan -> execute), persists
		// run.json at every stage transition, and emits a stream of
		// progress frames for IDE widgets (status bar, runs sidebar,
		// todos pane). Final frame is `analyze.result` carrying the
		// terminal RunStartRpcResponse; then `done` closes the stream.
		//
		// Persistence happens inside runAnalyze regardless of how the
		// stream ends (IDE disconnect, signal abort) -- terminal state
		// is recoverable via analyze.run.status.
		'analyze.run.start': async (params, send, signal) => {
			const mod = await import('./analyze-rpc.js');
			return mod.runStart(params, send, signal);
		},
		// Daemon-side workflow runner: drives one workflow (define / design.* /
		// plan / stub) end-to-end through the LLMProvider (config → invoking
		// CLI → Ollama), stamping meta.model with the resolved provider id.
		// Emits `progress` frames per phase, then terminal `done`/`error`.
		'workflow.run': async (params, send, signal) => {
			const mod = await import('./workflow-rpc.js');
			return mod.runStart(params, send, signal);
		},
		'ollama.pull': async (params, send, signal) => {
			const { model } = params as { model: string };
			const { Ollama } = await import('ollama');
			const config = JSON.parse(readFileSync(PATHS.config, 'utf-8')) as Record<string, unknown>;
			const ollamaConfig = (config['ollama'] ?? {}) as Record<string, unknown>;
			const host = (ollamaConfig['host'] as string) ?? 'http://localhost:11434';
			const ollama = new Ollama({ host });
			const stream = await ollama.pull({ model, stream: true });
			for await (const progress of stream) {
				if (signal.aborted) break;
				const pct = progress.completed && progress.total
					? Math.round((progress.completed / progress.total) * 100) : 0;
				send({ id: 0, stream: 'progress', data: { model, status: progress.status, pct } });
			}
			send({ id: 0, stream: 'done', data: { model } });
			log.info({ model }, 'ollama.pull complete');
		},
	});

	// Initialize chat session pool
	initChatHandlers();

	await server.listen();
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
	//     lock-file scan); see plans/storage-migration-lmdb-lance.md
	//     Phase 5.5.
	const READER_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
	const readerCheckTimer = setInterval(() => {
		runReaderCheck('periodic');
	}, READER_CHECK_INTERVAL);

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
	const HARD_EXIT_MS = 20_000;
	let shutdownStarted = false;
	function shutdown(signal: string): void {
		// Re-entrant safety: SIGINT followed by SIGTERM (or vice
		// versa) shouldn't restart the timers / double-emit "bye".
		if (shutdownStarted) {
			log.warn({ signal }, 'shutdown signal received again; already in progress');
			return;
		}
		shutdownStarted = true;
		// Log synchronously at the top so even a SIGKILL race leaves
		// at least the receipt line in agent.*.log. pino's worker-
		// thread transport may not flush this in time, but it's the
		// best-effort bookend matching the daemon-crash handler.
		log.info({ signal }, 'shutdown signal received; draining...');
		clearInterval(pruneTimer);
		clearInterval(readerCheckTimer);
		stopTodosRetention();
		queue.stop();
		void disposeChatHandlers();
		void watcher.close();
		void server.close();
		// Hard-exit backstop -- fires whether or not queueDone resolved.
		// `unref()` so the timer doesn't keep the event loop alive on
		// its own; queue drain finishing first lets us exit early.
		const backstop = setTimeout(() => {
			log.warn({ ms: HARD_EXIT_MS }, 'shutdown: hard-exit backstop fired (queue drain stalled)');
			try { clearPid(); } catch { /* nothing */ }
			process.exit(0);
		}, HARD_EXIT_MS);
		backstop.unref();
		void queueDone.finally(async () => {
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
			clearPid();
			log.info('bye');
			clearTimeout(backstop);
			process.exit(0);
		});
	}

	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch(err => {
	log.fatal({ err }, 'fatal error');
	process.exit(1);
});
