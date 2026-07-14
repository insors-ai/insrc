/**
 * Prisma `schema.prisma` parser for `code_orm_scan`
 * (code-analyzer-skills.md Phase 0.4).
 *
 * Schema layout:
 *
 *   model User {
 *     id     Int      @id @default(autoincrement())
 *     email  String   @unique
 *     name   String?
 *     posts  Post[]
 *
 *     @@map("users")
 *   }
 *
 * The parser is a line-oriented walker, not a full Prisma grammar
 * implementation -- it covers the 90% case (most fields, the common
 * attribute spellings, simple relation shapes). Out of scope:
 *
 *   - composite types (`type Address { ... }`) -- not currently
 *     consumed by the data-analyzer §3.3 wrapper
 *   - block comments mid-field (rare in practice)
 *   - Prisma's `@@unique([a, b])` / `@@index([a, b])` -- not part of
 *     the OrmColumn / OrmRelation shape
 *
 * Dialect default for the `table` name is the lowercased model name;
 * an explicit `@@map("...")` overrides it.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { OrmModel, OrmColumn, OrmRelation } from './types.js';

const SCHEMA_REL_PATH = 'prisma/schema.prisma';

export async function detectPrisma(repoPath: string): Promise<boolean> {
	try {
		await fs.access(join(repoPath, SCHEMA_REL_PATH));
		return true;
	} catch {
		return false;
	}
}

export async function scanPrisma(repoPath: string): Promise<OrmModel[]> {
	const schemaPath = join(repoPath, SCHEMA_REL_PATH);
	let raw: string;
	try {
		raw = await fs.readFile(schemaPath, 'utf8');
	} catch {
		return [];
	}
	return parsePrismaSchema(raw, schemaPath);
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

interface ModelBlock {
	readonly name:    string;
	readonly line:    number;
	readonly content: string;
}

export function parsePrismaSchema(raw: string, schemaPath: string): OrmModel[] {
	const blocks = extractModelBlocks(raw);
	return blocks.map(b => parseModel(b, schemaPath));
}

function extractModelBlocks(raw: string): ModelBlock[] {
	const out: ModelBlock[] = [];
	const lines = raw.split('\n');
	let i = 0;
	while (i < lines.length) {
		const line = lines[i]!;
		const m = /^\s*model\s+([A-Za-z_]\w*)\s*\{\s*(?:\/\/.*)?$/.exec(line);
		if (m === null) { i++; continue; }
		const name      = m[1]!;
		const headerLine = i + 1;
		const bodyStart = i + 1;
		// Find the closing brace at zero indent (relative to model open).
		let depth = 1;
		let j = bodyStart;
		while (j < lines.length && depth > 0) {
			const l = lines[j]!;
			for (let k = 0; k < l.length; k++) {
				const c = l.charCodeAt(k);
				if (c === 123) depth++;          // {
				else if (c === 125) depth--;     // }
				if (depth === 0) break;
			}
			if (depth === 0) break;
			j++;
		}
		const bodyEnd = j;
		const content = lines.slice(bodyStart, bodyEnd).join('\n');
		out.push({ name, line: headerLine, content });
		i = bodyEnd + 1;
	}
	return out;
}

function parseModel(block: ModelBlock, schemaPath: string): OrmModel {
	const columns:   OrmColumn[]   = [];
	const relations: OrmRelation[] = [];
	let table: string | undefined;

	for (const rawLine of block.content.split('\n')) {
		const line = stripComment(rawLine).trim();
		if (line.length === 0) continue;

		// Block-level attribute (@@map, @@id, @@unique, @@index, @@schema, ...).
		if (line.startsWith('@@')) {
			const map = /^@@map\(\s*"([^"]+)"\s*\)/.exec(line);
			if (map !== null) table = map[1];
			continue;
		}

		const fieldMatch = /^([A-Za-z_]\w*)\s+([A-Za-z_]\w*)(\?|\[\])?\s*(.*)$/.exec(line);
		if (fieldMatch === null) continue;
		const fieldName = fieldMatch[1]!;
		const baseType  = fieldMatch[2]!;
		const modifier  = fieldMatch[3] ?? '';
		const rest      = fieldMatch[4] ?? '';

		// Relation field: type points at another model (TitleCase) and
		// either is `Type[]` (has_many) or has `@relation(...)` attr.
		const isList     = modifier === '[]';
		const isOptional = modifier === '?';
		const looksLikeModelRef = /^[A-Z]/.test(baseType) && !PRISMA_SCALAR_TYPES.has(baseType);

		if (looksLikeModelRef) {
			const kind: OrmRelation['kind'] = isList ? 'has_many' : 'belongs_to';
			const rel: OrmRelation = { kind, target: baseType, fieldName };
			relations.push(rel);
			continue;
		}

		// Column field.
		const explicitName = parseExplicitColumnName(rest);
		const def          = parseDefault(rest);
		const isPrimary    = /\s@id\b/.test(' ' + rest);
		const isUnique     = /\s@unique\b/.test(' ' + rest);
		const nullable     = isOptional ? true : undefined;

		columns.push(assembleCol({
			name:      explicitName ?? fieldName,
			type:      baseType,
			nullable,
			default:   def,
			isPrimary,
			isUnique,
		}));
	}

	const out: OrmModel = {
		name:      block.name,
		columns,
		relations,
		path:      schemaPath,
		line:      block.line,
		dialect:   'prisma',
		...(table !== undefined ? { table } : {}),
	};
	return out;
}

const PRISMA_SCALAR_TYPES: ReadonlySet<string> = new Set([
	'String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime',
	'Json', 'Bytes', 'Unsupported',
]);

function parseExplicitColumnName(rest: string): string | undefined {
	const m = /@map\(\s*"([^"]+)"\s*\)/.exec(rest);
	return m === null ? undefined : m[1];
}

function parseDefault(rest: string): string | undefined {
	// Paren-balanced extraction so `@default(autoincrement())` doesn't
	// truncate at the inner `)`.
	const start = rest.indexOf('@default(');
	if (start === -1) return undefined;
	let i = start + '@default('.length;
	let depth = 1;
	const open = i;
	while (i < rest.length && depth > 0) {
		const c = rest.charCodeAt(i);
		if (c === 40) depth++;        // (
		else if (c === 41) depth--;   // )
		if (depth === 0) break;
		i++;
	}
	if (depth !== 0) return undefined;
	const inner = rest.slice(open, i).trim();
	return inner.length === 0 ? undefined : inner;
}

function assembleCol(opts: {
	name: string;
	type?: string | undefined;
	nullable?: boolean | undefined;
	default?: string | undefined;
	isPrimary?: boolean | undefined;
	isUnique?: boolean | undefined;
}): OrmColumn {
	let c: OrmColumn = { name: opts.name };
	if (opts.type !== undefined && opts.type.length > 0) c = { ...c, type: opts.type };
	if (opts.nullable !== undefined)                     c = { ...c, nullable: opts.nullable };
	if (opts.default !== undefined && opts.default.length > 0) c = { ...c, default: opts.default };
	if (opts.isPrimary === true) c = { ...c, isPrimary: true };
	if (opts.isUnique === true)  c = { ...c, isUnique: true };
	return c;
}

function stripComment(line: string): string {
	const idx = line.indexOf('//');
	return idx === -1 ? line : line.slice(0, idx);
}
