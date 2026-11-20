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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-handler-runtime-'));
process.env['HOME'] = HOME;
const { buildHandlerRuntime } = await import('../handler-runtime.js');
const { methodClasses } = await import('../threads/method-class.js');
const { closeGraphStore, setGraphStorePath } = await import('../../db/graph/store.js');

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
	'db.testConnection', 'docRelations.measure', 'docSummary.restoreFromBackup', 'docgen.generate', 'docgen.list', 'entity.closure',
	'entity.summary', 'entity.unreachable', 'gate.resolve', 'guide.get', 'guide.list', 'handoff.cleanup',
	'handoff.discard-orphan', 'handoff.list-orphans', 'handoff.mode-a.resolve', 'index.file', 'index.languages', 'index.subsystems', 'keys.delete', 'keys.get',
	'keys.list', 'keys.set', 'locate.inferParents', 'mcp.register', 'mcp.status', 'models.approve', 'models.check', 'models.definitions', 'models.reject', 'models.resolveRole', 'ollama.list', 'ollama.search', 'plan.delete', 'plan.get',
	'plan.next_step', 'plan.reset_stale', 'plan.save', 'plan.step_update', 'plan_get', 'plan_next_step',
	'plan_step_update', 'prefs.confirm.list', 'prefs.confirm.resolve', 'prefs.discard', 'prefs.edit', 'prefs.list',
	'providers.check', 'providers.getConfig', 'providers.listModels', 'providers.setConfig', 'providers.testKey',
	'repo.add', 'repo.depends_on', 'repo.entitiesForSourceRoots', 'repo.list', 'repo.reindex', 'repo.remove',
	'repo.resolveForCwd', 'repo.search_cross_repo', 'repo.stats', 'search.by_file', 'search.callees', 'search.callers',
	'search.callers_nhop', 'search.closure', 'search.doc_relations', 'search.query', 'session.close', 'session.delete', 'session.deleteBulk',
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

/** Methods the tables gained after the move: approval, team hand-over, feedback and identity, repo settings and conversion, tracker attach and sync, task code review. */
const ADDED_RPC = [
	'approval.answer', 'artifact.feedback.add', 'artifact.feedback.list', 'identity.declare', 'identity.show', 'repo.convert',
	'repo.buildDefaults.migrate', 'repo.gitHooks.install', 'repo.gitHooks.status', 'repo.gitHooks.uninstall', 'repo.settings.get', 'repo.settings.set', 'repo.trackerConfig.ensure', 'team.claim', 'team.park', 'team.refresh', 'team.release', 'team.resume', 'team.settle',
	'tracker.attach', 'tracker.setup', 'tracker.sync', 'tracker.syncComments', 'workflow.approvePipeline',
	'workflow.reviewArtifact', 'workflow.resolveFinding',
	'codeReview.task.activity', 'codeReview.task.assignment', 'codeReview.task.cancel', 'codeReview.task.cleanup', 'codeReview.task.progress', 'codeReview.task.publish',
	'codeReview.task.result', 'codeReview.task.scope', 'codeReview.task.start',
	'daemon.qualificationState',
	'designReview.activity', 'designReview.assignment', 'designReview.cancel', 'designReview.failure', 'designReview.impact', 'designReview.plan', 'designReview.progress', 'designReview.recover',
	'designReview.result', 'designReview.start',
	'progress.attach', 'progress.control', 'progress.detach', 'progress.origin.bind',
	'progress.origin.open', 'progress.origin.revoke', 'progress.read',
];
const ADDED_STREAM = ['approval.subscribe', 'progress.subscribe', 'tools.call'];

/** A dependency that fails the test if building the tables touches it. */
function untouchable(name: string): never {
	return new Proxy({}, { get: (_t, prop) => { throw new Error(`building the tables read ${name}.${String(prop)}`); } }) as never;
}

test('the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets plus the methods added since', () => {
	try {
		const runtime = buildHandlerRuntime({
			db: untouchable('db'), configStore: untouchable('configStore'), queue: untouchable('queue'), indexer: untouchable('indexer'),
			startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
		});
		assert.deepEqual(Object.keys(runtime.rpcHandlers).sort(), [...RECORDED_RPC, ...ADDED_RPC].sort());
		assert.deepEqual(Object.keys(runtime.streamHandlers).sort(), [...RECORDED_STREAM, ...ADDED_STREAM].sort());
		assert.equal(typeof runtime.understandingRoutes.stop, 'function');
	} finally {
		rmSync(HOME, { recursive: true, force: true });
	}
});

test('src/daemon/__tests__/handler-runtime.test.ts: the only code review methods added after the move are the nine task ones, with no duplicate or renamed method', () => {
	// codeReview.freshness queues file jobs from its existing handler: no method was added for it
	assert.ok(RECORDED_RPC.includes('codeReview.freshness'));
	assert.deepEqual(
		ADDED_RPC.filter(m => m.startsWith('codeReview.')).sort(),
		['activity', 'assignment', 'cancel', 'cleanup', 'progress', 'publish', 'result', 'scope', 'start'].map(m => `codeReview.task.${m}`),
	);
	assert.ok(!ADDED_STREAM.some(m => m.startsWith('codeReview.')));
	assert.equal(new Set([...RECORDED_RPC, ...ADDED_RPC]).size, RECORDED_RPC.length + ADDED_RPC.length, 'no duplicate or renamed method');
});

test('workflow.approvePipeline, tracker.sync and tracker.setup are registered and answer their requests', async () => {
	try {
		const registered = new Set<string>();   // the registry the repo gate reads
		const runtime = buildHandlerRuntime({
			registeredRepos: async () => registered,
			db: untouchable('db'), configStore: untouchable('configStore'), queue: untouchable('queue'), indexer: untouchable('indexer'),
			startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
		});
		const h = runtime.rpcHandlers;
		// a bad request is a structured error, never a throw
		const noRepo = await h['workflow.approvePipeline']!({}) as { error: string; code: string };
		assert.equal(noRepo.code, 'repo-missing');   // the repo gate answers first, before any registry read
		assert.match(noRepo.error, /workflow\.approvePipeline: `repo` .* is required/);
		const noSyncRepo = await h['tracker.sync']!({}) as { code: string };
		assert.equal(noSyncRepo.code, 'repo-missing');   // the repo gate answers first
		assert.equal(((await h['tracker.setup']!({})) as { code: string }).code, 'repo-missing');
		// an Epic that was never pushed is skipped, as the terminal's sync reported it
		const repo = mkdtempSync(join(tmpdir(), 'insrc-hr-sync-'));
		registered.add(repo);
		try {
			const r = await h['tracker.sync']!({ repoPath: repo, epicHash: '0123456789abcdef' }) as { status: string };
			assert.equal(r.status, 'skipped');
		} finally { rmSync(repo, { recursive: true, force: true }); }
	} finally {
		rmSync(HOME, { recursive: true, force: true });
	}
});

test('team.refresh, team.claim and team.release are registered and return the old results', async () => {
	try {
		const registered = new Set<string>();   // the registry the repo gate reads
		const runtime = buildHandlerRuntime({
			registeredRepos: async () => registered,
			db: untouchable('db'), configStore: untouchable('configStore'), queue: untouchable('queue'), indexer: untouchable('indexer'),
			startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
		});
		const h = runtime.rpcHandlers;
		const repo = mkdtempSync(join(tmpdir(), 'insrc-hr-team-'));
		registered.add(repo);
		try {
			// a repository that does not enforce claims: a claim and a release answer the terminal's refusal line
			const unit = { unit: 'story', epicHash: '0123456789abcdef', storyId: 's1' };
			assert.equal(await h['team.claim']!({ repoPath: repo, unit }), '✗ not claimed — this repository does not enforce claims (no team policy with claimsEnforced)');
			assert.match(String(await h['team.release']!({ repoPath: repo, unit })), /^✗ not released — /);
			// a refresh of a directory that is no git work tree is the refusal the terminal printed: an error of the call
			await assert.rejects(Promise.resolve(h['team.refresh']!({ repoPath: repo })), /./);
			assert.equal(((await h['team.claim']!({})) as unknown as { code: string }).code, 'repo-missing');
		} finally { rmSync(repo, { recursive: true, force: true }); }
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
	// A non-string path is refused by the repo gate before the handler or the repo store is reached (the gate answers with data, not a throw).
	const refused = await runtime.rpcHandlers['mcp.register']!({ path: 42 }) as { code?: string; error?: string };
	assert.equal(refused.code, 'repo-missing');
	assert.match(refused.error ?? '', /mcp\.register: `path`/);
});

/** repo.add over a real registry in a temporary HOME, a stand-in indexer and a temporary github.json. */
async function addRepoOver(repo: string, over: { file?: string; writer?: Parameters<typeof buildHandlerRuntime>[0]['buildDefaultsWriter'] } = {}) {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-hr-add-'));
	const config = join(dir, 'github.json');
	setGraphStorePath(join(dir, 'graph.lmdb'));   // a test may open only a temporary store
	if (over.file !== undefined) writeFileSync(config, over.file);
	const previous = process.env['INSRC_GITHUB_CONFIG'];
	process.env['INSRC_GITHUB_CONFIG'] = config;
	try {
		const indexed: string[] = [];
		const runtime = buildHandlerRuntime({
			db: undefined as never, configStore: untouchable('configStore'), queue: untouchable('queue'),
			indexer: { addRepo: async (p: string) => { indexed.push(p); } } as never,
			startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
			...(over.writer !== undefined ? { buildDefaultsWriter: over.writer } : {}),
		});
		const result = await runtime.rpcHandlers['repo.add']!({ path: repo }) as { ok: boolean; buildDefaults: unknown };
		return { result, indexed, config: (): Record<string, any> => JSON.parse(readFileSync(config, 'utf8')) as Record<string, any> };
	} finally {
		await closeGraphStore();
		if (previous === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = previous;
	}
}

test('src/daemon/__tests__/handler-runtime.test.ts: repo.add on a Python repo registers it and stores the default commands with no prompt, reports buildDefaults applied, and a failing write still registers the repo', async () => {
	const py = mkdtempSync(join(tmpdir(), 'insrc-hr-py-'));
	writeFileSync(join(py, 'pyproject.toml'), '');
	const broken = mkdtempSync(join(tmpdir(), 'insrc-hr-py-'));
	writeFileSync(join(broken, 'pyproject.toml'), '');
	try {
		const ok = await addRepoOver(py);
		assert.equal(ok.result.ok, true);
		assert.deepEqual(ok.indexed, [py], 'the repo is registered and indexing started');
		assert.deepEqual(ok.result.buildDefaults, { applied: true, projectType: 'python' });
		assert.deepEqual(ok.config()['repos'][py], { typecheckCommand: 'mypy .', testCommand: 'pytest', resultFormat: 'exit-code' });

		// a failing write: the add still succeeds and the outcome says why
		const failed = await addRepoOver(broken, { writer: async () => ({ ok: false, error: { code: 'write-failed', message: 'disk full' } }) });
		assert.equal(failed.result.ok, true);
		assert.deepEqual(failed.indexed, [broken]);
		assert.deepEqual(failed.result.buildDefaults, { applied: false, reason: 'write-failed', note: 'disk full' });
	} finally {
		rmSync(py, { recursive: true, force: true }); rmSync(broken, { recursive: true, force: true });
	}
});

test('src/daemon/__tests__/handler-runtime.test.ts: repo.add on a repo whose entry already holds commands keeps them and reports already-set', async () => {
	const go = mkdtempSync(join(tmpdir(), 'insrc-hr-go-'));
	writeFileSync(join(go, 'go.mod'), '');
	try {
		const mine = { typecheckCommand: 'make check', testCommand: 'make test' };
		const added = await addRepoOver(go, { file: JSON.stringify({ repos: { [go]: mine } }) });
		assert.equal(added.result.ok, true);
		assert.deepEqual(added.result.buildDefaults, { applied: false, reason: 'already-set' });
		assert.deepEqual(added.config()['repos'][go], mine, 'the commands the entry holds are kept');
	} finally { rmSync(go, { recursive: true, force: true }); }
});

test('src/daemon/__tests__/handler-runtime.test.ts: the handler tables hold repo.buildDefaults.migrate beside the recorded methods and repo.buildDefaults.migrate answers through the runtime', async () => {
	assert.ok(ADDED_RPC.includes('repo.buildDefaults.migrate'), 'recorded beside the other methods added since the move');
	const py = mkdtempSync(join(tmpdir(), 'insrc-hr-migrate-'));
	writeFileSync(join(py, 'pyproject.toml'), '');
	const dir = mkdtempSync(join(tmpdir(), 'insrc-hr-migrate-cfg-'));
	const config = join(dir, 'github.json');
	setGraphStorePath(join(dir, 'graph.lmdb'));
	const previous = process.env['INSRC_GITHUB_CONFIG'];
	process.env['INSRC_GITHUB_CONFIG'] = config;
	try {
		// the repo is registered while the add-time write is refused, so it holds no commands: what a repo added before the defaults looks like
		const runtime = buildHandlerRuntime({
			db: undefined as never, configStore: untouchable('configStore'), queue: untouchable('queue'),
			indexer: { addRepo: async () => {} } as never,
			startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
			buildDefaultsWriter: async () => ({ ok: false, error: { code: 'write-failed', message: 'refused for the test' } }),
		});
		assert.equal(typeof runtime.rpcHandlers['repo.buildDefaults.migrate'], 'function');
		const added = await runtime.rpcHandlers['repo.add']!({ path: py }) as { buildDefaults: { applied: boolean } };
		assert.equal(added.buildDefaults.applied, false);
		assert.equal(existsSync(config), false, 'the registered repo holds no commands yet');

		const report = await runtime.rpcHandlers['repo.buildDefaults.migrate']!({}) as { ok: boolean; repos: Array<{ repo: string; outcome: { applied: boolean } }>; counts: Record<string, number> };
		assert.equal(report.ok, true);
		assert.deepEqual(report.repos.map(e => [e.repo, e.outcome.applied]), [[py, true]]);
		assert.equal(report.counts['applied'], 1);
		assert.deepEqual((JSON.parse(readFileSync(config, 'utf8')) as Record<string, any>)['repos'][py], { typecheckCommand: 'mypy .', testCommand: 'pytest', resultFormat: 'exit-code' });

		const again = await runtime.rpcHandlers['repo.buildDefaults.migrate']!({}) as { counts: Record<string, number> };
		assert.equal(again.counts['already-set'], 1, 'a second call changes nothing');
	} finally {
		await closeGraphStore();
		if (previous === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = previous;
		rmSync(py, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true });
	}
});
