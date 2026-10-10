/**
 * The plan tree's branch for a request started with a stated kind of
 * source (a "hinted" request). No classifier runs on it, so it builds
 * the intent itself -- and now validates it.
 *
 * The run-level tests use a sandboxed graph store, so nothing here
 * reaches a model: a hinted request that passes classification stops
 * at the context builder's indexed check.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LoadedConnections } from '../../../daemon/db/config.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import type { Entity, RegisteredRepo } from '../../../shared/types.js';
import { connectionCheckFor } from '../../classifier/driver.js';
import { ScopeRefUnresolvedError } from '../../context/invariants.js';
import { connectionIsRegistered, type ScopeDeps } from '../../context/scope.js';
import { hintedIntentBase, runAnalyze } from '../driver.js';
import { purgeRunForTests, readRunRecord } from '../persistence.js';
import type { AnalyzeRunEvent } from '../types.js';

let sandbox: string;
let dirPath: string;
let filePath: string;
const REGISTERED = '/registered/elsewhere';

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'analyze-hinted-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	dirPath = join(sandbox, 'proj');
	filePath = join(dirPath, 'a.ts');
	mkdirSync(dirPath, { recursive: true });
	writeFileSync(filePath, 'export const a = 1;\n', 'utf8');
	// One registered, indexed repo that does NOT contain the sandbox: the
	// registry is not pristine, so the code source's indexed check is live.
	await addRepo(null, { path: REGISTERED, name: REGISTERED, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	await upsertEntities(null, [{
		id: 'e-fixture', repo: REGISTERED, file: `${REGISTERED}/index.ts`, kind: 'function', name: 'fn',
		language: 'typescript', startLine: 1, endLine: 3,
	} as unknown as Entity]);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

const never = async (): Promise<boolean> => { throw new Error('the connection check must not be called'); };

function runId(tag: string): string {
	return `hinted-${tag}-${Math.floor(Math.random() * 1e9).toString(16)}`;
}

// ---------------------------------------------------------------------------
// The intent a hinted request gets
// ---------------------------------------------------------------------------

test('hinted request: focused with the prompt as focus, unfocused with an empty prompt', async () => {
	const withPrompt = await hintedIntentBase('code', '  how does settlement work  ', { kind: 'repo', value: dirPath }, never);
	assert.deepEqual(withPrompt, {
		ok: true,
		base: { target: 'code', focused: true, focus: 'how does settlement work', scopeRef: { kind: 'repo', value: dirPath } },
	});

	for (const empty of ['', '   ', '\n\t']) {
		const without = await hintedIntentBase('code', empty, { kind: 'repo', value: dirPath }, never);
		assert.deepEqual(without, {
			ok: true,
			base: { target: 'code', focused: false, scopeRef: { kind: 'repo', value: dirPath } },
		});
		assert.ok(without.ok && !('focus' in without.base), 'no focus key at all');
	}
});

test('hinted request: the validator\'s two checks are made, with the connection check it was given', async () => {
	// pairing
	const mismatch = await hintedIntentBase('code', 'q', { kind: 'connection', value: 'ledger-db' }, never);
	assert.deepEqual(mismatch.ok, false);
	assert.ok(!mismatch.ok && mismatch.failure.code === 'scope-ref-kind-target-mismatch');
	// resolution: a path that does not exist
	const missing = await hintedIntentBase('code', 'q', { kind: 'repo', value: join(sandbox, 'nope') }, never);
	assert.ok(!missing.ok && missing.failure.code === 'scope-ref-unresolved');
	// resolution: a connection, through the check
	const asked: string[] = [];
	const registered = await hintedIntentBase('data', 'q', { kind: 'connection', value: 'ledger-db' },
		async (id) => { asked.push(id); return true; });
	assert.equal(registered.ok, true);
	const unregistered = await hintedIntentBase('data', 'q', { kind: 'connection', value: 'ghost-db' },
		async (id) => { asked.push(id); return false; });
	assert.ok(!unregistered.ok && unregistered.failure.code === 'scope-ref-unresolved');
	assert.match(!unregistered.ok ? unregistered.failure.message : '', /'ghost-db' is not registered/);
	assert.deepEqual(asked, ['ledger-db', 'ghost-db']);
});

// ---------------------------------------------------------------------------
// Through runAnalyze
// ---------------------------------------------------------------------------

async function run(id: string, args: Omit<Parameters<typeof runAnalyze>[0], 'runId'>) {
	const events: AnalyzeRunEvent[] = [];
	const result = await runAnalyze({ runId: id, ...args }, { onEvent: e => events.push(e) });
	return { result, events, record: readRunRecord(id) };
}

test("hinted pairing the table refuses fails at 'classify' with a failed run record", async () => {
	const id = runId('pairing');
	try {
		const { result, events, record } = await run(id, {
			userPrompt: 'what does this do', scopeRef: { kind: 'connection', value: 'ledger-db' },
			targetHint: 'code', scopeHint: 'M',
		});
		assert.equal(result.ok, false);
		if (result.ok) return;
		assert.equal(result.stage, 'classify');
		assert.equal(result.error.code, 'scope-ref-kind-target-mismatch');
		assert.match(result.error.message, /scopeRef\.kind='connection' is incompatible with target='code'/);
		// The run record says failed, at classify, with that code -- not left in progress.
		assert.equal(record?.status, 'failed');
		assert.equal(record?.stage, 'classify');
		assert.equal(record?.error?.code, 'scope-ref-kind-target-mismatch');
		// It never reached the plan stage.
		assert.ok(!events.some(e => e.type === 'stage-started' && e.stage === 'plan'));
		assert.equal(events.filter(e => e.type === 'done').length, 1);
	} finally {
		purgeRunForTests(id);
	}
});

test("hinted request with a scope that does not resolve fails with 'scope-ref-unresolved'", async () => {
	const id = runId('unresolved');
	try {
		const { result, record } = await run(id, {
			userPrompt: 'map it', scopeRef: { kind: 'repo', value: join(sandbox, 'does-not-exist') },
			targetHint: 'code', scopeHint: 'M',
		});
		assert.equal(result.ok, false);
		if (result.ok) return;
		assert.equal(result.stage, 'classify');
		assert.equal(result.error.code, 'scope-ref-unresolved');
		assert.equal(record?.status, 'failed');
		assert.equal(record?.error?.code, 'scope-ref-unresolved');
	} finally {
		purgeRunForTests(id);
	}
});

test('hinted request with a valid pairing reaches the context builder and the planner', async () => {
	// A valid pairing passes the classify stage with the prompt as its
	// focus and goes on to the plan stage, whose first step is the
	// context builder. The sandbox directory is in no registered repo,
	// so the context builder stops at its indexed check -- before any
	// model call. Reaching THAT failure, at stage 'plan', is the proof
	// the request got past classification and into the context builder.
	// (The planner itself is a model call; it is covered by the live checks.)
	const id = runId('valid');
	try {
		const { result, events, record } = await run(id, {
			userPrompt: 'how is this laid out', scopeRef: { kind: 'repo', value: dirPath },
			targetHint: 'code', scopeHint: 'M',
		});
		const classified = events.find(e => e.type === 'classified');
		assert.ok(classified !== undefined && classified.type === 'classified', 'the classify stage completed');
		if (classified.type !== 'classified') return;
		assert.equal(classified.intent.target, 'code');
		assert.equal(classified.intent.focused, true);
		assert.equal(classified.intent.focus, 'how is this laid out');
		// The size is measured, not taken from the request. The scope here is in no registered repo, so it cannot
		// be counted: the size is the largest, and the stated size is kept as the measure's hint.
		assert.equal(classified.intent.scope, 'XL');
		assert.deepEqual([classified.measure?.determined, classified.measure?.size, classified.measure?.sizeHint], [false, 'XL', 'M']);
		assert.deepEqual(classified.intent.scopeRef, { kind: 'repo', value: dirPath });
		assert.ok(events.some(e => e.type === 'stage-started' && e.stage === 'plan'), 'the plan stage started');

		assert.equal(result.ok, false);
		if (result.ok) return;
		assert.equal(result.stage, 'plan');
		assert.equal(result.error.code, 'scope-not-indexed');
		assert.equal(record?.intent?.focus, 'how is this laid out');
	} finally {
		purgeRunForTests(id);
	}
});

test('hinted request: a connection check that throws fails the run at classify with a code, not an unhandled rejection', async () => {
	// The real check throws when a repo's connections file cannot be read.
	const unreadable = async (): Promise<boolean> => {
		throw new ScopeRefUnresolvedError("Connection 'ledger-db' could not be checked: the connections file of repo '/a' could not be read (invalid JSON).");
	};
	const viaTyped = await hintedIntentBase('data', 'q', { kind: 'connection', value: 'ledger-db' }, unreadable);
	assert.ok(!viaTyped.ok);
	if (viaTyped.ok) return;
	assert.equal(viaTyped.failure.code, 'scope-ref-unresolved');
	assert.match(viaTyped.failure.message, /could not be read \(invalid JSON\)/);

	// Any other error from the check still becomes a failure with a code.
	const viaPlain = await hintedIntentBase('data', 'q', { kind: 'connection', value: 'ledger-db' },
		async () => { throw new Error('graph store not initialised'); });
	assert.ok(!viaPlain.ok);
	if (viaPlain.ok) return;
	assert.equal(viaPlain.failure.code, 'internal-error');
	assert.match(viaPlain.failure.message, /graph store not initialised/);
});

// ---------------------------------------------------------------------------
// The connection check
// ---------------------------------------------------------------------------

test('the classifier receives a connection check from each caller', async () => {
	// Neither caller of the classifier (the plan tree, the daemon's
	// classify request) passes a check; the classifier supplies the real
	// one, so the validator's connection check runs for both. It used to
	// be skipped whenever none was passed -- which was always.
	assert.equal(connectionCheckFor({}), connectionIsRegistered);
	assert.equal(connectionCheckFor({ connectionExists: undefined as never }), connectionIsRegistered);
	const own = async (): Promise<boolean> => true;
	assert.equal(connectionCheckFor({ connectionExists: own }), own);
});

test('connectionIsRegistered: declared by a registered repo or not; an unreadable file is reported', async () => {
	const conns = (ids: string[]): LoadedConnections =>
		({ file: { connections: [] }, resolved: ids.map(id => ({ id, kind: 'sqlite' })), warnings: [] } as unknown as LoadedConnections);
	const deps = (byRepo: Record<string, string[] | Error>): ScopeDeps => ({
		listRepos:           async () => Object.keys(byRepo).map(path => ({ path, status: 'ready' } as unknown as RegisteredRepo)),
		findEntitiesByFile:  async () => [],
		listEntitiesForRepo: async () => [],
		loadConnections:     async (repo) => { const v = byRepo[repo]!; if (v instanceof Error) throw v; return conns(v); },
	});
	assert.equal(await connectionIsRegistered('ledger-db', deps({ '/a': ['cache'], '/b': ['ledger-db'] })), true);
	assert.equal(await connectionIsRegistered('ledger-db', deps({ '/a': ['cache'], '/b': [] })), false);
	assert.equal(await connectionIsRegistered('ledger-db', deps({})), false);
	await assert.rejects(
		() => connectionIsRegistered('ledger-db', deps({ '/a': new Error('invalid JSON'), '/b': ['ledger-db'] })),
		/connections file of repo '\/a' could not be read \(invalid JSON\)/,
	);

	// Against the real (sandboxed) registry: a registered repo with no connections file.
	assert.equal(await connectionIsRegistered('ghost-db'), false);
});
