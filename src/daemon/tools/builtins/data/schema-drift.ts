/**
 * data_schema-drift -- diff a connection's expected schema (Prisma)
 * against the live RDBMS shape and report column-level drift.
 *
 * Phase 3.2 of plans/analyzers/data-analyzer.md. Implementation
 * scope:
 *
 *   - **Expected shape source: Prisma only** for v1. Reads
 *     `connection.schemaSource.type === 'prisma'` and runs
 *     `prismaSchemaDescription` (the same helper the data-driver
 *     uses for its describe() fast path). When the connection has
 *     no Prisma schema configured, we surface a clean
 *     "no static schema source" result with `confidence: 'low'`
 *     instead of silently passing -- the analyzer downstream can
 *     emit that as a finding.
 *
 *   - **Live shape source: pool.acquire + driver.describe(target)**.
 *     Same path the `db_sql_describe` tool uses; we go through the
 *     pool directly so this tool doesn't need to invoke another
 *     tool from inside its execute loop.
 *
 *   - **Diff dimensions:** missing-column / extra-column /
 *     type-mismatch / nullable-mismatch / pk-changed / fk-changed.
 *     Column matching is by `name`; unmatched columns become
 *     missing/extra entries.
 *
 * Out of scope (deferred follow-ups, per the plan):
 *
 *   - ORM model file resolvers (TypeORM / Sequelize / Mongoose).
 *   - Static query-builder analysis (parse SQL string literals in
 *     the code KG).
 *   - KV / file driver families. Drift over an unstructured KV is
 *     ill-defined for v1; the analyzer's `sample-shape` already
 *     surfaces field inconsistencies for those cases.
 */

import { resolve as resolvePath, isAbsolute } from 'node:path';
import { getLogger } from '../../../../shared/logger.js';
import type { Tool, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import type {
	ColumnDescription,
	RdbmsDriver,
	SchemaDescription,
} from '../../../../shared/db-driver.js';
import { acquirePool } from '../../../db/pool-cache.js';
import { prismaSchemaDescription } from '../../../db/drivers/rdbms-prisma.js';
import {
	exceedsCrossAgentDepth,
	readCrossAgentDepth,
	toolUnavailable,
} from '../../../../shared/cross-agent.js';

const log = getLogger('data:schema-drift');

// ---------------------------------------------------------------------------
// Drift kinds
// ---------------------------------------------------------------------------

type DriftKind =
	| 'missing-column'    // expected has it, live doesn't
	| 'extra-column'      // live has it, expected doesn't
	| 'type-mismatch'
	| 'nullable-mismatch'
	| 'pk-changed'
	| 'fk-changed';

interface DriftItem {
	readonly kind: DriftKind;
	readonly column: string;
	readonly severity: 'info' | 'warn' | 'error';
	readonly detail: string;
}

interface DriftData {
	readonly connectionId: string;
	readonly target: string;
	readonly expectedSource: 'prisma' | 'none';
	readonly drift: readonly DriftItem[];
	readonly expectedColumnCount: number;
	readonly liveColumnCount: number;
	/**
	 * Rendered confidence the analyzer should adopt verbatim. `low`
	 * when no expected source resolved; `medium` for normal Prisma
	 * diffs. `high` is reserved for the future static-analysis path
	 * that cross-references multiple sources.
	 */
	readonly confidence: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const dataSchemaDriftTool: Tool = {
	id: 'data_schema-drift',
	description:
		'Diff an RDBMS connection\'s expected schema (Prisma fast-path) against the live shape returned by the driver. ' +
		'Reports missing-column / extra-column / type-mismatch / nullable-mismatch / pk-changed / fk-changed. ' +
		'When the connection has no Prisma schemaSource configured, returns confidence:"low" with a "no static schema ' +
		'source" note so the analyzer can downgrade the finding rather than fabricate one.',
	inputSchema: {
		type: 'object',
		properties: {
			connectionId: {
				type: 'string',
				description: 'RDBMS connection id (must have schemaSource.type=prisma for a real diff).',
			},
			target: {
				type: 'string',
				description: 'Table name (Prisma model name OR @@map() target). Drift is per-table.',
			},
		},
		required: ['connectionId', 'target'],
		additionalProperties: false,
	},
	requiresApproval: false,

	async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
		// Cross-agent depth check (Phase 4 of plans/analyzers/data-analyzer.md).
		// Same envelope as data_lineage; the cap is strict at depth>=1.
		const depth = readCrossAgentDepth(input);
		if (exceedsCrossAgentDepth(depth)) {
			const sentinel = toolUnavailable('cross_agent_depth_exceeded');
			return {
				output: '[data_schema-drift] unavailable: cross_agent_depth_exceeded',
				format: 'json',
				success: false,
				error: 'cross_agent_depth_exceeded',
				data: sentinel,
			};
		}

		const connectionId = typeof input['connectionId'] === 'string' ? input['connectionId'] : '';
		const target = typeof input['target'] === 'string' ? input['target'] : '';
		if (connectionId.length === 0 || target.length === 0) {
			return fail('connectionId and target are required');
		}

		const repoPath = deps.repoPath;
		if (repoPath.length === 0) {
			return fail('session has no active repo; cannot resolve the connection');
		}

		const pool = await acquirePool(repoPath);
		const conn = pool.list().find(c => c.id === connectionId);
		if (conn === undefined) {
			return fail(`unknown connection '${connectionId}'`);
		}
		if (conn.family !== 'rdbms') {
			return fail(`connection '${connectionId}' is ${conn.family}; schema-drift v1 only supports rdbms`);
		}

		// Live shape via the existing driver path.
		const driver = await pool.acquire(connectionId);
		let live: SchemaDescription;
		try {
			live = await (driver as RdbmsDriver).describe(target);
		} catch (err) {
			return fail(`live describe failed: ${(err as Error).message}`);
		}

		// Expected shape: Prisma only for v1.
		const prismaPath = resolvePrismaPath(conn.schemaSource, repoPath);
		if (prismaPath === undefined) {
			const data: DriftData = {
				connectionId,
				target,
				expectedSource: 'none',
				drift: [],
				expectedColumnCount: 0,
				liveColumnCount: live.columns.length,
				confidence: 'low',
			};
			return {
				output: renderNoExpectedSource(target, connectionId, live),
				format: 'markdown',
				success: true,
				data,
			};
		}

		let expected: SchemaDescription;
		try {
			expected = await prismaSchemaDescription(target, prismaPath);
		} catch (err) {
			// Prisma schema couldn't resolve the model -- surface as
			// drift "missing-column"-style message rather than a tool
			// failure so the analyzer can decide.
			return fail(`prisma resolve failed: ${(err as Error).message}`);
		}

		const drift = diffSchemas(expected, live);
		const data: DriftData = {
			connectionId,
			target,
			expectedSource: 'prisma',
			drift,
			expectedColumnCount: expected.columns.length,
			liveColumnCount: live.columns.length,
			confidence: 'medium',
		};

		log.info(
			{ connectionId, target, prismaPath, drift: drift.length },
			'data_schema-drift diff complete',
		);

		return {
			output: renderDriftReport(data, expected, live),
			format: 'markdown',
			success: true,
			data,
		};
	},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(msg: string): ToolResult {
	return { output: `[data_schema-drift] ${msg}`, format: 'text', success: false, error: msg };
}

function resolvePrismaPath(
	schemaSource: { type: 'prisma'; path: string } | undefined,
	repoPath: string,
): string | undefined {
	if (schemaSource === undefined || schemaSource.type !== 'prisma') {
		return undefined;
	}
	const raw = schemaSource.path;
	if (raw.length === 0) return undefined;
	return isAbsolute(raw) ? raw : resolvePath(repoPath, raw);
}

/**
 * Walk both column lists, matching by `name`. Order matters less
 * than identity here -- a column's position is metadata, not a
 * semantic invariant the analyzer should care about.
 */
function diffSchemas(
	expected: SchemaDescription,
	live: SchemaDescription,
): readonly DriftItem[] {
	const out: DriftItem[] = [];
	const expectedByName = new Map(expected.columns.map(c => [c.name, c]));
	const liveByName = new Map(live.columns.map(c => [c.name, c]));

	for (const expectedCol of expected.columns) {
		const liveCol = liveByName.get(expectedCol.name);
		if (liveCol === undefined) {
			out.push({
				kind: 'missing-column',
				column: expectedCol.name,
				severity: 'error',
				detail: `expected column \`${expectedCol.name}\` (${expectedCol.type}) is missing from the live table`,
			});
			continue;
		}
		appendColumnLevelDrift(out, expectedCol, liveCol);
	}

	for (const liveCol of live.columns) {
		if (!expectedByName.has(liveCol.name)) {
			out.push({
				kind: 'extra-column',
				column: liveCol.name,
				severity: 'info',
				detail: `live column \`${liveCol.name}\` (${liveCol.type}) is not in the expected schema`,
			});
		}
	}
	return out;
}

function appendColumnLevelDrift(
	out: DriftItem[],
	expected: ColumnDescription,
	live: ColumnDescription,
): void {
	if (!typesMatch(expected.type, live.type)) {
		out.push({
			kind: 'type-mismatch',
			column: expected.name,
			severity: 'warn',
			detail: `type drift on \`${expected.name}\`: expected \`${expected.type}\`, live \`${live.type}\``,
		});
	}
	const expectedNullable = expected.nullable === true;
	const liveNullable = live.nullable === true;
	if (expectedNullable !== liveNullable) {
		out.push({
			kind: 'nullable-mismatch',
			column: expected.name,
			severity: 'warn',
			detail: `nullable drift on \`${expected.name}\`: expected ${expectedNullable ? 'nullable' : 'NOT NULL'}, live ${liveNullable ? 'nullable' : 'NOT NULL'}`,
		});
	}
	const expectedPk = expected.primaryKey === true;
	const livePk = live.primaryKey === true;
	if (expectedPk !== livePk) {
		out.push({
			kind: 'pk-changed',
			column: expected.name,
			severity: 'warn',
			detail: `primary-key membership drift on \`${expected.name}\`: expected ${expectedPk ? 'IS pk' : 'NOT pk'}, live ${livePk ? 'IS pk' : 'NOT pk'}`,
		});
	}
	const expectedFk = describeFk(expected.foreignKey);
	const liveFk = describeFk(live.foreignKey);
	if (expectedFk !== liveFk) {
		out.push({
			kind: 'fk-changed',
			column: expected.name,
			severity: 'warn',
			detail: `foreign-key drift on \`${expected.name}\`: expected ${expectedFk}, live ${liveFk}`,
		});
	}
}

function describeFk(fk: { table: string; column: string } | undefined): string {
	return fk === undefined ? '(none)' : `${fk.table}.${fk.column}`;
}

/**
 * Type comparison is intentionally permissive -- Prisma's
 * `prismaTypeToSql` produces canonical Postgres-ish strings, but
 * different RDBMS introspection layers normalise types differently
 * (`integer` vs `int4`, `varchar(255)` vs `character varying(255)`).
 * Match on a normalised lower-cased prefix so e.g. `varchar(120)`
 * still matches `text` when the Prisma side outputs `text`.
 *
 * False-negative rate: low. False-positive rate: a real drift like
 * `integer -> bigint` does flag (different prefixes), so the
 * permissiveness is bounded.
 */
function typesMatch(expected: string, live: string): boolean {
	const norm = (t: string) => t.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
	const ne = norm(expected);
	const nl = norm(live);
	if (ne === nl) return true;
	// Postgres-flavour aliases:
	const aliasGroups = [
		new Set(['integer', 'int', 'int4', 'serial']),
		new Set(['bigint', 'int8', 'bigserial']),
		new Set(['smallint', 'int2']),
		new Set(['text', 'varchar', 'character varying', 'char', 'character']),
		new Set(['boolean', 'bool']),
		new Set(['double precision', 'float8', 'real', 'float4']),
		new Set(['numeric', 'decimal']),
		new Set(['timestamp without time zone', 'timestamp']),
		new Set(['timestamp with time zone', 'timestamptz']),
	];
	return aliasGroups.some(g => g.has(ne) && g.has(nl));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderNoExpectedSource(
	target: string,
	connectionId: string,
	live: SchemaDescription,
): string {
	return [
		`# Schema drift -- \`${connectionId}\` -> \`${target}\``,
		'',
		`_No static schema source resolved for this connection (no \`schemaSource.type === 'prisma'\` in the connection config). The drift detector has nothing to diff against; emit \`confidence: 'low'\` with a "no static schema source" note._`,
		'',
		`Live shape (${live.columns.length} column${live.columns.length === 1 ? '' : 's'}, source=${live.source}):`,
		'',
		renderColumnTable(live.columns),
	].join('\n');
}

function renderDriftReport(
	d: DriftData,
	expected: SchemaDescription,
	live: SchemaDescription,
): string {
	const sections: string[] = [
		`# Schema drift -- \`${d.connectionId}\` -> \`${d.target}\``,
		'',
		`Expected source: \`${d.expectedSource}\` (${d.expectedColumnCount} column${d.expectedColumnCount === 1 ? '' : 's'}). ` +
		`Live source: \`${live.source}\` (${d.liveColumnCount} column${d.liveColumnCount === 1 ? '' : 's'}).`,
		'',
	];

	if (d.drift.length === 0) {
		sections.push('**No drift detected.** Expected and live shapes match column-by-column.');
		return sections.join('\n');
	}

	sections.push(`**${d.drift.length} drift item${d.drift.length === 1 ? '' : 's'}** found:`);
	sections.push('');
	sections.push('| kind | column | severity | detail |');
	sections.push('|---|---|---|---|');
	for (const item of d.drift) {
		sections.push(`| ${item.kind} | \`${item.column}\` | ${item.severity} | ${item.detail} |`);
	}
	sections.push('');
	sections.push('**Expected columns:**');
	sections.push('');
	sections.push(renderColumnTable(expected.columns));
	sections.push('');
	sections.push('**Live columns:**');
	sections.push('');
	sections.push(renderColumnTable(live.columns));
	return sections.join('\n');
}

function renderColumnTable(cols: readonly ColumnDescription[]): string {
	if (cols.length === 0) return '_(no columns)_';
	const rows: string[] = [
		'| column | type | nullable | pk | fk |',
		'|---|---|---|---|---|',
	];
	for (const c of cols) {
		rows.push(
			`| ${c.name} | ${c.type} | ${c.nullable === true ? 'yes' : 'no'} ` +
			`| ${c.primaryKey === true ? 'yes' : ''} ` +
			`| ${c.foreignKey === undefined ? '' : `${c.foreignKey.table}.${c.foreignKey.column}`} |`,
		);
	}
	return rows.join('\n');
}
