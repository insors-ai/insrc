import type { ConvertedTarget, MemoryRowSource } from '../../shared/connection-management.js';
import type { FileConverter } from './drivers/converters/types.js';
import { schemaVersion } from './drivers/converters/typed-row-source.js';
import { DecoderBudget } from './drivers/converters/decoder-budget.js';
/** Directory inputs expose one internal catalog; external directory sheet selection stays unsupported. */
export async function memoryFileSources(converter: FileConverter, paths: readonly string[], budget: DecoderBudget, signal: AbortSignal, options?: Readonly<Record<string, unknown>>): Promise<MemoryRowSource> {
	if (!converter.openMemory)
		throw new Error('unsupported-temporary');
	if (paths.length === 1)
		return converter.openMemory(paths[0]!, { memoryBudgetBytes: budget.limit, budget, signal }, options);
	const entries: {
		target: ConvertedTarget;
		original: ConvertedTarget;
		path: string;
	}[] = [], releases: (() => void)[] = [], active = new Set<MemoryRowSource>();
	let closed = false;
	try {
		for (let index = 0; index < paths.length; index++) {
			signal.throwIfAborted();
			const path = paths[index]!, source = await converter.openMemory(path, { memoryBudgetBytes: budget.limit, budget, signal }, options);
			try {
				for (const original of await source.targets()) {
					releases.push(budget.reserve(JSON.stringify(original).length * 2 + 256));
					entries.push({ path, original, target: { ...original, targetId: `f${index}_${original.targetId}` } });
				}
			}
			finally {
				await source.close();
			}
		}
	}
	catch (error) {
		for (const release of releases)
			release();
		throw error;
	}
	const live = () => {
		if (closed)
			throw new Error('Converted source closed');
		signal.throwIfAborted();
	};
	return {
		async targets() {
			live();
			return entries.map(e => e.target);
		},
		async describe(target) {
			live();
			const found = target === undefined ? entries : entries.filter(e => e.target.targetId === target);
			if (target !== undefined && !found.length)
				throw new Error('Unknown converted target');
			return found.map(e => e.target);
		},
		async *batches(target, abort) {
			live();
			const selected = target === undefined ? entries : entries.filter(e => e.target.targetId === target);
			if (target !== undefined && !selected.length)
				throw new Error('Unknown converted target');
			for (const entry of selected) {
				live();
				const combined = abort ? AbortSignal.any([signal, abort]) : signal;
				const source = await converter.openMemory!(entry.path, { memoryBudgetBytes: budget.limit, budget, signal: combined }, options);
				active.add(source);
				try {
					const actual = (await source.targets()).find(t => t.targetId === entry.original.targetId);
					if (!actual || schemaVersion(actual) !== schemaVersion(entry.original))
						throw new Error('Source changed during conversion');
					for await (const batch of source.batches(entry.original.targetId, combined)) {
						live();
						if (batch.schemaVersion !== schemaVersion(entry.original))
							throw new Error('Converted schema version mismatch');
						yield { ...batch, targetId: entry.target.targetId, schemaVersion: schemaVersion(entry.target) };
					}
				}
				finally {
					active.delete(source);
					await source.close();
				}
			}
		},
		async close() {
			if (closed)
				return;
			closed = true;
			try {
				for (const source of active)
					await source.close();
			}
			finally {
				active.clear();
				for (const release of releases.splice(0))
					release();
			}
		},
	};
}
