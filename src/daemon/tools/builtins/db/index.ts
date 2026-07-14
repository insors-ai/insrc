/**
 * Data-driver tools: `db_list_connections` + `db:sql:*` + `db:kv:*`
 * + `db:file:*`.
 *
 * Each tool validates input shape, acquires a driver from the repo's
 * cached pool, dispatches to the matching method, and wraps the
 * result in a ToolResult with a markdown summary on `output` +
 * structured payload on `data`.
 *
 * Family mismatch (calling db:sql:* on a KV connection, etc.) errors
 * cleanly with a FAMILY_MISMATCH message that names the right tool
 * namespace -- the LLM retries with the correct call.
 *
 * Per-repo opt-in: `db:*` tools short-circuit to an
 * NO_CONNECTIONS_CONFIGURED error when the active repo has zero
 * entries in db-connections.json. The tools stay listed (so the LLM
 * can pick them up) but refuse to run until configured.
 */

import { getLogger } from '../../../../shared/logger.js';
import { registerTool } from '../../registry.js';
import type { Tool, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { acquirePool } from '../../../db/pool-cache.js';
import type {
	AggregateRequest,
	AggregateSpec,
	AntiJoinRequest,
	ConnectionConfig,
	CorrelationMatrixRequest,
	CorrelationMethod,
	DistinctRequest,
	Driver,
	FileDriver,
	FunctionalDependencyRequest,
	HistogramMode,
	HistogramRequest,
	KvDriver,
	DickeyFullerRequest,
	OutlierMethod,
	OutlierRequest,
	RdbmsDriver,
	SampleOpts,
	ScanOpts,
	TemporalGapStatsRequest,
	TemporalTrendRequest,
	TemporalTrendResult,
	WhereClause,
} from '../../../../shared/db-driver.js';
import type { AccessPolicy, AccessPolicyContext } from '../../../../shared/access.js';

const log = getLogger('tools-db');

// ---------------------------------------------------------------------------
// Access policies (plans/access-gate.md Phase 3)
// ---------------------------------------------------------------------------

/**
 * Connection-level access policy used by db_sql_* and db_kv_* tools.
 * Sync extractKey: the connection id IS the resource id for remote
 * RDBMS / KV connections; one approval per (kind: connection, key:
 * connectionId) covers describe / sample / explain / scan / get /
 * sample_shape across the same connection in the session.
 */
const CONNECTION_ACCESS: AccessPolicy = {
	kind: 'connection',
	extractKey: (input) => typeof input['connectionId'] === 'string'
		? (input['connectionId'] as string)
		: undefined,
	describe: (input) => `connection \`${String(input['connectionId'] ?? '?')}\``,
};

/**
 * Filesystem-level access policy used by db_file_* tools. Async
 * extractKey: the surface input is a connectionId, but the
 * underlying RESOURCE is a filesystem path. Resolve the connection
 * id to its `path` via the pool so the gate uses (kind: 'fs-path',
 * key: <absolute path>) -- shared with the file_* tools (one
 * approval covers either access method against the same path).
 *
 * Returns undefined when:
 *   - no connectionId in input,
 *   - no repoPath in ctx (test harness),
 *   - the connection isn't registered (acquireDriver will surface
 *     a clean error inside the tool body),
 *   - the connection's config has no `path` (kv / rdbms families).
 *     Those families shouldn't reach db_file_*; the executor
 *     short-circuits to NO_CONNECTIONS / FAMILY_MISMATCH below.
 */
async function fileAccessExtract(
	input: Record<string, unknown>,
	ctx: AccessPolicyContext,
): Promise<string | undefined> {
	const connectionId = input['connectionId'];
	if (typeof connectionId !== 'string' || connectionId.length === 0) return undefined;
	if (typeof ctx.repoPath !== 'string' || ctx.repoPath.length === 0) return undefined;
	try {
		const pool = await acquirePool(ctx.repoPath);
		const config = pool.list().find(c => c.id === connectionId);
		const p = config?.path;
		return typeof p === 'string' && p.length > 0 ? p : undefined;
	} catch {
		return undefined;
	}
}

const FILE_ACCESS: AccessPolicy = {
	kind: 'fs-path',
	extractKey: fileAccessExtract,
	describe: (input) => `file via connection \`${String(input['connectionId'] ?? '?')}\``,
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function fail(id: string, msg: string, code?: string): ToolResult {
	const body = code === undefined ? `[${id}] ${msg}` : `[${id}] ${code}: ${msg}`;
	return { output: body, format: 'text', success: false, error: msg };
}

function ok(
	output: string,
	data: unknown,
	format: ToolResult['format'] = 'markdown',
): ToolResult {
	return { output, format, success: true, data };
}

async function requireRepoPath(
	toolId: string,
	deps: ToolDeps,
): Promise<string | ToolResult> {
	const repoPath = deps.repoPath;
	if (repoPath === undefined || repoPath === '') {
		return fail(toolId, 'No active repo on the session; db:* tools need a repoPath', 'NO_ACTIVE_REPO');
	}
	return repoPath;
}

async function acquireDriver(
	toolId: string,
	deps: ToolDeps,
	connectionId: string,
	expected: 'rdbms' | 'kv' | 'file',
): Promise<Driver | ToolResult> {
	const repoPath = await requireRepoPath(toolId, deps);
	if (typeof repoPath !== 'string') { return repoPath; }

	const pool = await acquirePool(repoPath);
	const configured = pool.list();
	if (configured.length === 0) {
		return fail(
			toolId,
			'No data-driver connections configured for this repo. Use the Data Sources pane / insrc.addDbConnection to add one.',
			'NO_CONNECTIONS_CONFIGURED',
		);
	}
	const match = configured.find(c => c.id === connectionId);
	if (match === undefined) {
		return fail(
			toolId,
			`Unknown connection '${connectionId}'. Known: ${configured.map(c => c.id).join(', ') || '(none)'}`,
			'UNKNOWN_CONNECTION',
		);
	}
	if (match.family !== expected) {
		return fail(
			toolId,
			`Connection '${connectionId}' is ${match.family}; use db:${match.family}:* instead`,
			'FAMILY_MISMATCH',
		);
	}
	return await pool.acquire(connectionId);
}

function summariseConnections(conns: readonly ConnectionConfig[]): string {
	if (conns.length === 0) { return '(no connections configured)'; }
	const rows = ['| id | kind | family | label | path |', '|---|---|---|---|---|'];
	for (const c of conns) {
		rows.push(`| ${c.id} | ${c.kind} | ${c.family ?? '?'} | ${c.label ?? ''} | ${c.path ?? ''} |`);
	}
	return rows.join('\n');
}

// ---------------------------------------------------------------------------
// Schema snippets reused across tools
// ---------------------------------------------------------------------------

const CONNECTION_ID_PROP = {
	connectionId: {
		type: 'string',
		description: 'Connection id from `db_list_connections` (unique within the repo).',
	},
} as const;

const WHERE_SCHEMA = {
	type: 'array',
	maxItems: 10,
	items: {
		type: 'object',
		required: ['column', 'op'],
		additionalProperties: false,
		properties: {
			column:      { type: 'string' },
			op:          { type: 'string', enum: ['=', '!=', '<', '<=', '>', '>=', 'in', 'is null', 'is not null', 'between', 'like', 'not like'] },
			value:       {},
			valueColumn: { type: 'string', description: 'Compare to another column instead of a literal value (mutually exclusive with `value`).' },
		},
	},
} as const;

// ---------------------------------------------------------------------------
// db:list_connections
// ---------------------------------------------------------------------------

const listConnectionsTool: Tool = {
	id: 'db_list_connections',
	description:
		'List every data-driver connection configured for the active repo. ' +
		'Each entry: { id, kind, family, label, path? }. The `path` field is set ' +
		'for file-family connections (single file or directory-as-table); for ' +
		'rdbms / kv it is omitted. Use this first to discover which ' +
		'db:sql:* / db:kv:* / db:file:* calls are available and what connectionId to pass.',
	inputSchema: { type: 'object', additionalProperties: false, properties: {} },
	async execute(_input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const repoPath = await requireRepoPath(this.id, deps);
		if (typeof repoPath !== 'string') { return repoPath; }
		try {
			const pool = await acquirePool(repoPath);
			const list = pool.list();
			return ok(
				summariseConnections(list),
				list.map(c => ({
					id:     c.id,
					kind:   c.kind,
					family: c.family,
					label:  c.label,
					// `path` is meaningful for file-family connections
					// (single file or directory-as-table); included so the
					// data-analyzer's meta-skills can resolve question
					// targets like "/data/exports" to the right connection.
					// Omitted for non-file connections where path is undef.
					...(c.path !== undefined ? { path: c.path } : {}),
				})),
			);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:sql:describe + db:sql:sample
// ---------------------------------------------------------------------------

const sqlDescribeTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_describe',
	description:
		'Describe the schema of a single RDBMS table or view: columns + types + nullability + PK/FK. ' +
		'Accepts bare `table` or `schema.table`. Use this before db:sql:sample so the LLM can pick valid column names.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'target'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string', description: 'Table or view name, with optional schema (e.g. `public.users`).' },
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const target = String(input['target'] ?? '');
		if (connectionId === '' || target === '') {
			return fail(this.id, 'connectionId and target are required');
		}
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) { return driver; }
		try {
			const schema = await (driver as RdbmsDriver).describe(target);
			const rows = [
				`**${schema.target}** (${schema.source})`,
				'',
				'| column | type | nullable | pk | fk |',
				'|---|---|---|---|---|',
			];
			for (const c of schema.columns) {
				rows.push(
					`| ${c.name} | ${c.type} | ${c.nullable === true ? 'yes' : 'no'} ` +
					`| ${c.primaryKey === true ? 'yes' : ''} ` +
					`| ${c.foreignKey === undefined ? '' : `${c.foreignKey.table}.${c.foreignKey.column}`} |`,
				);
			}
			return ok(rows.join('\n'), schema);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const sqlExplainTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_explain',
	description:
		'Run EXPLAIN against a SELECT-shaped query on an RDBMS connection. ' +
		'Returns the dialect-native plan as a string. Same WHERE / target ' +
		'safety envelope as db:sql:sample (no raw SQL; column names ' +
		'validated against describe()). Limit clamped at 50.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'queryAst'],
		properties: {
			...CONNECTION_ID_PROP,
			queryAst: {
				type: 'object',
				required: ['kind', 'target'],
				additionalProperties: false,
				properties: {
					kind: { type: 'string', enum: ['select'] },
					target: { type: 'string' },
					where: WHERE_SCHEMA,
				},
			},
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') { return fail(this.id, 'connectionId is required'); }
		const rawAst = input['queryAst'];
		if (rawAst === null || typeof rawAst !== 'object') {
			return fail(this.id, 'queryAst must be an object');
		}
		const ast = rawAst as Record<string, unknown>;
		if (ast['kind'] !== 'select' || typeof ast['target'] !== 'string' || ast['target'] === '') {
			return fail(this.id, 'queryAst.kind must be "select" and target must be a non-empty string');
		}
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) { return driver; }
		const rdbms = driver as RdbmsDriver;
		if (rdbms.explain === undefined) {
			return fail(this.id, `Connection '${connectionId}' (${rdbms.kind}) does not implement explain`, 'UNSUPPORTED');
		}
		try {
			const opts = buildSampleOpts({ ...input, ...ast });
			const result = await rdbms.explain({
				kind: 'select',
				target: ast['target'],
				...(opts.where !== undefined ? { where: opts.where } : {}),
			});
			return ok('```\n' + result.plan + '\n```', result, 'markdown');
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const sqlSampleTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_sample',
	description:
		'Sample up to 50 rows from an RDBMS table / view with an optional WHERE filter. ' +
		'Raw SQL is never accepted; filters are structured { column, op, value } objects. ' +
		'Clamped at 50 rows + 5s wall-clock.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'target', 'limit'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string' },
			limit:  { type: 'integer', minimum: 1, maximum: 50 },
			where:  WHERE_SCHEMA,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const target = String(input['target'] ?? '');
		if (connectionId === '' || target === '') {
			return fail(this.id, 'connectionId and target are required');
		}
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) { return driver; }
		try {
			const opts = buildSampleOpts(input);
			const result = await (driver as RdbmsDriver).sample(target, opts);
			return ok(formatSample(result.target, result), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:sql:aggregate (Phase 0.1 of plans/analyzers/data-analyzer-skills.md)
// ---------------------------------------------------------------------------
//
// Family-5 quality / distribution / dependency skills will hallucinate
// numerical answers if asked to compute them in the LLM. This tool
// pushes aggregation to the engine and returns a flat numeric record
// the skill consumes verbatim. Server-side count / sum / avg / stddev
// / variance / min / max / percentile / count_non_null / distinct_count.
// Per-driver dialect handled by the existing driver dispatch.

const AGGREGATE_FUNCTION_ENUM = [
	'count', 'count_non_null', 'count_where',
	'distinct_count', 'composite_distinct_count',
	'sum', 'avg', 'stddev', 'variance',
	'skewness', 'kurtosis', 'mad',
	'min', 'max', 'percentile',
] as const;

const AGGREGATE_SPEC_SCHEMA = {
	type: 'object',
	required: ['column', 'function'],
	additionalProperties: false,
	properties: {
		column:   { type: 'string', description: 'Column to aggregate. Ignored by `count` (COUNT(*)) but still required so the result key is well-defined.' },
		function: { type: 'string', enum: AGGREGATE_FUNCTION_ENUM as readonly string[] },
		args: {
			type: 'object',
			additionalProperties: false,
			properties: {
				p:         { type: 'number', minimum: 0, maximum: 1, description: 'Percentile fraction in [0, 1]. Required when function = "percentile".' },
				predicate: { ...WHERE_SCHEMA, description: 'WhereClause[] predicate for function = "count_where".' },
				columns:   { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 10, description: 'Column list for function = "composite_distinct_count".' },
			},
		},
	},
} as const;

function buildAggregateRequest(input: ToolInput): AggregateRequest | string {
	const raw = input['aggregations'];
	if (!Array.isArray(raw) || raw.length === 0) {
		return '`aggregations` is required and must be a non-empty array';
	}
	const aggregations: AggregateSpec[] = [];
	for (const item of raw) {
		if (typeof item !== 'object' || item === null) {
			return 'each aggregation must be an object { column, function, args? }';
		}
		const obj = item as Record<string, unknown>;
		const column = obj['column'];
		const fn = obj['function'];
		if (typeof column !== 'string' || column.length === 0) {
			return 'each aggregation must include a non-empty `column` string';
		}
		if (typeof fn !== 'string' || !(AGGREGATE_FUNCTION_ENUM as readonly string[]).includes(fn)) {
			return `unknown aggregate function '${String(fn)}'; must be one of ${AGGREGATE_FUNCTION_ENUM.join(', ')}`;
		}
		const spec: { column: string; function: AggregateSpec['function']; args?: AggregateSpec['args'] } = { column, function: fn as AggregateSpec['function'] };
		const argsRaw = obj['args'];
		if (argsRaw !== undefined && argsRaw !== null) {
			if (typeof argsRaw !== 'object') {
				return '`args` must be an object when supplied';
			}
			const argsObj = argsRaw as Record<string, unknown>;
			const args: { p?: number; predicate?: WhereClause[]; columns?: string[] } = {};
			const p = argsObj['p'];
			if (p !== undefined) {
				if (typeof p !== 'number' || p < 0 || p > 1) {
					return '`args.p` must be a number in [0, 1]';
				}
				args.p = p;
			}
			const predicate = argsObj['predicate'];
			if (predicate !== undefined) {
				const parsed = parseWhereInput(predicate);
				if (parsed.length === 0) return '`args.predicate` must be a non-empty array of WhereClause objects';
				args.predicate = parsed;
			}
			const cols = argsObj['columns'];
			if (cols !== undefined) {
				if (!Array.isArray(cols) || cols.length < 2) return '`args.columns` must be an array with >= 2 entries';
				const out: string[] = [];
				for (const c of cols) {
					if (typeof c !== 'string' || c.length === 0) return 'each entry in `args.columns` must be a non-empty string';
					out.push(c);
				}
				args.columns = out;
			}
			if (Object.keys(args).length > 0) spec.args = args;
		}
		if (spec.function === 'percentile' && spec.args?.p === undefined) {
			return 'function "percentile" requires args.p in [0, 1]';
		}
		if (spec.function === 'count_where' && (spec.args?.predicate === undefined || spec.args.predicate.length === 0)) {
			return 'function "count_where" requires args.predicate (non-empty WhereClause[])';
		}
		if (spec.function === 'composite_distinct_count' && (spec.args?.columns === undefined || spec.args.columns.length < 2)) {
			return 'function "composite_distinct_count" requires args.columns with >= 2 entries';
		}
		aggregations.push(spec as AggregateSpec);
	}
	const where = parseWhereInput(input['where']);
	return where.length === 0 ? { aggregations } : { aggregations, where };
}

/**
 * Shared WHERE-clause parser. Tolerant of malformed entries (skipped
 * silently, matching `buildSampleOpts`'s shape) so a single-bad-clause
 * input doesn't blow up the rest. Caller decides whether to short-
 * circuit on an empty list.
 */
function parseWhereInput(raw: unknown): WhereClause[] {
	const out: WhereClause[] = [];
	if (!Array.isArray(raw)) return out;
	const allowedOps = new Set([
		'=', '!=', '<', '<=', '>', '>=', 'in', 'is null', 'is not null', 'between', 'like', 'not like',
	]);
	for (const item of raw) {
		if (item === null || typeof item !== 'object') continue;
		const r = item as Record<string, unknown>;
		const column = typeof r['column'] === 'string' ? r['column'] : '';
		const op = r['op'];
		if (column === '') continue;
		if (typeof op !== 'string' || !allowedOps.has(op)) continue;
		if (op === 'is null' || op === 'is not null') {
			out.push({ column, op } as WhereClause);
		} else {
			const clause: { column: string; op: typeof op; value?: unknown; valueColumn?: string } = { column, op };
			if (typeof r['valueColumn'] === 'string') clause.valueColumn = r['valueColumn'];
			else clause.value = r['value'];
			out.push(clause as WhereClause);
		}
	}
	return out;
}

function formatAggregateResult(target: string, values: Readonly<Record<string, number | string | null>>): string {
	const rows = [`**Aggregates for \`${target}\`**`, '', '| key | value |', '|---|---|'];
	for (const [k, v] of Object.entries(values)) {
		rows.push(`| ${k} | ${v === null ? '_(null)_' : String(v)} |`);
	}
	return rows.join('\n');
}

const sqlAggregateTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_aggregate',
	description:
		'Compute server-side numeric aggregates on an RDBMS table / view. Supports count / count_non_null / ' +
		'distinct_count / sum / avg / stddev / variance / min / max / percentile (args.p). Returns a flat ' +
		'`<column>__<function>` keyed record. Use this whenever a Family-5 (quality / distribution / ' +
		'dependency) skill needs a number: never compute aggregates client-side from a sample.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'target', 'aggregations'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string', description: 'Table or view name, with optional schema.' },
			aggregations: {
				type: 'array',
				minItems: 1,
				maxItems: 32,
				items: AGGREGATE_SPEC_SCHEMA,
			},
			where: WHERE_SCHEMA,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const target = String(input['target'] ?? '');
		if (connectionId === '' || target === '') {
			return fail(this.id, 'connectionId and target are required');
		}
		const reqOrErr = buildAggregateRequest(input);
		if (typeof reqOrErr === 'string') return fail(this.id, reqOrErr);
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) { return driver; }
		try {
			const result = await (driver as RdbmsDriver).aggregate(target, reqOrErr);
			return ok(formatAggregateResult(result.target, result.values), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:sql:distinct + db:file:distinct (Phase 0.3 of plans/analyzers/data-analyzer-skills.md)
// ---------------------------------------------------------------------------
//
// Top-N distinct values for one column plus its overall distinct
// cardinality. Drives the `data.source.rdbms.sample-distinct` skill
// and downstream Family-5 categorical-profile skills (5a.2, 5d.2).
// Server-side aggregation; never compute a top-N from row samples in
// the LLM.

const DISTINCT_TOP_N_DEFAULT = 20;
const DISTINCT_TOP_N_MAX     = 1000;

function buildDistinctRequest(input: ToolInput): DistinctRequest | string {
	const column = input['column'];
	if (typeof column !== 'string' || column.length === 0) {
		return '`column` is required and must be a non-empty string';
	}
	const rawTopN = input['topN'];
	let topN = DISTINCT_TOP_N_DEFAULT;
	if (rawTopN !== undefined) {
		if (typeof rawTopN !== 'number' || !Number.isFinite(rawTopN) || rawTopN < 1) {
			return '`topN` must be a positive integer';
		}
		topN = Math.min(Math.floor(rawTopN), DISTINCT_TOP_N_MAX);
	}
	return { column, topN };
}

function formatDistinctResult(
	target: string,
	column: string,
	distinctCount: number,
	topValues: readonly { value: unknown; count: number }[],
): string {
	const lines: string[] = [
		`**${target}** -- column \`${column}\``,
		'',
		`distinct values: **${distinctCount}**`,
		`top ${topValues.length}:`,
		'',
		'| value | count |',
		'|---|---|',
	];
	for (const v of topValues) {
		const rendered = v.value === null || v.value === undefined ? '_(null)_' : String(v.value);
		lines.push(`| ${rendered} | ${v.count} |`);
	}
	return lines.join('\n');
}

const sqlDistinctTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_distinct',
	description:
		'Top-N most-frequent distinct values for one RDBMS column, plus the column\'s overall distinct ' +
		'cardinality. Use this whenever a categorical-profile skill (5a.2, 5d.2) needs the value distribution. ' +
		'Order: count desc, value asc (deterministic). Default topN=20, max 1000.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'target', 'column'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string' },
			column: { type: 'string' },
			topN:   { type: 'integer', minimum: 1, maximum: DISTINCT_TOP_N_MAX, description: `Default ${DISTINCT_TOP_N_DEFAULT}.` },
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const target = String(input['target'] ?? '');
		if (connectionId === '' || target === '') {
			return fail(this.id, 'connectionId and target are required');
		}
		const reqOrErr = buildDistinctRequest(input);
		if (typeof reqOrErr === 'string') return fail(this.id, reqOrErr);
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) { return driver; }
		try {
			const result = await (driver as RdbmsDriver).distinct(target, reqOrErr);
			return ok(formatDistinctResult(result.target, result.column, result.distinctCount, result.topValues), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const fileDistinctTool: Tool = {
	access: FILE_ACCESS,
	id: 'db_file_distinct',
	description:
		'Top-N most-frequent distinct values for one column on a file connection. Same semantics as ' +
		'db_sql_distinct; routes through the consolidated DuckDB-backed file driver so it covers all 12 ' +
		'file kinds. Default topN=20, max 1000.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'column'],
		properties: {
			...CONNECTION_ID_PROP,
			path:   { type: 'string', description: 'Optional. xlsx: sheet name. Other kinds ignore it.' },
			column: { type: 'string' },
			topN:   { type: 'integer', minimum: 1, maximum: DISTINCT_TOP_N_MAX, description: `Default ${DISTINCT_TOP_N_DEFAULT}.` },
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') return fail(this.id, 'connectionId is required');
		const reqOrErr = buildDistinctRequest(input);
		if (typeof reqOrErr === 'string') return fail(this.id, reqOrErr);
		const driver = await acquireDriver(this.id, deps, connectionId, 'file');
		if (!isDriver(driver)) { return driver; }
		const fd = driver as FileDriver;
		if (typeof fd.distinct !== 'function') {
			return fail(
				this.id,
				`file driver '${fd.kind}' does not implement distinct(). Every supported file kind routes through the DuckDB-backed driver and exposes distinct; reaching this branch means an out-of-tree driver was registered.`,
			);
		}
		try {
			const path = typeof input['path'] === 'string' ? input['path'] : undefined;
			const result = await fd.distinct(path, reqOrErr);
			return ok(formatDistinctResult(result.target, result.column, result.distinctCount, result.topValues), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const fileListFilesTool: Tool = {
	access: FILE_ACCESS,
	id: 'db_file_list_files',
	description:
		'Enumerate the file paths a directory-connection points at. Respects the connection\'s `recursive` ' +
		'option (default false = top-level only). Returns paths relative to the connection root + per-file ' +
		'size + mtime. Hidden files (`.foo`) are skipped. For single-file connections, returns just that one ' +
		'file. Use this when a Family-1 source-introspection skill needs to enumerate the dataset before ' +
		'sampling.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId'],
		properties: {
			...CONNECTION_ID_PROP,
			limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'Max files to enumerate. Default 200.' },
			pattern: { type: 'string', description: 'Optional glob-style pattern (e.g. "*.csv") matched against the basename.' },
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') return fail(this.id, 'connectionId is required');
		const repoPath = await requireRepoPath(this.id, deps);
		if (typeof repoPath !== 'string') return repoPath;
		const pool = await acquirePool(repoPath);
		const config = pool.list().find(c => c.id === connectionId);
		if (config === undefined) {
			return fail(this.id, `Unknown connection '${connectionId}'`, 'UNKNOWN_CONNECTION');
		}
		if (config.family !== 'file' || config.path === undefined) {
			return fail(this.id, `Connection '${connectionId}' is not a file connection`, 'FAMILY_MISMATCH');
		}
		const limit = Math.min(Math.max(1, Math.floor(Number(input['limit'] ?? 200))), 1000);
		const pattern = typeof input['pattern'] === 'string' ? input['pattern'] : undefined;

		try {
			const { listFilesForConnection } = await import('../../../db/list-files.js');
			const result = await listFilesForConnection(config.path, {
				recursive: config.recursive === true,
				...(pattern !== undefined ? { pattern } : {}),
				limit,
			});
			const lines: string[] = [
				`**${connectionId}** -- ${result.files.length} file${result.files.length === 1 ? '' : 's'}` +
					(result.truncated ? ` (truncated at ${limit})` : ''),
				'',
				'| path | size | mtime |',
				'|---|---|---|',
			];
			for (const f of result.files) {
				lines.push(`| ${f.path} | ${f.size} | ${f.mtime} |`);
			}
			return ok(lines.join('\n'), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const fileAggregateTool: Tool = {
	access: FILE_ACCESS,
	id: 'db_file_aggregate',
	description:
		'Compute server-side numeric aggregates on a file connection. Covers every file kind the data-driver ' +
		'supports -- native (csv / tsv / jsonl / ndjson / json / parquet / arrow / feather) plus converted ' +
		'(avro / bson / fixed-width / xlsx, which stage through a Parquet cache). Aggregation runs in DuckDB, ' +
		'not the LLM. Same function set + result shape as db_sql_aggregate.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'aggregations'],
		properties: {
			...CONNECTION_ID_PROP,
			path: { type: 'string', description: 'Optional sub-path / sheet name. Most file kinds ignore this; multi-target kinds (xlsx) require it.' },
			aggregations: {
				type: 'array',
				minItems: 1,
				maxItems: 32,
				items: AGGREGATE_SPEC_SCHEMA,
			},
			where: WHERE_SCHEMA,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') return fail(this.id, 'connectionId is required');
		const reqOrErr = buildAggregateRequest(input);
		if (typeof reqOrErr === 'string') return fail(this.id, reqOrErr);
		const driver = await acquireDriver(this.id, deps, connectionId, 'file');
		if (!isDriver(driver)) { return driver; }
		const fd = driver as FileDriver;
		if (typeof fd.aggregate !== 'function') {
			return fail(
				this.id,
				`file driver '${fd.kind}' does not implement aggregate(). Every supported file kind routes through the DuckDB-backed driver and exposes aggregate; reaching this branch means an out-of-tree driver was registered.`,
			);
		}
		try {
			const path = typeof input['path'] === 'string' ? input['path'] : undefined;
			const result = await fd.aggregate(path, reqOrErr);
			return ok(formatAggregateResult(result.target, result.values), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:sql:list_tables + db:sql:list_indexes (Phase 1.1)
// ---------------------------------------------------------------------------

const sqlListTablesTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_list_tables',
	description:
		'Enumerate base tables + views on an RDBMS connection (excluding system schemas). Optional `schema` filter. ' +
		'Returns `{ target, tables: [{ name, schema, kind, approxRowCount? }], truncated }`. Default limit 500, capped at 5000.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId'],
		properties: {
			...CONNECTION_ID_PROP,
			schema: { type: 'string', description: 'Optional schema filter (Postgres/MSSQL/Oracle owners; MySQL databases).' },
			limit:  { type: 'integer', minimum: 1, maximum: 5000, description: 'Default 500.' },
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') return fail(this.id, 'connectionId is required');
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) return driver;
		const rd = driver as RdbmsDriver;
		if (typeof rd.listTables !== 'function') {
			return fail(this.id, `RDBMS driver '${rd.kind}' does not implement listTables() yet`);
		}
		try {
			const opts: { schema?: string; limit?: number } = {};
			if (typeof input['schema'] === 'string') opts.schema = input['schema'];
			if (typeof input['limit'] === 'number')  opts.limit = Math.floor(input['limit']);
			const result = await rd.listTables(opts);
			const lines: string[] = [
				`**${connectionId}** -- ${result.tables.length} table${result.tables.length === 1 ? '' : 's'}` +
				(result.truncated ? ' (truncated)' : ''),
			];
			if (result.tables.length > 0) {
				lines.push('', '| schema | name | kind |', '|---|---|---|');
				for (const t of result.tables) {
					lines.push(`| ${t.schema ?? ''} | ${t.name} | ${t.kind} |`);
				}
			}
			return ok(lines.join('\n'), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const sqlListIndexesTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_list_indexes',
	description:
		'List indexes on one RDBMS table: name + columns (in key order) + unique flag + primary-key flag. ' +
		'Useful for verifying that filter / join columns are indexed before recommending query rewrites.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'target'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string', description: 'Table identifier; `schema.table` accepted.' },
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const target = String(input['target'] ?? '');
		if (connectionId === '' || target === '') return fail(this.id, 'connectionId and target are required');
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) return driver;
		const rd = driver as RdbmsDriver;
		if (typeof rd.listIndexes !== 'function') {
			return fail(this.id, `RDBMS driver '${rd.kind}' does not implement listIndexes() yet`);
		}
		try {
			const result = await rd.listIndexes(target);
			const lines: string[] = [
				`**${target}** -- ${result.indexes.length} index${result.indexes.length === 1 ? '' : 'es'}`,
			];
			if (result.indexes.length > 0) {
				lines.push('', '| name | columns | unique | pk |', '|---|---|---|---|');
				for (const idx of result.indexes) {
					lines.push(`| ${idx.name} | ${idx.columns.join(', ')} | ${idx.unique ? 'yes' : 'no'} | ${idx.primaryKey ? 'yes' : 'no'} |`);
				}
			}
			return ok(lines.join('\n'), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:sql:anti_join (Phase 5c.5)
// ---------------------------------------------------------------------------

const sqlAntiJoinTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_anti_join',
	description:
		'Exact full-table orphan count for `left.col` values that have no match in `right.col`. ' +
		'Server-side NOT EXISTS anti-join -- no value-set cap, no truncation. Returns the count + ' +
		'up to N example orphan values. Same connection only; pass two table names that live on the same RDBMS connection.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'leftTarget', 'leftColumn', 'rightTarget', 'rightColumn'],
		properties: {
			...CONNECTION_ID_PROP,
			leftTarget:    { type: 'string' },
			leftColumn:    { type: 'string' },
			rightTarget:   { type: 'string' },
			rightColumn:   { type: 'string' },
			exampleLimit:  { type: 'integer', minimum: 0, maximum: 50, description: 'Default 5.' },
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const leftTarget = String(input['leftTarget'] ?? '');
		const leftColumn = String(input['leftColumn'] ?? '');
		const rightTarget = String(input['rightTarget'] ?? '');
		const rightColumn = String(input['rightColumn'] ?? '');
		if (connectionId === '' || leftTarget === '' || leftColumn === '' || rightTarget === '' || rightColumn === '') {
			return fail(this.id, 'connectionId, leftTarget, leftColumn, rightTarget, rightColumn are required');
		}
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) return driver;
		const rd = driver as RdbmsDriver;
		if (typeof rd.antiJoin !== 'function') {
			return fail(this.id, `RDBMS driver '${rd.kind}' does not implement antiJoin() yet`);
		}
		try {
			const req: AntiJoinRequest = typeof input['exampleLimit'] === 'number'
				? { leftTarget, leftColumn, rightTarget, rightColumn, exampleLimit: Math.floor(input['exampleLimit']) }
				: { leftTarget, leftColumn, rightTarget, rightColumn };
			const result = await rd.antiJoin(req);
			const lines: string[] = [
				`**${leftTarget}.${leftColumn}** -> **${rightTarget}.${rightColumn}**`,
				'',
				`orphan count: **${result.orphanCount}**`,
			];
			if (result.examples.length > 0) {
				lines.push('', '_orphan examples:_', ...result.examples.map(e => `- \`${String(e)}\``));
			}
			return ok(lines.join('\n'), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:sql:functional_dependency (Phase 5c.3)
// ---------------------------------------------------------------------------

const sqlFunctionalDependencyTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_functional_dependency',
	description:
		'Full-table functional-dependency check for one ordered (from, to) pair on an RDBMS table. Issues GROUP BY + COUNT(DISTINCT) ' +
		'queries to compute totalGroups / consistentGroups / informativeGroups / max+avg distinctTo / determinationScore + top-N violation examples. ' +
		'Use this when the precise full-table answer matters; the sample-based 5c.3 skill is the cheap default.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'target', 'fromColumn', 'toColumn'],
		properties: {
			...CONNECTION_ID_PROP,
			target:        { type: 'string' },
			fromColumn:    { type: 'string', description: 'Determinant column ("does this determine toColumn?").' },
			toColumn:      { type: 'string', description: 'Dependent column.' },
			topViolations: { type: 'integer', minimum: 1, maximum: 20, description: 'Default 3.' },
			where:         WHERE_SCHEMA,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const target = String(input['target'] ?? '');
		const fromColumn = String(input['fromColumn'] ?? '');
		const toColumn = String(input['toColumn'] ?? '');
		if (connectionId === '' || target === '' || fromColumn === '' || toColumn === '') {
			return fail(this.id, 'connectionId, target, fromColumn and toColumn are required');
		}
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) return driver;
		const rd = driver as RdbmsDriver;
		if (typeof rd.functionalDependency !== 'function') {
			return fail(this.id, `RDBMS driver '${rd.kind}' does not implement functionalDependency() yet`);
		}
		try {
			const where = parseWhereInput(input['where']);
			const req: FunctionalDependencyRequest = where.length === 0
				? (typeof input['topViolations'] === 'number'
					? { fromColumn, toColumn, topViolations: Math.floor(input['topViolations']) }
					: { fromColumn, toColumn })
				: (typeof input['topViolations'] === 'number'
					? { fromColumn, toColumn, topViolations: Math.floor(input['topViolations']), where }
					: { fromColumn, toColumn, where });
			const result = await rd.functionalDependency(target, req);
			const lines: string[] = [
				`**${target}** -- \`${fromColumn}\` -> \`${toColumn}\``,
				'',
				`totalGroups: ${result.totalGroups} | consistent: ${result.consistentGroups} | informative: ${result.informativeGroups}`,
				`maxDistinctTo: ${result.maxDistinctTo} | avgDistinctTo: ${result.avgDistinctTo.toFixed(2)} | determinationScore: ${result.determinationScore.toFixed(3)}`,
			];
			if (result.topViolations.length > 0) {
				lines.push('', '_top violations:_', '| from | distinct to | sample to-values |', '|---|---|---|');
				for (const v of result.topViolations) {
					lines.push(`| ${String(v.fromValue)} | ${v.distinctToCount} | ${v.toSample.map(s => String(s)).join(', ')} |`);
				}
			}
			return ok(lines.join('\n'), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:sql:histogram + db:file:histogram (Phase 0.2)
// ---------------------------------------------------------------------------

const HISTOGRAM_BUCKETS_DEFAULT = 20;
const HISTOGRAM_BUCKETS_MIN     = 4;
const HISTOGRAM_BUCKETS_MAX     = 200;

function buildHistogramRequest(input: ToolInput): HistogramRequest | string {
	const column = input['column'];
	if (typeof column !== 'string' || column.length === 0) {
		return '`column` is required and must be a non-empty string';
	}
	const rawBuckets = input['buckets'];
	let buckets = HISTOGRAM_BUCKETS_DEFAULT;
	if (rawBuckets !== undefined) {
		if (typeof rawBuckets !== 'number' || !Number.isFinite(rawBuckets)) {
			return '`buckets` must be an integer';
		}
		buckets = Math.min(Math.max(HISTOGRAM_BUCKETS_MIN, Math.floor(rawBuckets)), HISTOGRAM_BUCKETS_MAX);
	}
	const rawMode = input['mode'];
	let mode: HistogramMode = 'equal-width';
	if (rawMode !== undefined) {
		if (rawMode !== 'equal-width' && rawMode !== 'equal-frequency') {
			return '`mode` must be "equal-width" or "equal-frequency"';
		}
		mode = rawMode;
	}
	const where = parseWhereInput(input['where']);
	const out: HistogramRequest = where.length === 0
		? { column, buckets, mode }
		: { column, buckets, mode, where };
	return out;
}

function formatHistogramResult(target: string, column: string, mode: string, buckets: readonly { lower: number; upper: number; count: number }[], nonNullCount: number, nullCount: number): string {
	const lines: string[] = [
		`**${target}** -- column \`${column}\` (${mode}, ${buckets.length} buckets, n=${nonNullCount} non-null${nullCount > 0 ? `, ${nullCount} null` : ''})`,
		'',
		'| bucket | range | count |',
		'|---|---|---|',
	];
	for (let i = 0; i < buckets.length; i++) {
		const b = buckets[i]!;
		lines.push(`| ${i} | [${b.lower.toPrecision(6)}, ${b.upper.toPrecision(6)}${i === buckets.length - 1 ? ']' : ')'} | ${b.count} |`);
	}
	return lines.join('\n');
}

const HISTOGRAM_INPUT_PROPS = {
	column: { type: 'string', description: 'Numeric column to bucket.' },
	buckets: { type: 'integer', minimum: HISTOGRAM_BUCKETS_MIN, maximum: HISTOGRAM_BUCKETS_MAX, description: `Histogram bucket count. Default ${HISTOGRAM_BUCKETS_DEFAULT}.` },
	mode: { type: 'string', enum: ['equal-width', 'equal-frequency'], description: 'Default equal-width.' },
	where: WHERE_SCHEMA,
} as const;

const sqlHistogramTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_histogram',
	description:
		'Server-side histogram on a numeric RDBMS column. Equal-width uses min/max bounds + FLOOR arithmetic ' +
		'(works on every dialect); equal-frequency uses NTILE() OVER (ORDER BY col) (Postgres / DuckDB / SQLite>=3.25 / ' +
		'MySQL>=8 / MSSQL / Oracle). Default 20 buckets, capped at 200. ClickHouse not yet supported.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'target', 'column'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string' },
			...HISTOGRAM_INPUT_PROPS,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const target = String(input['target'] ?? '');
		if (connectionId === '' || target === '') return fail(this.id, 'connectionId and target are required');
		const reqOrErr = buildHistogramRequest(input);
		if (typeof reqOrErr === 'string') return fail(this.id, reqOrErr);
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) return driver;
		const rd = driver as RdbmsDriver;
		if (typeof rd.histogram !== 'function') {
			return fail(this.id, `RDBMS driver '${rd.kind}' does not implement histogram() yet`);
		}
		try {
			const result = await rd.histogram(target, reqOrErr);
			return ok(formatHistogramResult(result.target, result.column, result.mode, result.buckets, result.nonNullCount, result.nullCount), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const fileHistogramTool: Tool = {
	access: FILE_ACCESS,
	id: 'db_file_histogram',
	description:
		'Server-side histogram on a numeric column of a file connection. Same shape as db_sql_histogram; ' +
		'routes through the consolidated DuckDB-backed file driver (DuckDB has both equal-width arithmetic ' +
		'and NTILE).',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'column'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string', description: 'Optional. xlsx: sheet name.' },
			...HISTOGRAM_INPUT_PROPS,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') return fail(this.id, 'connectionId is required');
		const reqOrErr = buildHistogramRequest(input);
		if (typeof reqOrErr === 'string') return fail(this.id, reqOrErr);
		const driver = await acquireDriver(this.id, deps, connectionId, 'file');
		if (!isDriver(driver)) return driver;
		const fd = driver as FileDriver;
		if (typeof fd.histogram !== 'function') {
			return fail(this.id, `file driver '${fd.kind}' does not implement histogram(). All DuckDB-backed file kinds support it; reaching this branch means an out-of-tree driver was registered.`);
		}
		try {
			const target = typeof input['target'] === 'string' ? input['target'] : undefined;
			const result = await fd.histogram(target, reqOrErr);
			return ok(formatHistogramResult(result.target, result.column, result.mode, result.buckets, result.nonNullCount, result.nullCount), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:sql:correlation_matrix + db:file:correlation_matrix (Phase 0.4)
// ---------------------------------------------------------------------------

const CORRELATION_MAX_COLUMNS = 10;

function buildCorrelationRequest(input: ToolInput): CorrelationMatrixRequest | string {
	const cols = input['columns'];
	if (!Array.isArray(cols) || cols.length < 2) {
		return '`columns` is required and must be an array of at least 2 column names';
	}
	if (cols.length > CORRELATION_MAX_COLUMNS) {
		return `\`columns\` exceeds max ${CORRELATION_MAX_COLUMNS}`;
	}
	const columns: string[] = [];
	for (const c of cols) {
		if (typeof c !== 'string' || c.length === 0) return 'each entry in `columns` must be a non-empty string';
		columns.push(c);
	}
	const rawMethod = input['method'];
	let method: CorrelationMethod = 'pearson';
	if (rawMethod !== undefined) {
		if (rawMethod !== 'pearson' && rawMethod !== 'spearman') {
			return '`method` must be "pearson" or "spearman"';
		}
		method = rawMethod;
	}
	const where = parseWhereInput(input['where']);
	return where.length === 0 ? { columns, method } : { columns, method, where };
}

function formatCorrelationResult(target: string, columns: readonly string[], method: string, n: number, matrix: readonly (readonly (number | null)[])[]): string {
	const lines: string[] = [
		`**${target}** -- ${method} correlation, n=${n}`,
		'',
		`| | ${columns.join(' | ')} |`,
		`|---|${columns.map(() => '---').join('|')}|`,
	];
	for (let i = 0; i < columns.length; i++) {
		const row = matrix[i]!;
		const cells = row.map(v => v === null ? '_(null)_' : v.toFixed(3));
		lines.push(`| ${columns[i]} | ${cells.join(' | ')} |`);
	}
	return lines.join('\n');
}

const CORRELATION_INPUT_PROPS = {
	columns: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: CORRELATION_MAX_COLUMNS, description: 'Numeric columns to correlate pairwise.' },
	method: { type: 'string', enum: ['pearson', 'spearman'], description: 'Default pearson.' },
	where: WHERE_SCHEMA,
} as const;

const sqlCorrelationMatrixTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_correlation_matrix',
	description:
		'Pairwise correlation matrix for an RDBMS table. Pearson uses native CORR() on Postgres / Oracle / DuckDB; ' +
		'computed expression elsewhere. Spearman ranks each column with RANK() OVER (ORDER BY col) then correlates ' +
		'the ranks. Pairwise complete observations (rows where every requested column is non-null). Capped at 10 ' +
		'columns. ClickHouse not yet supported.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'target', 'columns'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string' },
			...CORRELATION_INPUT_PROPS,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const target = String(input['target'] ?? '');
		if (connectionId === '' || target === '') return fail(this.id, 'connectionId and target are required');
		const reqOrErr = buildCorrelationRequest(input);
		if (typeof reqOrErr === 'string') return fail(this.id, reqOrErr);
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) return driver;
		const rd = driver as RdbmsDriver;
		if (typeof rd.correlationMatrix !== 'function') {
			return fail(this.id, `RDBMS driver '${rd.kind}' does not implement correlationMatrix() yet`);
		}
		try {
			const result = await rd.correlationMatrix(target, reqOrErr);
			return ok(formatCorrelationResult(result.target, result.columns, result.method, result.nonNullCount, result.matrix), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const fileCorrelationMatrixTool: Tool = {
	access: FILE_ACCESS,
	id: 'db_file_correlation_matrix',
	description:
		'Pairwise correlation matrix for a file connection. Same shape as db_sql_correlation_matrix; routes ' +
		'through the consolidated DuckDB-backed file driver, which has native CORR() + RANK() window function.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'columns'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string', description: 'Optional. xlsx: sheet name.' },
			...CORRELATION_INPUT_PROPS,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') return fail(this.id, 'connectionId is required');
		const reqOrErr = buildCorrelationRequest(input);
		if (typeof reqOrErr === 'string') return fail(this.id, reqOrErr);
		const driver = await acquireDriver(this.id, deps, connectionId, 'file');
		if (!isDriver(driver)) return driver;
		const fd = driver as FileDriver;
		if (typeof fd.correlationMatrix !== 'function') {
			return fail(this.id, `file driver '${fd.kind}' does not implement correlationMatrix(). All DuckDB-backed file kinds support it; reaching this branch means an out-of-tree driver was registered.`);
		}
		try {
			const target = typeof input['target'] === 'string' ? input['target'] : undefined;
			const result = await fd.correlationMatrix(target, reqOrErr);
			return ok(formatCorrelationResult(result.target, result.columns, result.method, result.nonNullCount, result.matrix), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:sql:outliers + db:file:outliers (Phase 0.5)
// ---------------------------------------------------------------------------

const OUTLIER_EXAMPLES_DEFAULT = 20;
const OUTLIER_EXAMPLES_MAX     = 50;

function buildOutlierRequest(input: ToolInput): OutlierRequest | string {
	const column = input['column'];
	if (typeof column !== 'string' || column.length === 0) {
		return '`column` is required and must be a non-empty string';
	}
	const rawMethod = input['method'];
	let method: OutlierMethod = 'iqr';
	if (rawMethod !== undefined) {
		if (rawMethod !== 'iqr' && rawMethod !== 'zscore') {
			return '`method` must be "iqr" or "zscore"';
		}
		method = rawMethod;
	}
	const out: { column: string; method: OutlierMethod; threshold?: number; examples?: number; where?: WhereClause[] } = { column, method };
	const rawThreshold = input['threshold'];
	if (rawThreshold !== undefined) {
		if (typeof rawThreshold !== 'number' || !Number.isFinite(rawThreshold) || rawThreshold <= 0) {
			return '`threshold` must be a positive number';
		}
		out.threshold = rawThreshold;
	}
	const rawExamples = input['examples'];
	if (rawExamples !== undefined) {
		if (typeof rawExamples !== 'number' || !Number.isFinite(rawExamples) || rawExamples < 1) {
			return '`examples` must be a positive integer';
		}
		out.examples = Math.min(Math.floor(rawExamples), OUTLIER_EXAMPLES_MAX);
	}
	const where = parseWhereInput(input['where']);
	if (where.length > 0) out.where = where;
	return out as OutlierRequest;
}

function formatOutlierResult(
	target: string, column: string, method: string, threshold: number, n: number,
	below: number, above: number, total: number,
	lower: number | null, upper: number | null, center: number | null, spread: number | null,
	examples: readonly { value: number; side: string }[],
): string {
	const lines: string[] = [
		`**${target}** -- column \`${column}\` (${method}, threshold=${threshold}, n=${n})`,
		'',
		`outliers: **${total}** (below=${below}, above=${above})`,
		`bounds: lower=${lower === null ? '_(null)_' : lower.toPrecision(6)}, upper=${upper === null ? '_(null)_' : upper.toPrecision(6)}`,
		`center: ${center === null ? '_(null)_' : center.toPrecision(6)}, spread: ${spread === null ? '_(null)_' : spread.toPrecision(6)}`,
	];
	if (examples.length > 0) {
		lines.push('', '| value | side |', '|---|---|');
		for (const e of examples) lines.push(`| ${e.value.toPrecision(6)} | ${e.side} |`);
	}
	return lines.join('\n');
}

const OUTLIER_INPUT_PROPS = {
	column: { type: 'string', description: 'Numeric column to scan.' },
	method: { type: 'string', enum: ['iqr', 'zscore'], description: 'Default iqr.' },
	threshold: { type: 'number', exclusiveMinimum: 0, description: 'IQR multiplier (default 1.5) or zscore cutoff (default 3).' },
	examples: { type: 'integer', minimum: 1, maximum: OUTLIER_EXAMPLES_MAX, description: `Up to ${OUTLIER_EXAMPLES_MAX} example outlier values; default ${OUTLIER_EXAMPLES_DEFAULT}.` },
	where: WHERE_SCHEMA,
} as const;

const sqlOutliersTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_outliers',
	description:
		'Full-table outlier counts + examples for an RDBMS column. IQR: q1/q3 +/- threshold*(q3-q1). Z-score: ' +
		'avg +/- threshold*stddev. Two phases: bounds via aggregate, counts + ordered examples via SUM(CASE) + ' +
		'LIMIT. Replaces sample-based estimates in 5b.2 / 5b.3 outlier skills.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'target', 'column'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string' },
			...OUTLIER_INPUT_PROPS,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const target = String(input['target'] ?? '');
		if (connectionId === '' || target === '') return fail(this.id, 'connectionId and target are required');
		const reqOrErr = buildOutlierRequest(input);
		if (typeof reqOrErr === 'string') return fail(this.id, reqOrErr);
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) return driver;
		const rd = driver as RdbmsDriver;
		if (typeof rd.outliers !== 'function') {
			return fail(this.id, `RDBMS driver '${rd.kind}' does not implement outliers() yet`);
		}
		try {
			const r = await rd.outliers(target, reqOrErr);
			return ok(formatOutlierResult(r.target, r.column, r.method, r.threshold, r.nonNullCount, r.belowCount, r.aboveCount, r.outlierCount, r.lowerBound, r.upperBound, r.center, r.spread, r.examples), r);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const fileOutliersTool: Tool = {
	access: FILE_ACCESS,
	id: 'db_file_outliers',
	description:
		'Full-table outlier counts + examples for a file connection column. Same shape as db_sql_outliers.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'column'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string', description: 'Optional. xlsx: sheet name.' },
			...OUTLIER_INPUT_PROPS,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') return fail(this.id, 'connectionId is required');
		const reqOrErr = buildOutlierRequest(input);
		if (typeof reqOrErr === 'string') return fail(this.id, reqOrErr);
		const driver = await acquireDriver(this.id, deps, connectionId, 'file');
		if (!isDriver(driver)) return driver;
		const fd = driver as FileDriver;
		if (typeof fd.outliers !== 'function') {
			return fail(this.id, `file driver '${fd.kind}' does not implement outliers(). All DuckDB-backed file kinds support it; reaching this branch means an out-of-tree driver was registered.`);
		}
		try {
			const target = typeof input['target'] === 'string' ? input['target'] : undefined;
			const r = await fd.outliers(target, reqOrErr);
			return ok(formatOutlierResult(r.target, r.column, r.method, r.threshold, r.nonNullCount, r.belowCount, r.aboveCount, r.outlierCount, r.lowerBound, r.upperBound, r.center, r.spread, r.examples), r);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:sql:temporal_trend + db:file:temporal_trend (Phase 5g.1 substrate)
// ---------------------------------------------------------------------------

function buildTemporalTrendRequest(input: ToolInput): { request: TemporalTrendRequest; error?: undefined } | { error: string } {
	const timestampColumn = String(input['timestampColumn'] ?? '');
	const valueColumn     = String(input['valueColumn']     ?? '');
	if (timestampColumn === '' || valueColumn === '') {
		return { error: 'timestampColumn and valueColumn are required' };
	}
	const where = parseWhereInput(input['where']);
	const out: TemporalTrendRequest = where.length > 0
		? { timestampColumn, valueColumn, where }
		: { timestampColumn, valueColumn };
	return { request: out };
}

function formatTemporalTrendResult(r: TemporalTrendResult): string {
	const lines: string[] = [
		`**${r.target}** -- regress \`${r.valueColumn}\` on \`${r.timestampColumn}\` (n=${r.n})`,
		'',
		`slope: ${r.slope === null ? '_(null)_' : r.slope.toPrecision(6)} per second`,
		`slopePerDay: ${r.slopePerDay === null ? '_(null)_' : r.slopePerDay.toPrecision(6)}`,
		`intercept: ${r.intercept === null ? '_(null)_' : r.intercept.toPrecision(6)}`,
		`R²: ${r.r2 === null ? '_(null)_' : r.r2.toPrecision(4)}`,
	];
	if (r.minTimestampEpoch !== null && r.maxTimestampEpoch !== null) {
		lines.push(`time range: epoch ${r.minTimestampEpoch} .. ${r.maxTimestampEpoch}`);
	}
	return lines.join('\n');
}

const TEMPORAL_TREND_INPUT_PROPS = {
	timestampColumn: { type: 'string', description: 'Temporal column used as the X axis. Server converts to epoch-seconds via dialect-specific SQL.' },
	valueColumn:     { type: 'string', description: 'Numeric column used as the Y axis.' },
	where:           WHERE_SCHEMA,
} as const;

const sqlTemporalTrendTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_temporal_trend',
	description:
		'Server-side OLS regression of valueColumn on timestampColumn (Phase 5g.1 substrate). Returns slope ' +
		'(per second of epoch), slopePerDay (slope * 86400), intercept, R², n (count of non-null pairs), and ' +
		'min/max timestampEpoch. Postgres / DuckDB / Oracle use native REGR_SLOPE / REGR_INTERCEPT / REGR_R2; ' +
		'MySQL / SQLite / MSSQL pull SUM moments and the orchestrator computes slope/intercept/R² in JS. ' +
		'ClickHouse stub throws.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'target', 'timestampColumn', 'valueColumn'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string' },
			...TEMPORAL_TREND_INPUT_PROPS,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const target = String(input['target'] ?? '');
		if (connectionId === '' || target === '') return fail(this.id, 'connectionId and target are required');
		const reqOrErr = buildTemporalTrendRequest(input);
		if (reqOrErr.error !== undefined) return fail(this.id, reqOrErr.error);
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) return driver;
		const rd = driver as RdbmsDriver;
		if (typeof rd.temporalTrend !== 'function') {
			return fail(this.id, `RDBMS driver '${rd.kind}' does not implement temporalTrend() yet`);
		}
		try {
			const r = await rd.temporalTrend(target, reqOrErr.request);
			return ok(formatTemporalTrendResult(r), r);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const fileTemporalTrendTool: Tool = {
	access: FILE_ACCESS,
	id: 'db_file_temporal_trend',
	description:
		'Server-side OLS regression on a file connection (DuckDB-backed). Same shape as db_sql_temporal_trend ' +
		'with `path` for the optional xlsx sheet selector. DuckDB has native REGR_* aggregates so this always ' +
		'takes the native path.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'timestampColumn', 'valueColumn'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string', description: 'Optional. xlsx: sheet name.' },
			...TEMPORAL_TREND_INPUT_PROPS,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') return fail(this.id, 'connectionId is required');
		const reqOrErr = buildTemporalTrendRequest(input);
		if (reqOrErr.error !== undefined) return fail(this.id, reqOrErr.error);
		const driver = await acquireDriver(this.id, deps, connectionId, 'file');
		if (!isDriver(driver)) return driver;
		const fd = driver as FileDriver;
		if (typeof fd.temporalTrend !== 'function') {
			return fail(this.id, `file driver '${fd.kind}' does not implement temporalTrend(). All DuckDB-backed file kinds support it.`);
		}
		try {
			const target = typeof input['target'] === 'string' ? input['target'] : undefined;
			const r = await fd.temporalTrend(target, reqOrErr.request);
			return ok(formatTemporalTrendResult(r), r);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:sql:dickey_fuller (Phase 5g.3 substrate)
// ---------------------------------------------------------------------------

const sqlDickeyFullerTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_dickey_fuller',
	description:
		'Server-side Dickey-Fuller stationarity test (Phase 5g.3). Internally uses LAG window function in a ' +
		'CTE to materialise (y[t], y[t-1]) pairs ordered by timestampColumn, then aggregates the SUM moments ' +
		'needed to derive β + SE(β) + t-statistic for the regression Δy[t] = α + β·y[t-1] + ε. The skill ' +
		'compares t against MacKinnon critical values to verdict stationary vs non-stationary. Universally ' +
		'supported on dialects with CTE + LAG (PG / DuckDB / MySQL 8+ / SQLite >=3.25 / MSSQL / Oracle); ' +
		'ClickHouse stub throws.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'target', 'valueColumn', 'timestampColumn'],
		properties: {
			...CONNECTION_ID_PROP,
			target:          { type: 'string' },
			valueColumn:     { type: 'string' },
			timestampColumn: { type: 'string' },
			where:           WHERE_SCHEMA,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const target = String(input['target'] ?? '');
		const valueColumn = String(input['valueColumn'] ?? '');
		const timestampColumn = String(input['timestampColumn'] ?? '');
		if (connectionId === '' || target === '' || valueColumn === '' || timestampColumn === '') {
			return fail(this.id, 'connectionId, target, valueColumn, timestampColumn are required');
		}
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) return driver;
		const rd = driver as RdbmsDriver;
		if (typeof rd.dickeyFuller !== 'function') {
			return fail(this.id, `RDBMS driver '${rd.kind}' does not implement dickeyFuller() yet`);
		}
		const where = parseWhereInput(input['where']);
		const req: DickeyFullerRequest = where.length > 0
			? { valueColumn, timestampColumn, where }
			: { valueColumn, timestampColumn };
		try {
			const r = await rd.dickeyFuller(target, req);
			const lines: string[] = [
				`**${r.target}** -- Dickey-Fuller on \`${r.valueColumn}\` (sorted by \`${r.timestampColumn}\`, n=${r.n})`,
				'',
				`β = ${fmtNullable(r.beta)}`,
				`SE(β) = ${fmtNullable(r.seBeta)}`,
				`t-stat = ${fmtNullable(r.tStat)}`,
			];
			return ok(lines.join('\n'), r);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:sql:temporal_gap_stats (Phase 5g.4 substrate)
// ---------------------------------------------------------------------------

const sqlTemporalGapStatsTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_sql_temporal_gap_stats',
	description:
		'Server-side temporal gap statistics (Phase 5g.4). Two-phase protocol: (1) baseline aggregates ' +
		'count + median delta + min/max epoch via PERCENTILE_CONT over consecutive timestamp deltas ' +
		'(LAG window function); (2) bucket counts (regular = within ±50% of median, gap = > gapRatio ' +
		'× median) + top-N gap deltas. Returns medianDeltaSeconds + regularityScore + gapCount + topGaps. ' +
		'Universally supported on dialects with CTE + LAG + PERCENTILE_CONT; ClickHouse stub throws.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'target', 'timestampColumn'],
		properties: {
			...CONNECTION_ID_PROP,
			target:          { type: 'string' },
			timestampColumn: { type: 'string' },
			gapRatio:        { type: 'number', exclusiveMinimum: 1, description: 'Multiplier vs median for "gap" detection. Default 2.' },
			topGaps:         { type: 'integer', minimum: 1, maximum: 50, description: 'How many top gaps to return. Default 10.' },
			where:           WHERE_SCHEMA,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const target = String(input['target'] ?? '');
		const timestampColumn = String(input['timestampColumn'] ?? '');
		if (connectionId === '' || target === '' || timestampColumn === '') {
			return fail(this.id, 'connectionId, target, timestampColumn are required');
		}
		const driver = await acquireDriver(this.id, deps, connectionId, 'rdbms');
		if (!isDriver(driver)) return driver;
		const rd = driver as RdbmsDriver;
		if (typeof rd.temporalGapStats !== 'function') {
			return fail(this.id, `RDBMS driver '${rd.kind}' does not implement temporalGapStats() yet`);
		}
		const where = parseWhereInput(input['where']);
		const req: TemporalGapStatsRequest = {
			timestampColumn,
			...(where.length > 0 ? { where } : {}),
			...(typeof input['gapRatio'] === 'number' ? { gapRatio: input['gapRatio'] } : {}),
			...(typeof input['topGaps']  === 'number' ? { topGaps:  Math.floor(input['topGaps']) } : {}),
		};
		try {
			const r = await rd.temporalGapStats(target, req);
			const lines: string[] = [
				`**${r.target}** -- gap stats on \`${r.timestampColumn}\` (n=${r.n})`,
				'',
				`median Δ: ${r.medianDeltaSeconds === null ? '_(null)_' : `${r.medianDeltaSeconds.toPrecision(6)}s`}`,
				`regularity: ${r.regularityScore === null ? '_(null)_' : (r.regularityScore * 100).toFixed(1) + '%'}`,
				`gap count: ${r.gapCount}`,
			];
			if (r.topGaps.length > 0) {
				lines.push('', '| from epoch | to epoch | Δs | ratio |', '|---|---|---|---|');
				for (const g of r.topGaps) {
					lines.push(`| ${g.fromEpoch} | ${g.toEpoch} | ${g.deltaSeconds.toPrecision(4)} | ${g.ratio.toPrecision(4)} |`);
				}
			}
			return ok(lines.join('\n'), r);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

function fmtNullable(v: number | null): string {
	if (v === null || !Number.isFinite(v)) return '_(null)_';
	return v.toPrecision(6);
}

// ---------------------------------------------------------------------------
// db:kv:list_namespaces + db:kv:describe_namespace (Phase 0.7 + 0.8)
// ---------------------------------------------------------------------------

const kvListNamespacesTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_kv_list_namespaces',
	description:
		'Enumerate top-level namespaces on a KV connection: Mongo collections (`<db>.<coll>`), Cassandra tables ' +
		'(`<keyspace>.<table>`), DynamoDB tables, NATS KV bucket, Redis / etcd scan-derived prefixes. Returns ' +
		'`supported: false` for stores without a namespace concept (memcached). Required by Phase 1.2 ' +
		'source-introspection skills.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId'],
		properties: {
			...CONNECTION_ID_PROP,
			limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'Max namespaces to return; default 200.' },
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') return fail(this.id, 'connectionId is required');
		const driver = await acquireDriver(this.id, deps, connectionId, 'kv');
		if (!isDriver(driver)) return driver;
		const kd = driver as KvDriver;
		if (typeof kd.listNamespaces !== 'function') {
			return fail(this.id, `KV driver '${kd.kind}' does not implement listNamespaces() yet`);
		}
		try {
			const limit = typeof input['limit'] === 'number' ? Math.floor(input['limit']) : undefined;
			const result = await kd.listNamespaces(limit !== undefined ? { limit } : undefined);
			const lines: string[] = [
				`**${connectionId}** -- ${result.namespaces.length} namespace${result.namespaces.length === 1 ? '' : 's'}` +
					(result.truncated ? ' (truncated)' : '') +
					(result.supported ? '' : ' (driver does not expose namespaces)'),
			];
			if (result.namespaces.length > 0) {
				lines.push('', '| name | kind | approx count |', '|---|---|---|');
				for (const ns of result.namespaces) {
					lines.push(`| ${ns.name} | ${ns.kind ?? ''} | ${ns.approxCount ?? ''} |`);
				}
			}
			return ok(lines.join('\n'), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const kvDescribeNamespaceTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_kv_describe_namespace',
	description:
		'Shape + sample keys for one KV namespace. For Mongo / Cassandra / DynamoDB returns the engine\'s ' +
		'native schema info; for Redis / etcd / NATS samples values under the namespace prefix and infers ' +
		'a JSON shape. Pairs with db_kv_list_namespaces.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'namespace'],
		properties: {
			...CONNECTION_ID_PROP,
			namespace: { type: 'string' },
			sampleSize: { type: 'integer', minimum: 1, maximum: 200, description: 'Sample size for shape inference; default 50.' },
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		const namespace = String(input['namespace'] ?? '');
		if (connectionId === '' || namespace === '') return fail(this.id, 'connectionId and namespace are required');
		const driver = await acquireDriver(this.id, deps, connectionId, 'kv');
		if (!isDriver(driver)) return driver;
		const kd = driver as KvDriver;
		if (typeof kd.describeNamespace !== 'function') {
			return fail(this.id, `KV driver '${kd.kind}' does not implement describeNamespace() yet`);
		}
		try {
			const sampleSize = typeof input['sampleSize'] === 'number' ? Math.floor(input['sampleSize']) : undefined;
			const result = await kd.describeNamespace(namespace, sampleSize !== undefined ? { sampleSize } : undefined);
			const lines: string[] = [
				`**${namespace}** (${result.kind ?? 'namespace'})` + (result.supported ? '' : ' -- driver does not expose namespace shape'),
				`approxCount: ${result.approxCount ?? '_(unknown)_'}`,
			];
			if (result.sampleKeys.length > 0) {
				lines.push('', '_sample keys_:', ...result.sampleKeys.map(k => `- \`${k}\``));
			}
			if (result.fields.length > 0) {
				lines.push('', '| path | types | nullable | freq |', '|---|---|---|---|');
				for (const f of result.fields) {
					lines.push(`| ${f.path} | ${f.types.join(', ')} | ${f.nullable ? 'yes' : 'no'} | ${(f.frequency * 100).toFixed(0)}% |`);
				}
			}
			return ok(lines.join('\n'), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:kv:scan + db:kv:get + db:kv:sample_shape
// ---------------------------------------------------------------------------

const kvScanTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_kv_scan',
	description:
		'List keys on a KV connection (redis / valkey / keydb / mongodb / cassandra / nats). ' +
		'Supply either `pattern` (glob / subject-wildcard per kind) or `prefix`. ' +
		'Clamped at 500 keys + 5s wall-clock. Respects the connection\'s namespace.allow whitelist.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'limit'],
		properties: {
			...CONNECTION_ID_PROP,
			pattern: { type: 'string' },
			prefix:  { type: 'string' },
			limit:   { type: 'integer', minimum: 1, maximum: 500 },
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') { return fail(this.id, 'connectionId is required'); }
		const driver = await acquireDriver(this.id, deps, connectionId, 'kv');
		if (!isDriver(driver)) { return driver; }
		try {
			const result = await (driver as KvDriver).scan(buildScanOpts(input));
			const summary =
				`${result.keys.length} keys${result.truncated ? ' (truncated)' : ''}` +
				(result.keys.length === 0
					? ''
					: '\n\n' + result.keys.slice(0, 50).map(k => `- ${keyToString(k)}`).join('\n'));
			return ok(summary, result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const kvGetTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_kv_get',
	description:
		'Read a single key from a KV connection. For string-key stores (redis / valkey / nats) ' +
		'pass `key` as a string; for composite-key stores (mongodb: {db, collection, _id}; ' +
		'cassandra: {keyspace, table, ...pkCols}) pass `key` as an object.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'key'],
		properties: {
			...CONNECTION_ID_PROP,
			key: {
				anyOf: [
					{ type: 'string' },
					{ type: 'object' },
				],
			},
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') { return fail(this.id, 'connectionId is required'); }
		const rawKey = input['key'];
		if (rawKey === undefined || rawKey === null) { return fail(this.id, 'key is required'); }
		const driver = await acquireDriver(this.id, deps, connectionId, 'kv');
		if (!isDriver(driver)) { return driver; }
		try {
			const result = await (driver as KvDriver).get(
				rawKey as string | Readonly<Record<string, unknown>>,
			);
			const preview = JSON.stringify(result.value, null, 2) ?? 'null';
			const summary = `**${keyToString(result.key)}** (${result.type})\n\n\`\`\`json\n${preview.slice(0, 2_000)}\n\`\`\``;
			return ok(summary, result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const kvSampleShapeTool: Tool = {
	access: CONNECTION_ACCESS,
	id: 'db_kv_sample_shape',
	description:
		'Infer the shape (field names + observed types + nullability + frequency) of values ' +
		'under a pattern or prefix on a KV connection. Samples at most 50 values + 5s wall-clock.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'limit'],
		properties: {
			...CONNECTION_ID_PROP,
			pattern: { type: 'string' },
			prefix:  { type: 'string' },
			limit:   { type: 'integer', minimum: 1, maximum: 50 },
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') { return fail(this.id, 'connectionId is required'); }
		const driver = await acquireDriver(this.id, deps, connectionId, 'kv');
		if (!isDriver(driver)) { return driver; }
		try {
			const result = await (driver as KvDriver).sampleShape(buildScanOpts(input));
			const rows = [
				`sampled ${result.sampleSize} values`,
				'',
				'| path | types | nullable | frequency |',
				'|---|---|---|---|',
			];
			for (const f of result.fields) {
				rows.push(`| ${f.path} | ${f.types.join(', ')} | ${f.nullable ? 'yes' : 'no'} | ${(f.frequency * 100).toFixed(0)}% |`);
			}
			return ok(rows.join('\n'), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// db:file:describe + db:file:sample + db:file:sample_shape
// ---------------------------------------------------------------------------

const fileDescribeTool: Tool = {
	access: FILE_ACCESS,
	id: 'db_file_describe',
	description:
		'Describe the inferred / embedded schema of a tabular file connection ' +
		'(csv / tsv / jsonl / xlsx / avro / arrow / bson / fixed-width). ' +
		'For xlsx / multi-target files, supply `target` = sheet name.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string', description: 'For multi-target files (xlsx sheets).' },
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') { return fail(this.id, 'connectionId is required'); }
		const driver = await acquireDriver(this.id, deps, connectionId, 'file');
		if (!isDriver(driver)) { return driver; }
		const fd = driver as FileDriver;
		if (fd.describe === undefined) {
			return fail(this.id, `Connection '${connectionId}' (${fd.kind}) does not support describe; try db:file:sample_shape`);
		}
		try {
			const target = typeof input['target'] === 'string' ? input['target'] : undefined;
			const schema = target === undefined
				? await fd.describe()
				: await fd.describe(target);
			const rows = [
				`**${schema.target}** (${schema.source})`,
				'',
				'| column | type | nullable |',
				'|---|---|---|',
			];
			for (const c of schema.columns) {
				rows.push(`| ${c.name} | ${c.type} | ${c.nullable === true ? 'yes' : 'no'} |`);
			}
			return ok(rows.join('\n'), schema);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const fileSampleTool: Tool = {
	access: FILE_ACCESS,
	id: 'db_file_sample',
	description:
		'Sample up to 50 records from a file connection with an optional WHERE filter. ' +
		'Clamped at 50 rows + 5s wall-clock.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'limit'],
		properties: {
			...CONNECTION_ID_PROP,
			target: { type: 'string' },
			limit:  { type: 'integer', minimum: 1, maximum: 50 },
			where:  WHERE_SCHEMA,
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') { return fail(this.id, 'connectionId is required'); }
		const driver = await acquireDriver(this.id, deps, connectionId, 'file');
		if (!isDriver(driver)) { return driver; }
		const fd = driver as FileDriver;
		if (fd.sample === undefined) {
			return fail(this.id, `Connection '${connectionId}' (${fd.kind}) does not support row-sample; try db:file:sample_shape`);
		}
		try {
			const target = typeof input['target'] === 'string' ? input['target'] : undefined;
			const opts = buildSampleOpts(input);
			const result = await fd.sample(target, opts);
			return ok(formatSample(result.target, result), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

const fileSampleShapeTool: Tool = {
	access: FILE_ACCESS,
	id: 'db_file_sample_shape',
	description:
		'Infer the shape of records in a document-style file connection (e.g. single-doc JSON, nested fields). ' +
		'Clamped at 50 records + 5s wall-clock.',
	inputSchema: {
		type: 'object',
		additionalProperties: false,
		required: ['connectionId', 'limit'],
		properties: {
			...CONNECTION_ID_PROP,
			pattern: { type: 'string' },
			prefix:  { type: 'string' },
			limit:   { type: 'integer', minimum: 1, maximum: 50 },
		},
	},
	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		const connectionId = String(input['connectionId'] ?? '');
		if (connectionId === '') { return fail(this.id, 'connectionId is required'); }
		const driver = await acquireDriver(this.id, deps, connectionId, 'file');
		if (!isDriver(driver)) { return driver; }
		const fd = driver as FileDriver;
		if (fd.sampleShape === undefined) {
			return fail(this.id, `Connection '${connectionId}' (${fd.kind}) does not support sample_shape; try db:file:describe`);
		}
		try {
			const result = await fd.sampleShape(buildScanOpts(input));
			const rows = [
				`sampled ${result.sampleSize} records`,
				'',
				'| path | types | nullable | frequency |',
				'|---|---|---|---|',
			];
			for (const f of result.fields) {
				rows.push(`| ${f.path} | ${f.types.join(', ')} | ${f.nullable ? 'yes' : 'no'} | ${(f.frequency * 100).toFixed(0)}% |`);
			}
			return ok(rows.join('\n'), result);
		} catch (err) {
			return fail(this.id, (err as Error).message);
		}
	},
};

// ---------------------------------------------------------------------------
// Input adapters
// ---------------------------------------------------------------------------

function buildSampleOpts(input: ToolInput): SampleOpts {
	const limit = Math.min(Math.max(1, Number(input['limit'] ?? 10)), 50);
	const where = parseWhereInput(input['where']);
	return where.length === 0 ? { limit } : { limit, where };
}

function buildScanOpts(input: ToolInput): ScanOpts {
	const limit = Math.min(Math.max(1, Number(input['limit'] ?? 50)), 500);
	const pattern = typeof input['pattern'] === 'string' ? input['pattern'] : undefined;
	const prefix  = typeof input['prefix']  === 'string' ? input['prefix']  : undefined;
	return pattern !== undefined
		? { limit, pattern }
		: prefix !== undefined
			? { limit, prefix }
			: { limit };
}

function isDriver(v: Driver | ToolResult): v is Driver {
	return (v as Driver).family !== undefined;
}

function keyToString(key: string | Readonly<Record<string, unknown>>): string {
	return typeof key === 'string' ? key : JSON.stringify(key);
}

function formatSample(target: string, result: { columns: readonly string[]; rows: readonly Readonly<Record<string, unknown>>[]; truncated: boolean }): string {
	if (result.rows.length === 0) {
		return `**${target}** — no rows${result.truncated ? ' (truncated)' : ''}`;
	}
	const header = `| ${result.columns.join(' | ')} |`;
	const sep = `| ${result.columns.map(() => '---').join(' | ')} |`;
	const rows = result.rows.map(r =>
		`| ${result.columns.map(c => fmtCell(r[c])).join(' | ')} |`,
	);
	return `**${target}**${result.truncated ? ' (truncated)' : ''}\n\n${header}\n${sep}\n${rows.join('\n')}`;
}

function fmtCell(v: unknown): string {
	if (v === null || v === undefined) { return ''; }
	if (typeof v === 'string') { return v.length > 200 ? v.slice(0, 200) + '…' : v; }
	if (typeof v === 'number' || typeof v === 'boolean') { return String(v); }
	if (typeof v === 'bigint') { return v.toString(); }
	if (v instanceof Date) { return v.toISOString(); }
	const s = JSON.stringify(v);
	return s.length > 200 ? s.slice(0, 200) + '…' : s;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerDbTools(): void {
	registerTool(listConnectionsTool);
	registerTool(sqlDescribeTool);
	registerTool(sqlSampleTool);
	registerTool(sqlExplainTool);
	registerTool(sqlAggregateTool);
	registerTool(sqlDistinctTool);
	registerTool(sqlListTablesTool);
	registerTool(sqlListIndexesTool);
	registerTool(sqlFunctionalDependencyTool);
	registerTool(sqlAntiJoinTool);
	registerTool(sqlHistogramTool);
	registerTool(sqlCorrelationMatrixTool);
	registerTool(sqlOutliersTool);
	registerTool(sqlTemporalTrendTool);
	registerTool(sqlDickeyFullerTool);
	registerTool(sqlTemporalGapStatsTool);
	registerTool(kvScanTool);
	registerTool(kvGetTool);
	registerTool(kvSampleShapeTool);
	registerTool(kvListNamespacesTool);
	registerTool(kvDescribeNamespaceTool);
	registerTool(fileDescribeTool);
	registerTool(fileSampleTool);
	registerTool(fileSampleShapeTool);
	registerTool(fileAggregateTool);
	registerTool(fileDistinctTool);
	registerTool(fileHistogramTool);
	registerTool(fileCorrelationMatrixTool);
	registerTool(fileOutliersTool);
	registerTool(fileTemporalTrendTool);
	registerTool(fileListFilesTool);
	log.debug({ count: 27 }, 'data-driver tools registered');
}
