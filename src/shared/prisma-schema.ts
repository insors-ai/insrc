/**
 * Prisma schema regex parser -- shared between the artifact ER kind
 * (which renders Mermaid) and the data driver's RDBMS describe()
 * fast path (which produces a SchemaDescription without hitting the
 * live catalog).
 *
 * Originally lived as private helpers inside
 * `agent/tasks/artifacts/kinds/er-sources.ts`. Lifted to `shared/`
 * so the daemon-side data driver can reuse it without depending on
 * the artifact pipeline. No deps; no `@prisma/internals` -- just
 * regex over the .prisma file text.
 *
 * Coverage:
 *   - `model X { ... }` blocks with field lines.
 *   - `@id` / `@@id([...])` -> primaryKey
 *   - `@@map("name")`       -> table name override
 *   - `@map("name")`        -> column name override
 *   - `?` / `[]`            -> nullable / list
 *   - `@relation(fields: [..], references: [..])` -> FK pointers on
 *     the holder field.
 *
 * Out of scope: enums (skipped), composite types, `@@unique`
 * (column-level only).
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PrismaField {
	readonly name: string;
	/** Column name as written; `@map` override applied. */
	readonly column: string;
	/** Prisma type token (`String`, `Int`, ...). Use `prismaTypeToSql`
	 *  to map onto a canonical SQL type string when needed. */
	readonly type: string;
	readonly isId: boolean;
	readonly isUnique: boolean;
	readonly isList: boolean;
	readonly isOptional: boolean;
	/** Set when this field's `type` resolves to another model and is
	 *  therefore a relation (not a scalar column). */
	readonly relationTo?: string;
	/** Set when @relation(fields: [..], references: [..]) is on this
	 *  field; lists the local FK columns + the target columns. */
	readonly relationFields?: readonly string[];
	readonly relationReferences?: readonly string[];
}

export interface PrismaModel {
	readonly name: string;
	/** Table name as it appears in the live DB; `@@map` applied
	 *  (defaults to `name` when no map). */
	readonly table: string;
	readonly fields: readonly PrismaField[];
	/** Composite-PK column list (from `@@id([a, b])`). Empty when
	 *  the model uses a single-column `@id` or has no PK declared. */
	readonly compositePrimaryKey: readonly string[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const MODEL_BLOCK_RE = /\bmodel\s+([A-Za-z_][A-Za-z0-9_]*)\s*{([^}]*)}/g;
const FIELD_LINE_RE  = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+([^\s@/]+)(\s+@[^\n]*)?\s*$/;
const MAP_RE         = /@map\s*\(\s*"([^"]+)"\s*\)/;
const TABLE_MAP_RE   = /@@map\s*\(\s*"([^"]+)"\s*\)/;
const COMPOSITE_ID_RE = /@@id\s*\(\s*\[\s*([^\]]+)\]\s*\)/;
const RELATION_FIELDS_RE = /@relation\s*\([^)]*\bfields\s*:\s*\[([^\]]+)\]/;
const RELATION_REFS_RE   = /@relation\s*\([^)]*\breferences\s*:\s*\[([^\]]+)\]/;

const PRIMITIVE_TYPES = new Set([
	'String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean',
	'DateTime', 'Date', 'Time', 'Json', 'Bytes',
]);

export function parsePrismaSchema(text: string): readonly PrismaModel[] {
	const models: PrismaModel[] = [];
	MODEL_BLOCK_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = MODEL_BLOCK_RE.exec(text)) !== null) {
		const modelName = m[1];
		const body = m[2];
		if (modelName === undefined || body === undefined) { continue; }

		const fields: PrismaField[] = [];
		let tableOverride: string | undefined;
		let compositePk: string[] = [];

		for (const rawLine of body.split('\n')) {
			const line = rawLine.replace(/\/\/.*$/, '').trim();
			if (line === '') { continue; }

			// Block-level directives
			if (line.startsWith('@@')) {
				const tableMap = TABLE_MAP_RE.exec(line);
				if (tableMap !== null && tableMap[1] !== undefined) {
					tableOverride = tableMap[1];
					continue;
				}
				const compId = COMPOSITE_ID_RE.exec(line);
				if (compId !== null && compId[1] !== undefined) {
					compositePk = compId[1].split(',').map(s => s.trim()).filter(s => s !== '');
				}
				continue;
			}

			const match = FIELD_LINE_RE.exec(line);
			if (match === null) { continue; }
			const name = match[1];
			let type = match[2];
			const attrs = match[3] ?? '';
			if (name === undefined || type === undefined) { continue; }

			const isList = type.endsWith('[]');
			if (isList) { type = type.slice(0, -2); }
			const isOptional = type.endsWith('?');
			if (isOptional) { type = type.slice(0, -1); }

			const isId = /@id\b/.test(attrs);
			const isUnique = /@unique\b/.test(attrs);
			const isPrimitive = PRIMITIVE_TYPES.has(type);
			const relationTo = !isPrimitive && /^[A-Z]/.test(type) ? type : undefined;

			const colMap = MAP_RE.exec(attrs);
			const column = colMap !== null && colMap[1] !== undefined ? colMap[1] : name;

			const relFields = RELATION_FIELDS_RE.exec(attrs);
			const relRefs = RELATION_REFS_RE.exec(attrs);
			const relationFields = relFields !== null && relFields[1] !== undefined
				? relFields[1].split(',').map(s => s.trim()).filter(s => s !== '')
				: undefined;
			const relationReferences = relRefs !== null && relRefs[1] !== undefined
				? relRefs[1].split(',').map(s => s.trim()).filter(s => s !== '')
				: undefined;

			const field: { -readonly [K in keyof PrismaField]: PrismaField[K] } = {
				name, column, type, isId, isUnique, isList, isOptional,
			};
			if (relationTo !== undefined)         { field.relationTo = relationTo; }
			if (relationFields !== undefined)     { field.relationFields = relationFields; }
			if (relationReferences !== undefined) { field.relationReferences = relationReferences; }
			fields.push(field);
		}

		if (fields.length > 0) {
			models.push({
				name: modelName,
				table: tableOverride ?? modelName,
				fields,
				compositePrimaryKey: compositePk,
			});
		}
	}
	return models;
}

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

/**
 * Map a Prisma scalar type token onto a canonical SQL-ish type
 * string. Output approximates what `information_schema.columns.data_type`
 * reports on Postgres so downstream consumers see a consistent
 * shape regardless of which path produced the SchemaDescription.
 */
export function prismaTypeToSql(prismaType: string): string {
	switch (prismaType) {
		case 'String':   return 'text';
		case 'Int':      return 'integer';
		case 'BigInt':   return 'bigint';
		case 'Float':    return 'double precision';
		case 'Decimal':  return 'numeric';
		case 'Boolean':  return 'boolean';
		case 'DateTime': return 'timestamp without time zone';
		case 'Date':     return 'date';
		case 'Time':     return 'time';
		case 'Json':     return 'jsonb';
		case 'Bytes':    return 'bytea';
		default:         return prismaType;
	}
}
