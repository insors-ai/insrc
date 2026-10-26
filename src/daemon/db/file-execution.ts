/** Daemon-owned private file execution. Source paths never become table names or logs. */
import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { decodedValueBytes } from './drivers/converters/row-admission.js';
import { DuckDBTimestampValue, StatementType, listValue } from '@duckdb/node-api';
import type { DuckDBConnection, DuckDBAppender, DuckDBValue } from '@duckdb/node-api';
import type { FileExecutionPolicy, FileExecutionResource, ConvertedTarget, ConvertedColumn, MemoryRowSource } from '../../shared/connection-management.js';
import { createPrivateDuckDB, withConnection as withSavedConnection } from './duckdb-pool.js';
import type { PrivateDuckDB } from './duckdb-pool.js';
import { DecoderBudget } from './drivers/converters/decoder-budget.js';
import { schemaVersion, assertCompatibleTargets } from './drivers/converters/typed-row-source.js';
export type FileQueryConnection = Pick<DuckDBConnection, 'runAndReadAll'>;
export interface OwnedFileExecutionResource extends FileExecutionResource {
	readonly policy: FileExecutionPolicy;
	withConnection<T>(use: (connection: FileQueryConnection) => Promise<T>): Promise<T>;
}
export interface NativeFileRead {
	readonly kind: 'csv' | 'tsv' | 'json' | 'jsonl' | 'ndjson' | 'parquet' | 'arrow' | 'feather';
	readonly paths: readonly string[];
	readonly delimiter?: string | undefined;
	readonly header?: boolean | undefined;
	readonly quote?: string | false | undefined;
	readonly hivePartitioning?: boolean | undefined;
}
const quote = (identifier: string) => '"' + identifier.replaceAll('"', '""') + '"';
const physicalTypes: Record<string, string> = { UTF8: 'VARCHAR', INT32: 'INTEGER', INT64: 'BIGINT', FLOAT: 'FLOAT', DOUBLE: 'DOUBLE', BOOLEAN: 'BOOLEAN', BYTE_ARRAY: 'BLOB', TIMESTAMP_MILLIS: 'TIMESTAMP' };
function nativeReader(spec: NativeFileRead): string {
	const extra = spec.hivePartitioning ? ', hive_partitioning=true' : '';
	if (spec.kind === 'csv' || spec.kind === 'tsv') {
		const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
		const options: string[] = [];
		const delimiter = spec.delimiter ?? (spec.kind === 'tsv' ? '\t' : undefined);
		if (delimiter !== undefined) {
			if (delimiter.length < 1 || delimiter.length > 2 || /['"\\]/.test(delimiter))
				throw new Error('Invalid CSV delimiter');
			options.push('delim=' + literal(delimiter));
		}
		if (spec.header !== undefined)
			options.push('header=' + String(spec.header));
		if (spec.quote !== undefined) {
			if (spec.quote !== false && (spec.quote.length !== 1 || spec.quote === '\\'))
				throw new Error('Invalid CSV quote');
			options.push('quote=' + literal(spec.quote === false ? '' : spec.quote));
		}
		return `read_csv_auto(?${options.length ? ', ' + options.join(', ') : ''}${extra})`;
	}
	if (spec.kind === 'jsonl' || spec.kind === 'ndjson')
		return `read_json_auto(?, format='newline_delimited'${extra})`;
	const reader = { json: 'read_json_auto', parquet: 'read_parquet', arrow: 'read_arrow', feather: 'read_arrow' }[spec.kind];
	return `${reader}(?${extra})`;
}
function append(appender: DuckDBAppender, value: unknown, column: ConvertedColumn): void {
	if (value === null || value === undefined) {
		if (!column.nullable)
			throw new Error('Invalid null converted value');
		appender.appendNull();
		return;
	}
	switch (column.physicalType) {
		case 'UTF8':
			if (typeof value !== 'string')
				throw new Error('Invalid converted string');
			appender.appendVarchar(value);
			return;
		case 'INT32':
			if (typeof value !== 'number' || !Number.isInteger(value) || value < -2147483648 || value > 2147483647)
				throw new Error('Invalid converted integer');
			appender.appendInteger(value);
			return;
		case 'INT64':
			if (typeof value !== 'bigint' && (typeof value !== 'number' || !Number.isSafeInteger(value)))
				throw new Error('Invalid converted integer');
			appender.appendBigInt(BigInt(value));
			return;
		case 'FLOAT':
		case 'DOUBLE':
			if (typeof value !== 'number' || !Number.isFinite(value))
				throw new Error('Invalid converted number');
			if (column.physicalType === 'FLOAT')
				appender.appendFloat(value);
			else
				appender.appendDouble(value);
			return;
		case 'BOOLEAN':
			if (typeof value !== 'boolean')
				throw new Error('Invalid converted boolean');
			appender.appendBoolean(value);
			return;
		case 'BYTE_ARRAY':
			if (!(value instanceof Uint8Array))
				throw new Error('Invalid converted binary');
			appender.appendBlob(value);
			return;
		case 'TIMESTAMP_MILLIS':
			if (typeof value !== 'number' || !Number.isSafeInteger(value))
				throw new Error('Invalid converted timestamp');
			appender.appendTimestamp(new DuckDBTimestampValue(BigInt(value) * 1000n));
			return;
		default: throw new Error('unsupported-temporary');
	}
}
export class MemoryFileExecution implements OwnedFileExecutionResource {
	readonly decoderBudget: DecoderBudget;
	#controller = new AbortController();
	#connections = new Set<DuckDBConnection>();
	#pending = new Set<Promise<unknown>>();
	#sources = new Set<MemoryRowSource>();
	#sourceClosures = new WeakMap<MemoryRowSource, Promise<void>>();
	#retained: (() => void)[] = [];
	#closed = false;
	#closing: Promise<void> | undefined;
	#engineClosed = false;
	#initialized = false;
	#targets: readonly ConvertedTarget[] = [];
	#tables = new Map<string, string>();
	#union: string | undefined;
	private constructor(readonly policy: FileExecutionPolicy, readonly engine: PrivateDuckDB, readonly allowedPaths: readonly string[]) {
		this.decoderBudget = new DecoderBudget(policy.memoryBudgetBytes);
	}
	static async open(policy: FileExecutionPolicy, options: {
		readonly nativePaths?: readonly string[] | undefined;
		readonly localReaders?: readonly 'arrow'[] | undefined;
	} = {}): Promise<MemoryFileExecution> {
		if (policy.persistence !== 'memory-only' || policy.allowSpill !== false)
			throw new Error('Invalid memory execution policy');
		let paths: string[];
		try {
			paths = [];
			for (const path of options.nativePaths ?? []) {
				const canonical = await realpath(path);
				if (!(await stat(canonical)).isFile())
					throw new Error();
				paths.push(canonical);
			}
		}
		catch {
			throw new Error('Invalid or unsupported temporary source');
		}
		const engine = await createPrivateDuckDB({ memoryBudgetBytes: policy.memoryBudgetBytes, allowedPaths: paths, localReaders: options.localReaders });
		return new MemoryFileExecution(Object.freeze({ ...policy, identity: Object.freeze({ ...policy.identity }) }), engine, Object.freeze(paths));
	}
	get diagnostics(): Readonly<{
		closed: boolean;
		connections: number;
		operations: number;
		tables: number;
		decodedBytes: number;
	}> {
		return { closed: this.#closed, connections: this.#connections.size, operations: this.#pending.size, tables: this.#tables.size, decodedBytes: this.decoderBudget.snapshot().retained };
	}
	#name(): string {
		return 'cm_' + randomUUID().replaceAll('-', '');
	}
	#closeSource(source: MemoryRowSource): Promise<void> {
		let closing = this.#sourceClosures.get(source);
		if (!closing) {
			closing = Promise.resolve().then(() => source.close()).then(() => { this.#sources.delete(source); }, () => { this.#sourceClosures.delete(source); throw new Error('File execution cleanup pending'); });
			this.#sourceClosures.set(source, closing);
		}
		return closing;
	}
	#live(): void {
		if (this.#closed || this.#controller.signal.aborted)
			throw new Error('File execution closed');
	}
	#operation<T>(use: (connection: DuckDBConnection) => Promise<T>): Promise<T> {
		this.#live();
		const work = (async () => {
			const connection = await this.engine.instance.connect();
			this.#connections.add(connection);
			try {
				this.#live();
				return await use(connection);
			}
			finally {
				connection.closeSync();
				this.#connections.delete(connection);
			}
		})();
		this.#pending.add(work);
		void work.then(() => this.#pending.delete(work), () => this.#pending.delete(work));
		return work;
	}
	async loadRows(factory: (budget: DecoderBudget, signal: AbortSignal) => Promise<MemoryRowSource>): Promise<void> {
		this.#live();
		if (this.#initialized)
			throw new Error('File execution already initialized');
		this.#initialized = true;
		let source: MemoryRowSource | undefined;
		try {
			await this.#operation(async (connection) => {
				source = await factory(this.decoderBudget, this.#controller.signal);
				this.#sources.add(source);
				this.#live();
				const targets = Object.freeze((await source.targets()).map(target => Object.freeze({ ...target, columns: Object.freeze(target.columns.map(column => Object.freeze({ ...column }))) })));
				if (new Set(targets.map(t => t.targetId)).size !== targets.length)
					throw new Error('Invalid converted target catalog');
				for (const target of targets) {
					this.#live();
					if (!target.columns.length || new Set(target.columns.map(c => c.name)).size !== target.columns.length)
						throw new Error('Invalid converted schema');
					this.#retained.push(this.decoderBudget.reserve(decodedValueBytes(target,this.policy.memoryBudgetBytes) + target.columns.length * 128));
					const name = this.#name();
					const columns = target.columns.map(column => {
						const type = physicalTypes[column.physicalType];
						if (!type)
							throw new Error('unsupported-temporary');
						return `${quote(column.name)} ${type}${column.nullable ? '' : ' NOT NULL'}`;
					}).join(',');
					await connection.run(`CREATE TABLE ${quote(name)} (${columns})`);
					this.#tables.set(target.targetId, name);
					const appender = await connection.createAppender(name);
					try {
						for await (const batch of source.batches(target.targetId, this.#controller.signal)) {
							this.#live();
							if (batch.targetId !== target.targetId || batch.schemaVersion !== schemaVersion(target))
								throw new Error('Converted schema version mismatch');
							for (const row of batch.rows) {
								if (Object.keys(row).length !== target.columns.length || target.columns.some(column => !Object.hasOwn(row, column.name)))
									throw new Error('Converted row schema mismatch');
							this.#retained.push(this.decoderBudget.reserve(decodedValueBytes(row,this.policy.memoryBudgetBytes) + 128 + target.columns.length * 16));
								for (const column of target.columns)
									append(appender, row[column.name], column);
								appender.endRow();
							}
						}
					}
					finally {
						appender.closeSync();
					}
				}
				this.#targets = targets;
			});
		}
		catch (error) {
			await this.close();
			throw safeExecutionError(error);
		}
		finally {
			try {
				if (source) await this.#closeSource(source);
			}
			catch (error) {
				await this.close();
				throw safeExecutionError(error);
			}
		}
	}
	async loadNative(spec: NativeFileRead): Promise<void> {
		this.#live();
		if (this.#initialized)
			throw new Error('File execution already initialized');
		this.#initialized = true;
		try {
			const paths: string[] = [];
			for (const path of spec.paths) {
				const canonical = await realpath(path);
				if (!this.allowedPaths.includes(canonical))
					throw new Error('Invalid source access');
				paths.push(canonical);
			}
			if (!paths.length)
				throw new Error('No temporary source files');
			const expression = nativeReader(spec), name = this.#name();
			await this.#operation(async (connection) => {
				await connection.run(`CREATE TABLE ${quote(name)} AS SELECT * FROM ${expression}`, [paths.length === 1 ? paths[0]! : listValue(paths)]);
				this.#tables.set('data', name);
				const description = (await connection.runAndReadAll(`DESCRIBE ${quote(name)}`)).getRowObjectsJS();
				this.#targets = [{ targetId: 'data', sourceIdentity: this.policy.identity.sourceIdentity, columns: description.map(row => ({ name: String(row.column_name), logicalType: String(row.column_type), physicalType: String(row.column_type), nullable: row.null === 'YES', normalization: 'native-reader' })) }];
			});
		}
		catch (error) {
			await this.close();
			throw safeExecutionError(error);
		}
	}
	async targets(): Promise<readonly ConvertedTarget[]> {
		this.#live();
		return this.#targets;
	}
	async table(target?: string): Promise<string> {
		this.#live();
		if (!this.#initialized)
			throw new Error('File execution not initialized');
		if (target) {
			const exact = this.#targets.filter(t => t.targetId === target), aliases = exact.length ? exact : this.#targets.filter(t => t.worksheetName === target || t.worksheetSlug === target);
			if (aliases.length !== 1)
				throw new Error('Unknown converted target');
			return this.#tables.get(aliases[0]!.targetId)!;
		}
		if (this.#targets.length === 1)
			return this.#tables.get(this.#targets[0]!.targetId)!;
		if (!this.#targets.length)
			throw new Error('No converted targets');
		assertCompatibleTargets(this.#targets);
		if (!this.#union) {
			const name = this.#name();
			await this.#operation(async (connection) => {
				await connection.run(`CREATE VIEW ${quote(name)} AS ${this.#targets.map(t => `SELECT * FROM ${quote(this.#tables.get(t.targetId)!)}`).join(' UNION ALL ')}`);
			});
			this.#union = name;
		}
		return this.#union;
	}
	async withConnection<T>(use: (connection: FileQueryConnection) => Promise<T>): Promise<T> {
		return this.#operation(async (connection) => {
			const pending = new Set<Promise<unknown>>();
			let accepting = true;
			const facade: FileQueryConnection = { runAndReadAll: (sql, values) => {
					if (!accepting)
						throw new Error('File execution query scope closed');
					const query = (async () => {
						this.#live();
						if (!/^\s*(SELECT|WITH|DESCRIBE)\b/i.test(sql))
							throw new Error('Unsupported file query');
						const statements = await connection.extractStatements(sql);
						if (statements.count !== 1)
							throw new Error('Unsupported file query');
						const prepared = await statements.prepare(0);
						try {
							if (prepared.statementType !== StatementType.SELECT)
								throw new Error('Unsupported file query');
							if (values)
								prepared.bind(values);
							return await prepared.runAndReadAll();
						}
						finally {
							prepared.destroySync();
						}
					})();
					pending.add(query);
					void query.then(() => pending.delete(query), () => pending.delete(query));
					return query;
				} };
			try {
				return await use(Object.freeze(facade));
			}
			catch (error) {
				throw safeExecutionError(error);
			}
			finally {
				accepting = false;
				while (pending.size)
					await Promise.allSettled([...pending]);
			}
		});
	}
	async close(): Promise<void> {
		if (this.#closing) return this.#closing;
		this.#closed = true; this.#controller.abort();
		for (const connection of this.#connections) { try { connection.interrupt(); } catch { /* Still drain and close this owned handle. */ } }
		this.#closing = (async () => {
			while (this.#pending.size) await Promise.allSettled([...this.#pending]);
			let failed = false;
			const sources = await Promise.allSettled([...this.#sources].map(source => this.#closeSource(source)));
			for (const connection of this.#connections) {
				try { connection.closeSync(); this.#connections.delete(connection); } catch { failed = true; }
			}
			if (this.#connections.size === 0 && !this.#engineClosed) {
				try { this.engine.close(); this.#engineClosed = true; } catch { failed = true; }
			}
			if (failed || sources.some(result => result.status === 'rejected')) throw new Error('File execution cleanup pending');
			this.#tables.clear(); this.#targets = []; this.#union = undefined;
			for (const release of this.#retained.splice(0)) release();
		})().catch(() => { this.#closing = undefined; throw new Error('File execution cleanup pending'); });
		return this.#closing;
	}

}
export function savedFileExecution(policy: FileExecutionPolicy): OwnedFileExecutionResource {
	if (policy.persistence !== 'saved-cache')
		throw new Error('Invalid saved execution policy');
	let closed = false;
	const pending = new Set<Promise<unknown>>();
	let closing: Promise<void> | undefined;
	return { policy, async withConnection(use) {
			if (closed)
				throw new Error('File execution closed');
			const work = withSavedConnection(use);
			pending.add(work);
			try { return await work; } finally { pending.delete(work); }
		}, async close() {
			closed = true;
			closing ??= (async () => { while (pending.size) await Promise.allSettled([...pending]); })();
			await closing;
		} };
}
function safeExecutionError(error: unknown): Error {
	const message = error instanceof Error ? error.message : '';
	if (['resource-limit', 'unsupported-temporary', 'Converted schema version mismatch', 'Converted row schema mismatch', 'Unknown converted target', 'Incompatible converted target schemas', 'File execution closed'].includes(message))
		return Object.assign(new Error(message), ['resource-limit', 'unsupported-temporary'].includes(message) ? { code: message } : {});
	if (/out of memory|memory limit|memory budget|failed to pin|failed to allocate/i.test(message))
		return Object.assign(new Error('resource-limit'), { code: 'resource-limit' });
	return new Error('Temporary file execution failed');
}
