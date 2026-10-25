import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { databaseFixture } from './fixtures/docker-database.js';
import { getFactory } from '../registry.js';
import type { DraftProbe } from '../draft-probe.js';
import type { Driver } from '../../../shared/db-driver.js';
import { parseProbeWorkerResult } from '../draft-probe.js';
import '../drivers/clickhouse.js';

test('CM-S2-A4: ClickHouse actual service authenticates SELECT1 and rejects invalid or unavailable connections', async () => {
	const fixture = databaseFixture('clickhouse/clickhouse-server:25.8-alpine', 8123, [], {
		CLICKHOUSE_USER: 'fixture',
		CLICKHOUSE_PASSWORD: 'FixturePassword123',
	}, '2g');
	const config = { id: 'fixture', kind: 'clickhouse', url: `http://fixture:FixturePassword123@127.0.0.1:${fixture.port}/default` };
	const create = async (url: string) => await getFactory('clickhouse')!({ ...config, url }) as Driver & DraftProbe;
	const root = await mkdtemp(join(tmpdir(), 'cm-clickhouse-worker-'));
	const workerProbe = async (url: string, expected: 'reachable' | 'failed') => {
		for (const compiled of [false, true]) {
			const requestId = randomUUID(), nonce = randomBytes(32).toString('hex'), messages: unknown[] = [];
			const child = fork(resolve(compiled ? 'out/bin/insrc-connection-test.js' : 'src/bin/insrc-connection-test.ts'), [], {
				execArgv: [...(compiled ? [] : ['--import', 'tsx']), '--no-warnings'],
				env: { HOME: root, TMPDIR: root, TSX_DISABLE_CACHE: '1' },
				stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
			});
			let output = '';
			child.stdout!.on('data', chunk => { output += chunk; });
			child.stderr!.on('data', chunk => { output += chunk; });
			child.on('message', message => messages.push(message));
			const closed = new Promise<number | null>((resolveClose, reject) => {
				child.once('error', reject);
				child.once('close', resolveClose);
			});
			const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
			try {
				child.send({ type: 'start', requestId, nonce, lookupRoot: root, config: { ...config, url } });
				assert.equal(await closed, 0);
				assert.equal(messages.length, 1);
				assert.equal(parseProbeWorkerResult(messages[0], { requestId, nonce }).code, expected);
				assert.equal(output, '', 'SDK errors must not bypass the quiet worker logger');
				assert.deepEqual(await readdir(root), []);
			} finally {
				clearTimeout(timer);
				if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
			}
		}
	};
	try {
		let ready = false;
		let last: unknown;
		for (const deadline = Date.now() + 90_000; Date.now() < deadline;) {
			const driver = await create(config.url);
			try {
				assert.equal(await driver.probeReachability(), undefined);
				ready = true;
				break;
			} catch (error) {
				last = error;
			} finally {
				await driver.close();
			}
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		assert.equal(ready, true, String(last));
		await workerProbe(config.url, 'reachable');
		const denied = await create(config.url.replace('FixturePassword123', 'IncorrectPassword'));
		try {
			await assert.rejects(denied.probeReachability());
		} finally {
			await denied.close();
		}
		await workerProbe(config.url.replace('FixturePassword123', 'IncorrectPassword'), 'failed');
		fixture.close();
		const unavailable = await create(config.url);
		try {
			await assert.rejects(unavailable.probeReachability());
		} finally {
			await unavailable.close();
		}
		await workerProbe(config.url, 'failed');
	} finally {
		fixture.close();
		await rm(root, { recursive: true, force: true });
	}
});
