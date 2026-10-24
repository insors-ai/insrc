import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises, { readFile, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { environment, committed, deferred } from './fixtures/saved-management-fixture.js';
import { TICKET_LIFETIME_MS } from '../management-tickets.js';
test('CM-S1-D: simultaneous identical replay joins one mutation and restart replays the exact durable outcome without effects', async () => {
	const env = await environment();
	const f = await env.rootFixture('root');
	const resume = deferred();
	const started = deferred();
	try {
		const request = await f.request('fixture');
		f.reset();
		f.hooks.stage = async () => {
			started.resolve();
			await resume.promise;
		};
		const first = f.service.mutate(f.context, request);
		await started.promise;
		const joined = f.service.mutate(f.context, structuredClone(request));
		assert.deepEqual(await f.service.status(f.context, request.ticket), { status: 'pending' });
		const mismatch = await f.service.mutate(f.context, { ...request, publicPatch: { ...request.publicPatch, label: 'different' } });
		assert.equal(mismatch.status, 'rejected');
		if (mismatch.status === 'rejected')
			assert.equal(mismatch.code, 'operation-mismatch');
		resume.resolve();
		const a = await first;
		const b = await joined;
		assert.deepEqual(a, b);
		const outcome = committed(a);
		assert.equal(f.counts.stages, 2);
		const bytes = await readFile(f.path, 'utf8');
		const values = [...f.values];
		assert.equal(Object.keys(JSON.parse(bytes)._management.receipts).length, 1);
		f.hooks.stage = undefined;
		await f.restart();
		f.reset();
		assert.deepEqual(await f.service.mutate(f.context, request), a);
		assert.equal(await readFile(f.path, 'utf8'), bytes);
		assert.deepEqual([...f.values], values);
		assert.equal(f.counts.writes, 0);
		assert.equal(f.counts.stages, 0);
		assert.equal(f.counts.sets, 0);
		assert.equal(f.counts.deletes, 0);
		const changed = await f.service.mutate(f.context, { ...request, credentials: { ...request.credentials, 'url.password': { action: 'replace', value: 'changed-secret-canary' } } });
		assert.equal(changed.status, 'rejected');
		if (changed.status === 'rejected')
			assert.equal(changed.code, 'operation-mismatch');
		assert.equal(f.counts.writes, 0);
		assert.equal(f.counts.stages, 0);
		const status = await f.service.status(f.context, request.ticket);
		assert.equal(status.status, 'committed');
		if (status.status === 'committed')
			assert.deepEqual(status.value, outcome);
	}
	finally {
		resume.resolve();
		await env.cleanup();
	}
});
test('CM-S1-D: expired signed tickets reconcile missing or pruned receipts and can never authorize a new replay', async () => {
	const env = await environment();
	const f = await env.rootFixture('root');
	try {
		const request = await f.request('fixture');
		const original = await f.service.mutate(f.context, request);
		committed(original);
		f.clock.value += TICKET_LIFETIME_MS + 1;
		assert.deepEqual(await f.service.mutate(f.context, request), original);
		await f.service.pruneReceipts(f.context);
		assert.equal(Object.keys(JSON.parse(await readFile(f.path, 'utf8'))._management.receipts).length, 0);
		const bytes = await readFile(f.path, 'utf8');
		const keys = [...f.values];
		f.reset();
		const replay = await f.service.mutate(f.context, request);
		assert.equal(replay.status, 'rejected');
		if (replay.status === 'rejected')
			assert.equal(replay.code, 'reconciliation-required');
		assert.deepEqual(await f.service.status(f.context, request.ticket), { status: 'reconciliation-required' });
		assert.equal(await readFile(f.path, 'utf8'), bytes);
		assert.deepEqual([...f.values], keys);
		assert.equal(f.counts.stages, 0);
		assert.equal(f.counts.writes, 0);
		assert.equal(f.counts.sets, 0);
	}
	finally {
		await env.cleanup();
	}
});
test('CM-S1-E: uncertain initial and final receipt rename results reconcile in place without staging another generation', async () => {
	for (const phase of [1, 2]) {
		const env = await environment();
		const f = await env.rootFixture('root');
		try {
			const request = await f.request('fixture');
			let failed = false;
			f.reset();
			f.hooks.writer = async (stage) => {
				if (stage === 'after-rename' && f.counts.writes === phase && !failed) {
					failed = true;
					throw new Error('injected-private-canary');
				}
			};
			const result = await f.service.mutate(f.context, request);
			assert.equal(failed, true);
			if (phase === 1) {
				assert.equal(result.status, 'rejected');
				if (result.status === 'rejected')
					assert.equal(result.code, 'reconciliation-required');
			}
			else
				committed(result);
			const bytes = await readFile(f.path, 'utf8');
			const values = [...f.values];
			const revision = JSON.parse(bytes)._management.revisions.fixture;
			f.hooks.writer = undefined;
			f.reset();
			const status = await f.service.status(f.context, request.ticket);
			assert.equal(status.status, 'committed');
			if (status.status === 'committed')
				assert.equal(status.value.revision, revision);
			assert.equal(await readFile(f.path, 'utf8'), bytes);
			assert.deepEqual([...f.values], values);
			assert.equal(f.counts.writes, 0);
			assert.equal(f.counts.stages, 0);
			assert.equal(f.counts.sets, 0);
			const replay = committed(await f.service.mutate(f.context, request));
			assert.equal(replay.revision, revision);
			assert.equal(f.counts.writes, 0);
			assert.equal(f.counts.stages, 0);
		}
		finally {
			await env.cleanup();
		}
	}
});
test('CM-S1-Q: activation-only retry preserves exact registry revision receipt and credential generation', async () => {
	const env = await environment();
	const f = await env.rootFixture('root');
	try {
		f.hooks.activate = async () => {
			throw new Error('private-source-canary');
		};
		const request = await f.request('fixture');
		const initial = committed(await f.service.mutate(f.context, request));
		assert.equal(initial.activation, 'failed');
		const bytes = await readFile(f.path, 'utf8');
		const keys = [...f.values];
		const document = JSON.parse(bytes);
		f.hooks.activate = undefined;
		f.reset();
		const retried = committed(await f.service.retryActivation(f.context, { key: request.key, committedRevision: initial.revision }));
		assert.equal(retried.activation, 'active');
		assert.equal(retried.revision, initial.revision);
		assert.equal(retried.operationId, initial.operationId);
		assert.equal(await readFile(f.path, 'utf8'), bytes);
		assert.deepEqual(JSON.parse(await readFile(f.path, 'utf8')), document);
		assert.deepEqual([...f.values], keys);
		assert.equal(f.counts.writes, 0);
		assert.equal(f.counts.stages, 0);
		assert.equal(f.counts.sets, 0);
		assert.equal(f.counts.deletes, 0);
		const stale = await f.service.retryActivation(f.context, { key: request.key, committedRevision: 'stale' });
		assert.equal(stale.status, 'rejected');
		if (stale.status === 'rejected')
			assert.equal(stale.code, 'conflict');
		assert.equal(f.counts.writes, 0);
	}
	finally {
		await env.cleanup();
	}
});
test('CM-S1-R: a failed safe-list refresh retries only list without another ticket mutation stage or registry write', async () => {
	const env = await environment();
	const f = await env.rootFixture('root');
	try {
		const request = await f.request('fixture');
		committed(await f.service.mutate(f.context, request));
		const bytes = await readFile(f.path, 'utf8');
		const keys = [...f.values];
		f.reset();
		let tickets = 0, mutations = 0;
		const issue = f.service.ticket.bind(f.service);
		const mutate = f.service.mutate.bind(f.service);
		const ticketSpy = mock.method(f.service, 'ticket', async (...args: Parameters<typeof issue>) => {
			tickets++;
			return issue(...args);
		});
		const mutationSpy = mock.method(f.service, 'mutate', async (...args: Parameters<typeof mutate>) => {
			mutations++;
			return mutate(...args);
		});
		const original = fsPromises.readFile;
		let fail = true;
		const read = mock.method(fsPromises, 'readFile', async (...args: Parameters<typeof original>) => {
			if (args[0] === f.path && fail) {
				fail = false;
				throw Object.assign(new Error('private-source-canary'), { code: 'EIO' });
			}
			return original(...args);
		});
		syncBuiltinESMExports();
		try {
			await assert.rejects(f.service.list(f.context), { code: 'registry-unreadable' });
			const list = await f.service.list(f.context);
			assert.equal(list.length, 1);
			assert.ok(!JSON.stringify(list).includes('secret-canary'));
			assert.equal(tickets, 0);
			assert.equal(mutations, 0);
			assert.equal(f.counts.writes, 0);
			assert.equal(f.counts.stages, 0);
			assert.equal(f.counts.sets, 0);
			assert.equal(f.counts.deletes, 0);
		}
		finally {
			read.mock.restore();
			ticketSpy.mock.restore();
			mutationSpy.mock.restore();
			syncBuiltinESMExports();
		}
		assert.equal(await readFile(f.path, 'utf8'), bytes);
		assert.deepEqual([...f.values], keys);
	}
	finally {
		await env.cleanup();
	}
});
test('CM-S1-D: a full service process exits after commit without a response and the restarted owner reconciles one receipt', async () => {
	const env = await environment();
	const f = await env.rootFixture('root');
	try {
		const { join, dirname, resolve } = await import('node:path');
		const { promisify } = await import('node:util');
		const { execFile } = await import('node:child_process');
		const request = await f.request('fixture');
		const vault = join(f.root, 'fake-vault.json');
		const payload = join(f.root, 'fake-request.json');
		await writeFile(vault, JSON.stringify(Object.fromEntries(f.values)), { mode: 0o600 });
		await writeFile(payload, JSON.stringify(request), { mode: 0o600 });
		await f.close();
		await assert.rejects(promisify(execFile)(process.execPath, ['--import', 'tsx', resolve('src/daemon/db/__tests__/fixtures/saved-lost-response-child.ts'), join(env.directory, 'insrc'), f.root, vault, payload], { timeout: 20000, maxBuffer: 1024 * 1024 }), error => {
			assert.equal((error as {
				code?: number;
			}).code, 74, String(error));
			return true;
		});
		f.values.clear();
		for (const [ref, value] of Object.entries(JSON.parse(await readFile(vault, 'utf8')) as Record<string, string>))
			f.values.set(ref, value);
		const bytes = await readFile(f.path, 'utf8');
		const document = JSON.parse(bytes);
		const outcome = document._management.receipts[request.operationId].outcome;
		assert.equal(Object.keys(document._management.receipts).length, 1);
		assert.ok(!bytes.includes('secret-canary'));
		await f.restart();
		f.reset();
		const status = await f.service.status(f.context, request.ticket);
		assert.deepEqual(status, { status: 'committed', value: outcome });
		assert.deepEqual(await f.service.mutate(f.context, request), { status: 'committed', value: outcome });
		assert.equal(await readFile(f.path, 'utf8'), bytes);
		assert.equal(f.counts.writes, 0);
		assert.equal(f.counts.stages, 0);
		assert.equal(f.counts.sets, 0);
		assert.equal(f.counts.deletes, 0);
	}
	finally {
		await env.cleanup();
	}
});
