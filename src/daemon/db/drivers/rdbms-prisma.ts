/**
 * Prisma-schema fast path for RDBMS describe().
 *
 * When a connection sets `schemaSource: { type: 'prisma', path: ... }`,
 * each driver's describe() short-circuits through this helper instead
 * of running an `information_schema.columns` (or PRAGMA / sys.columns
 * / ALL_TAB_COLUMNS) query against the live DB.
 *
 * Returns a `SchemaDescription` shape-compatible with what live
 * introspection produces, so the tool layer doesn't care which path
 * supplied it (the `source` field is `'prisma'` vs `'introspect'`
 * for caller-side disambiguation).
 *
 * Caching: parsed prisma file content is memoized per `path` for
 * the lifetime of the helper module. The file mtime is checked on
 * each call so editing schema.prisma and re-running describe()
 * picks up the new content without a daemon restart.
 */

import { readFile, stat } from 'node:fs/promises';

import type {
	ColumnDescription,
	SchemaDescription,
} from '../../../shared/db-driver.js';
import {
	parsePrismaSchema,
	prismaTypeToSql,
	type PrismaModel,
} from '../../../shared/prisma-schema.js';

interface CacheEntry {
	readonly mtimeMs: number;
	readonly models: readonly PrismaModel[];
	/** Lookup map: both `model.name` (Prisma identifier) and
	 *  `model.table` (mapped SQL identifier) point at the same model. */
	readonly index: ReadonlyMap<string, PrismaModel>;
}

const CACHE = new Map<string, CacheEntry>();

async function loadModels(absPath: string): Promise<CacheEntry> {
	const st = await stat(absPath);
	const cached = CACHE.get(absPath);
	if (cached !== undefined && cached.mtimeMs === st.mtimeMs) { return cached; }

	const text = await readFile(absPath, 'utf8');
	const models = parsePrismaSchema(text);
	const index = new Map<string, PrismaModel>();
	for (const model of models) {
		index.set(model.name, model);
		if (model.table !== model.name) { index.set(model.table, model); }
	}
	const entry: CacheEntry = { mtimeMs: st.mtimeMs, models, index };
	CACHE.set(absPath, entry);
	return entry;
}

export async function prismaSchemaDescription(
	target: string,
	prismaPath: string,
): Promise<SchemaDescription> {
	const { index } = await loadModels(prismaPath);
	const model = index.get(target);
	if (model === undefined) {
		throw new Error(
			`data-driver: prisma schema at '${prismaPath}' has no model matching ` +
			`target '${target}' (looked at both model name + @@map)`,
		);
	}

	const compositePk = new Set(model.compositePrimaryKey);

	// First pass: build a map of FK columns. Prisma's relation-holder
	// is a virtual field whose `relationFields` lists the *local*
	// scalar columns that carry the FK; the actual columns are
	// separate scalar fields elsewhere in the same model.
	const fkByColumn = collectForeignKeys(model, index);

	const columns: ColumnDescription[] = [];
	for (const field of model.fields) {
		// Relation virtual fields -- skip; they don't materialize as
		// columns. Their FK info has already been routed to the local
		// scalar column via `fkByColumn` above.
		if (field.relationTo !== undefined) { continue; }

		const base: { -readonly [K in keyof ColumnDescription]: ColumnDescription[K] } = {
			name: field.column,
			type: prismaTypeToSql(field.type),
			nullable: field.isOptional,
			primaryKey: field.isId || compositePk.has(field.name) || compositePk.has(field.column),
		};
		const fk = fkByColumn.get(field.name) ?? fkByColumn.get(field.column);
		if (fk !== undefined) { base.foreignKey = fk; }
		columns.push(base);
	}

	return { target, columns, source: 'prisma' };
}

function collectForeignKeys(
	model: PrismaModel,
	index: ReadonlyMap<string, PrismaModel>,
): Map<string, { readonly table: string; readonly column: string }> {
	const out = new Map<string, { table: string; column: string }>();
	for (const field of model.fields) {
		const fields = field.relationFields;
		const refs = field.relationReferences;
		const targetModel = field.relationTo;
		if (
			fields === undefined || refs === undefined || targetModel === undefined
			|| fields.length === 0 || fields.length !== refs.length
		) {
			continue;
		}
		const target = index.get(targetModel);
		if (target === undefined) { continue; }
		for (let i = 0; i < fields.length; i++) {
			const localFieldName = fields[i]!;
			const referencedFieldName = refs[i]!;
			const refField = target.fields.find(f => f.name === referencedFieldName);
			const refColumn = refField?.column ?? referencedFieldName;
			out.set(localFieldName, { table: target.table, column: refColumn });
		}
	}
	return out;
}

export function _resetPrismaCacheForTests(): void {
	CACHE.clear();
}
