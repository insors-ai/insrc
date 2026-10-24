/** Bounded worksheet readers and one normalization path for both output modes. */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DecoderBudget } from './decoder-budget.js';
import { BoundedWorkbook } from './xlsx-reader.js';
import { XlsxInference, coerceXlsxValue, slugifySheetName } from './xlsx-values.js';
import { convertedColumn } from './normalization.js';
import { createTypedRowSource, emptyColumn, assertCompatibleTargets } from './typed-row-source.js';
import type { TypedTargetReader } from './typed-row-source.js';
import { writeTypedParquet } from './typed-parquet.js';
import { runDirectoryConvert } from './shared.js';
import type { FileConverter, MemoryRowSource, MemorySourceOptions, ConvertResult, ConvertDirectoryOpts, ConvertDirectoryResult } from './types.js';
class XlsxConverter implements FileConverter {
	readonly kind = 'xlsx' as const;
	async openMemory(source: string, controls: MemorySourceOptions): Promise<MemoryRowSource> {
		const budget = controls.budget ?? new DecoderBudget(controls.memoryBudgetBytes);
		let workbook: BoundedWorkbook | undefined;
		const schemaReleases: (() => void)[] = [];
		try {
			controls.signal?.throwIfAborted();
			workbook = await BoundedWorkbook.open(source, budget);
			const owned = workbook, readers: TypedTargetReader[] = [];
			for (const sheet of workbook.sheets) {
				let names: string[] = [];
				let inferred: XlsxInference[] = [];
				for await (const row of workbook.rows(sheet, controls.signal)) {
					if (row.index === 1) {
						const last = Math.max(0, ...row.values.keys());
						for (let column = 1; column <= last; column++) {
							const name = String(row.values.get(column) ?? `col_${column}`);
							schemaReleases.push(budget.reserve(name.length * 2 + 256));
							names.push(name);
							inferred.push(new XlsxInference());
						}
						if (new Set(names).size !== names.length)
							throw new Error('Unsupported duplicate worksheet headers');
					}
					if (row.index >= 2 && row.index <= 51)
						for (let column = 0; column < names.length; column++)
							inferred[column]!.observe(row.values.get(column + 1));
				}
				const columns = names.length ? names.map((name, i) => convertedColumn(name, inferred[i]!.physicalType(), true, 'xlsx-scalar')) : [emptyColumn()];
				const targetId = slugifySheetName(sheet.name);
				readers.push({
					target: { targetId, sourceIdentity: workbook.zip.stamp.identity, worksheetName: sheet.name, worksheetSlug: targetId, columns },
					async *rows(signal) {
						const combined = controls.signal ? AbortSignal.any([controls.signal, ...(signal ? [signal] : [])]) : signal;
						if (!names.length)
							return;
						for await (const row of owned.rows(sheet, combined)) {
							if (row.index < 2)
								continue;
							const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
							let allNull = true;
							for (let index = 0; index < columns.length; index++) {
								const column = columns[index]!, value = coerceXlsxValue(row.values.get(index + 1), column.physicalType);
								out[column.name] = value;
								if (value !== null)
									allNull = false;
							}
							if (!allNull)
								yield out;
						}
					}, normalize: row => row,
				});
			}
			if (new Set(readers.map(r => r.target.targetId)).size !== readers.length)
				throw new Error('Unsupported ambiguous worksheet slugs');
			const close = async () => {
				for (const release of schemaReleases.splice(0))
					release();
				await owned.close();
			};
			const base = createTypedRowSource(readers, { memoryBudgetBytes: controls.memoryBudgetBytes, close });
			return {
				targets: () => base.targets(),
				async describe(target) {
					if (!target)
						assertCompatibleTargets(await base.targets());
					return base.describe(target || undefined);
				},
				async *batches(target, signal) {
					if (!target)
						assertCompatibleTargets(await base.targets());
					yield* base.batches(target || undefined, signal);
				},
				close: () => base.close(),
			};
		}
		catch (error) {
			for (const release of schemaReleases)
				release();
			await workbook?.close();
			if (error instanceof Error && ['resource-limit', 'unsupported-temporary', 'Source changed during conversion'].includes(error.message))
				throw error;
			throw new Error('Invalid or unsupported XLSX source');
		}
	}
	async convertFile(source: string, dest: string, _options?: Readonly<Record<string, unknown>>): Promise<ConvertResult> {
		const start = Date.now(), rows = await this.openMemory(source, { memoryBudgetBytes: 256 * 1024 * 1024 });
		try {
			await mkdir(dest, { recursive: true });
			let rowCount = 0;
			for (const target of await rows.targets())
				rowCount += await writeTypedParquet(rows, target.targetId, join(dest, `${target.worksheetSlug}.parquet`));
			return { destPath: dest, rowCount, durationMs: Date.now() - start };
		}
		finally {
			await rows.close();
		}
	}
	async convertDirectory(source: string, dest: string, opts: ConvertDirectoryOpts, options?: Readonly<Record<string, unknown>>): Promise<ConvertDirectoryResult> {
		const result = await runDirectoryConvert(source, dest, { ...opts, pattern: opts.pattern ?? '*.xlsx' }, this.kind, (s, d) => this.convertFile(s, d, options));
		return { ...result, parquetGlob: join(dest, '**', '*.parquet') };
	}
}
export const xlsxConverter: FileConverter = new XlsxConverter();
