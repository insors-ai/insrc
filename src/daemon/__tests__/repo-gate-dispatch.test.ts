/**
 * Story 64703b708590bd68/s1, task t5: every file-modifying method of the table is behind the repo gate in the handler tables
 * buildHandlerRuntime builds. Real store in a temporary home; the daemon's own cwd and INSRC_REPO are a registered repository.
 * Run: npx tsx --test-force-exit src/daemon/__tests__/repo-gate-dispatch.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-gate-dispatch-home-'));
process.env['HOME'] = HOME;

const { closeGraphStore, declareLiveStoreOwner } = await import('../../db/graph/store.js');
const { closeLanceConn } = await import('../../db/lance/conn.js');
const { getDb } = await import('../../db/client.js');
const { addRepo } = await import('../../db/repos.js');
const { buildHandlerRuntime } = await import('../handler-runtime.js');
const { RPC_AUDIT } = await import('../repo-call-audit.js');
const { lifecycleFor } = await import('../lifecycle-registry.js');
const { artifact: makeArtifact, H } = await import('../../workflow/artifact-core/__tests__/store-kit.js');
await import('../../workflow/__tests__/helpers/converted-repos.js');

const repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-gate-dispatch-repo-')));
const listing = (dir: string): string[] => readdirSync(dir, { recursive: true }).map(String).sort().map(f => `${f}:${(() => { try { return readFileSync(join(dir, f)).toString('utf8').length; } catch { return -1; } })()}`);
let runtime: ReturnType<typeof buildHandlerRuntime>;

before(async () => {
	declareLiveStoreOwner();
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(join(repo, '.insrc', 'artifacts', 'keep.json'), '{}');
	const db = await getDb();
	await addRepo(db, { path: repo, name: 'gate-dispatch', addedAt: '2026-11-01T00:00:00.000Z', status: 'ready' });
	runtime = buildHandlerRuntime({
		db, configStore: {} as never, queue: { enqueue: () => {}, codeIndexWorkFor: () => ({ inFlight: false, pending: 0 }) } as never, indexer: {} as never,
		startedAt: Date.now(), shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
	});
});
after(async () => {
	await closeGraphStore(); await closeLanceConn();
	rmSync(HOME, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true });
});

test('repo-gate-dispatch.test.ts: each method in the table called with no repo is refused and leaves the file system unchanged', async () => {
	const savedEnv = process.env['INSRC_REPO']; const savedCwd = process.cwd();
	const before = listing(repo);
	const rpc = Object.keys(RPC_AUDIT).filter(m => RPC_AUDIT[m]!.kind === 'modifying');
	assert.ok(rpc.length >= 20, 'the table has the modifying RPC methods');
	const seen: string[] = [];
	try {
		process.env['INSRC_REPO'] = repo; process.chdir(repo);
		for (const method of rpc) {
			const rpcHandler = runtime.rpcHandlers[method] as ((p: unknown) => Promise<unknown>) | undefined;
			const streamHandler = runtime.streamHandlers[method] as ((p: unknown, send: () => void, signal: AbortSignal) => Promise<unknown>) | undefined;
			assert.ok(rpcHandler !== undefined || streamHandler !== undefined, `${method} is registered`);
			if (rpcHandler !== undefined) {
				for (const params of [{}, undefined, { artifactPath: '.insrc/artifacts/keep.json', epicHash: 'deadbeefdeadbeef', repoPath: '', repo: '' }]) {
					const reply = await rpcHandler(params) as { error?: string; code?: string };
					assert.equal(reply?.code, 'repo-missing', `${method} with ${JSON.stringify(params)}: ${JSON.stringify(reply)}`);
					assert.match(reply.error ?? '', new RegExp(method.replace(/\./g, '\\.')));
				}
			} else {
				await assert.rejects(streamHandler!({}, () => {}, new AbortController().signal), /repo-missing/, method);
			}
			seen.push(method);
		}
	} finally {
		process.chdir(savedCwd);
		if (savedEnv === undefined) delete process.env['INSRC_REPO']; else process.env['INSRC_REPO'] = savedEnv;
	}
	assert.deepEqual(seen, rpc, 'every modifying method was called');
	assert.deepEqual(listing(repo), before, 'nothing was written');
});

test('repo-gate-dispatch.test.ts: artifact.feedback.append through the gated handler tables stores the entry when the call names the repo and a relative artifactPath, and refuses it without the repo', async () => {
	const PLAN = `PLAN-${H}-s1`;
	const { store } = lifecycleFor(repo);
	await store.write(makeArtifact(`DEF-${H}`), { id: 'github:alice', kind: 'person', properties: {} });
	await store.write(makeArtifact(PLAN), { id: 'github:alice', kind: 'person', properties: {} });
	const append = runtime.rpcHandlers['artifact.feedback.append'] as (p: unknown) => Promise<{ entryId?: string; total?: number; error?: string; code?: string }>;
	const entry = { author: 'Bob', comment: 'tighten this', target: { file: `${PLAN}.json` }, kind: 'feedback' };
	const refused = await append({ artifactPath: `.insrc/artifacts/${PLAN}.json`, ...entry });
	assert.equal(refused.code, 'repo-missing');
	const stored = await append({ repo, artifactPath: `.insrc/artifacts/${PLAN}.json`, ...entry });
	assert.equal(stored.error, undefined, JSON.stringify(stored));
	assert.equal(stored.total, 1);
	assert.equal((await lifecycleFor(repo).feedback.entries(PLAN)).length, 1, 'the entry is in the named repository\'s store');
});
