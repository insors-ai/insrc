/**
 * Shared helpers for the file-family driver. Now that every file kind
 * flows through the consolidated DuckDB-backed driver
 * (`duckdb-file.ts`), this module only carries the row-limit cap.
 * Older helpers (`inferColumnTypes`, `rowMatchesWhere`,
 * `FILE_DESCRIBE_SAMPLE_ROWS`) lived here for the bespoke
 * per-format drivers and were dropped with them.
 */

export const FILE_SAMPLE_LIMIT = 50;
export const FILE_SAMPLE_TIMEOUT_MS = 5_000;

export function clampFileLimit(n: number): number {
	return Math.min(Math.max(1, Math.floor(n)), FILE_SAMPLE_LIMIT);
}
