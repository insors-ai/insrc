/**
 * Ambient module declaration for parquetjs-lite, which ships no
 * `@types/parquetjs-lite` package. We model only the slice of the
 * API the data driver uses (read-only ParquetReader + cursor +
 * schema accessor); writes are explicitly out of scope.
 */

declare module 'parquetjs-lite' {
	export interface ParquetCursor {
		next(): Promise<Record<string, unknown> | null>;
	}

	export interface ParquetSchemaField {
		readonly type?: string;
		readonly optional?: boolean;
		readonly repeated?: boolean;
	}

	export interface ParquetSchema {
		readonly fields: Record<string, ParquetSchemaField>;
	}

	export class ParquetReader {
		static openFile(path: string): Promise<ParquetReader>;
		getCursor(columnList?: readonly string[]): ParquetCursor;
		getSchema(): ParquetSchema;
		close(): Promise<void>;
	}
}
