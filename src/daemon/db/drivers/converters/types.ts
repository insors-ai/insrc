/**
 * Format-converter contract (Phase 2.1 of
 * plans/data-driver-duckdb-files.md).
 *
 * Each non-native file format (avro / bson / fixed-width / xlsx)
 * implements this interface to produce Parquet files DuckDB can
 * `read_parquet()`. The driver layer composes a converter with the
 * cache layer (Phase 3) so per-file work happens once and survives
 * across queries.
 *
 * Single-file vs directory: the same converter implements both. The
 * directory variant mirrors the source tree under the cache root so
 * DuckDB queries can use a glob that exactly matches the source
 * layout.
 */

export interface ConvertResult {
	readonly destPath: string;
	readonly rowCount: number;
	readonly durationMs: number;
}

export interface ConvertDirectoryResult {
	/** Glob string DuckDB's `read_parquet` reads: e.g.
	 *  `<cacheRoot>/*.parquet` or `<cacheRoot>/**\/*.parquet`. */
	readonly parquetGlob: string;
	readonly sourceCount: number;
	readonly durationMs: number;
}

export interface ConvertDirectoryOpts {
	readonly recursive: boolean;
	/** Optional basename glob (e.g. `*.bson`). */
	readonly pattern?: string;
}

export interface FileConverter {
	/** Format kind this converter handles -- used by the dispatch
	 *  layer in `daemon/db/drivers/duckdb-file.ts` to pick the right
	 *  converter for a connection's `kind`. */
	readonly kind: 'avro' | 'bson' | 'fixed-width' | 'xlsx';

	/**
	 * Convert one source file. Implementations should be idempotent
	 * with respect to the destination path: writing twice to the
	 * same path produces the same content (the cache layer treats
	 * destination existence + sidecar match as already-done).
	 */
	convertFile(
		source: string,
		dest: string,
		options?: Readonly<Record<string, unknown>>,
	): Promise<ConvertResult>;

	/**
	 * Convert a directory tree. Walks the source per `opts.recursive`
	 * + optional glob pattern, produces one Parquet per source file,
	 * mirrors the source structure under `destDir`. Returns a
	 * DuckDB-readable glob (`<destDir>/*.parquet` or
	 * `<destDir>/**\/*.parquet`).
	 *
	 * Per-file caching is handled by the cache layer wrapping the
	 * converter; this method walks + dispatches per file.
	 */
	convertDirectory(
		sourceDir: string,
		destDir: string,
		opts: ConvertDirectoryOpts,
		options?: Readonly<Record<string, unknown>>,
	): Promise<ConvertDirectoryResult>;
}
