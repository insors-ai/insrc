/** Saved XLSX inference/coercion semantics, shared with private-memory decoding. */
export class XlsxInference {
	number = false;
	integer = true;
	boolean = false;
	date = false;
	string = false;
	observe(value: unknown): void {
		if (value === null || value === undefined)
			return;
		if (typeof value === 'number') {
			this.number = true;
			if (!Number.isInteger(value))
				this.integer = false;
		}
		else if (typeof value === 'boolean')
			this.boolean = true;
		else if (value instanceof Date)
			this.date = true;
		else
			this.string = true;
	}
	physicalType(): string {
		if (this.string)
			return 'UTF8';
		if (this.date && !this.number && !this.boolean)
			return 'TIMESTAMP_MILLIS';
		if (this.number && !this.boolean)
			return this.integer ? 'INT64' : 'DOUBLE';
		if (this.boolean && !this.number)
			return 'BOOLEAN';
		return 'UTF8';
	}
}
export function coerceXlsxValue(value: unknown, type: string): unknown {
	if (value === null || value === undefined)
		return null;
	switch (type) {
		case 'INT64': return typeof value === 'number' ? Math.round(value) : null;
		case 'DOUBLE': return typeof value === 'number' ? value : null;
		case 'BOOLEAN': return Boolean(value);
		case 'TIMESTAMP_MILLIS': return value instanceof Date ? value.getTime() : null;
		default: return value instanceof Date ? value.toISOString() : String(value);
	}
}
export function slugifySheetName(name: string): string {
	return name.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'sheet';
}
