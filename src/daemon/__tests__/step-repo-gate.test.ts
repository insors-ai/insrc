/**
 * Story 64703b708590bd68/s1, task t6: the step host puts the repo gate in front of the modifying phases of the workflow and build steps.
 * The handler is the step.call stream handler buildHandlerRuntime builds; the daemon's own cwd and INSRC_REPO are a registered repository.
 * Run: npx tsx --test-force-exit src/daemon/__tests__/step-repo-gate.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-step-gate-home-'));
process.env['HOME'] = HOME;

const { closeGraphStore, declareLiveStoreOwner } = await import('../../db/graph/store.js');
const { closeLanceConn } = await import('../../db/lance/conn.js');
const { getDb } = await import('../../db/client.js');
const { addRepo } = await import('../../db/repos.js');
const { buildHandlerRuntime } = await import('../handler-runtime.js');
const { encodeState, STATE_VERSION } = await import('../steps/workflow-step/state.js');
await import('../../workflow/__tests__/helpers/converted-repos.js');

const dirs: string[] = [];
const mk = (p: string): string => { const d = realpathSync(mkdtempSync(join(tmpdir(), p))); dirs.push(d); return d; };
const listing = (dir: string): string[] => readdirSync(dir, { recursive: true }).map(String).sort().map(f => { try { return `${f}:${readFileSync(join(dir, f)).length}`; } catch { return `${f}:dir`; } });

let repoA: string; let repoB: string;
let stepCall: (params: unknown, send: (m: { stream: string; data?: unknown }) => void, signal: AbortSignal) => Promise<void>;

/** Run one step.call and return the 'done' envelope (parsed) or the 'error' frame. */
async function call(tool: string, args: unknown): Promise<{ next?: string; error?: { code: string; name: string; message: string } } & Record<string, unknown>> {
	let out: unknown;
	await stepCall({ tool, args, context: { cwd: repoA, envRepo: repoA } }, m => {
		if (m.stream === 'done') out = JSON.parse((m.data as { content: Array<{ text: string }> }).content[0]!.text);
		if (m.stream === 'error') out = { next: 'error', error: m.data };
	}, new AbortController().signal);
	return out as never;
}

before(async () => {
	declareLiveStoreOwner();
	repoA = mk('insrc-step-gate-a-'); repoB = mk('insrc-step-gate-b-');
	for (const r of [repoA, repoB]) { mkdirSync(join(r, '.insrc', 'artifacts'), { recursive: true }); writeFileSync(join(r, '.insrc', 'artifacts', 'keep.json'), '{}'); }
	const db = await getDb();
	for (const path of [repoA, repoB]) await addRepo(db, { path, name: path, addedAt: '2026-11-01T00:00:00.000Z', status: 'ready' });
	const runtime = buildHandlerRuntime({
		db, configStore: {} as never, queue: { enqueue: () => {}, codeIndexWorkFor: () => ({ inFlight: false, pending: 0 }) } as never, indexer: {} as never,
		startedAt: Date.now(), shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
	});
	stepCall = runtime.streamHandlers['step.call'] as never;
});
after(async () => {
	await closeGraphStore(); await closeLanceConn();
	rmSync(HOME, { recursive: true, force: true });
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

test('step-repo-gate.test.ts: a modifying step phase with no repo and no token is refused, and a later phase cannot be redirected to another repository by a different repo', async () => {
	const savedEnv = process.env['INSRC_REPO']; const savedCwd = process.cwd();
	const before = [listing(repoA), listing(repoB)];
	try {
		process.env['INSRC_REPO'] = repoA; process.chdir(repoA);
		// the first phase of a run, and the build phases, with the daemon's cwd and INSRC_REPO a registered repository: refused all the same
		for (const [tool, args] of [
			['insrc_workflow_step', { phase: 'start', workflow: 'plan', focus: 'x', params: {} }],
			['insrc_workflow_step', { phase: 'resolve_question', workflow: 'plan', questionId: 'q1' }],
			['insrc_workflow_step', { phase: 'park', epicHash: '0123456789abcdef' }],
			['insrc_build_step', { phase: 'implement', target: 's1/t1' }],
			['insrc_build_step', { phase: 'validate', target: 's1/t1' }],
		] as const) {
			const reply = await call(tool, args);
			assert.equal(reply.error?.name, 'RepoGateError', `${tool} ${JSON.stringify(args)}: ${JSON.stringify(reply)}`);
			assert.match(reply.error?.message ?? '', /repo-missing|\\?`repo`/ );
		}
		// a later phase carrying only a token that records no repo is refused too
		const emptyToken = await encodeState({ version: STATE_VERSION, runId: 'r0', epicKey: 'k', startedAtMs: 1, intent: { workflow: 'plan', focus: 'x', repoPath: '', repoIndexedAt: null, params: {} } as never, stage: 'awaiting_plan' });
		assert.equal((await call('insrc_workflow_step', { phase: 'plan', state: emptyToken, plan: { workflow: 'plan', steps: [] } })).error?.name, 'RepoGateError');
		// a run started on repoA cannot be continued against repoB
		const token = await encodeState({ version: STATE_VERSION, runId: 'r1', epicKey: 'k', startedAtMs: 1, intent: { workflow: 'plan', focus: 'x', repoPath: repoA, repoIndexedAt: null, params: {} } as never, stage: 'awaiting_plan' });
		const redirected = await call('insrc_workflow_step', { phase: 'plan', state: token, repo: repoB, plan: { workflow: 'plan', steps: [] } });
		assert.equal(redirected.error?.name, 'RepoGateError');
		assert.match(redirected.error?.message ?? '', /not the repository this run started on/);
		// a read-only phase is not gated: it keeps the session-aware resolution (here it reaches the step itself, not the gate)
		const readOnly = await call('insrc_workflow_step', { phase: 'review_deferred', params: { epicHash: '0123456789abcdef' } });
		assert.notEqual(readOnly.error?.name, 'RepoGateError', JSON.stringify(readOnly));
	} finally {
		process.chdir(savedCwd);
		if (savedEnv === undefined) delete process.env['INSRC_REPO']; else process.env['INSRC_REPO'] = savedEnv;
	}
	assert.deepEqual([listing(repoA), listing(repoB)], before, 'nothing was written in either repository');
});
