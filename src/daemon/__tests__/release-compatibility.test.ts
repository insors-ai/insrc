/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { closeGraphStore, getGraphStore, SCHEMA_VERSION, setGraphStorePath } from '../../db/graph/store.js';
import { rpc } from '../../shared/ipc-client.js';
import type { DaemonStatus } from '../../shared/types.js';
import { COMPATIBILITY_RECEIPT, COMPATIBILITY_STEP, readReleaseCompatibility, requireQualifiedReleasePair, verifyQuiescedReleaseStores } from '../release-compatibility.js';

const formats = { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' };
const prior = readReleaseCompatibility({
	version: 1, releaseId: 'prior', graphSchema: SCHEMA_VERSION, formats, startup: 'rollback-compatible',
});
const candidate = { ...prior, releaseId: 'candidate' };
const pair = { prior, candidate };

test('Compatibility declaration and read-only quiesced check refuse unknown or migration-bearing pairs', async t => {
	assert.throws(() => readReleaseCompatibility({ ...candidate, version: 2 }), /unknown/);
	assert.throws(() => readReleaseCompatibility({ ...candidate, startup: 'migration-required' }), /migration-bearing/);
	assert.throws(() => readReleaseCompatibility({ ...candidate, formats: { lance: '1' } }), /missing.*format/);
	assert.throws(() => requireQualifiedReleasePair(prior, candidate, []), /not qualified/);
	assert.throws(() => requireQualifiedReleasePair(prior, { ...candidate, formats: { ...formats, config: '2' } }, [pair]), /writable format/);

	const root = await mkdtemp(join(tmpdir(), 'insrc-compat-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const leftover = join(root, 'graph.lmdb.compact');
	await writeFile(leftover, 'pending recovery');
	await assert.rejects(verifyQuiescedReleaseStores(root, requireQualifiedReleasePair(prior, candidate, [pair])), /compaction recovery/);
	assert.equal(await readFile(leftover, 'utf8'), 'pending recovery');
});

test('Inject upgrade with a newer graph schema and verify the old daemon can still open the unchanged store', async t => {
	const root = await mkdtemp(join(tmpdir(), 'insrc-compat-'));
	const graph = join(root, 'graph.lmdb');
	setGraphStorePath(graph);
	t.after(async () => { await closeGraphStore(); await rm(root, { recursive: true, force: true }); });
	await mkdir(join(root, 'lance'));
	const initial = await getGraphStore();
	await initial.meta.put('rollback-probe', 'prior state');
	await closeGraphStore();
	const before = await readFile(graph);

	const qualified = requireQualifiedReleasePair(prior, candidate, [pair]);
	await verifyQuiescedReleaseStores(root, qualified);
	const newer = { ...candidate, graphSchema: SCHEMA_VERSION + 1 };
	assert.throws(() => requireQualifiedReleasePair(prior, newer, [{ prior, candidate: newer }]), /writable format/);
	await assert.rejects(verifyQuiescedReleaseStores(root, { prior, candidate: newer }), /graph schema/);
	assert.deepEqual(await readFile(graph), before);
	const reopened = await getGraphStore();
	assert.equal(reopened.meta.get('schema_version'), SCHEMA_VERSION);
	assert.equal(reopened.meta.get('rollback-probe'), 'prior state');
});

test('Candidate stays read-only and serves the prior commit until matching durable success', { timeout: 15_000 }, async t => {
	if (process.platform !== 'darwin') return t.skip('managed probation is macOS-only');
	const home = await realpath(await mkdtemp('/tmp/insrc-prob-'));
	const root = join(home, '.insrc');
	const graph = join(root, 'graph.lmdb');
	const journalDir = join(root, 'managed-lifecycle');
	const journal = join(journalDir, 'journal.json');
	t.after(async () => { await closeGraphStore(); await rm(home, { recursive: true, force: true }); });
	await mkdir(journalDir, { recursive: true, mode: 0o700 });
	await mkdir(join(root, 'lance'));
	setGraphStorePath(graph);
	await getGraphStore();
	await closeGraphStore();
	const before = await readFile(graph);
	const active = {
		id: 'update', kind: 'update',
		owner: { pid: process.pid, uid: process.getuid!(), startedAt: 'test', executable: process.execPath },
		predecessor: { priorRelease: 'prior', candidateRelease: 'candidate', priorCommit: 'old-head', wasRunning: true },
		entries: [{ step: COMPATIBILITY_STEP, intent: JSON.stringify(pair), receipt: COMPATIBILITY_RECEIPT }],
	};
	const publish = async (outcome: { id: string; decision: string; detail: string } | null) => {
		await writeFile(journal + '.tmp', JSON.stringify({ version: 1, root, active, outcome }), { mode: 0o600 });
		await rename(journal + '.tmp', journal);
	};
	await publish(null);
	const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', `
import { declareLiveStoreOwner } from './src/db/graph/store.ts';
import { startManagedDaemonProbation } from './src/daemon/managed-daemon-probation.ts';
import { daemonRunFiles } from './src/daemon/run-file-ownership.ts';
import { directDispatch } from './src/daemon/server.ts';
declareLiveStoreOwner();
const lease = daemonRunFiles.lease();
const probation = await startManagedDaemonProbation({ assertProbationActive() {} });
lease.release();
process.send('probation');
await probation.waitForCommit();
probation.activate(directDispatch({ 'repo.list': async () => [] }));
process.send('committed');
`], {
		env: { ...process.env, HOME: home, INSRC_PROBATION_UPDATE: active.id, INSRC_PROBATION_RELEASE: candidate.releaseId },
		stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
	});
	t.after(async () => {
		if (child.exitCode === null && child.signalCode === null) {
			const exited = once(child, 'exit');
			child.kill();
			await exited;
		}
	});
	const nextMessage = async () => Promise.race([
		once(child, 'message').then(([message]) => message),
		once(child, 'exit').then(([code, signal]) => { throw new Error(`candidate exited (${code ?? signal})`); }),
	]);
	assert.equal(await nextMessage(), 'probation');
	const call = <T = unknown>(method: string) => rpc<T>(method, {}, () => createConnection(join(root, 'daemon.sock')), { timeoutMs: 2_000 });
	assert.equal((await call<DaemonStatus>('daemon.status')).installedCommit, 'old-head');
	await assert.rejects(call('repo.list'), /unknown method/);
	await publish({ id: 'unrelated', decision: 'committed', detail: 'other update' });
	await new Promise(resolve => setTimeout(resolve, 200));
	await assert.rejects(call('repo.list'), /unknown method/);
	assert.deepEqual(await readFile(graph), before);
	const committed = nextMessage();
	await publish({ id: active.id, decision: 'committed', detail: 'matching update' });
	assert.equal(await committed, 'committed');
	assert.deepEqual(await call('repo.list'), []);
});
