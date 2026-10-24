import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, readdir, utimes, symlink, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { DuckDBConnection } from '@duckdb/node-api';
import { serialize } from 'bson';
import { environment, deferred } from './fixtures/saved-management-fixture.js';
import { fileExecutionPolicy } from '../file-policy.js';
import { savedCacheIdentity, cacheDirFor, ensureCached, clearConnectionCache, isCached, cacheRoot, _resetForTests, _settleForTests } from '../converter-cache.js';
import { getFactory } from '../registry.js';
import { closeDuckDB } from '../duckdb-pool.js';
import type { ConnectionConfig, FileDriver } from '../../../shared/db-driver.js';
function authority(root: string, config: ConnectionConfig, revision = 'same-revision') {
	return fileExecutionPolicy(config, { lookupRoot: root, ownerId: 'owner', revision, persistence: 'saved-cache' });
}
const copy = async (source: string, dest: string) => {
	await writeFile(dest, await readFile(source));
	return { rowCount: 1, durationMs: 0 };
};
test('CM-S1-I: all saved cache identity components isolate destinations sidecars inflight work and exact-owned cleanup', async () => {
	const env = await environment();
	const a = join(env.directory, 'a'), b = join(env.directory, 'b');
	await mkdir(a);
	await mkdir(b);
	const sourceA = join(a, 'same.bson'), sourceB = join(b, 'same.bson');
	await writeFile(sourceA, 'AAAA');
	await writeFile(sourceB, 'BBBB');
	const configA = { id: 'same', kind: 'bson', path: sourceA }, configB = { id: 'same', kind: 'bson', path: sourceB };
	try {
		const one = await savedCacheIdentity(authority(a, configA), sourceA, 'bson'), two = await savedCacheIdentity(authority(b, configB), sourceB, 'bson');
		const identities = [one, two, { ...one, connectionId: 'different' }, { ...one, revision: 'next' }, { ...one, sourceIdentity: sourceB }, { ...one, converterVersion: 'next-version' }, { ...one, optionsDigest: 'different-options' }];
		assert.equal(new Set(identities.map(cacheDirFor)).size, identities.length);
		const leases = [];
		for (const identity of identities)
			leases.push(await ensureCached(identity, copy));
		assert.equal(await readFile(leases[0]!.path, 'utf8'), 'AAAA');
		assert.equal(await readFile(leases[1]!.path, 'utf8'), 'BBBB');
		const meta = JSON.parse(await readFile(leases[0]!.path + '.meta', 'utf8'));
		assert.deepEqual(meta.identity, one);
		assert.match(meta.sourceFingerprint, /^[a-f0-9]{64}$/);
		assert.equal((await lstat(leases[0]!.path + '.meta')).mode & 0o777, 0o600);
		await assert.rejects(clearConnectionCache(one), /busy/);
		for (const lease of leases)
			lease.release();
		await _settleForTests();
		await clearConnectionCache(one);
		assert.equal(await isCached(one), false);
		assert.equal(await isCached(two), true);
		assert.equal(await readFile(sourceA, 'utf8'), 'AAAA');
		assert.equal(await readFile(sourceB, 'utf8'), 'BBBB');
		const alias = join(env.directory, 'alias');
		await symlink(a, alias);
		assert.deepEqual(await savedCacheIdentity(authority(alias, configA), join(alias, 'same.bson'), 'bson'), one);
		await assert.rejects(savedCacheIdentity({ ...authority(a, configA), persistence: 'memory-only' }, sourceA, 'bson'), /Memory-only/);
	}
	finally {
		await _settleForTests();
		_resetForTests();
		await env.cleanup();
	}
});
test('CM-S1-I: unchanged size and mtime cannot reuse stale contents and corrupt derived output is rebuilt without changing source', async () => {
	const env = await environment();
	const root = join(env.directory, 'root');
	await mkdir(root);
	const path = join(root, 'same.bson');
	await writeFile(path, 'AAAA');
	const time = new Date('2026-01-01Z');
	await utimes(path, time, time);
	try {
		const identity = await savedCacheIdentity(authority(root, { id: 'same', kind: 'bson', path }), path, 'bson');
		let conversions = 0;
		const convert = async (source: string, dest: string) => {
			conversions++;
			return copy(source, dest);
		};
		const first = await ensureCached(identity, convert);
		assert.equal(conversions, 1);
		first.release();
		const repeated = await ensureCached(identity, convert);
		assert.equal(conversions, 1);
		repeated.release();
		await writeFile(path, 'BBBB');
		await utimes(path, time, time);
		assert.equal(await isCached(identity), false);
		const second = await ensureCached(identity, convert);
		assert.equal(conversions, 2);
		assert.notEqual(second.path, first.path);
		assert.equal(await readFile(second.path, 'utf8'), 'BBBB');
		second.release();
		await writeFile(second.path, 'EVIL');
		assert.equal(await isCached(identity), false);
		const repaired = await ensureCached(identity, convert);
		assert.equal(conversions, 3);
		assert.equal(await readFile(repaired.path, 'utf8'), 'BBBB');
		assert.equal(await readFile(path, 'utf8'), 'BBBB');
		repaired.release();
	}
	finally {
		await _settleForTests();
		_resetForTests();
		await env.cleanup();
	}
});
test('CM-S1-I: same-identity conversions join while separate roots proceed and source changes discard all staged output', async () => {
	const env = await environment();
	const a = join(env.directory, 'a'), b = join(env.directory, 'b');
	await mkdir(a);
	await mkdir(b);
	const sourceA = join(a, 'same.bson'), sourceB = join(b, 'same.bson');
	await writeFile(sourceA, 'AAAA');
	await writeFile(sourceB, 'BBBB');
	try {
		const one = await savedCacheIdentity(authority(a, { id: 'same', kind: 'bson', path: sourceA }), sourceA, 'bson'), two = await savedCacheIdentity(authority(b, { id: 'same', kind: 'bson', path: sourceB }), sourceB, 'bson');
		const started = deferred(), gate = deferred();
		let calls = 0;
		const convert = async (source: string, dest: string) => {
			calls++;
			started.resolve();
			await gate.promise;
			return copy(source, dest);
		};
		const first = ensureCached(one, convert);
		await started.promise;
		const joined = ensureCached(one, convert);
		const independent = await ensureCached(two, copy);
		assert.equal(await readFile(independent.path, 'utf8'), 'BBBB');
		independent.release();
		gate.resolve();
		const [x, y] = await Promise.all([first, joined]);
		assert.equal(calls, 1);
		assert.equal(x.path, y.path);
		x.release();
		y.release();
		const changed = { ...one, revision: 'changed' };
		await assert.rejects(ensureCached(changed, async (source, dest) => {
			await writeFile(source, 'CCCC');
			return copy(source, dest);
		}), /source changed/);
		const files = await readdir(join(cacheDirFor(changed), 'files'));
		assert.deepEqual(files, []);
	}
	finally {
		await _settleForTests();
		_resetForTests();
		await env.cleanup();
	}
});
test('CM-S1-T: saved file-driver roots contents revisions and converter options return correct complete rows', async () => {
	const env = await environment();
	const a = join(env.directory, 'a'), b = join(env.directory, 'b');
	await mkdir(a);
	await mkdir(b);
	const sourceA = join(a, 'same.bson'), sourceB = join(b, 'same.bson');
	const documents = (value: string) => Buffer.concat(Array.from({ length: 1002 }, (_, id) => serialize({ id, value, ...(id === 1001 ? { rare: 'tail' } : {}) })));
	await writeFile(sourceA, documents('AAAA'));
	await writeFile(sourceB, documents('BBBB'));
	const time = new Date('2026-01-01Z');
	await utimes(sourceA, time, time);
	await utimes(sourceB, time, time);
	const original = DuckDBConnection.prototype.run;
	const spy = mock.method(DuckDBConnection.prototype, 'run', function (this: DuckDBConnection, sql: string, ...args: unknown[]) {
		if (/^INSTALL/i.test(sql))
			return Promise.reject(new Error('extension installation disabled in this isolated test'));
		return original.call(this, sql, ...args as [
		]);
	});
	const drivers: FileDriver[] = [];
	try {
		for (const [root, path, expected] of [[a, sourceA, 'AAAA'], [b, sourceB, 'BBBB']] as const) {
			const config = { id: 'same', kind: 'bson', path };
			const driver = await getFactory('bson')!(config, { fileExecutionPolicy: authority(root, config) }) as FileDriver;
			drivers.push(driver);
			assert.equal((await driver.sample!(undefined, { limit: 10 })).rows[0]?.value, expected);
			assert.equal((await driver.aggregate!(undefined, { aggregations: [{ column: '*', function: 'count' }] })).values['*__count'], 1002);
			assert.equal((await driver.sample!(undefined, { limit: 10, where: [{ column: 'id', op: '=', value: 1001 }] })).rows[0]?.rare, 'tail');
		}
		await writeFile(sourceA, documents('CCCC'));
		await utimes(sourceA, time, time);
		assert.equal((await drivers[0]!.sample!(undefined, { limit: 10 })).rows[0]?.value, 'CCCC');
		assert.equal((await drivers[1]!.sample!(undefined, { limit: 10 })).rows[0]?.value, 'BBBB');
		const fixed = join(a, 'data.txt');
		await writeFile(fixed, ' a  \n');
		for (const trim of [true, false]) {
			const config: ConnectionConfig = { id: 'same', kind: 'fixed-width', path: fixed, options: { trim, columns: [{ name: 'value', start: 0, length: 4, type: 'string' }] } };
			const driver = await getFactory('fixed-width')!(config, { fileExecutionPolicy: authority(a, config) }) as FileDriver;
			drivers.push(driver);
			assert.equal((await driver.sample!(undefined, { limit: 10 })).rows[0]?.value, trim ? 'a' : ' a  ');
		}
		assert.ok((await readdir(cacheRoot())).length >= 4);
	}
	finally {
		for (const driver of drivers)
			await driver.close();
		await closeDuckDB();
		spy.mock.restore();
		await _settleForTests();
		_resetForTests();
		await env.cleanup();
	}
});
test('CM-S1-I: cache maintenance evicts only unpinned derived generations and leaves source bytes intact', async () => {
	const env = await environment();
	const root = join(env.directory, 'root');
	await mkdir(root);
	const source = join(root, 'data.bson');
	await writeFile(source, 'x'.repeat(4096));
	const previous = process.env.INSRC_CONVERTER_CACHE_MB;
	process.env.INSRC_CONVERTER_CACHE_MB = '0.001';
	try {
		const identity = await savedCacheIdentity(authority(root, { id: 'fixture', kind: 'bson', path: source }), source, 'bson');
		const lease = await ensureCached(identity, copy);
		await _settleForTests();
		assert.equal((await readFile(lease.path)).length, 4096);
		lease.release();
		await _settleForTests();
		assert.equal(await isCached(identity), false);
		assert.equal((await readFile(source)).length, 4096);
	}
	finally {
		if (previous === undefined)
			delete process.env.INSRC_CONVERTER_CACHE_MB;
		else
			process.env.INSRC_CONVERTER_CACHE_MB = previous;
		await _settleForTests();
		_resetForTests();
		await env.cleanup();
	}
});
test('CM-S1-T: directory saved reads include only current sources and current XLSX sheets across content generations', async () => {
	const { default: ExcelJS } = await import('exceljs');
	const { rm } = await import('node:fs/promises');
	const env = await environment();
	const root = join(env.directory, 'root');
	await mkdir(root);
	const original = DuckDBConnection.prototype.run;
	const spy = mock.method(DuckDBConnection.prototype, 'run', function (this: DuckDBConnection, sql: string, ...args: unknown[]) {
		if (/^INSTALL/i.test(sql))
			return Promise.reject(new Error('isolated test'));
		return original.call(this, sql, ...args as [
		]);
	});
	let driver: FileDriver | undefined;
	try {
		const make = async (name: string, sheet: string, value: string) => {
			const book = new ExcelJS.Workbook(), worksheet = book.addWorksheet(sheet);
			worksheet.addRow(['value']);
			worksheet.addRow([value]);
			await book.xlsx.writeFile(join(root, name + '.xlsx'));
		};
		await make('a', 'Old Sheet', 'AAAA');
		await make('b', 'Other Sheet', 'BBBB');
		const config = { id: 'fixture', kind: 'xlsx', path: root };
		driver = await getFactory('xlsx')!(config, { fileExecutionPolicy: authority(root, config) }) as FileDriver;
		assert.deepEqual((await driver.sample!(undefined, { limit: 10 })).rows.map(row => row.value).sort(), ['AAAA', 'BBBB']);
		await make('a', 'New Sheet', 'CCCC');
		assert.deepEqual((await driver.sample!(undefined, { limit: 10 })).rows.map(row => row.value).sort(), ['BBBB', 'CCCC']);
		await rm(join(root, 'b.xlsx'));
		assert.deepEqual((await driver.sample!(undefined, { limit: 10 })).rows, [{ value: 'CCCC' }]);
	}
	finally {
		await driver?.close();
		await closeDuckDB();
		spy.mock.restore();
		await _settleForTests();
		_resetForTests();
		await env.cleanup();
	}
});
