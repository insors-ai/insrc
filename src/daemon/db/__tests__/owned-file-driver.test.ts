import { DuckDBConnection } from '@duckdb/node-api';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { environment, deferred } from './fixtures/saved-management-fixture.js';
import { getFactory, registerDriver } from '../registry.js';
import { MemoryFileExecution } from '../file-execution.js';
import { fileExecutionPolicy } from '../file-policy.js';
import { bsonConverter } from '../drivers/converters/bson.js';
import { xlsxConverter } from '../drivers/converters/xlsx.js';
import { serialize } from 'bson';
import { testConnectionRpc, prepareLegacyProbeConfig } from '../../db-rpc.js';
import { connectionsPath } from '../config.js';
import { _setKeystoreForTests } from '../secrets.js';
import * as defaultKeystore from '../../../shared/keystore.js';
import {RequestLifetime} from '../../request-context.js';
import {connectionTestSupervisor} from '../draft-test.js';
import type { ConnectionConfig, FileDriver, DriverFactoryContext, Driver } from '../../../shared/db-driver.js';
function context(root: string, config: ConnectionConfig): DriverFactoryContext {
	return { fileExecutionPolicy: { ...fileExecutionPolicy(config, { lookupRoot: root, ownerId: 'fixture', revision: 'revision', persistence: 'memory-only' }), memoryBudgetBytes: 64 * 1024 * 1024 } };
}
async function snapshot(dir: string): Promise<Record<string, string>> {
	const result: Record<string, string> = {};
	for (const path of await readdir(dir, { recursive: true })) {
		try {
			result[path] = (await readFile(join(dir, path))).toString('base64');
		}
		catch {
			result[path] = '<directory>';
		}
	}
	return result;
}
test('CM-S1-T: every file driver query uses its owned private resource and close disposes it without cache or source-path output', async () => {
	const env = await environment();
	const root = join(env.directory, 'files');
	await mkdir(root);
	const path = join(root, 'private-source.csv');
	await writeFile(path, 'x,y,stamp\n' + Array.from({ length: 20 }, (_, i) => `${i + 1},${(i + 1) * 2},2026-01-${String(i + 1).padStart(2, '0')} 00:00:00`).join('\n'));
	const before = await snapshot(env.directory), config = { id: 'fixture', kind: 'csv', path };
	const driver = await getFactory('csv')!(config, context(root, config)) as FileDriver;
	const original = MemoryFileExecution.prototype.withConnection;
	let calls = 0, resource: MemoryFileExecution | undefined;
	const spy = mock.method(MemoryFileExecution.prototype, 'withConnection', function (this: MemoryFileExecution, use: Parameters<typeof original>[0]) {
		calls++;
		resource = this;
		return original.call(this, use);
	});
	try {
		const operations = [
			() => driver.describe!(), () => driver.sample!(undefined, { limit: 5 }), () => driver.sampleShape!({ limit: 5 }),
			() => driver.aggregate!(undefined, { aggregations: [{ column: 'x', function: 'sum' }] }), () => driver.distinct!(undefined, { column: 'x', topN: 3 }),
			() => driver.histogram!(undefined, { column: 'x', buckets: 4 }), () => driver.correlationMatrix!(undefined, { columns: ['x', 'y'] }),
			() => driver.outliers!(undefined, { column: 'x', method: 'iqr' }), () => driver.temporalTrend!(undefined, { timestampColumn: 'stamp', valueColumn: 'y' }),
		];
		for (const operation of operations) {
			const previous = calls;
			const result = await operation();
			assert.ok(calls > previous);
			assert.ok(!JSON.stringify(result).includes(root), 'private path cannot leak in metadata/query outputs');
		}
		assert.ok(resource);
		assert.ok(resource.diagnostics.tables > 0);
		await driver.close();
		assert.deepEqual(resource.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
		await assert.rejects(driver.sample!(undefined, { limit: 1 }), /closed/);
		assert.deepEqual(await snapshot(env.directory), before);
	}
	finally {
		spy.mock.restore();
		await driver.close();
		await env.cleanup();
	}
});
test('CM-S1-H: converted driver memory reads cannot enter persistent conversion and workbook schema selection never crosses sheets', async () => {
	const env = await environment();
	const root = join(env.directory, 'files');
	await mkdir(root);
	const path = join(root, 'private.bson');
	await writeFile(path, serialize({ id: 1, value: 'full value' }));
	const book = new ExcelJS.Workbook(), a = book.addWorksheet('First Sheet'), b = book.addWorksheet('Other');
	a.addRow(['a']);
	a.addRow(['first']);
	b.addRow(['b']);
	b.addRow([2]);
	const xlsx = join(root, 'private.xlsx');
	await book.xlsx.writeFile(xlsx);
	const before = await snapshot(env.directory);
	const bson = mock.method(bsonConverter, 'convertFile', async () => {
		throw new Error('persistent conversion forbidden');
	}), excel = mock.method(xlsxConverter, 'convertFile', async () => {
		throw new Error('persistent conversion forbidden');
	});
	try {
		for (const [kind, file] of [['bson', path], ['xlsx', xlsx]] as const) {
			const config = { id: 'fixture', kind, path: file };
			const driver = await getFactory(kind)!(config, context(root, config)) as FileDriver;
			try {
				if (kind === 'bson')
					assert.equal((await driver.sample!(undefined, { limit: 10 })).rows[0]?.value, 'full value');
				else {
					assert.deepEqual((await driver.describe!('First Sheet')).columns.map(c => c.name), ['a']);
					assert.deepEqual((await driver.describe!('Other')).columns.map(c => c.name), ['b']);
					assert.deepEqual((await driver.sample!('First_Sheet', { limit: 10 })).rows, [{ a: 'first' }]);
					assert.deepEqual((await driver.describe!('First Sheet')).columns.map(c => c.name), ['a']);
					await assert.rejects(driver.describe!('unknown'), /Unknown/);
				}
			}
			finally {
				await driver.close();
			}
		}
		assert.equal(bson.mock.callCount(), 0);
		assert.equal(excel.mock.callCount(), 0);
		assert.deepEqual(await snapshot(env.directory), before);
	}
	finally {
		bson.mock.restore();
		excel.mock.restore();
		await env.cleanup();
	}
});
test('CM-S1-T: directory memory readers retain every matching file and single-quote CSV configuration is escaped', async () => {
	const env = await environment();
	const root = join(env.directory, 'files');
	await mkdir(root);
	try {
		for (const name of ['a', 'b'])
			await writeFile(join(root, name + '.bson'), serialize({ value: name }));
		let config: ConnectionConfig = { id: 'fixture', kind: 'bson', path: root };
		let driver = await getFactory('bson')!(config, context(root, config)) as FileDriver;
		try {
			assert.deepEqual((await driver.sample!(undefined, { limit: 10 })).rows.map(row => row.value).sort(), ['a', 'b']);
		}
		finally {
			await driver.close();
		}
		const csv = join(root, 'quote.csv');
		await writeFile(csv, "label\n'a,b'\n");
		config = { id: 'quote', kind: 'csv', path: csv, options: { header: true, quote: "'" } };
		driver = await getFactory('csv')!(config, context(root, config)) as FileDriver;
		try {
			assert.deepEqual((await driver.sample!(undefined, { limit: 10 })).rows, [{ label: 'a,b' }]);
		}
		finally {
			await driver.close();
		}
	}
	finally {
		await env.cleanup();
	}
});
test('CM-S1-T: legacy transient construction uses profile materialization memory policy and awaited private cleanup without writes', async () => {
	const env = await environment();
	const root = join(env.directory, 'files');
	await mkdir(root);
	await writeFile(join(root, 'data.csv'), 'value\n1\n');
	const lifetime=new RequestLifetime();
	try {
		const before=await snapshot(env.directory);
		const result=await testConnectionRpc({repoRoot:root,config:{id:'fixture',kind:'csv',path:'data.csv',options:{header:true}}},{connectionIdentity:'fixture',daemonEpoch:'epoch',signal:lifetime.signal,registerDrain:lifetime.registerDrain});
		assert.equal('ok' in result&&result.ok,true,JSON.stringify(result));
		lifetime.complete();await lifetime.drained;
		assert.equal(connectionTestSupervisor.activeCount,0);
		assert.deepEqual(await snapshot(env.directory),before);
	}finally{await env.cleanup();}
});
test('CM-S1-T: transient drafts cannot read another credential reference and nested owned credentials use read-only materialization', async () => {
	const env = await environment();
	const root = join(env.directory, 'files');
	await mkdir(root);
	const path = connectionsPath(root);
	await mkdir(join(path, '..'), { recursive: true });
	const reference = 'db:owned:fixture';
	await writeFile(path, JSON.stringify({ connections: [{ id: 'fixture', kind: 'etcd', url: 'http://host', options: { hosts: ['http://host:2379'], password: '${secret:' + reference + '}' } }] }));
	let reads = 0, writes = 0;
	_setKeystoreForTests({ getKey: async (ref) => {
			reads++;
			assert.equal(ref, reference);
			return 'private-value';
		}, setKey: async () => {
			writes++;
		}, deleteKey: async () => {
			writes++;
		} });
	try {
		await assert.rejects(prepareLegacyProbeConfig({id:'new',kind:'etcd',url:'http://host',options:{password:'${secret:foreign}'}},'kv',root));
		assert.equal(reads,0);assert.equal(writes,0);
		const effective=await prepareLegacyProbeConfig({id:'fixture',kind:'etcd',url:'http://host',options:{hosts:['http://host:2379'],password:'${secret:'+reference+'}'}},'kv',root);
		assert.equal(effective.options?.password,'private-value');assert.equal(reads,1);assert.equal(writes,0);
	}finally{_setKeystoreForTests(defaultKeystore);await env.cleanup();}
});
test('CM-S1-T: renderer options cannot select execution policy and memory initialization errors redact source paths', async () => {
	const env = await environment();
	const root = join(env.directory, 'files');
	await mkdir(root);
	const path = join(root, 'data.csv');
	await writeFile(path, 'value\n1\n');
	try {
		const config: ConnectionConfig = { id: 'fixture', kind: 'csv', path, options: { persistence: 'memory-only', memoryBudgetBytes: 1, executionPolicy: { persistence: 'memory-only' } } };
		const driver = await getFactory('csv')!(config);
		try {
			assert.equal((driver as unknown as {
				execution: {
					policy: {
						persistence: string;
					};
				};
			}).execution.policy.persistence, 'saved-cache');
		}
		finally {
			await driver.close();
		}
		const missing = { ...config, path: join(root, 'private-missing-source.csv') };
		await assert.rejects(getFactory('csv')!(missing, context(root, missing)), error => error instanceof Error && !error.message.includes(root) && !error.message.includes('private-missing'));
	}
	finally {
		await env.cleanup();
	}
});
test('CM-S1-T: private native and converted driver initialization issues zero INSTALL calls', async () => {
	const env = await environment(), root = join(env.directory, 'no-install');
	await mkdir(root);
	const statements: string[] = [], run = DuckDBConnection.prototype.run, read = DuckDBConnection.prototype.runAndReadAll;
	const runSpy = mock.method(DuckDBConnection.prototype, 'run', function (this: DuckDBConnection, ...args: Parameters<typeof run>) {
		statements.push(args[0]);
		return Reflect.apply(run, this, args);
	});
	const readSpy = mock.method(DuckDBConnection.prototype, 'runAndReadAll', function (this: DuckDBConnection, ...args: Parameters<typeof read>) {
		statements.push(args[0]);
		return Reflect.apply(read, this, args);
	});
	try {
		for (const kind of ['csv', 'bson']) {
			const path = join(root, 'data.' + kind);
			await writeFile(path, kind === 'csv' ? 'value\nfirst\n' : serialize({ value: 'first' }));
			const config = { id: 'private', kind, path }, driver = await getFactory(kind)!(config, context(root, config)) as FileDriver;
			try {
				assert.equal((await driver.sample!(undefined, { limit: 1 })).rows.length, 1);
			}
			finally {
				await driver.close();
			}
		}
		assert(statements.length > 0);
		assert.equal(statements.filter(sql => /^\s*INSTALL\b/i.test(sql)).length, 0, 'observes actual driver factory initialization through both native query entrypoints');
	}
	finally {
		runSpy.mock.restore();
		readSpy.mock.restore();
		await env.cleanup();
	}
});
