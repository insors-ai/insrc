import { posix } from 'node:path';
import { BoundedZip } from './bounded-zip.js';
import { parseBoundedXml, parseBoundedXmlChunks } from './bounded-xml.js';
import type { XmlHandlers } from './bounded-xml.js';
import { DecoderBudget } from './decoder-budget.js';
export interface WorksheetTarget {
	readonly name: string;
	readonly path: string;
	readonly merges: Map<number, Map<number, string>>;
	readonly masters: Set<string>;
	readonly hyperlinks: Set<string>;
}
export interface WorksheetRow {
	readonly index: number;
	readonly values: ReadonlyMap<number, unknown>;
}
const local = (name: string) => name.split(':').at(-1)!;
const decoded = (text: string) => text.replace(/_x([0-9A-F]{4})_/g, (_all, hex: string) => String.fromCharCode(parseInt(hex, 16)));
function integer(raw: string | undefined, max: number): number {
	const n = Number(raw);
	if (!Number.isSafeInteger(n) || n < 0 || n > max)
		throw new Error('Invalid workbook index');
	return n;
}
function coordinate(ref: string): {
	row: number;
	column: number;
} {
	const match = /^([A-Z]{1,3})([1-9][0-9]*)$/.exec(ref);
	if (!match)
		throw new Error('Invalid worksheet coordinate');
	let column = 0;
	for (const char of match[1]!)
		column = column * 26 + char.charCodeAt(0) - 64;
	const row = integer(match[2], 1048576);
	if (column > 16384)
		throw new Error('resource-limit');
	return { row, column };
}
function dateFormat(format: string): boolean {
	return /[ymdhMsb]+/.test(format.replace(/\[[^\]]*]/g, '').replace(/"[^"]*"/g, ''));
}
export class BoundedWorkbook {
	readonly strings: unknown[] = [];
	readonly dateStyles: boolean[] = [];
	readonly sheets: WorksheetTarget[] = [];
	date1904 = false;
	#releases: (() => void)[] = [];
	private constructor(readonly zip: BoundedZip, readonly budget: DecoderBudget) {
	}
	#retain(bytes: number): void {
		this.#releases.push(this.budget.reserve(bytes));
	}
	async #xml(path: string, handlers: XmlHandlers): Promise<void> {
		const data = await this.zip.read(path);
		try {
			parseBoundedXml(data.bytes, this.budget, handlers);
		}
		finally {
			data.release();
		}
	}
	static async open(path: string, budget: DecoderBudget): Promise<BoundedWorkbook> {
		const workbook = new BoundedWorkbook(await BoundedZip.open(path, budget), budget);
		try {
			await workbook.#metadata();
			return workbook;
		}
		catch (error) {
			await workbook.close();
			throw error;
		}
	}
	async #metadata(): Promise<void> {
		const relations = new Map<string, string>();
		await this.#xml('xl/_rels/workbook.xml.rels', { open: tag => {
				if (local(tag.name) !== 'Relationship' || !tag.attributes.Type?.endsWith('/worksheet'))
					return;
				if (tag.attributes.TargetMode === 'External')
					throw new Error('unsupported-temporary');
				const id = tag.attributes.Id, target = tag.attributes.Target;
				if (!id || !target || relations.has(id))
					throw new Error('Invalid worksheet relationship');
				const path = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join('xl', target));
				if (!path.startsWith('xl/') || !this.zip.entries.some(e => e.name === path))
					throw new Error('Invalid worksheet relationship');
				this.#retain((id.length + path.length) * 2 + 128);
				relations.set(id, path);
			} });
		await this.#xml('xl/workbook.xml', { open: tag => {
				const name = local(tag.name);
				if (name === 'workbookPr')
					this.date1904 = ['1', 'true'].includes(tag.attributes.date1904 ?? '');
				if (name === 'sheet') {
					const sheetName = tag.attributes.name, path = relations.get(tag.attributes['r:id'] ?? '');
					if (!sheetName || !path)
						throw new Error('Invalid workbook sheet');
					if (this.sheets.length >= 1024 || this.sheets.some(sheet => sheet.name === sheetName || sheet.path === path))
						throw new Error('resource-limit');
					this.#retain(sheetName.length * 2 + 512);
					this.sheets.push({ name: sheetName, path, merges: new Map(), masters: new Set(), hyperlinks: new Set() });
				}
			} });
		if (this.zip.entries.some(e => e.name === 'xl/sharedStrings.xml')) {
			let text = '', textBytes = 0, inString = false, inText = false, rich = false;
			await this.#xml('xl/sharedStrings.xml', {
				open: tag => {
					const name = local(tag.name);
					if (name === 'si') {
						if (inString)
							throw new Error('unsupported-temporary');
						inString = true;
						textBytes = 0;
						text = '';
						rich = false;
					}
					if (name === 'r')
						rich = true;
					if (name === 't') {
						if (!inString || inText)
							throw new Error('unsupported-temporary');
						inText = true;
					}
				},
				text: value => {
					if (inText) {
						textBytes += Buffer.byteLength(value);
						if (textBytes > 64 * 1024)
							throw new Error('resource-limit');
						this.#retain(value.length * 2);
						text += value;
					}
				},
				close: tag => {
					const name = local(tag.name);
					if (name === 't')
						inText = false;
					if (name === 'si') {
						if (this.strings.length >= 262144)
							throw new Error('resource-limit');
						this.#retain(128);
						this.strings.push(rich ? { richText: true } : decoded(text));
						inString = false;
						textBytes = 0;
						text = '';
					}
				},
			});
		}
		if (this.zip.entries.some(e => e.name === 'xl/styles.xml')) {
			const formats = new Map<number, string>();
			let inCellXfs = false;
			await this.#xml('xl/styles.xml', { open: tag => {
					const name = local(tag.name);
					if (name === 'numFmt') {
						const id = integer(tag.attributes.numFmtId, 65535), format = tag.attributes.formatCode ?? '';
						this.#retain(format.length * 2 + 128);
						formats.set(id, format);
					}
					if (name === 'cellXfs')
						inCellXfs = true;
					if (name === 'xf' && inCellXfs) {
						if (this.dateStyles.length >= 65536)
							throw new Error('resource-limit');
						const id = integer(tag.attributes.numFmtId ?? '0', 65535);
						this.#retain(16);
						this.dateStyles.push(formats.has(id) ? dateFormat(formats.get(id)!) : (id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58));
					}
				}, close: tag => {
					if (local(tag.name) === 'cellXfs')
						inCellXfs = false;
				} });
		}
		let mergeCells = 0;
		for (const sheet of this.sheets) {
			await this.#xml(sheet.path, { open: tag => {
					const name = local(tag.name);
					if (name === 'hyperlink') {
						const ref = tag.attributes.ref;
						if (!ref)
							throw new Error('Invalid worksheet hyperlink');
						coordinate(ref);
						this.#retain(ref.length * 2 + 64);
						sheet.hyperlinks.add(ref);
					}
					if (name === 'mergeCell') {
						const range = (tag.attributes.ref ?? '').split(':');
						if (range.length !== 2)
							throw new Error('Invalid merged range');
						const start = coordinate(range[0]!), end = coordinate(range[1]!);
						if (end.row < start.row || end.column < start.column || (end.row - start.row + 1) * (end.column - start.column + 1) > 16384)
							throw new Error('resource-limit');
						const master = `${start.row}:${start.column}`;
						sheet.masters.add(master);
						for (let row = start.row; row <= end.row; row++)
							for (let column = start.column; column <= end.column; column++) {
								if (++mergeCells > 16384)
									throw new Error('resource-limit');
								let columns = sheet.merges.get(row);
								if (!columns) {
									columns = new Map();
									sheet.merges.set(row, columns);
								}
								if (columns.has(column))
									throw new Error('Invalid overlapping merges');
								this.#retain(128);
								columns.set(column, master);
							}
					}
				} });
		}
	}
	#cell(type: string, text: string, style: number, formula: boolean, rich: boolean): unknown {
		if (formula)
			return { formula: true };
		if (rich)
			return { richText: true };
		if (type === 's') {
			const index = integer(text, this.strings.length - 1);
			if (index >= this.strings.length)
				throw new Error('Invalid shared-string reference');
			return this.strings[index];
		}
		if (type === 'inlineStr' || type === 'str')
			return decoded(text);
		if (type === 'e')
			return { error: text };
		if (type === 'b')
			return text === '1';
		if (type === 'd') {
			const date = new Date(text);
			if (!Number.isFinite(date.getTime()))
				throw new Error('Invalid worksheet date');
			return date;
		}
		if (text === '')
			return null;
		const number = Number(text);
		if (!Number.isFinite(number))
			throw new Error('Invalid worksheet number');
		if (this.dateStyles[style])
			return new Date(Math.round((number - 25569 + (this.date1904 ? 1462 : 0)) * 86400000));
		return number;
	}
	async *rows(sheet: WorksheetTarget, signal?: AbortSignal): AsyncIterable<WorksheetRow> {
		const data = await this.zip.read(sheet.path);
		const pending: {
			row: WorksheetRow;
			release: () => void;
		}[] = [], masters = new Map<string, unknown>(), masterReleases: (() => void)[] = [];
		let rowIndex = 0, lastRow = 0, column = 0, type = '', style = 0, text = '', inValue = false, formula = false, rich = false, ref = '', values = new Map<number, unknown>();
		let rowOpen = false, cellOpen = false;
		let rowReleases: (() => void)[] = [];
		const releaseRow = () => {
			for (const release of rowReleases.splice(0))
				release();
		};
		const mergeRows = [...sheet.merges.keys()].sort((a, b) => a - b);
		let mergeIndex = 0, lastYield = 0;
		const merged = (index: number, cells: ReadonlyMap<number, unknown>): WorksheetRow => {
			const result = new Map(cells);
			for (const [col, master] of sheet.merges.get(index) ?? [])
				result.set(col, masters.get(master) ?? null);
			return { index, values: result };
		};
		try {
			const steps = parseBoundedXmlChunks(data.bytes, this.budget, {
				open: tag => {
					signal?.throwIfAborted();
					const name = local(tag.name);
					if (name === 'row') {
						if (rowOpen)
							throw new Error('Invalid worksheet row');
						rowOpen = true;
						rowIndex = integer(tag.attributes.r ?? String(lastRow + 1), 1048576);
						if (rowIndex <= lastRow || rowIndex === 0)
							throw new Error('Invalid worksheet row order');
						values = new Map();
						column = 0;
					}
					if (name === 'c') {
						if (!rowOpen || cellOpen)
							throw new Error('Invalid worksheet cell');
						cellOpen = true;
						const cell = tag.attributes.r ? coordinate(tag.attributes.r) : { row: rowIndex, column: column + 1 };
						if (cell.row !== rowIndex || values.has(cell.column))
							throw new Error('Invalid worksheet cell');
						column = cell.column;
						if (column > 16384)
							throw new Error('resource-limit');
						rowReleases.push(this.budget.reserve(256));
						type = tag.attributes.t ?? 'n';
						style = integer(tag.attributes.s ?? '0', 65535);
						text = '';
						formula = false;
						rich = false;
						ref = tag.attributes.r ?? '';
						if (!['n', 's', 'inlineStr', 'str', 'e', 'b', 'd'].includes(type))
							throw new Error('unsupported-temporary');
					}
					if (name === 'f')
						formula = true;
					if (name === 'r')
						rich = true;
					if (name === 'v' || name === 't')
						inValue = true;
				},
				text: value => {
					if (inValue) {
						rowReleases.push(this.budget.reserve(value.length * 2));
						text += value;
					}
				},
				close: tag => {
					const name = local(tag.name);
					if (name === 'v' || name === 't')
						inValue = false;
					if (name === 'c') {
						cellOpen = false;
						let value = this.#cell(type, text, style, formula, rich);
						if (sheet.hyperlinks.has(ref))
							value = { text: value, hyperlink: true };
						values.set(column, value);
						const key = `${rowIndex}:${column}`;
						if (sheet.masters.has(key)) {
							masterReleases.push(this.budget.reserve(typeof value === 'string' ? value.length * 2 + 128 : 128));
							masters.set(key, value);
						}
					}
					if (name === 'row') {
						rowOpen = false;
						const releases = rowReleases;
						rowReleases = [];
						pending.push({ row: { index: rowIndex, values }, release: () => {
								for (const release of releases)
									release();
							} });
						lastRow = rowIndex;
					}
				},
			});
			try {
				for (const step of steps) {
					void step;
					while (pending.length) {
						signal?.throwIfAborted();
						const current = pending.shift()!;
						try {
							while (mergeIndex < mergeRows.length && mergeRows[mergeIndex]! < current.row.index) {
								const index = mergeRows[mergeIndex++]!;
								if (index > lastYield) {
									yield merged(index, new Map());
									lastYield = index;
								}
							}
							yield merged(current.row.index, current.row.values);
							lastYield = current.row.index;
							while (mergeIndex < mergeRows.length && mergeRows[mergeIndex]! <= lastYield)
								mergeIndex++;
						}
						finally {
							current.release();
						}
					}
				}
			}
			finally {
				steps.return(undefined);
			}
			while (mergeIndex < mergeRows.length) {
				signal?.throwIfAborted();
				const index = mergeRows[mergeIndex++]!;
				if (index > lastYield)
					yield merged(index, new Map());
			}
		}
		finally {
			releaseRow();
			for (const current of pending)
				current.release();
			for (const release of masterReleases)
				release();
			data.release();
		}
	}
	async close(): Promise<void> {
		for (const release of this.#releases.splice(0))
			release();
		for (const sheet of this.sheets) {
			sheet.merges.clear();
			sheet.masters.clear();
			sheet.hyperlinks.clear();
		}
		this.sheets.length = 0;
		this.strings.length = 0;
		this.dateStyles.length = 0;
		await this.zip.close();
	}
}
