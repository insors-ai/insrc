/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The handler runtime (Epic 86197ac6, Story s2, t1): the request tables are
 * built by one function from the objects they use, with no daemon, socket or
 * indexer running, and hold exactly the methods main() served before the move.
 *
 * Run: npx tsx --test src/daemon/__tests__/handler-runtime.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-handler-runtime-'));
process.env['HOME'] = HOME;
const { buildHandlerRuntime } = await import('../handler-runtime.js');
const { methodClasses } = await import('../threads/method-class.js');

/** The rpc methods main() built before the move (recorded 2026-10-22 from src/daemon/index.ts). */
const RECORDED_RPC = [
	'access.revoke', 'access.revokePrefix', 'access.snapshot', 'agent.discard', 'agent.list', 'agent.resume',
	'analyze.classify', 'analyze.context.buildClassification', 'analyze.context.buildRun', 'analyze.context.buildTask',
	'analyze.plan.build', 'analyze.run.purge', 'analyze.run.status', 'analyzer.reset', 'analyzer.status',
	'artifact.feedback.append', 'artifact.get', 'artifact.search', 'artifacts.downloadOfflineBundle',
	'artifacts.ensureUserTemplate', 'artifacts.getOfflineBundleStatus', 'artifacts.listTemplates',
	'artifacts.removeOfflineBundle', 'artifacts.resetUserTemplate', 'brainstorm.addIdea', 'chat.cancel', 'chat.close',
	'chat.inject', 'chat.list', 'chat.redirect', 'chat.reply', 'chat.restore', 'chat.start', 'chat.status',
	'claude.models', 'codeAnalyzer.diffRuns', 'codeReview.freshness', 'codeReview.grounding', 'config.agents',
	'config.catalog', 'config.enqueue', 'config.list', 'config.reindex', 'config.reload', 'config.resolveTemplate',
	'config.search', 'config.show', 'config.write', 'conversation.compact', 'conversation.saveSession',
	'conversation.saveTurn', 'conversation.stats', 'daemon.backup', 'daemon.compact', 'daemon.debug-status',
	'daemon.shutdown', 'daemon.status', 'daemon.update', 'daemon.updateOutcome', 'dataAnalyzer.clearCache',
	'dataAnalyzer.diffRuns', 'db.connections.v2.activate', 'db.connections.v2.cancelTest', 'db.connections.v2.capabilities', 'db.connections.v2.drivers',
	'db.connections.v2.list', 'db.connections.v2.mutate', 'db.connections.v2.read', 'db.connections.v2.removalState', 'db.connections.v2.retryRemovalCleanup',
	'db.connections.v2.session.attach', 'db.connections.v2.session.delegate', 'db.connections.v2.session.end',
	'db.connections.v2.session.heartbeat', 'db.connections.v2.session.open', 'db.connections.v2.session.resume',
	'db.connections.v2.status', 'db.connections.v2.test', 'db.connections.v2.ticket',
	'db.deleteConnection', 'db.listConnections', 'db.listDriverKinds', 'db.saveConnection',
	'db.testConnection', 'docSummary.restoreFromBackup', 'docgen.generate', 'docgen.list', 'entity.closure',
	'entity.summary', 'entity.unreachable', 'gate.resolve', 'guide.get', 'guide.list', 'handoff.cleanup',
	'handoff.discard-orphan', 'handoff.list-orphans', 'handoff.mode-a.resolve', 'index.file', 'keys.delete', 'keys.get',
	'keys.list', 'keys.set', 'locate.inferParents', 'mcp.register', 'mcp.status', 'models.approve', 'models.check', 'models.definitions', 'models.reject', 'models.resolveRole', 'ollama.list', 'ollama.search', 'plan.delete', 'plan.get',
	'plan.next_step', 'plan.reset_stale', 'plan.save', 'plan.step_update', 'plan_get', 'plan_next_step',
	'plan_step_update', 'prefs.confirm.list', 'prefs.confirm.resolve', 'prefs.discard', 'prefs.edit', 'prefs.list',
	'providers.check', 'providers.getConfig', 'providers.listModels', 'providers.setConfig', 'providers.testKey',
	'repo.add', 'repo.depends_on', 'repo.entitiesForSourceRoots', 'repo.list', 'repo.reindex', 'repo.remove',
	'repo.resolveForCwd', 'repo.search_cross_repo', 'repo.stats', 'search.by_file', 'search.callees', 'search.callers',
	'search.callers_nhop', 'search.closure', 'search.query', 'session.close', 'session.delete', 'session.deleteBulk',
	'session.forget', 'session.history', 'session.list', 'session.prune', 'session.save', 'session.search_turns',
	'session.seed', 'skill.audit', 'skill.feasibility', 'skill.invoke', 'skill.list', 'spec.resolveApproved',
	'system.info', 'system.recommend', 'todos.ackComment', 'todos.addComment', 'todos.addItem', 'todos.archive',
	'todos.cleanup', 'todos.clearCompleted', 'todos.create', 'todos.deleteComment', 'todos.deleteList',
	'todos.editComment', 'todos.forwardToAgent', 'todos.listForSession', 'todos.removeItem', 'todos.reorderItem',
	'todos.reparent', 'todos.transfer', 'todos.unarchive', 'todos.update', 'todos.updateItem', 'tools.config.get',
	'tools.config.set', 'understanding.cancel', 'understanding.delete', 'understanding.history', 'understanding.list',
	'understanding.prepare', 'understanding.requestOverride', 'understanding.resume', 'workflow.approve',
	'workflow.artifactContent', 'workflow.delivery', 'workflow.deliveryEvidence', 'workflow.pending',
	'workflow.resolveComment', 'workflow.reviewDecision', 'workflow.run.abort', 'workflow.run.poll', 'workflow.run.start',
];
/** The stream methods main() built before the move. */
const RECORDED_STREAM = [
	'analyze.run.start', 'chat.resume', 'chat.resumeCodeAnalysis', 'chat.resumeDataAnalysis', 'chat.resumeFromCheckpoint',
	'chat.send', 'codeReview.run', 'gate.request-permission', 'handoff.run', 'meta-task.run', 'ollama.pull', 'step.call',
	'todos.subscribe', 'understanding.watch', 'workflow.review', 'workflow.run',
];

/** A dependency that fails the test if building the tables touches it. */
function untouchable(name: string): never {
	return new Proxy({}, { get: (_t, prop) => { throw new Error(`building the tables read ${name}.${String(prop)}`); } }) as never;
}

test('the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets', () => {
	try {
		const runtime = buildHandlerRuntime({
			db: untouchable('db'), configStore: untouchable('configStore'), queue: untouchable('queue'), indexer: untouchable('indexer'),
			startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
		});
		assert.deepEqual(Object.keys(runtime.rpcHandlers).sort(), RECORDED_RPC);
		assert.deepEqual(Object.keys(runtime.streamHandlers).sort(), RECORDED_STREAM);
		assert.equal(typeof runtime.understandingRoutes.stop, 'function');
	} finally {
		rmSync(HOME, { recursive: true, force: true });
	}
});

test('handler-runtime.test.ts: RECORDED_RPC includes models.check, models.approve, models.reject; method-class classifies them as session', async () => {
	const runtime = buildHandlerRuntime({
		db: untouchable('db'), configStore: untouchable('configStore'), queue: untouchable('queue'), indexer: untouchable('indexer'),
		startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
	});
	for (const m of ['models.check', 'models.approve', 'models.reject']) {
		assert.ok(RECORDED_RPC.includes(m), m);
		assert.equal(typeof runtime.rpcHandlers[m], 'function', m);
		assert.equal(methodClasses.classOf(m), 'session', m);
		assert.equal(methodClasses.entries().find(e => e.method === m)?.stream, false, m);
	}
	// The handlers reach model-check.ts: refusals that need no CLI and write nothing.
	assert.deepEqual(await runtime.rpcHandlers['models.check']!({ family: 'ollama', modelId: 'm', claimedEfforts: [] }),
		{ error: 'invalid-params: family must be a vendor CLI family of the model definitions', recoverable: false });
	for (const m of ['models.approve', 'models.reject']) {
		assert.deepEqual(await runtime.rpcHandlers[m]!({ checkId: 'never-issued', efforts: [] }),
			{ ok: false, reason: 'unknown-check', detail: 'no pending check never-issued; run models.check again' }, m);
	}
});

test("session.delete refuses a session id that is a path ('..', a separator) before anything is purged", async () => {
	const { isSafeSessionId } = await import('../handler-runtime.js');
	for (const id of ['..', '.', 'a/b', 'a\\b', '../x', 'a\0b', '']) assert.equal(isSafeSessionId(id), false, JSON.stringify(id));
	for (const id of ['s-1f2e', 'abc..def', '9b2c']) assert.equal(isSafeSessionId(id), true, id);
	// Every dependency fails the test if touched: the refusal comes first.
	const runtime = buildHandlerRuntime({
		db: untouchable('db'), configStore: untouchable('configStore'), queue: untouchable('queue'), indexer: untouchable('indexer'),
		startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
	});
	try {
		for (const sessionId of ['..', '../..', 'x/../..']) {
			assert.deepEqual(await runtime.rpcHandlers['session.delete']!({ sessionId }), { deleted: false, reason: 'invalid-input', message: 'sessionId must not be a path' });
		}
	} finally {
		runtime.understandingRoutes.stop();
	}
});

test("the session purge's tmp directory is the id's direct child of the tmp root, and nothing for an id that names anything else", async () => {
	const { sessionTmpDir } = await import('../handler-runtime.js');
	const root = join(tmpdir(), 'insrc-tmp-root');
	assert.equal(sessionTmpDir(root, 's-1f2e'), join(root, 's-1f2e'));
	assert.equal(sessionTmpDir(root, 'abc..def'), join(root, 'abc..def'));
	for (const id of ['..', '.', '', 'a/b', 'a/../..', '..\\x', 'a\0b']) assert.equal(sessionTmpDir(root, id), undefined, JSON.stringify(id));
});

test('handler-runtime.test.ts: mcp.register and mcp.status are served; mcp.register refuses a malformed path before touching the store', async () => {
	const runtime = buildHandlerRuntime({
		db: untouchable('db'), configStore: untouchable('configStore'), queue: untouchable('queue'), indexer: untouchable('indexer'),
		startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
	});
	assert.equal(typeof runtime.rpcHandlers['mcp.register'], 'function');
	assert.equal(typeof runtime.rpcHandlers['mcp.status'], 'function');
	assert.equal(methodClasses.classOf('mcp.register'), 'indexing');
	assert.equal(methodClasses.classOf('mcp.status'), 'admin');
	// A non-string path is refused by validateRepoPath before the repo store is read.
	await assert.rejects(runtime.rpcHandlers['mcp.register']!({ path: 42 }), /Cannot register providers/);
});
