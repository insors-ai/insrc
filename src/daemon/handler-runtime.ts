/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's request handler tables (Epic 86197ac6, Story s2, t1), built by
 * one function from the objects they use, so any thread that serves requests
 * can build them: main() calls it with the real index queue and indexer; a
 * worker or a test passes its own. Handler bodies are unchanged from main().
 */

import { createUnderstandingRoutes } from './understanding-rpc.js';
import { connectionManagementHandlers } from './connection-management-rpc.js';
import type { UnderstandingService } from '../understanding/service.js';
import { localIdentityDeps, resolveLearner } from '../understanding/identity.js';
import { AssessmentError } from '../shared/understanding.js';

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { injectSteeringBlock, type SteeringSelection } from './steering-inject.js';
import { registerMcpClients, daemonInstallRoot } from './mcp-register.js';
import { PATHS } from '../shared/paths.js';
import { getLogger } from '../shared/logger.js';
import { getDb } from '../db/client.js';
import { listRepos, addRepo, removeRepo, repoContainingCwd, InvalidRepoPathError, validateRepoPath } from '../db/repos.js';
import { deleteEntitiesForRepo, findEntitiesByFile, getEntity } from '../db/entities.js';
import { deleteUnresolvedForRepo } from '../db/relations.js';
import { collectRepoStats } from './repo-stats.js';
import { unattributedUnwritable, withCompleteness } from './repo-completeness.js';
import { buildDaemonStatus, composeQueueLanes } from './status.js';
import { entitiesForSourceRoots, METHOD_ENTITIES_FOR_SOURCE_ROOTS } from './source-roots-rpc.js';
import { reloadChatConfig, chatStart, chatCancel, chatInject, chatClose, chatList, chatStatus, chatRestore } from './chat-handler.js';
// Phase 1 cleanup: handoff-stream, meta-task-stream, gate-handlers, orphan-handlers,
// the chat agent-flow exports (chatReply, chatRedirect, brainstormAddIdea, chatSend,
// chatResume + variants), and handoff/orphan-cleanup detectOrphans all return
// `backend offline` via the inline helpers below. Their backing files get deleted
// in Phase 2-3.

import type { RpcHandler, RpcHandlers, StreamHandler, StreamHandlers } from './server.js';
import { listModels } from './list-models.js';
import { claudeModels, modelDefinitions, resolveRoleWire } from './model-definitions.js';
import { sharedAdminHandlers } from './admin-handlers.js';
import { getGraphStore } from '../db/graph/store.js';
import { readInstalledCommit } from './installed-commit.js';

import { getModelState } from './lifecycle.js';
import { resolveClosure, searchEntities, findCallers, findCallees, closureEntities, unreachableEntities } from '../db/search.js';
import { embedQuery } from '../indexer/embedder.js';
import { guardSearchRequest, underIndexFilter } from './search-guard.js';
import { getArtifactById, queryArtifactVec } from '../db/lance/artifact-vec.js';
import { inferParentCandidates } from '../workflow/locate/infer.js';
import { buildOwnershipIndex } from '../workflow/locate/ownership.js';
import { daemonInferencePorts } from '../workflow/locate/infer-daemon.js';
import type { InferParentsRequest } from '../workflow/locate/types.js';
import { readFile as fsReadFile } from 'node:fs/promises';
import {
	saveTurn,
	closeSession,
	saveSession,
	seedFromPrior,
	deleteSessionsForRepo,
	deleteTurnsForRepo,
	pruneConversations,
	searchTurnsByRepo,
	getConversationStats,
	listSessions,
	getAllTurns,
	type TurnRecord,
} from '../db/conversations.js';
import { compactConversations, type CompactionOpts } from '../db/compaction.js';
// Cleanup: plan-store + Plan / PlanStepStatus dropped with the legacy planner.
import type { RegisteredRepo, DaemonStatus, Entity, ConfigScope, ConfigSearchOpts, TemplateQuery, AttachedClient, IndexJob } from '../shared/types.js';
import { basename, isAbsolute, join } from 'node:path';
import type { ConfigStore } from '../config/store.js';
import { applyConfigWrite } from './config-write.js';
import { getModelRegistry } from './model-registry.js';
import { searchConfig, resolveTemplate } from '../config/search.js';
import * as todosRpc from './todos-rpc.js';
import { createRepoSettingsHandlers } from './repo-settings.js';
import { handoffRpcHandlers } from './steps/workflow-step/handoff-rpc.js';
import { approvalAnswer, approvalSubscribe } from './approval.js';
import { toolsCall } from './tools/call-handler.js';

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

const log = getLogger('daemon');

/** The step.call handler, built once on first use (the step modules load lazily). */
let _stepCallHandler: StreamHandler | undefined;
function getStepCallHandler(mod: typeof import('./steps/host.js')): StreamHandler {
	return _stepCallHandler ??= mod.createStepCallHandler();
}

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

/** The code-graph work for one repo, queued or in flight (IndexQueue.codeIndexWorkFor). */
export interface CodeIndexWork { readonly inFlight: boolean; readonly pending: number }

/**
 * What the handlers use of the index queue: the IndexQueue itself where the
 * queue lives, or, on the main thread with daemon threads, a port to the
 * code-indexing worker (Epic 86197ac6 s2), whose codeIndexWorkFor answers
 * asynchronously.
 */
export interface RuntimeQueue {
	readonly depth: number;
	readonly isProcessing: boolean;
	laneStatus(): { index: { depth: number; running: boolean }; summary: { depth: number; running: boolean } };
	enqueue(job: IndexJob): void;
	codeIndexWorkFor(repoPath: string): CodeIndexWork | Promise<CodeIndexWork>;
	depthForRepo(repoPath: string): number;
}

/** What the handlers use of the indexer. */
export interface RuntimeIndexer {
	addRepo(repoPath: string): Promise<void>;
	removeRepo(repoPath: string): Promise<void>;
	summarySweepProgress(): { repoPath: string; done: number; total: number } | undefined;
}

export interface HandlerRuntimeDeps {
  /** Trusted in-process composition seam; never supplied in an RPC payload. */
  readonly probeHandler?: RpcHandler | undefined;
 readonly stepCallHandler?: StreamHandler | undefined;
	readonly db: Awaited<ReturnType<typeof getDb>>;
	readonly configStore: ConfigStore;
	readonly queue: RuntimeQueue;
	readonly indexer: RuntimeIndexer;
	/** When the daemon started, for daemon.status's uptime. */
	readonly startedAt: number;
	/** Called by daemon.shutdown and daemon.update; the shutdown is created after the tables. */
	readonly shutdown: (reason: string) => void;
	/** The socket server's attached clients, for daemon.debug-status; the server is created after the tables. */
	readonly attachedClients: () => AttachedClient[];
	/** The understanding service once it has opened (after the server listens), else undefined. */
	readonly understandingService: () => UnderstandingService | undefined;
}

export interface HandlerRuntime {
	readonly rpcHandlers: RpcHandlers;
	readonly streamHandlers: StreamHandlers;
	readonly understandingRoutes: ReturnType<typeof createUnderstandingRoutes>;
}

/** Build the request handler tables, the understanding routes merged in. */
/**
 * The post-approval seam of every approval at the daemon: the bugfix advance, then the approve pipeline (Task reconciliation and,
 * with `withTracker`, publication, the check-in commit and the attachment), then the attachment of a BUILD's records. The graph handle
 * stays here, so the workflow layer stays DB-free.
 */
function approveFollowOn(db: HandlerRuntimeDeps['db'], withTracker: boolean) {
	return async (approved: import('../workflow/gates.js').WorkflowApproveResult['approved'], repoPath: string) => {
		const { advanceApprovedBugfixes } = await import('../workflow/bugfix/index.js');
		const { followOnTrackerAttach } = await import('./tracker-attach.js');
		const { approvePipelineFollowOn } = await import('./approve-pipeline.js');
		const bugfix = await advanceApprovedBugfixes(approved, {
			repoPath,
			// DB-bound parent inference is bound to this daemon's graph handle (the same wiring the `locate.inferParents` IPC uses).
			inferCandidates: async (req: InferParentsRequest) =>
				inferParentCandidates(daemonInferencePorts(db, req.repoPath), buildOwnershipIndex(req.repoPath), req),
		});
		return [...(bugfix ?? []), ...await approvePipelineFollowOn(approved, { withTracker }), ...await followOnTrackerAttach(approved, repoPath)];
	};
}

export function buildHandlerRuntime(deps: HandlerRuntimeDeps): HandlerRuntime {
	const { db, configStore, queue, indexer, startedAt } = deps;
	/** When codeReview.freshness last asked the queue to index each file (absolute path); read back as requestedAt. */
	const freshnessRequests = new Map<string, number>();
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
	// The request handler maps, built once: the IpcServer serves them over the
	// socket, and the step handlers call the same functions in-process through
	// the in-daemon client (Epic c2ba6fa6, Story s11), never over a loopback.
	const repoSettingsHandlers = createRepoSettingsHandlers({ registeredRepos: async () => (await listRepos(db)).map(r => r.path) });
	const rpcHandlers: RpcHandlers = {
		...handoffRpcHandlers(),
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
			let mcp: Awaited<ReturnType<typeof registerMcpClients>> | undefined;
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
				// Same gate, same non-fatal contract: register the insrc MCP for
				// each approved client (--scope user / global, idempotent). A
				// registration failure is captured per-client and never fails the add.
				try {
					mcp = await registerMcpClients(daemonInstallRoot(), sel);
				} catch (err) {
					log.warn(
						{ repo: normalisedPath, err: err instanceof Error ? err.message : String(err) },
						'mcp registration failed; repo registered regardless',
					);
				}
			}
			return {
				ok: true,
				...(steering !== undefined ? { steering } : {}),
				...(mcp !== undefined ? { mcp } : {}),
			};
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
			return await withCompleteness(await listRepos(db), r => r.path);
		},

		// Combined per-repo index statistics in one call (Story
		// add-new-repo-stats-daemon-ipc / S001). Read-only: scans the graph +
		// registry + queue and returns a RepoStats for `repoPath` (or {error}
		// when it is not a registered repo), or a RepoStats[] for every
		// registered repo when `repoPath` is omitted. No mutation, no indexing.
		'repo.stats': async (params) => {
			const { repoPath } = (params ?? {}) as { repoPath?: unknown };
			const repos = await listRepos(db);
			const store = await getGraphStore();
			const all = await withCompleteness(collectRepoStats(store, repos, queue), s => s.repoPath);
			if (typeof repoPath === 'string' && repoPath.length > 0) {
				const one = all.find(s => s.repoPath === repoPath);
				return one ?? { error: `repo.stats: ${repoPath} is not a registered repo` };
			}
			return all;
		},

		// Read-only: a repository's file entities, for a review that runs
		// outside the daemon and may not open the store (Epic c2ba6fa6, Story s4).
		[METHOD_ENTITIES_FOR_SOURCE_ROOTS]: async (params) => entitiesForSourceRoots(params),

		// Append one post-hoc, human-authored feedback entry to a workflow
		// artifact (Story S001 — provenance/feedback), now stored as a Feedback line through the
		// repository's FeedbackService (s5); returns { artifactPath, entryId, total } on success
		// or { error } (never a throw) on a bad request / out-of-tree path / malformed artifact.
		'artifact.feedback.append': async (params) => {
			const { handleFeedbackAppend } = await import('./feedback-handlers.js');
			return handleFeedbackAppend(params);
		},

		// s5: feedback and replies on any artifact (a Task included) through the repository's FeedbackService, the threads of an
		// artifact (open ones on request), and the person's declared ids. Each returns { error } on a bad request, never a throw.
		'artifact.feedback.add': async (params) => (await import('./feedback-handlers.js')).handleFeedbackAdd(params, process.env['INSRC_REPO']),
		'artifact.feedback.list': async (params) => (await import('./feedback-handlers.js')).handleFeedbackList(params, process.env['INSRC_REPO']),
		'identity.show': async () => (await import('./feedback-handlers.js')).handleIdentityShow(),
		'identity.declare': async (params) => (await import('./feedback-handlers.js')).handleIdentityDeclare(params),

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

		// In-CLI, controller-driven approval: approve the artifact's lifecycle (enforcing the
		// review block-verdict via approveArtifactByJsonPath) for a single
		// artifact by path, or batch every still-pending artifact under an epic.
		// Non-lossy — review-blocked artifacts come back in `skipped[]`.
		'workflow.approve': async (params) => {
			const { handleWorkflowApprove } = await import('./workflow-approve.js');
			// delegates to the pipeline's seam with the tracker on: an approval publishes, checks in and attaches, as the terminal's approve does
			return handleWorkflowApprove(params, process.env['INSRC_REPO'], { followOn: approveFollowOn(db, true) });
		},

		// The terminal's approve (Story s10): one artifact approved and carried through the pipeline in the daemon. `withTracker` false stops after
		// the approval and the Task reconciliation. Answers the approval and every follow-on entry, or { error } (a refusal, a review block).
		'workflow.approvePipeline': async (params) => {
			const { handleApprovePipeline } = await import('./workflow-approve.js');
			return handleApprovePipeline(params, process.env['INSRC_REPO'], (withTracker) => approveFollowOn(db, withTracker));
		},

		// Story s10: the terminal's team and review operations, run here so the tracker and git are reached through the registry only.
		'team.refresh': async (params) => (await import('./team-review-handlers.js')).handleTeamRefresh(params),
		'team.claim': async (params) => (await import('./team-review-handlers.js')).handleTeamClaim(params),
		'team.release': async (params) => (await import('./team-review-handlers.js')).handleTeamRelease(params),
		'workflow.reviewArtifact': async (params) => (await import('./team-review-handlers.js')).handleReviewArtifact(params),
		'workflow.resolveFinding': async (params) => (await import('./team-review-handlers.js')).handleResolveFinding(params),

		// Story s10: pull the tracker state of an Epic and its Stories into the Define; read-only against GitHub.
		'tracker.sync': async (params) => {
			const { handleTrackerSync } = await import('./tracker-setup-handlers.js');
			return handleTrackerSync(params);
		},

		// Story s10: bootstrap the GitHub tracker for a repo (preflight, config, labels, issue types, optionally a board).
		'tracker.setup': async (params) => {
			const { handleTrackerSetup } = await import('./tracker-setup-handlers.js');
			return handleTrackerSetup(params, repoSettingsHandlers['repo.trackerConfig.ensure']!);
		},

		// s9: convert the repository's artifacts to the current schema (a preview unless mode is 'apply'). Exempt from the schema gate.
		'repo.convert': async (params) => {
			const { handleRepoConvert } = await import('./repo-convert.js');
			return handleRepoConvert(params, process.env['INSRC_REPO']);
		},

		// s6: attach a unit's committed documents to its issue (a link per revision). Commits nothing.
		'tracker.attach': async (params) => {
			const { handleTrackerAttach } = await import('./tracker-attach.js');
			return handleTrackerAttach(params, process.env['INSRC_REPO']);
		},

		// s8: read a unit's issue comments in as feedback and post feedback entered here out. Commits nothing.
		'tracker.syncComments': async (params) => {
			const { handleTrackerSyncComments } = await import('./tracker-sync-comments.js');
			return handleTrackerSyncComments(params, process.env['INSRC_REPO']);
		},

		// sc1 (ide-artifact-review-panel S001): the pending-approval artifact
		// list the JetBrains review panel polls. A pure scan of the canonical
		// `.insrc/artifacts` store (a head whose lifecycle is neither approved nor rejected) —
		// the single source of truth, so the panel can never disagree with real
		// approval state (k1/k5). Read-only; one bounded readdir per call, no
		// push stream (k7). A store the scanner cannot READ maps to a structured
		// `{ error }` the plugin relays — never a silent empty list.
		'workflow.pending': async (params) => {
			const { handleWorkflowPending } = await import('../workflow/pending.js');
			return handleWorkflowPending(params as { repo?: string } | undefined, process.env['INSRC_REPO']);
		},

		// sc2 (ide-artifact-review-panel S002): the review view for one pending
		// artifact — its own rendered .md content (verbatim, k5/lc1), open
		// questions, and whether a review block-verdict withholds approval. A
		// pure read (handleArtifactContent) path-guarded under docs/; a failure
		// maps to a structured { error } the plugin renders as 'content
		// unavailable', never a blank pane. Read-only; delegates like
		// workflow.pending.
		'workflow.artifactContent': async (params) => {
			const { handleArtifactContent } = await import('../workflow/artifact-content.js');
			return handleArtifactContent(
				params as { repo?: string; mdPath?: string } | undefined,
				process.env['INSRC_REPO'],
			);
		},

		// sc7 (E1 delivery read model s5): one timestamped snapshot of every
		// work item in the artifact store — stage, evidence, gates, currency,
		// notices and one needs-attention flag. Reads the store once; never
		// writes. A missing repo or unreadable store is a structured { error }.
		'workflow.delivery': async (params) => {
			const { handleDelivery } = await import('../workflow/delivery/handlers.js');
			return handleDelivery(params as { repo?: string } | undefined, process.env['INSRC_REPO']);
		},

		// sc7 (E1 delivery read model s5): one record's meta, body and
		// rendered markdown, for records the review view cannot open (a
		// marker-less BUILD, an AMD). Id-pattern and realpath guarded under
		// the store; markdown read under the docs/ containment rule.
		'workflow.deliveryEvidence': async (params) => {
			const { handleDeliveryEvidence } = await import('../workflow/delivery/handlers.js');
			return handleDeliveryEvidence(
				params as { repo?: string; artifactId: string } | undefined,
				process.env['INSRC_REPO'],
			);
		},

		// sc3 (ide-artifact-review-panel S004): record the submitted review
		// comments against their artifact as open-question resolutions, through
		// the EXISTING recordResolution machinery (k4/lc1 — no parallel store).
		// The artifactId (DEF/HLD/LLD) is the locator; every failure maps to a
		// structured { error } the plugin renders as Unavailable (keeping the
		// un-submitted buffer, ac3). Write-side; delegates like the read above.
		'workflow.resolveComment': async (params) => {
			const { handleResolveComment } = await import('../workflow/resolve-comment.js');
			return handleResolveComment(
				params as Parameters<typeof handleResolveComment>[0],
				process.env['INSRC_REPO'],
			);
		},

		// One decision from the review pane (Story E202610138d4b90c9:S001): approve,
		// reject or send feedback, with the reviewer's comments. The decision is
		// recorded first, then the comments are stored through the repository's
		// FeedbackService under one batch id, with the author the daemon resolves. Every
		// refusal is a structured { error } and writes nothing. The follow-on of
		// an approval is the one 'workflow.approve' runs, bound to this daemon's
		// graph handle.
		'workflow.reviewDecision': async (params) => {
			const { handleReviewDecision } = await import('../workflow/review-decision.js');
			const { lifecycleFor } = await import('./lifecycle-registry.js');
			return handleReviewDecision(
				params as Parameters<typeof handleReviewDecision>[0],
				process.env['INSRC_REPO'],
				{
					lifecycleFor: repoPath => lifecycleFor(repoPath).service,
					feedbackFor: repoPath => {
						const entry = lifecycleFor(repoPath);
						return { feedback: entry.feedback, currentActor: path => entry.identity.currentActor(path) };
					},
					followOn: approveFollowOn(db, true),
				},
			);
		},

		// Read-side of sc4 (S007): resolve a brainstorm SpecArtifact by its
		// specHash, refusing an unapproved one. `define` / standalone
		// `design.story` reach an approved spec ONLY through this IPC — never by
		// opening the artifact file directly (k11). Non-throwing: the pure
		// resolver maps not-approved / not-found to a structured { error, code }
		// the consumer relays to the user (ac4).
		'spec.resolveApproved': async (params) => {
			const p = (params ?? {}) as { repo?: string; specHash?: string };
			const repoPath = (p.repo !== undefined && p.repo.length > 0 ? p.repo : process.env['INSRC_REPO']) ?? '';
			if (repoPath.length === 0) {
				return { error: 'spec.resolveApproved: `repo` is required', code: 'not-found' as const };
			}
			if (typeof p.specHash !== 'string' || p.specHash.length === 0) {
				return { error: 'spec.resolveApproved: `specHash` is required', code: 'not-found' as const };
			}
			const { resolveApprovedSpec } = await import('../workflow/gates.js');
			return resolveApprovedSpec(repoPath, p.specHash);
		},

		// sc2 (code-review S001): daemon-served code-review grounding. The
		// dimension judgements and the controller path reach the changed-symbol
		// summaries ONLY through this IPC — no surface opens LMDB directly
		// (ac4, k5). Read-only. Resolving the subject may DECLINE with a
		// no-verdict reason (no approved contract / no build) rather than a
		// verdict (ac2); on ok, grounding is structured entity summaries, never
		// raw file text (ac3, k6).
		'codeReview.investigation.capabilities': async()=>{const {investigationCapabilities}=await import('./review-investigation-gateway.js');return investigationCapabilities();},
    'codeReview.investigation.probe': async params => {if(deps.probeHandler)return deps.probeHandler(params);const {probeTransport}=await import('./review-investigation-gateway.js');return probeTransport(params);},
		'codeReview.diagnostics': async params => {
 const {legacyInvestigationDiagnostics}=await import('./review-investigation-gateway.js');return legacyInvestigationDiagnostics(params);
 },
		'codeReview.investigation': async params => {
 const {investigationTransport}=await import('./review-investigation-gateway.js');return investigationTransport(params);
 },
		'codeReview.grounding': async (params) => {
			const p = (params ?? {}) as { repo?: string; epicHash?: string; storyId?: string };
			const repoPath = (p.repo !== undefined && p.repo.length > 0 ? p.repo : process.env['INSRC_REPO']) ?? '';
			if (repoPath.length === 0) { return { error: 'codeReview.grounding: `repo` is required' }; }
			if (typeof p.epicHash !== 'string' || p.epicHash.length === 0) { return { error: 'codeReview.grounding: `epicHash` is required' }; }
			if (typeof p.storyId !== 'string' || p.storyId.length === 0) { return { error: 'codeReview.grounding: `storyId` is required' }; }
			const { resolveCodeReviewSubject } = await import('../workflow/code-review/subject.js');
			const subject = await resolveCodeReviewSubject(repoPath, p.epicHash, p.storyId);
			if (!subject.ok) { return { ok: false as const, reason: subject.reason }; }
			const { assembleCodeReviewGrounding, realGroundingDeps } = await import('../workflow/code-review/grounding.js');
			const grounding = await assembleCodeReviewGrounding(repoPath, subject.subject.changedFiles, await realGroundingDeps());
			return { ok: true as const, grounding };
		},

		// Code-review s9 — the indexing-readiness freshness check. Read-only:
		// returns { isProcessing, inFlight, pendingCodeIndexJobs, staleFiles, unindexedFiles } for the
		// changed set, from the repo's code-index work in the queue (ISSUE-1102dc71)
		// + the per-file graph watermark. It queues one file job for each stale file the
		// index holds, once per mtime (no reindex of the repo, no store write). The controller-side gate (insrc_code_review_step) polls
		// this before assembling grounding so a stale graph cannot yield a hollow
		// PASS. Additive sibling of codeReview.grounding.
		'codeReview.freshness': async (params) => {
			const p = (params ?? {}) as { repo?: string; epicHash?: string; storyId?: string; changedFiles?: unknown };
			const repoPath = (p.repo !== undefined && p.repo.length > 0 ? p.repo : process.env['INSRC_REPO']) ?? '';
			if (repoPath.length === 0) { return { error: 'codeReview.freshness: `repo` is required' }; }
			if (typeof p.epicHash !== 'string' || p.epicHash.length === 0) { return { error: 'codeReview.freshness: `epicHash` is required' }; }
			if (typeof p.storyId !== 'string' || p.storyId.length === 0) { return { error: 'codeReview.freshness: `storyId` is required' }; }
			const changedFiles = Array.isArray(p.changedFiles) ? p.changedFiles.filter((f): f is string => typeof f === 'string') : [];
			const { computeCodeReviewFreshness, realFreshnessGraphDeps } = await import('../workflow/code-review/freshness.js');
			const graphDeps = await realFreshnessGraphDeps();
			const repos = await listRepos(db);
			const repoRow = repos.find(r => r.path === repoPath);
			const computed = await computeCodeReviewFreshness(repoPath, changedFiles, {
				codeIndexWork: (r: string) => queue.codeIndexWorkFor(r),
				repoLastIndexed: async () => {
					const li = repoRow?.lastIndexed;
					if (li === undefined) return 0;
					const ms = typeof li === 'number' ? li : Date.parse(String(li));
					return Number.isFinite(ms) ? ms : 0;
				},
				requestedAt: (r: string, f: string) => freshnessRequests.get(isAbsolute(f) ? f : join(r, f)),
				...graphDeps,
			});
			// The reply: the FreshnessResult, after the unindexed files were queued and the queue state re-read.
			if (computed.unindexedFiles.length === 0) return computed;
			for (const file of computed.unindexedFiles) {
				const filePath = isAbsolute(file) ? file : join(repoPath, file);
				queue.enqueue({ kind: 'file', filePath, event: 'update' });
				freshnessRequests.set(filePath, Date.now());
			}
			const work = await queue.codeIndexWorkFor(repoPath);
			return { ...computed, isProcessing: work.inFlight || work.pending > 0, inFlight: work.inFlight, pendingCodeIndexJobs: work.pending };
		},

		'repo.reindex': async (params) => {
			const { path: repoPath } = params as { path: string };
			const repos = await listRepos(db);
			const repo = repos.find(r => r.path === repoPath);
			if (!repo) { return { error: 'repo not found' }; }
			queue.enqueue({ kind: 'full', repoPath });
			return { ok: true };
		},

		// One-time restore of document summaries from a backup store (ISSUE-dced4385).
		'docSummary.restoreFromBackup': async (params) => {
			const { backupPath } = (params ?? {}) as { backupPath?: unknown };
			if (typeof backupPath !== 'string') throw new Error('docSummary.restoreFromBackup: backupPath must be a string');
			const { restoreDocSummariesFromBackup } = await import('../db/doc-summaries.js');
			const counts = await restoreDocSummariesFromBackup(backupPath);
			log.info({ backupPath, ...counts }, 'document summaries restored from a backup');
			return counts;
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
			// LMDB env file size for compact-when-needed surfacing.
			let lmdbFileSizeMb: number | undefined;
			try {
				const { existsSync, statSync } = await import('node:fs');
				if (existsSync(PATHS.lmdb)) {
					lmdbFileSizeMb = Math.round(statSync(PATHS.lmdb).size / 1024 / 1024);
				}
			} catch { /* best-effort; status should never throw */ }
			// The repository list is read from the store; buildDaemonStatus guards
			// that read so the status still answers, with `storeFailure`, once the
			// store has failed (Epic c2ba6fa6, Story s4).
			const status: DaemonStatus = await buildDaemonStatus({
				uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
				listRepos: async () => withCompleteness(await listRepos(db), r => r.path),
				unattributedUnwritable,
				queueDepth: queue.depth,
				queueLanes: () => composeQueueLanes(queue.laneStatus(), indexer.summarySweepProgress()),
				modelState: getModelState(),
				// Story S002 (sc2): the daemon's installed source commit for freshness
				// checks. Best-effort git read; '' when undeterminable, never throws.
				installedCommit: readInstalledCommit(),
				lmdbFileSizeMb,
			});
			return status;
		},

		// Story s4: read-only diagnostic — the daemon's own list of currently-attached
		// socket connections (label/pid/connected-at). The CLI Debug pane's MCP section
		// reads this over IPC (k1); it has no side effects and never closes a connection
		// (k5). deps.attachedClients reads the server, which exists before any request fires.
		'daemon.debug-status': async (): Promise<{ clients: AttachedClient[] }> => ({ clients: deps.attachedClients() }),

		'search.query': async (params) => {
			const { text, limit, filter } = params as { text: string; limit?: number; filter?: string };
			const searchFilter = (filter === 'code' || filter === 'artifact') ? filter : 'all';
			log.debug({ query: text.slice(0, 120), limit: limit ?? 10, filter: searchFilter }, 'search.query request');
			const queryVec = await embedQuery(text);
			// Every registered repository is searched, except one under index:
			// the answer comes from the others, and the request is not refused.
			const repos = (await underIndexFilter()).paths((await listRepos(db)).map(r => r.path));
			const results = await searchEntities(db, queryVec, repos, limit ?? 10, searchFilter) as Entity[];
			log.debug({ query: text.slice(0, 60), hits: results.length, names: results.slice(0, 5).map(e => `${e.kind}:${e.name}`) }, 'search.query response');
			return results;
		},

		'search.closure': async (params) => {
			const { repoPath } = params as { repoPath: string };
			await guardSearchRequest({ repoPaths: [repoPath] });
			return (await underIndexFilter()).paths(await resolveClosure(db, repoPath));
		},

		'search.callers': async (params) => {
			const { entityId } = params as { entityId: string };
			await guardSearchRequest({ entityIds: [entityId] });
			return (await underIndexFilter()).entities(await findCallers(db, entityId) as Entity[]);
		},

		'search.callees': async (params) => {
			const { entityId } = params as { entityId: string };
			await guardSearchRequest({ entityIds: [entityId] });
			return (await underIndexFilter()).entities(await findCallees(db, entityId) as Entity[]);
		},

		// ----- locate.* IPC (S003 / sc3 — the tiered parent-locator) -----
		// Daemon-side inference for the bugfix parent-locator: it composes the
		// graph code-ownership and semantic (ANN) tiers over the DB (rule 1) and
		// returns RAW ranked candidates. The controller-side `locateParent` policy
		// applies the tier order + auto-attach thresholds + prompt/standalone
		// fallback. No attach decision is made here.
		'locate.inferParents': async (params) => {
			const { repoPath, touchedPaths, defectDescription } = params as Partial<InferParentsRequest>;
			if (typeof repoPath !== 'string' || repoPath.length === 0) {
				return { error: 'locate.inferParents: `repoPath` is required' };
			}
			await guardSearchRequest({ repoPaths: [repoPath] });
			const req: InferParentsRequest = {
				repoPath,
				touchedPaths:      Array.isArray(touchedPaths) ? touchedPaths.filter((p): p is string => typeof p === 'string') : [],
				defectDescription: typeof defectDescription === 'string' ? defectDescription : '',
			};
			const ownership = buildOwnershipIndex(repoPath);
			const ports = daemonInferencePorts(db, repoPath);
			return inferParentCandidates(ports, ownership, req);
		},

		// ----- entity.* IPCs (added for the MCP server's `insrc_entity_*` tools) -----
		// These wrap existing db/search.ts and db/entities.ts functions so the
		// out-of-process MCP server subprocess can reach the same data without
		// re-implementing the graph layer. See plans/external-agent-integration.md
		// Phase 1 Day 2.

		'entity.summary': async (params) => {
			const { entityId } = params as { entityId: string };
			await guardSearchRequest({ entityIds: [entityId] });
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
			await guardSearchRequest({ entityIds: rootIds });
			return (await underIndexFilter()).entities(await closureEntities(db, rootIds, opts) as Entity[]);
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
			await guardSearchRequest({ entityIds: rootIds });
			const filter = await underIndexFilter();
			return filter.entities(await unreachableEntities(
				db,
				rootIds,
				candidateKinds as readonly ('repo'|'file'|'module'|'function'|'method'|'class'|'interface'|'type')[],
				opts,
			) as Entity[]);
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
			await guardSearchRequest({ repoPaths: [repoId] });
			const closurePaths = (await underIndexFilter()).paths(await resolveClosure(db, repoId));
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
			await guardSearchRequest({ repoPaths: [repoId] });
			const closurePaths = (await underIndexFilter()).paths(await resolveClosure(db, repoId));
			const queryVec     = await embedQuery(query);
			return searchEntities(db, queryVec, closurePaths, limit ?? 10, 'code') as Promise<Entity[]>;
		},

		// ----- Graph context helpers (Phase 7) -----

		'search.by_file': async (params) => {
			const { filePath } = params as { filePath: string };
			await guardSearchRequest({ filePaths: [filePath] });
			return findEntitiesByFile(db, filePath);
		},

		'search.callers_nhop': async (params) => {
			const { entityId, hops } = params as { entityId: string; hops?: number };
			await guardSearchRequest({ entityIds: [entityId] });
			const maxHops = Math.min(hops ?? 1, 3); // cap at 3 to prevent explosion
			// The callers in a repository under index are left out, and are not walked through.
			const filter = await underIndexFilter();
			// For 1-hop, use the existing findCallers
			if (maxHops <= 1) return filter.entities(await findCallers(db, entityId) as Entity[]);

			// Multi-hop: BFS caller traversal
			const seen = new Set<string>();
			let frontier = [entityId];
			const allCallers: Entity[] = [];

			for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
				const nextFrontier: string[] = [];
				for (const eid of frontier) {
					if (seen.has(eid)) continue;
					seen.add(eid);
					const callers = filter.entities(await findCallers(db, eid) as Entity[]);
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

		// Claude model listing: the served models of the family the claude CLI
		// runs, from the model definitions (no cloud REST call, DEF k1).
		'claude.models': async () => claudeModels(),

		// Phase 1 cleanup: agent step bindings RPC gone with the agent
		// framework. IDE Model Providers pane no longer surfaces per-step
		// overrides under the cleanup.
		'config.agents': offlineRpc('config.agents'),

		// config.show, config.catalog, guide.get, guide.list, daemon.shutdown,
		// daemon.update and daemon.updateOutcome: shared with the admin worker
		// (./admin-handlers.ts), so both serve them from one source.
		...sharedAdminHandlers(deps.shutdown),

		// Repo-scoped tracker settings (Story s3): the daemon is the only writer of
		// ~/.insrc/github.json, so every client edits it through these methods.
		...repoSettingsHandlers,

		// docgen: generate a self-contained HTML document from the code graph
		// (Epic 870ed3dd, s1 · t7). The IPC method + the docgen_generate tool +
		// the MCP surface all enumerate the SAME registry, so they cannot drift
		// (k4). Reads happen inside the daemon; only the finished shell returns.
		'docgen.generate': async (params) => {
			// Forward the WHOLE params (minus docType) so every registered doc type's
			// per-type fields (symbol/base/question/maxDepth/path) reach its extractor
			// — parity with the tool + MCP surfaces (s6/ac1). No {repo,path} reshaping.
			const { docType, ...input } = (params ?? {}) as { docType: string } & Record<string, unknown>;
			const mod = await import('../docgen/index.js');
			return mod.generateDocument(docType, input) as unknown as Record<string, unknown>;
		},

		'docgen.list': async () => {
			const mod = await import('../docgen/index.js');
			return { docTypes: mod.listDocTypes() } as unknown as Record<string, unknown>;
		},

		'config.write': async (params) => {
			// `path` is either a legacy dot-string (safe for dot-free keys) OR an
			// array of literal segments — the latter is required for keys that
			// contain dots (models.tasks.<roleId>, .byRepo.<repoPath>),
			// which a naive dot-split would mis-nest. See config/write-path.ts.
			const { path, value } = params as { path: string | string[]; value: unknown };
			let config: Record<string, unknown> = {};
			try {
				config = JSON.parse(readFileSync(PATHS.config, 'utf-8')) as Record<string, unknown>;
			} catch { /* start fresh */ }

			// Applied to a candidate first: an invalid path, or a tier set to a model
			// the user rejected, is refused and config.json is left as it is.
			const { result, candidate } = applyConfigWrite(config, path, value, getModelRegistry());
			if (!result.ok || candidate === undefined) {
				log.warn({ path, reason: result.ok ? undefined : result.reason, detail: result.ok ? undefined : result.detail }, 'config.write: refused');
				return result;
			}

			writeFileSync(PATHS.config, JSON.stringify(candidate, null, 2), 'utf-8');
			await reloadChatConfig();
			log.info({ path, value, restartRequired: result.restartRequired === true }, 'config.write');
			return result;
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
		'models.resolveRole':   async (params) => resolveRoleWire(params),   // sc5 (Epic ce99b72065d03b1b, s3): a role's tier, model and provider settings
		'models.definitions':   () => modelDefinitions(),          // sc3 (Epic ce99b72065d03b1b, s2): read-only model definitions
		'providers.listModels': (params) => listModels(params),   // sc2 (Epic ba132c185fe45860, S002): revived read-only model-list dispatch
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
		'approval.answer': (params) => approvalAnswer(params),
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
		...connectionManagementHandlers(),
		'db.listConnections': async (params, context) => {
			const mod = await import('./db-rpc.js');
			return mod.listConnectionsRpc(params as { repoRoot?: unknown }, context);
		},
		'db.listDriverKinds': async () => {
			const mod = await import('./db-rpc.js');
			return mod.listDriverKindsRpc();
		},
		'db.saveConnection': async (params, context) => {
			const mod = await import('./db-rpc.js');
			return mod.saveConnectionRpc(params as { repoRoot?: unknown; config?: unknown }, context);
		},
		'db.deleteConnection': async (params, context) => {
			const mod = await import('./db-rpc.js');
			return mod.deleteConnectionRpc(params as { repoRoot?: unknown; id?: unknown }, context);
		},
		'db.testConnection': async (params, context) => {
			const mod = await import('./db-rpc.js');
			return mod.testConnectionRpc(params as { repoRoot?: unknown; config?: unknown }, context);
		},

		// ----- analyze.context.* IPCs (analyze framework Context Builder) -----
		// design/analyze-context-builder.md "Public API"
		// docs/plans/analyze-context-builder.md Phase 7
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
	};
	const streamHandlers: StreamHandlers = {
		// Streaming handlers. All agent-driven streams (chat.send, the
		// chat.resume variants, handoff.run, meta-task.run, gate.request-
		// permission) emit a single `error` event and close. `todos.subscribe`
		// + `ollama.pull` remain live.
		'handoff.run':                 offlineStream('handoff.run'),
		'meta-task.run':               offlineStream('meta-task.run'),
		'gate.request-permission':     offlineStream('gate.request-permission'),
		// The approval exchange (sc4): clients subscribe here and answer with 'approval.answer'.
		'approval.subscribe':          approvalSubscribe,
		'chat.send':                   offlineStream('chat.send'),
		'chat.resume':                 offlineStream('chat.resume'),
		'chat.resumeFromCheckpoint':   offlineStream('chat.resumeFromCheckpoint'),
		'chat.resumeCodeAnalysis':     offlineStream('chat.resumeCodeAnalysis'),
		'chat.resumeDataAnalysis':     offlineStream('chat.resumeDataAnalysis'),
		'todos.subscribe': todosRpc.subscribe,
		// One registry tool run for a client with a validated caller; closing the stream cancels it.
		'tools.call':                  toolsCall,
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
		// Daemon-side code-review runner (code-review S006/sc5): resolves the
		// high-tier provider + the fixed sc1 subject (declining, not verdicting,
		// when there is no approved contract/build), drives runCodeReview's serial
		// four-judge loop, streams CodeReviewProgress frames, and persists the sc4
		// CR-<epic>-<story> record. Peer of workflow.run; the load-bearing logic
		// lives in runCodeReview.
		'codeReview.run': async (params, send, signal) => {
			const mod = await import('./code-review-rpc.js');
			return mod.codeReviewRunStart(params, send, signal);
		},
		// Daemon-side review of an EXISTING design artifact (DEF / HLD / LLD) the
		// daemon did not author. `insrc_review_step` sends controller-authored
		// work here; a daemon-authored artifact is refused with an `error` frame.
		'workflow.review': async (params, send, signal) => {
			const mod = await import('./workflow-review-rpc.js');
			const { lifecycleFor } = await import('./lifecycle-registry.js');
			return mod.workflowReviewStart(params, send, signal, { lifecycleFor: repoPath => lifecycleFor(repoPath).service });
		},
		// The step host (Epic c2ba6fa6, Story s11): runs one of the seven step
		// tools for an MCP forwarder, in the caller's context, with this
		// stream's signal; the 'done' frame carries the tool's reply unchanged.
		'step.call': async (params, send, signal, trusted) => {
			const mod = await import('./steps/host.js');
			return (deps.stepCallHandler ?? getStepCallHandler(mod))(params, send, signal, trusted);
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
	};
	const understandingRoutes = createUnderstandingRoutes({
		service: () => { const understandingService = deps.understandingService(); if (!understandingService) throw new AssessmentError('unavailable'); return understandingService; },
		owner: async repo => {
			const understandingHostId = deps.understandingService()?.hostId;
			if (!understandingHostId) throw new AssessmentError('unavailable');
			if (!(await listRepos(db)).some(r => r.path === repo)) throw new AssessmentError('not-found');
			return resolveLearner(repo, localIdentityDeps(understandingHostId));
		},
	});
	Object.assign(rpcHandlers, understandingRoutes.rpc);
	Object.assign(streamHandlers, understandingRoutes.streams);
	return { rpcHandlers, streamHandlers, understandingRoutes };
}
