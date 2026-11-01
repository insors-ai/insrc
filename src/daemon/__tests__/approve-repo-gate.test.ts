/**
 * Story 64703b708590bd68/s1, task t4: the approval family goes through the repo gate. The handlers are the ones buildHandlerRuntime
 * builds, over a real store in a temporary home; two repositories are registered, one of them is the daemon's own cwd and INSRC_REPO.
 * Run: npx tsx --test-force-exit src/daemon/__tests__/approve-repo-gate.test.ts
 */

import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-approve-gate-home-'));
process.env['HOME'] = HOME;

const { closeGraphStore, declareLiveStoreOwner } = await import('../../db/graph/store.js');
const { closeLanceConn } = await import('../../db/lance/conn.js');
const { getDb } = await import('../../db/client.js');
const { addRepo } = await import('../../db/repos.js');
const { buildHandlerRuntime } = await import('../handler-runtime.js');
const { lifecycleFor, resetLifecycleRegistry } = await import('../lifecycle-registry.js');
const { artifact: makeArtifact, H } = await import('../../workflow/artifact-core/__tests__/store-kit.js');
await import('../../workflow/__tests__/helpers/converted-repos.js');

const PLAN = `PLAN-${H}-s1`;
const alice = { id: 'github:alice', kind: 'person' as const, properties: {} };
const dirs: string[] = [];
const mk = (p: string): string => { const d = realpathSync(mkdtempSync(join(tmpdir(), p))); dirs.push(d); return d; };

let daemonRepo: string;   // registered; the daemon's cwd and INSRC_REPO point here
let otherRepo: string;    // registered; the call names this one
let handlers: Record<string, (params: unknown) => Promise<unknown>>;

async function seed(repo: string): Promise<void> {
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const { store } = lifecycleFor(repo);
	await store.write(makeArtifact(`DEF-${H}`), alice);
	await store.write(makeArtifact(PLAN), alice);
}
/** Every file under a repository's artifact folder with its content, to show a call changed nothing. */
const snapshot = (repo: string): Record<string, string> => {
	const dir = join(repo, '.insrc', 'artifacts');
	return Object.fromEntries(readdirSync(dir, { recursive: true }).map(String).sort().map(f => [f, readFileSync(join(dir, f)).toString('utf8')]));
};

before(async () => {
	declareLiveStoreOwner();
	daemonRepo = mk('insrc-approve-gate-daemon-');
	otherRepo = mk('insrc-approve-gate-other-');
	const db = await getDb();
	for (const path of [daemonRepo, otherRepo]) await addRepo(db, { path, name: path, addedAt: '2026-11-01T00:00:00.000Z', status: 'ready' });
	await seed(daemonRepo); await seed(otherRepo);
	const runtime = buildHandlerRuntime({
		db, configStore: {} as never, queue: { enqueue: () => {}, codeIndexWorkFor: () => ({ inFlight: false, pending: 0 }) } as never, indexer: {} as never,
		startedAt: Date.now(), shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
	});
	handlers = runtime.rpcHandlers as never;
});
afterEach(() => { resetLifecycleRegistry(); });
after(async () => {
	await closeGraphStore(); await closeLanceConn();
	rmSync(HOME, { recursive: true, force: true });
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

test('approve-repo-gate.test.ts: a daemon started with INSRC_REPO set and its working directory inside a registered repo refuses workflow.approve with a relative artifactPath and no repo and writes nothing in either repository', async () => {
	const savedEnv = process.env['INSRC_REPO']; const savedCwd = process.cwd();
	const before = [snapshot(daemonRepo), snapshot(otherRepo)];
	try {
		process.env['INSRC_REPO'] = daemonRepo; process.chdir(daemonRepo);
		for (const method of ['workflow.approve', 'workflow.approvePipeline']) {
			const reply = await handlers[method]!({ artifactPath: `.insrc/artifacts/${PLAN}.json` }) as { error?: string; code?: string };
			assert.equal(reply.code, 'repo-missing', method);
			assert.match(reply.error ?? '', /does not fall back to INSRC_REPO/, method);
		}
		// a relative repo, an unregistered one and a path that leaves the named repo are refused too
		for (const [params, code] of [
			[{ repo: '.', artifactPath: `.insrc/artifacts/${PLAN}.json` }, 'repo-not-absolute'],
			[{ repo: tmpdir(), artifactPath: 'x.json' }, 'repo-not-registered'],
			[{ repo: otherRepo, artifactPath: join(daemonRepo, '.insrc', 'artifacts', `${PLAN}.json`) }, 'path-outside-repo'],
		] as const) {
			assert.equal(((await handlers['workflow.approve']!(params)) as { code?: string }).code, code, JSON.stringify(params));
		}
	} finally {
		process.chdir(savedCwd);
		if (savedEnv === undefined) delete process.env['INSRC_REPO']; else process.env['INSRC_REPO'] = savedEnv;
	}
	assert.deepEqual([snapshot(daemonRepo), snapshot(otherRepo)], before, 'nothing was written in either repository');
	assert.equal((await lifecycleFor(daemonRepo).store.read(PLAN)).lifecycle.status, 'draft');
	assert.equal((await lifecycleFor(otherRepo).store.read(PLAN)).lifecycle.status, 'draft');
});

test("approve-repo-gate.test.ts: workflow.approve with an absolute registered repo and a relative path approves the artifact in that repo's store only", async () => {
	const savedCwd = process.cwd();
	try {
		process.chdir(daemonRepo);   // the daemon's cwd is the other registered repository
		const reply = await handlers['workflow.approve']!({ repo: otherRepo, artifactPath: `.insrc/artifacts/${PLAN}.json` }) as { approved?: unknown[]; skipped?: unknown[]; error?: string };
		assert.equal(reply.error, undefined, JSON.stringify(reply));
		assert.equal(reply.approved?.length, 1, JSON.stringify(reply.skipped));
	} finally { process.chdir(savedCwd); }
	assert.equal((await lifecycleFor(otherRepo).store.read(PLAN)).lifecycle.status, 'approved', 'the named repository approved it');
	assert.equal((await lifecycleFor(daemonRepo).store.read(PLAN)).lifecycle.status, 'draft', 'the daemon\'s own cwd repository was not touched');
});
