/** Isolated process: all engine home/cache/temp/log destinations belong to the fixture. */
import assert from 'node:assert/strict';
import { watch } from 'node:fs';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PATHS } from '../../../../shared/paths.js';
import type { FileExecutionPolicy } from '../../../../shared/connection-management.js';
const root = process.argv[2];
if (!root)
	throw new Error('Missing isolated fixture');
const logRoot = join(root, 'logs');
for (const [key, value] of Object.entries({ logDir: logRoot, daemonLog: join(logRoot, 'daemon.log'), agentLog: join(logRoot, 'agent.log') }))
	Object.defineProperty(PATHS, key, { value, configurable: true });
const { getLogger } = await import('../../../../shared/logger.js');
const { MemoryFileExecution } = await import('../../file-execution.js');
const { bsonConverter } = await import('../../drivers/converters/bson.js');
const { xlsxConverter } = await import('../../drivers/converters/xlsx.js');
const logger = getLogger('private-execution-audit');
async function logs(): Promise<string> {
	let text = '';
	for (const name of await readdir(logRoot)) {
		assert(/^daemon.*\.log$/.test(name), 'only the configured application log is permitted');
		text += await readFile(join(logRoot, name), 'utf8');
	}
	return text;
}
async function logged(marker: string): Promise<void> {
	logger.info(marker);
	const deadline = Date.now() + 10000;
	while (!(await logs()).includes(marker)) {
		if (Date.now() > deadline)
			throw new Error('Logger did not flush');
		await delay(25);
	}
}
async function snapshot(): Promise<Record<string, string>> {
	const output: Record<string, string> = {};
	async function walk(path: string): Promise<void> {
		const name = relative(root, path);
		if (name === 'logs' || name.startsWith('logs/'))
			return;
		const stat = await lstat(path, { bigint: true });
		output[name] = `${stat.mode}:${stat.mtimeNs}:` + (stat.isFile() ? (await readFile(path)).toString('base64') : 'directory');
		if (stat.isDirectory())
			for (const child of (await readdir(path)).sort())
				await walk(join(path, child));
	}
	await walk(root);
	return output;
}
const configMarker = 'PRIVATE_CONFIG_CANARY_9481';
const policy = (kind: string): FileExecutionPolicy => ({ identity: { lookupRoot: root, ownerId: 'audit', connectionId: configMarker, revision: 'fixture', sourceIdentity: kind, converterOptionsDigest: 'options' }, persistence: 'memory-only', memoryBudgetBytes: 64 * 1024 * 1024, allowSpill: false });
await logged('private-execution-ready');
const before = await snapshot(), events: string[] = [];
const watcher = watch(root, { recursive: true }, (_, name) => events.push(String(name)));
let native = 0, converted = 0, optionalReaderAvailable = false;
try {
	for (const [kind, suffix] of [['csv', 'csv'], ['json', 'json'], ['jsonl', 'jsonl'], ['parquet', 'parquet']] as const) {
		const path = join(root, 'sources', 'PRIVATE_PATH_CANARY.' + suffix), resource = await MemoryFileExecution.open(policy(kind), { nativePaths: [path] });
		try {
			await resource.loadNative({ kind, paths: [path] });
			const table = await resource.table();
			const rows = await resource.withConnection(async (c) => (await c.runAndReadAll('SELECT * FROM query_table(?)', [table])).getRowObjectsJS());
			assert.equal(rows.length, 2);
			native++;
		}
		finally {
			await resource.close();
		}
		assert.deepEqual(resource.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
	}
	for (const [kind, converter] of [['bson', bsonConverter], ['xlsx', xlsxConverter]] as const) {
		const resource = await MemoryFileExecution.open(policy(kind));
		try {
			await resource.loadRows((budget, signal) => converter.openMemory!(join(root, 'sources', 'PRIVATE_PATH_CANARY.' + kind), { memoryBudgetBytes: budget.limit, budget, signal }));
			const table = await resource.table();
			assert.equal((await resource.withConnection(async (c) => (await c.runAndReadAll('SELECT * FROM query_table(?)', [table])).getRowObjectsJS())).length, 2);
			converted++;
		}
		finally {
			await resource.close();
		}
		assert.deepEqual(resource.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
	}
	const failed = await MemoryFileExecution.open(policy('failure'));
	await assert.rejects(failed.loadRows((budget, signal) => bsonConverter.openMemory!(join(root, 'sources', 'bad.bson'), { memoryBudgetBytes: budget.limit, budget, signal })), /resource-limit/);
	assert.deepEqual(failed.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
	try {
		const optional = await MemoryFileExecution.open(policy('optional'), { localReaders: ['arrow'] });
		optionalReaderAvailable = true;
		await optional.close();
	}
	catch (error) {
		assert.match((error as Error).message, /unsupported-temporary/);
	}
	await logged('private-execution-finished');
	await delay(1200);
	const after = await snapshot();
	assert.deepEqual(after, before, 'home/cache/temp/config/working/source roots remain byte-for-byte and mtime unchanged');
	for (const event of events) {
		if (event === 'logs' || event.startsWith('logs/'))
			continue;
		assert(Object.hasOwn(before, event) && before[event] === after[event], 'no transient spill/cache/profile/config sidecars outside logs: ' + event);
	}
	const text = await logs();
	for (const privateValue of [root, await realpath(root), 'PRIVATE_PATH_CANARY', configMarker])
		assert(!text.includes(privateValue), 'no source path or configuration marker in application logs');
	process.stdout.write(JSON.stringify({ native, converted, optionalReaderAvailable, filesystemUnchanged: true, logsClean: true }) + '\n');
}
finally {
	watcher.close();
}
