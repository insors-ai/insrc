/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Method-class registry (Epic 86197ac6, Story s2, contract sc5): the class of
 * every RPC and stream method the daemon serves, so the router sends each
 * request to the right kind of thread. A frozen table that imports no handler
 * module, so the main thread and every worker can load it. A test fails when
 * it differs from the handler tables buildHandlerRuntime constructs.
 */

import type { MethodClass } from './channel.js';

export interface MethodClassEntry {
	readonly method: string;
	readonly cls: MethodClass;
	readonly stream: boolean;
}

export interface MethodClassRegistry {
	readonly classOf: (method: string) => MethodClass | undefined;
	readonly entries: () => readonly MethodClassEntry[];
}

/** [method, class, stream] for every served method. */
const TABLE: readonly (readonly [string, MethodClass, boolean])[] = [
	// Admin: liveness, status and control, answered from the status board.
	['daemon.status', 'admin', false],
	['daemon.debug-status', 'admin', false],
	['daemon.shutdown', 'admin', false],
	['daemon.update', 'admin', false],
	['daemon.updateOutcome', 'admin', false],
	['repo.list', 'admin', false],
	['mcp.status', 'admin', false],
	['config.show', 'admin', false],
	['config.catalog', 'admin', false],
	['guide.list', 'admin', false],
	['guide.get', 'admin', false],
	// Indexing: they change or scan the whole index, or read the queue.
	['repo.add', 'indexing', false],
	['mcp.register', 'indexing', false],
	['repo.remove', 'indexing', false],
	['repo.reindex', 'indexing', false],
	['repo.stats', 'indexing', false],
	['index.file', 'indexing', false],
	['config.enqueue', 'indexing', false],
	['config.reindex', 'indexing', false],
	['daemon.compact', 'indexing', false],
	['daemon.backup', 'indexing', false],
	['docSummary.restoreFromBackup', 'indexing', false],
	// Session: every other unary method.
	['access.revoke', 'session', false],
	['access.revokePrefix', 'session', false],
	['access.snapshot', 'session', false],
	['agent.discard', 'session', false],
	['agent.list', 'session', false],
	['agent.resume', 'session', false],
	['analyze.classify', 'session', false],
	['analyze.context.buildClassification', 'session', false],
	['analyze.context.buildRun', 'session', false],
	['analyze.context.buildTask', 'session', false],
	['analyze.plan.build', 'session', false],
	['analyze.run.purge', 'session', false],
	['analyze.run.status', 'session', false],
	['analyzer.reset', 'session', false],
	['analyzer.status', 'session', false],
	['artifact.feedback.append', 'session', false],
	['artifact.get', 'session', false],
	['artifact.search', 'session', false],
	['artifacts.downloadOfflineBundle', 'session', false],
	['artifacts.ensureUserTemplate', 'session', false],
	['artifacts.getOfflineBundleStatus', 'session', false],
	['artifacts.listTemplates', 'session', false],
	['artifacts.removeOfflineBundle', 'session', false],
	['artifacts.resetUserTemplate', 'session', false],
	['brainstorm.addIdea', 'session', false],
	['chat.cancel', 'session', false],
	['chat.close', 'session', false],
	['chat.inject', 'session', false],
	['chat.list', 'session', false],
	['chat.redirect', 'session', false],
	['chat.reply', 'session', false],
	['chat.restore', 'session', false],
	['chat.start', 'session', false],
	['chat.status', 'session', false],
	['claude.models', 'session', false],
	['codeAnalyzer.diffRuns', 'session', false],
	['codeReview.freshness', 'session', false],
	['codeReview.grounding', 'session', false],
	['config.agents', 'session', false],
	['config.list', 'session', false],
	['config.reload', 'session', false],
	['config.resolveTemplate', 'session', false],
	['config.search', 'session', false],
	['config.write', 'session', false],
	['conversation.compact', 'session', false],
	['conversation.saveSession', 'session', false],
	['conversation.saveTurn', 'session', false],
	['conversation.stats', 'session', false],
	['dataAnalyzer.clearCache', 'session', false],
	['dataAnalyzer.diffRuns', 'session', false],
	['db.connections.v2.session.open', 'session', false],
	['db.connections.v2.session.resume', 'session', false],
	['db.connections.v2.session.attach', 'session', false],
	['db.connections.v2.session.delegate', 'session', false],
	['db.connections.v2.session.heartbeat', 'session', false],
	['db.connections.v2.session.end', 'session', false],
	['db.connections.v2.activate', 'session', false],
	['db.connections.v2.capabilities', 'session', false],
	['db.connections.v2.drivers', 'session', false],
	['db.connections.v2.list', 'session', false],
	['db.connections.v2.mutate', 'session', false],
	['db.connections.v2.read', 'session', false],
	['db.connections.v2.status', 'session', false],
 ['db.connections.v2.removalState', 'session', false],
 ['db.connections.v2.retryRemovalCleanup', 'session', false],
	['db.connections.v2.test', 'session', false],
	['db.connections.v2.cancelTest', 'session', false],
	['db.connections.v2.ticket', 'session', false],
	['db.deleteConnection', 'session', false],
	['db.listConnections', 'session', false],
	['db.listDriverKinds', 'session', false],
	['db.saveConnection', 'session', false],
	['db.testConnection', 'session', false],
	['docgen.generate', 'session', false],
	['docgen.list', 'session', false],
	['entity.closure', 'session', false],
	['entity.summary', 'session', false],
	['entity.unreachable', 'session', false],
	['gate.resolve', 'session', false],
	['handoff.cleanup', 'session', false],
	['handoff.discard-orphan', 'session', false],
	['handoff.list-orphans', 'session', false],
	['handoff.mode-a.resolve', 'session', false],
	['keys.delete', 'session', false],
	['keys.get', 'session', false],
	['keys.list', 'session', false],
	['keys.set', 'session', false],
	['locate.inferParents', 'session', false],
	['ollama.list', 'session', false],
	['ollama.search', 'session', false],
	['plan.delete', 'session', false],
	['plan.get', 'session', false],
	['plan.next_step', 'session', false],
	['plan.reset_stale', 'session', false],
	['plan.save', 'session', false],
	['plan.step_update', 'session', false],
	['plan_get', 'session', false],
	['plan_next_step', 'session', false],
	['plan_step_update', 'session', false],
	['prefs.confirm.list', 'session', false],
	['prefs.confirm.resolve', 'session', false],
	['prefs.discard', 'session', false],
	['prefs.edit', 'session', false],
	['prefs.list', 'session', false],
	['providers.check', 'session', false],
	['providers.getConfig', 'session', false],
	['models.definitions', 'session', false],
	['models.resolveRole', 'session', false],
	['models.check', 'session', false],
	['models.approve', 'session', false],
	['models.reject', 'session', false],
	['providers.listModels', 'session', false],
	['providers.setConfig', 'session', false],
	['providers.testKey', 'session', false],
	['repo.depends_on', 'session', false],
	['repo.entitiesForSourceRoots', 'session', false],
	['repo.resolveForCwd', 'session', false],
	['repo.search_cross_repo', 'session', false],
	['search.by_file', 'session', false],
	['search.callees', 'session', false],
	['search.callers', 'session', false],
	['search.callers_nhop', 'session', false],
	['search.closure', 'session', false],
	['search.query', 'session', false],
	['session.close', 'session', false],
	['session.delete', 'session', false],
	['session.deleteBulk', 'session', false],
	['session.forget', 'session', false],
	['session.history', 'session', false],
	['session.list', 'session', false],
	['session.prune', 'session', false],
	['session.save', 'session', false],
	['session.search_turns', 'session', false],
	['session.seed', 'session', false],
	['skill.audit', 'session', false],
	['skill.feasibility', 'session', false],
	['skill.invoke', 'session', false],
	['skill.list', 'session', false],
	['spec.resolveApproved', 'session', false],
	['system.info', 'session', false],
	['system.recommend', 'session', false],
	['todos.ackComment', 'session', false],
	['todos.addComment', 'session', false],
	['todos.addItem', 'session', false],
	['todos.archive', 'session', false],
	['todos.cleanup', 'session', false],
	['todos.clearCompleted', 'session', false],
	['todos.create', 'session', false],
	['todos.deleteComment', 'session', false],
	['todos.deleteList', 'session', false],
	['todos.editComment', 'session', false],
	['todos.forwardToAgent', 'session', false],
	['todos.listForSession', 'session', false],
	['todos.removeItem', 'session', false],
	['todos.reorderItem', 'session', false],
	['todos.reparent', 'session', false],
	['todos.transfer', 'session', false],
	['todos.unarchive', 'session', false],
	['todos.update', 'session', false],
	['todos.updateItem', 'session', false],
	['tools.config.get', 'session', false],
	['tools.config.set', 'session', false],
	['understanding.cancel', 'session', false],
	['understanding.delete', 'session', false],
	['understanding.history', 'session', false],
	['understanding.list', 'session', false],
	['understanding.prepare', 'session', false],
	['understanding.requestOverride', 'session', false],
	['understanding.resume', 'session', false],
	['workflow.approve', 'session', false],
	['workflow.artifactContent', 'session', false],
	['workflow.delivery', 'session', false],
	['workflow.deliveryEvidence', 'session', false],
	['workflow.pending', 'session', false],
	['workflow.resolveComment', 'session', false],
	['workflow.reviewDecision', 'session', false],
	['workflow.run.abort', 'session', false],
	['workflow.run.poll', 'session', false],
	['workflow.run.start', 'session', false],
	// Session: every stream method.
	['analyze.run.start', 'session', true],
	['chat.resume', 'session', true],
	['chat.resumeCodeAnalysis', 'session', true],
	['chat.resumeDataAnalysis', 'session', true],
	['chat.resumeFromCheckpoint', 'session', true],
	['chat.send', 'session', true],
	['codeReview.run', 'session', true],
	['gate.request-permission', 'session', true],
	['handoff.run', 'session', true],
	['meta-task.run', 'session', true],
	['ollama.pull', 'session', true],
	['step.call', 'session', true],
	['todos.subscribe', 'session', true],
	['understanding.watch', 'session', true],
	['workflow.review', 'session', true],
	['workflow.run', 'session', true],
];

const ENTRIES: readonly MethodClassEntry[] = Object.freeze(TABLE.map(([method, cls, stream]) => Object.freeze({ method, cls, stream })));
const BY_METHOD: ReadonlyMap<string, MethodClassEntry> = new Map(ENTRIES.map(e => [e.method, e]));

export const methodClasses: MethodClassRegistry = Object.freeze({
	classOf: (method: string): MethodClass | undefined => BY_METHOD.get(method)?.cls,
	entries: (): readonly MethodClassEntry[] => ENTRIES,
});

/**
 * The session-class families whose state is one process-wide copy (s3): chat (the chat session pool), todos (the todos event bus)
 * and understanding (the understanding service); and (Story 5d393a4b) models, whose checks run one at a time and are decided by a
 * later call, and codeReview, whose running operations later turns look up.
 */
const SHARED_STATE_FAMILIES = ['chat.', 'todos.', 'understanding.', 'models.', 'codeReview.'] as const;

/** The session-class methods served on the one shared-state worker (s3), so their state stays whole. */
export const SHARED_STATE_METHODS: ReadonlySet<string> = new Set(
	ENTRIES.filter(e => e.cls === 'session' && SHARED_STATE_FAMILIES.some(f => e.method.startsWith(f))).map(e => e.method),
);

/** The step.call tools served on the shared-state worker (Story 5d393a4b): the code-review step's turns reach the operations codeReview.run started there. */
export const SHARED_STATE_STEP_TOOLS: ReadonlySet<string> = new Set(['insrc_code_review_step']);

/** Whether a session-class request is served on the shared-state worker: a shared-state method, or step.call for a shared-state step tool. */
export function servedOnSharedState(method: string, params: unknown): boolean {
	if (SHARED_STATE_METHODS.has(method)) return true;
	const tool = method === 'step.call' && typeof params === 'object' && params !== null ? (params as { tool?: unknown }).tool : undefined;
	return typeof tool === 'string' && SHARED_STATE_STEP_TOOLS.has(tool);
}

/**
 * The session-class methods a session's FIFO does not hold back (s3): subscriptions, and
 * methods that observe or control a request of the same session that is still running.
 */
export const FIFO_EXEMPT_METHODS: ReadonlySet<string> = new Set([
	'understanding.watch', 'todos.subscribe',
	'chat.cancel', 'chat.inject', 'chat.redirect', 'chat.status',
	'workflow.run.poll', 'workflow.run.abort',
]);

/** Methods the shared-state worker serves to in-daemon calls only; the socket answers them 'unknown method' (s3). */
export const IN_DAEMON_SHARED_METHODS: ReadonlySet<string> = new Set(['chat.dropSession']);

/** What a thread's in-daemon route knows: the classes routed to workers, and whether it is the shared-state worker. */
export interface InDaemonRouteView {
	readonly routed: ReadonlySet<MethodClass>;
	readonly onSharedWorker: boolean;
}

/**
 * Where a nested in-daemon call runs (s3): an admin or indexing method on its class's worker
 * when that class is routed; a shared-state method on the shared-state worker once session
 * work is routed, unless this is that worker; anything else inline, on the calling thread.
 */
export function inDaemonTarget(method: string, view: InDaemonRouteView): { readonly cls: MethodClass; readonly shared?: true } | undefined {
	const cls = methodClasses.classOf(method);
	if (cls !== undefined && cls !== 'session' && view.routed.has(cls)) return { cls };
	const shared = SHARED_STATE_METHODS.has(method) || IN_DAEMON_SHARED_METHODS.has(method);
	if (shared && view.routed.has('session') && !view.onSharedWorker) return { cls: 'session', shared: true };
	return undefined;
}

/** Served on the main thread, which owns their state and pushes it to every worker (Story 5d393a4b): the IDE's tool settings. */
export const MAIN_THREAD_STATE_METHODS: ReadonlySet<string> = new Set(['tools.config.set']);

/** These operations own process-local admission and transport lifetimes. */
export const MAIN_DAEMON_CONNECTION_METHODS:ReadonlySet<string>=new Set([
 'db.listConnections','db.listDriverKinds','db.saveConnection','db.deleteConnection','db.testConnection',
 'db.connections.v2.capabilities','db.connections.v2.drivers','db.connections.v2.list','db.connections.v2.read',
 'db.connections.v2.ticket','db.connections.v2.mutate','db.connections.v2.status','db.connections.v2.activate',
 'db.connections.v2.test','db.connections.v2.cancelTest',
 'db.connections.v2.removalState','db.connections.v2.retryRemovalCleanup',
 'db.connections.v2.session.open','db.connections.v2.session.resume','db.connections.v2.session.attach',
 'db.connections.v2.session.delegate','db.connections.v2.session.heartbeat','db.connections.v2.session.end',
]);
