/** Shared schema-first adapter. Readers own admission; both sinks use these rows. */
import { createHash } from 'node:crypto';
import { DecoderBudget } from './decoder-budget.js';
import { decodedValueBytes } from './row-admission.js';
import type { ConvertedBatch, ConvertedColumn, ConvertedTarget, MemoryRowSource } from '../../../../shared/connection-management.js';
export interface TypedTargetReader {
	readonly target: ConvertedTarget;
	/** Repeatable: inference must finish before exposing this reader. */
	rows(signal?: AbortSignal | undefined): AsyncIterable<Readonly<Record<string, unknown>>>;
	normalize(row: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
}
export interface TypedSourceOptions {
	readonly memoryBudgetBytes: number;
	readonly budget?: DecoderBudget | undefined;
	readonly batchBytes?: number | undefined;
	readonly batchRows?: number | undefined;
	readonly close?: (() => Promise<void>) | undefined;
}
export function schemaVersion(target: ConvertedTarget): string {
	return createHash('sha256').update(JSON.stringify(target)).digest('hex');
}
export function emptyColumn(): ConvertedColumn {
	return { name: '_empty', logicalType: 'string', physicalType: 'UTF8', nullable: true, normalization: 'identity' };
}
/** Exact target ids take precedence over worksheet aliases; ambiguity fails closed. */
export function selectTargets(readers: readonly TypedTargetReader[], requested?: string): readonly TypedTargetReader[] {
	if (requested === undefined)
		return readers;
	const exact = readers.filter(r => r.target.targetId === requested);
	if (exact.length === 1)
		return exact;
	const aliases = readers.filter(r => r.target.worksheetName === requested || r.target.worksheetSlug === requested);
	if (exact.length > 1 || aliases.length !== 1)
		throw new Error('Unknown or ambiguous converted target');
	return aliases;
}
export function createTypedRowSource(input: readonly TypedTargetReader[], options: TypedSourceOptions): MemoryRowSource {
	if (!Number.isSafeInteger(options.memoryBudgetBytes) || options.memoryBudgetBytes <= 0)
		throw new Error('Invalid decoded memory budget');
	const batchBytes = Math.min(options.batchBytes ?? 1024 * 1024, options.memoryBudgetBytes);
	const batchRows = options.batchRows ?? 1024;
	if (!Number.isSafeInteger(batchBytes) || batchBytes <= 0 || !Number.isSafeInteger(batchRows) || batchRows <= 0)
		throw new Error('Invalid converted batch limit');
	const readers = input.map(reader => ({ rows: reader.rows.bind(reader), normalize: reader.normalize.bind(reader), target: Object.freeze({ ...reader.target, columns: Object.freeze(reader.target.columns.map(c => Object.freeze({ ...c }))) }) }));
	if (new Set(readers.map(r => r.target.targetId)).size !== readers.length)
		throw new Error('Duplicate converted target');
	for (const { target } of readers) {
		if (!target.columns.length || new Set(target.columns.map(c => c.name)).size !== target.columns.length)
			throw new Error('Invalid converted schema');
	}
	const controller = new AbortController();
	const active = new Set<AsyncIterator<Readonly<Record<string, unknown>>>>();
	const closing = new WeakMap<object, Promise<unknown>>();
	const finish = (iterator: AsyncIterator<Readonly<Record<string, unknown>>>): Promise<unknown> => {
		let result = closing.get(iterator);
		if (!result) {
			result = Promise.resolve().then(() => iterator.return?.());
			closing.set(iterator, result);
		}
		return result;
	};
	let closed = false;
	const budget = options.budget ?? new DecoderBudget(options.memoryBudgetBytes);
	let cleanupPromise: Promise<void> | undefined;
	const held = new Set<() => void>();
	const reserve = (bytes: number) => {
		const release = budget.reserve(bytes);
		const tracked = () => {
			held.delete(tracked);
			release();
		};
		held.add(tracked);
		return tracked;
	};
	const cleanup = () => cleanupPromise ??= Promise.resolve().then(async () => {
		for (const release of held)
			release();
		await options.close?.();
	});
	const live = (signal?: AbortSignal): void => {
		if (closed)
			throw new Error('Converted source closed');
		signal?.throwIfAborted();
	};
	return {
		async targets() {
			live();
			return readers.map(r => r.target);
		},
		async describe(target) {
			live();
			return selectTargets(readers, target).map(r => r.target);
		},
		async *batches(target, signal): AsyncIterable<ConvertedBatch> {
			signal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
			try { live(signal); } catch(error) { closed=true;controller.abort();await cleanup();throw error; }
			for (const reader of selectTargets(readers, target)) {
				const version = schemaVersion(reader.target);
				let rows: Readonly<Record<string, unknown>>[] = [], bytes = 0;
				const reservations: (() => void)[] = [];
				const releaseBatch = () => {
					for (const release of reservations.splice(0))
						release();
				};
				const iterator = reader.rows(signal)[Symbol.asyncIterator]();
				active.add(iterator);
				try {
					for await (const raw of { [Symbol.asyncIterator]: () => iterator }) {
						live(signal);
						const estimate = 4 * (decodedValueBytes(raw, options.memoryBudgetBytes) + reader.target.columns.reduce((sum, c) => sum + c.name.length * 2 + 16, 24));
						if (estimate > options.memoryBudgetBytes)
							throw new Error('Decoded row exceeds memory budget');
						if (rows.length && (bytes + estimate > batchBytes || rows.length >= batchRows)) {
							yield { targetId: reader.target.targetId, schemaVersion: version, rows, byteSize: bytes };
							live(signal);
							releaseBatch();
							rows = [];
							bytes = 0;
						}
						const release = reserve(estimate);
						reservations.push(release);
						const normalized = reader.normalize(raw);
						const row: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
						for (const column of reader.target.columns) {
							const value = normalized[column.name] ?? null;
							if (value === null && !column.nullable)
								throw new Error('Null in required converted column');
							row[column.name] = value;
						}
						const size = decodedValueBytes(row, options.memoryBudgetBytes);
						if (size > estimate)
							reservations.push(reserve(size - estimate));
						if (size > options.memoryBudgetBytes)
							throw new Error('Decoded row exceeds memory budget');
						rows.push(row);
						bytes += Math.max(size, estimate);
					}
					if (rows.length) {
						live(signal);
						yield { targetId: reader.target.targetId, schemaVersion: version, rows, byteSize: bytes };
					}
				}
				catch (error) {
					closed = true;
					controller.abort();
					active.delete(iterator);
					await finish(iterator);
					for (const other of active)
						await finish(other);
					active.clear();
					await cleanup();
					throw error;
				}
				finally {
					releaseBatch();
					active.delete(iterator);
					await finish(iterator);
				}
			}
		},
		async close() {
			if (closed)
				return;
			closed = true;
			controller.abort();
			try {
				for (const iterator of active)
					await finish(iterator);
			}
			finally {
				active.clear();
				await cleanup();
			}
		},
	};
}
/** Used only when a caller requests the legacy all-target union. */
export function assertCompatibleTargets(targets: readonly ConvertedTarget[]): void {
	const expected = targets[0] === undefined ? undefined : JSON.stringify(targets[0].columns);
	for (const target of targets)
		if (JSON.stringify(target.columns) !== expected)
			throw new Error('Incompatible converted target schemas');
}
