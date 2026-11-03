/**
 * SQL parser (Epic c2ba6fa6, Story s9).
 *
 * Owns '.sql' (the artifact reader no longer lists it) behind the registry's
 * guarded load of @derekstride/tree-sitter-sql 0.3.11.
 *
 * Extracted from a .sql file:
 *  - the file entity and the whole-file document entity exactly as the
 *    artifact reader wrote them (same ids, names and flags), so retrieval and
 *    the vectors already stored for SQL documents are unaffected
 *  - CREATE TABLE -> table, CREATE [OR REPLACE] VIEW -> view, named by the
 *    schema-qualified name (`app.users`), each identifier written unquoted
 *    unless its double quotes change its meaning (`"Users"`, `"a.b"`; see
 *    sql-names.ts); DEFINES from the file
 *  - REFERENCES from a table to each table its REFERENCES clauses name, and
 *    from a view to each relation it selects from (FROM, JOIN, subqueries);
 *    a name the view's own WITH clause defines is a CTE, not a reference
 *  - a reference to a table or view of this file is resolved here (the
 *    resolver marks it 'extracted'); one to another file is written pending
 *    under its name as written, quotes kept, for the cross-file pass
 *
 * Names compare by the SQL name rule (ISSUE-0f3376a0): a double-quoted
 * identifier exactly, any other case-insensitively, so "Orders" and orders are
 * different names and the quoted single name "a.b" is not a.b. A file over
 * the artifact reader's size limit is skipped, as it was before. When the
 * grammar cannot load, a .sql file is still stored as its document.
 *
 * Left out: other statements (indexes, functions, triggers, inserts) are not
 * entities; references from DML outside a view are not recorded.
 */

import { createRequire } from 'node:module';
import { basename } from 'node:path';
import type { CodeParser, ParseResult } from './base.js';
import { makeEntityId } from './base.js';
import type { Entity, Language, Relation } from '../../shared/types.js';
import { loadReader, registerParser } from './registry.js';
import { setSqlReferenceReader } from '../../db/relations.js';
import { sqlNameKey, sqlStoredIdentifier } from './sql-names.js';

type SyntaxNode = import('tree-sitter').SyntaxNode;

// The artifact reader's limits, kept so a .sql file reads as it did before.
const MAX_SIZE = 256 * 1024;
const MAX_BODY = 8192;
const truncate = (text: string): string => text.length <= MAX_BODY ? text : text.slice(0, MAX_BODY) + '\n… (truncated)';

const identifiers = (ref: SyntaxNode): SyntaxNode[] => ref.namedChildren.filter(c => c.type === 'identifier');

/**
 * An identifier of `stmt` the grammar cannot read, unquoted as before the name
 * rule -- a backticked identifier holding a dot, or a double-quoted one the
 * grammar cut at an escaped quote ("a""b" reads as "a") -- or undefined.
 */
function grammarLimit(id: SyntaxNode, stmt: SyntaxNode): string | undefined {
	const t = id.text;
	const cut = t.startsWith('"') && stmt.text[id.endIndex - stmt.startIndex] === '"';
	return cut || (t.startsWith('`') && t.includes('.')) ? t.slice(1, -1) : undefined;
}

/** The name a definition's object_reference in `stmt` stores (`app.users`, `"Orders"`). */
const storedName = (ref: SyntaxNode, stmt: SyntaxNode): string =>
	identifiers(ref).map(c => grammarLimit(c, stmt) ?? sqlStoredIdentifier(c.text)).join('.');

/** The name an object_reference in `stmt` is written with (`app."Ledger"`, `` `app`.`users` ``), quotes kept. */
const writtenName = (ref: SyntaxNode, stmt: SyntaxNode): string =>
	identifiers(ref).map(c => grammarLimit(c, stmt) ?? c.text).join('.');

/** Every node of `type` under `root`, in source order. */
function descendants(root: SyntaxNode, type: string): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	const stack: SyntaxNode[] = [root];
	while (stack.length > 0) {
		const n = stack.pop()!;
		if (n.type === type) out.push(n);
		for (let i = n.namedChildCount - 1; i >= 0; i--) stack.push(n.namedChild(i)!);
	}
	return out;
}

/** The relations a table's REFERENCES clauses name. */
function tableReferences(stmt: SyntaxNode): string[] {
	const names: string[] = [];
	for (const kw of descendants(stmt, 'keyword_references')) {
		const ref = kw.nextNamedSibling;
		if (ref !== null && ref.type === 'object_reference') names.push(writtenName(ref, stmt));
	}
	return names;
}

/** The relations a view selects from, without the names its WITH clause defines (matched by key). */
function viewReferences(stmt: SyntaxNode): string[] {
	const ctes = new Set(descendants(stmt, 'cte').map(c => c.namedChildren.find(n => n.type === 'identifier')).filter(n => n !== undefined).map(n => sqlNameKey(grammarLimit(n, stmt) ?? n.text)));
	const names: string[] = [];
	for (const rel of descendants(stmt, 'relation')) {
		const ref = rel.namedChildren.find(c => c.type === 'object_reference');
		if (ref === undefined) continue;
		const name = writtenName(ref, stmt);
		if (!ctes.has(sqlNameKey(name))) names.push(name);
	}
	return names;
}

/**
 * The SQL reader. Built without a grammar (`null`) it is the fallback for a
 * machine where the grammar cannot load: it writes the file and document
 * entities only, as the artifact reader did, and is listed under 'config' so
 * the languages request still says SQL is not read, with the load error.
 */
export class SqlParser implements CodeParser {
	readonly language: Language;
	private readonly tsParser: import('tree-sitter') | null;

	constructor(Parser: typeof import('tree-sitter') | null, grammar: unknown, readonly extensions: string[] = ['.sql']) {
		this.tsParser = Parser === null ? null : new Parser();
		(this.tsParser as { setLanguage(l: unknown): void } | null)?.setLanguage(grammar);
		this.language = this.tsParser === null ? 'config' : 'sql';
	}

	/**
	 * The names a CREATE TABLE / VIEW statement references, as written (quotes
	 * kept) and read as this reader reads them when it parses the file (a
	 * view's CTE names are not references; strings, comments and aliases are
	 * not names), or undefined
	 * without a grammar or when the text holds no such statement.
	 */
	referencesIn(statement: string): string[] | undefined {
		const root = (this.tsParser as { parse(s: string): { rootNode: SyntaxNode } } | null)?.parse(statement).rootNode;
		if (root === undefined) return undefined;
		const stmt = [...descendants(root, 'create_table'), ...descendants(root, 'create_view')]
			.sort((a, b) => a.startIndex - b.startIndex)[0];
		if (stmt === undefined) return undefined;
		return stmt.type === 'create_table' ? tableReferences(stmt) : viewReferences(stmt);
	}

	parse(filePath: string, source: string, repo: string, repoId: number): ParseResult {
		if (source.length > MAX_SIZE) return { entities: [], relations: [] };
		const name = basename(filePath);
		const now = new Date().toISOString();
		const lines = source.split('\n').length;
		const root = (this.tsParser as { parse(s: string): { rootNode: SyntaxNode } } | null)?.parse(source).rootNode;

		const fileId = makeEntityId(repo, filePath, 'file', filePath);
		const base = { language: 'sql' as const, repoId, repo, file: filePath, embedding: [], indexedAt: now };
		const entities: Entity[] = [
			{ ...base, id: fileId, kind: 'file', name, startLine: 1, endLine: lines, body: '', artifact: true,
				...(root?.hasError === true ? { signature: 'parse-error' } : {}) },
			{ ...base, id: makeEntityId(repo, filePath, 'document', name), kind: 'document', name, startLine: 1, endLine: lines, body: truncate(source), artifact: true },
		];
		const relations: Relation[] = [{ kind: 'DEFINES', from: fileId, to: entities[1]!.id, resolved: true }];

		// Every CREATE TABLE / VIEW, ERROR regions included.
		const defs: { id: string; refs: string[] }[] = [];
		const byName = new Map<string, string>();
		for (const stmt of root === undefined ? [] : [...descendants(root, 'create_table'), ...descendants(root, 'create_view')]) {
			const ref = stmt.namedChildren.find(c => c.type === 'object_reference');
			if (ref === undefined) continue;
			const objName = storedName(ref, stmt);
			if (objName === '') continue;
			const kind = stmt.type === 'create_table' ? 'table' : 'view';
			const id = makeEntityId(repo, filePath, kind, objName);
			if (entities.some(e => e.id === id)) continue;
			entities.push({
				...base, id, kind, name: objName, isExported: true,
				startLine: stmt.startPosition.row + 1, endLine: stmt.endPosition.row + 1, body: stmt.text,
				signature: `${kind} ${objName}`,
			});
			relations.push({ kind: 'DEFINES', from: fileId, to: id, resolved: true });
			byName.set(sqlNameKey(objName), id);
			defs.push({ id, refs: kind === 'table' ? tableReferences(stmt) : viewReferences(stmt) });
		}

		for (const d of defs) {
			// One reference per name key, under the first way it is written.
			const byKey = new Map<string, string>();
			for (const target of d.refs) if (!byKey.has(sqlNameKey(target))) byKey.set(sqlNameKey(target), target);
			for (const [key, target] of byKey) {
				const local = byName.get(key);
				relations.push(local !== undefined
					? { kind: 'REFERENCES', from: d.id, to: local, resolved: true }
					: { kind: 'REFERENCES', from: d.id, to: target, resolved: false, meta: { file: filePath, repo } });
			}
		}
		return { entities, relations };
	}
}

/**
 * Register the SQL reader for `extensions`, or, when `load` throws, record it
 * unavailable with the error and register the document-only fallback, so a
 * .sql file is still stored as the document it always was. Returns the
 * grammar-backed reader, or `null`.
 */
export function registerSqlReader(load: () => SqlParser, extensions: readonly string[] = ['.sql']): SqlParser | null {
	const reader = loadReader('sql', extensions, load);
	if (reader === null) registerParser(new SqlParser(null, null, [...extensions]));
	return reader;
}

/** The registered parser, or `null` when the grammar failed to load (the fallback then reads .sql). */
export const sqlParser: SqlParser | null = registerSqlReader(() => {
	const _require = createRequire(import.meta.url);
	const Parser  = _require('tree-sitter')                 as typeof import('tree-sitter');
	const grammar = _require('@derekstride/tree-sitter-sql') as unknown;
	return new SqlParser(Parser, grammar);
});

// A SQL reference whose target is removed returns pending under the names this
// reader reads in its holder's statement (Story 9d8b5542), not a guess at them.
if (sqlParser !== null) setSqlReferenceReader(statement => sqlParser.referencesIn(statement));
