/**
 * Shared helpers for KV drivers (Redis / Valkey / KeyDB, MongoDB,
 * Cassandra-as-KV, NATS JetStream KV, DynamoDB, etcd, Memcached).
 *
 * Each driver implements the scan / get / sampleShape contract in
 * its own idiomatic client; shared concerns here:
 *   - scan pattern / prefix validation against the connection's
 *     `namespace.allow` whitelist (if configured);
 *   - limit + wall-clock caps.
 *
 * Shape inference (`inferShape`) lives in `./shape-common.js` -- it
 * is now reused by RDBMS JSON-column inspection and file-format shape
 * sampling.
 */

import type {
	ConnectionConfig,
	ScanOpts,
} from '../../../shared/db-driver.js';

export const SCAN_LIMIT = 500;
export const SAMPLE_SHAPE_LIMIT = 50;
export const SCAN_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Namespace whitelist
// ---------------------------------------------------------------------------

/**
 * Reject scan opts whose pattern/prefix doesn't fall within any
 * allowed prefix. Each allowed entry is itself treated as a prefix
 * match (longest wins; we only care about "is the request inside?"
 * semantics).
 *
 * No whitelist configured -> permissive (pattern/prefix passes).
 * Pattern mode: the input's literal stem (anything before the first
 * wildcard) must start with one of the allowed prefixes.
 */
export function assertNamespaceAllowed(
	config: ConnectionConfig,
	opts: ScanOpts,
): void {
	const allow = config.namespace?.allow;
	if (allow === undefined || allow.length === 0) { return; }

	const stem = scanStem(opts);
	if (stem === null) {
		throw new Error(
			`data-driver: connection '${config.id}' has a namespace whitelist; ` +
			`pattern or prefix is required`,
		);
	}

	const ok = allow.some((a) => {
		const aStem = a.endsWith('*') ? a.slice(0, -1) : a;
		return stem.startsWith(aStem);
	});
	if (!ok) {
		throw new Error(
			`data-driver: scan pattern/prefix '${stem}' is outside the ` +
			`namespace whitelist for connection '${config.id}' ` +
			`(allowed: ${allow.join(', ')})`,
		);
	}
}

function scanStem(opts: ScanOpts): string | null {
	if (opts.prefix !== undefined) { return opts.prefix; }
	if (opts.pattern !== undefined) {
		const first = opts.pattern.search(/[*?[\\]/);
		return first < 0 ? opts.pattern : opts.pattern.slice(0, first);
	}
	return null;
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export function clampScanLimit(n: number): number {
	return Math.min(Math.max(1, Math.floor(n)), SCAN_LIMIT);
}

export function clampSampleShapeLimit(n: number): number {
	return Math.min(Math.max(1, Math.floor(n)), SAMPLE_SHAPE_LIMIT);
}

