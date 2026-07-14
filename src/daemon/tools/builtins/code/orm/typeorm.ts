/**
 * TypeORM `@Entity()` parser for `code_orm_scan`
 * (code-analyzer-skills.md Phase 0.4).
 *
 * Walks the LMDB graph for `kind: 'class'` entities whose body
 * contains a TypeORM `@Entity` decorator AND whose file imports
 * from `'typeorm'`. Per-class field extraction is body-regex
 * because the TypeScript parser stores the whole class body as a
 * blob (no per-field entities for TS -- see class-fields.ts:30).
 *
 * Entity decorator forms:
 *   - `@Entity()`               -> table name = camel-or-class default
 *   - `@Entity('users')`        -> explicit table
 *   - `@Entity({ name: 'u' })`  -> explicit table via options
 *
 * Column decorator forms supported:
 *   - `@Column()`
 *   - `@Column('varchar')`
 *   - `@Column({ type: 'varchar', nullable: true, default: 'x' })`
 *   - `@PrimaryGeneratedColumn()`  (always primary; nullable: false)
 *   - `@PrimaryColumn()`
 *
 * Relation decorators:
 *   - `@OneToMany(() => Foo, ...)`   -> has_many
 *   - `@ManyToOne(() => Foo, ...)`   -> belongs_to
 *   - `@OneToOne(() => Foo, ...)`    -> has_one
 *   - `@ManyToMany(() => Foo, ...)`  -> many_to_many
 *
 * The graph walk is repo-scoped via `listEntitiesForRepo`. Out of
 * scope: TypeORM v0.2 schema-builder API (`new EntitySchema(...)`),
 * embedded entities, single-table inheritance.
 */

import { listEntitiesForRepo } from '../../../../../db/entities.js';
import type { Entity } from '../../../../../shared/types.js';
import type { OrmModel, OrmColumn, OrmRelation } from './types.js';

export async function detectTypeORM(repoPath: string): Promise<boolean> {
	// Cheaper than the full scan: any class that imports from 'typeorm'
	// and has @Entity in its body counts as a hit. Reuse the same
	// per-class predicate the scanner uses, short-circuit on first hit.
	const entities = await listEntitiesForRepo(null, repoPath);
	for (const e of entities) {
		if (e.kind === 'class' && (e.language === 'typescript' || e.language === 'javascript')) {
			if (looksLikeTypeORM(e)) return true;
		}
	}
	return false;
}

export async function scanTypeORM(repoPath: string): Promise<OrmModel[]> {
	const entities = await listEntitiesForRepo(null, repoPath);
	const out: OrmModel[] = [];
	for (const e of entities) {
		if (e.kind !== 'class') continue;
		if (e.language !== 'typescript' && e.language !== 'javascript') continue;
		if (!looksLikeTypeORM(e)) continue;
		out.push(parseTypeORMEntity(e));
	}
	return out;
}

// ---------------------------------------------------------------------------
// Per-class predicate
// ---------------------------------------------------------------------------

function looksLikeTypeORM(e: Entity): boolean {
	if (!/@Entity\b/.test(e.body)) return false;
	// `import ... from 'typeorm'` is in the file, not in the class body.
	// We only see the class entity here, so the import-check is best
	// effort: trust the @Entity decorator in the body. False positives
	// would require a user-defined `@Entity` decorator unrelated to
	// TypeORM, which is rare.
	return true;
}

// ---------------------------------------------------------------------------
// Per-entity parser
// ---------------------------------------------------------------------------

export function parseTypeORMEntity(e: Entity): OrmModel {
	const body = e.body;
	const className = stripQualifier(e.name);
	const table = parseEntityTableName(body);

	const columns:   OrmColumn[]   = [];
	const relations: OrmRelation[] = [];

	// Iterate non-empty member groups (decorator block + member line).
	// A member is a decorator-prefixed line followed by `name: Type [...]`.
	const lines = body.split('\n');
	let pendingDecorators: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i]!.trim();
		if (trimmed.length === 0) continue;
		if (trimmed.startsWith('//')) continue;

		if (trimmed.startsWith('@')) {
			pendingDecorators.push(trimmed);
			continue;
		}

		// Member line.
		const memberMatch = /^(?:public |private |protected |readonly |static )*([A-Za-z_$][\w$]*)(\?)?\s*[:!]?\s*([^=;]+)?/.exec(trimmed);
		if (memberMatch === null) {
			pendingDecorators = [];
			continue;
		}
		const fieldName = memberMatch[1]!;
		const optional  = memberMatch[2] === '?';
		const declTypeRaw = (memberMatch[3] ?? '').trim().replace(/[;{].*$/, '').trim();

		// Skip method-shaped lines (parens after name).
		if (/\(/.test(declTypeRaw)) {
			pendingDecorators = [];
			continue;
		}
		// Skip lines that are not decorated (TypeORM members are always
		// decorated; bare fields in an @Entity class are usually
		// computed properties).
		if (pendingDecorators.length === 0) continue;

		const decoratorBlob = pendingDecorators.join(' ');
		pendingDecorators = [];

		const rel = parseRelation(decoratorBlob, fieldName);
		if (rel !== null) {
			relations.push(rel);
			continue;
		}

		const col = parseColumn(decoratorBlob, fieldName, declTypeRaw, optional);
		if (col !== null) columns.push(col);
	}

	const out: OrmModel = {
		name:     className,
		columns,
		relations,
		path:     e.file,
		line:     e.startLine,
		dialect:  'typeorm',
		...(table !== undefined ? { table } : {}),
	};
	return out;
}

function parseEntityTableName(body: string): string | undefined {
	// `@Entity('users')` or `@Entity("users")`
	const stringForm = /@Entity\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(body);
	if (stringForm !== null) return stringForm[1];
	// `@Entity({ name: 'users', ...})`
	const objectForm = /@Entity\s*\(\s*\{[^}]*name\s*:\s*['"]([^'"]+)['"]/.exec(body);
	if (objectForm !== null) return objectForm[1];
	return undefined;
}

function parseRelation(decoratorBlob: string, fieldName: string): OrmRelation | null {
	const m = /@(OneToMany|ManyToOne|OneToOne|ManyToMany)\s*\(\s*\(\)\s*=>\s*([A-Za-z_$][\w$]*)/.exec(decoratorBlob);
	if (m === null) return null;
	const decorator = m[1]!;
	const target    = m[2]!;
	const kind: OrmRelation['kind'] =
		decorator === 'OneToMany'  ? 'has_many'    :
		decorator === 'ManyToOne'  ? 'belongs_to'  :
		decorator === 'OneToOne'   ? 'has_one'     :
		'many_to_many';
	return { kind, target, fieldName };
}

function parseColumn(
	decoratorBlob: string,
	fieldName:     string,
	declType:      string,
	optional:      boolean,
): OrmColumn | null {
	if (!/@(?:Primary)?(?:Generated)?Column\b/.test(decoratorBlob)
		&& !/@CreateDateColumn\b/.test(decoratorBlob)
		&& !/@UpdateDateColumn\b/.test(decoratorBlob)
		&& !/@DeleteDateColumn\b/.test(decoratorBlob)
		&& !/@VersionColumn\b/.test(decoratorBlob)) {
		return null;
	}

	const isPrimary = /@Primary(?:Generated)?Column\b/.test(decoratorBlob);
	// Explicit decorator-driven name override: `@Column({ name: 'col' })`
	const explicitName = parseObjectField(decoratorBlob, 'name');
	const explicitType = parseObjectField(decoratorBlob, 'type')
		?? parseSingleStringArg(decoratorBlob);
	const explicitNullable = parseObjectField(decoratorBlob, 'nullable');
	const explicitDefault  = parseObjectField(decoratorBlob, 'default');

	const type = explicitType ?? (declType.length > 0 ? declType : undefined);
	const nullable = explicitNullable === 'true' ? true
		: explicitNullable === 'false' ? false
		: optional ? true
		: undefined;

	let c: OrmColumn = { name: explicitName ?? fieldName };
	if (type !== undefined)             c = { ...c, type };
	if (nullable !== undefined)         c = { ...c, nullable };
	if (explicitDefault !== undefined)  c = { ...c, default: explicitDefault };
	if (isPrimary)                      c = { ...c, isPrimary: true };
	return c;
}

function parseObjectField(blob: string, key: string): string | undefined {
	// `key: 'value'` or `key: "value"` or `key: true` / `key: 123`
	const re = new RegExp(`\\b${key}\\s*:\\s*(?:['"]([^'"]+)['"]|([A-Za-z0-9_.]+))`);
	const m = re.exec(blob);
	if (m === null) return undefined;
	return m[1] ?? m[2];
}

function parseSingleStringArg(blob: string): string | undefined {
	// `@Column('varchar')` or `@Column("varchar")`
	const m = /@Column\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(blob);
	return m === null ? undefined : m[1];
}

function stripQualifier(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot === -1 ? name : name.slice(dot + 1);
}
