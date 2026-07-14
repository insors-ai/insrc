/**
 * Lean SQL DDL extractor for Prisma migrate + Liquibase + Flyway
 * raw-SQL bodies (code-analyzer-skills.md Phase 0.5).
 *
 * NOT a full SQL grammar -- it walks statements split on `;` and
 * matches the leading keyword. Statements we don't recognise fall
 * through to `kind: 'execute_raw'` with the raw SQL preserved.
 *
 * Supported forms:
 *
 *   CREATE TABLE [IF NOT EXISTS] "name" ( ... )
 *   DROP   TABLE [IF EXISTS] "name"
 *   ALTER  TABLE "name" ADD    [COLUMN] "col" type [constraints]
 *   ALTER  TABLE "name" DROP   [COLUMN] "col"
 *   ALTER  TABLE "name" ALTER  [COLUMN] "col" SET / DROP / TYPE ...
 *   ALTER  TABLE "name" RENAME TO   "new"
 *   ALTER  TABLE "name" RENAME [COLUMN] "old" TO "new"
 *   CREATE [UNIQUE] INDEX [IF NOT EXISTS] "name" ON "table" ...
 *   DROP   INDEX  [IF EXISTS] "name"
 */

import type { MigrationOp } from './types.js';

export function extractDdlOps(sql: string): MigrationOp[] {
	const ops: MigrationOp[] = [];
	for (const stmt of splitStatements(sql)) {
		const trimmed = stmt.trim();
		if (trimmed.length === 0) continue;
		ops.push(parseStatement(trimmed));
	}
	return ops;
}

// ---------------------------------------------------------------------------
// Statement splitting
// ---------------------------------------------------------------------------

/**
 * Split on `;` while respecting (...) parentheses (CREATE TABLE
 * bodies have semicolons inside trigger / default expressions on
 * occasion) and string / identifier literals.
 */
function splitStatements(sql: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let inSingle = false;
	let inDouble = false;
	let inLineComment = false;
	let inBlockComment = false;
	let buf = '';
	for (let i = 0; i < sql.length; i++) {
		const c = sql.charCodeAt(i);
		const next = i + 1 < sql.length ? sql.charCodeAt(i + 1) : -1;

		if (inLineComment) {
			if (c === 10) inLineComment = false;
			buf += sql[i]!;
			continue;
		}
		if (inBlockComment) {
			if (c === 42 && next === 47) {
				inBlockComment = false;
				buf += '*/';
				i++;
				continue;
			}
			buf += sql[i]!;
			continue;
		}

		if (!inSingle && !inDouble && c === 45 && next === 45) {
			inLineComment = true;
			buf += '--';
			i++;
			continue;
		}
		if (!inSingle && !inDouble && c === 47 && next === 42) {
			inBlockComment = true;
			buf += '/*';
			i++;
			continue;
		}
		if (!inDouble && c === 39) inSingle = !inSingle;
		else if (!inSingle && c === 34) inDouble = !inDouble;

		if (!inSingle && !inDouble) {
			if (c === 40) depth++;        // (
			else if (c === 41) depth--;   // )
			else if (c === 59 && depth === 0) {
				// Statement terminator at top level.
				out.push(buf);
				buf = '';
				continue;
			}
		}
		buf += sql[i]!;
	}
	if (buf.trim().length > 0) out.push(buf);
	return out;
}

// ---------------------------------------------------------------------------
// Per-statement classifier
// ---------------------------------------------------------------------------

function parseStatement(stmt: string): MigrationOp {
	const head = stmt.replace(/\s+/g, ' ').trim().toUpperCase();

	if (head.startsWith('CREATE TABLE')) return parseCreateTable(stmt);
	if (head.startsWith('DROP TABLE'))   return parseDropTable(stmt);
	if (head.startsWith('ALTER TABLE'))  return parseAlterTable(stmt);
	if (head.startsWith('CREATE INDEX') || head.startsWith('CREATE UNIQUE INDEX')) {
		return parseCreateIndex(stmt);
	}
	if (head.startsWith('DROP INDEX')) return parseDropIndex(stmt);

	// Anything else: pass through verbatim. The skill renderer can show
	// it as-is; the data-analyzer's lineage skills don't care about
	// DML / GRANT / SELECT statements in migrations.
	return { kind: 'execute_raw', raw: clip(stmt, 400) };
}

function parseCreateTable(stmt: string): MigrationOp {
	const m = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\[]?[\w.]+[`"\]]?)/i.exec(stmt);
	const table = m === null ? undefined : unquoteIdent(m[1]!);
	return table === undefined
		? { kind: 'create_table', raw: clip(stmt, 200) }
		: { kind: 'create_table', table };
}

function parseDropTable(stmt: string): MigrationOp {
	const m = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([`"\[]?[\w.]+[`"\]]?)/i.exec(stmt);
	const table = m === null ? undefined : unquoteIdent(m[1]!);
	return table === undefined
		? { kind: 'drop_table', raw: clip(stmt, 200) }
		: { kind: 'drop_table', table };
}

function parseAlterTable(stmt: string): MigrationOp {
	const tableMatch = /ALTER\s+TABLE\s+([`"\[]?[\w.]+[`"\]]?)/i.exec(stmt);
	const table = tableMatch === null ? undefined : unquoteIdent(tableMatch[1]!);
	if (table === undefined) {
		return { kind: 'execute_raw', raw: clip(stmt, 200) };
	}

	// Order matters: longest / most-specific clauses first.
	const renameTable = /\bRENAME\s+TO\s+([`"\[]?[\w.]+[`"\]]?)/i.exec(stmt);
	if (renameTable !== null) {
		return {
			kind:    'rename_table',
			table,
			column:  unquoteIdent(renameTable[1]!), // surface the target via `column` (we only have one slot for the new name)
			raw:     clip(stmt, 200),
		};
	}
	const renameCol = /\bRENAME(?:\s+COLUMN)?\s+([`"\[]?[\w]+[`"\]]?)\s+TO\s+([`"\[]?[\w]+[`"\]]?)/i.exec(stmt);
	if (renameCol !== null) {
		return {
			kind:   'rename_column',
			table,
			column: unquoteIdent(renameCol[1]!),
			raw:    `${unquoteIdent(renameCol[1]!)} -> ${unquoteIdent(renameCol[2]!)}`,
		};
	}
	const dropCol = /\bDROP(?:\s+COLUMN)?\s+([`"\[]?[\w]+[`"\]]?)/i.exec(stmt);
	if (dropCol !== null) {
		return { kind: 'drop_column', table, column: unquoteIdent(dropCol[1]!) };
	}
	const alterCol = /\bALTER(?:\s+COLUMN)?\s+([`"\[]?[\w]+[`"\]]?)/i.exec(stmt);
	const addCol = /\bADD(?:\s+COLUMN)?\s+([`"\[]?[\w]+[`"\]]?)\s+([\w()\[\]<> ,]+?)(?:\s+(?:NOT\s+NULL|NULL|DEFAULT|UNIQUE|PRIMARY)|\s*[,)])/i.exec(stmt + ' ,');
	if (addCol !== null) {
		const op: MigrationOp = {
			kind:   'add_column',
			table,
			column: unquoteIdent(addCol[1]!),
			type:   addCol[2]!.trim(),
		};
		const nullable = parseNullableClause(stmt);
		const def      = parseDefaultClause(stmt);
		if (nullable !== undefined) (op as { nullable?: boolean }).nullable = nullable;
		if (def !== undefined)      (op as { default?: string }).default = def;
		return op;
	}
	if (alterCol !== null) {
		return {
			kind:   'alter_column',
			table,
			column: unquoteIdent(alterCol[1]!),
			raw:    clip(stmt, 200),
		};
	}

	return { kind: 'execute_raw', table, raw: clip(stmt, 200) };
}

function parseCreateIndex(stmt: string): MigrationOp {
	const m = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\[]?[\w.]+[`"\]]?)\s+ON\s+([`"\[]?[\w.]+[`"\]]?)/i.exec(stmt);
	if (m === null) return { kind: 'add_index', raw: clip(stmt, 200) };
	return { kind: 'add_index', table: unquoteIdent(m[2]!), column: unquoteIdent(m[1]!) };
}

function parseDropIndex(stmt: string): MigrationOp {
	const m = /DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?([`"\[]?[\w.]+[`"\]]?)/i.exec(stmt);
	return m === null
		? { kind: 'drop_index', raw: clip(stmt, 200) }
		: { kind: 'drop_index', column: unquoteIdent(m[1]!) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNullableClause(stmt: string): boolean | undefined {
	if (/\bNOT\s+NULL\b/i.test(stmt)) return false;
	if (/\bNULL\b/i.test(stmt))       return true;
	return undefined;
}

function parseDefaultClause(stmt: string): string | undefined {
	const m = /\bDEFAULT\s+([^,)]+?)(?:\s*[,)]|$)/i.exec(stmt);
	return m === null ? undefined : m[1]!.trim();
}

function unquoteIdent(raw: string): string {
	const t = raw.trim();
	if (t.length >= 2) {
		const f = t.charCodeAt(0);
		const l = t.charCodeAt(t.length - 1);
		if ((f === 34 && l === 34) || (f === 96 && l === 96) ||
			(f === 91 && l === 93)) {
			return t.slice(1, -1);
		}
	}
	return t;
}

function clip(s: string, max: number): string {
	if (s.length <= max) return s;
	return s.slice(0, max) + '...';
}
