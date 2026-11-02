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
 *    unquoted, schema-qualified name (`app.users`); DEFINES from the file
 *  - REFERENCES from a table to each table its REFERENCES clauses name, and
 *    from a view to each relation it selects from (FROM, JOIN, subqueries);
 *    a name the view's own WITH clause defines is a CTE, not a reference
 *  - a reference to a table or view of this file is resolved here (the
 *    resolver marks it 'extracted'); one to another file is written pending
 *    by name -- the cross-file pass does not match SQL names in this Story
 *    (user decision 2026-11-02; a recorded pending item)
 *
 * Unquoted names match case-insensitively, as SQL compares them. A file over
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

type SyntaxNode = import('tree-sitter').SyntaxNode;

// The artifact reader's limits, kept so a .sql file reads as it did before.
const MAX_SIZE = 256 * 1024;
const MAX_BODY = 8192;
const truncate = (text: string): string => text.length <= MAX_BODY ? text : text.slice(0, MAX_BODY) + '\n… (truncated)';

/** An identifier without its quotes: "Orders", `Orders` and [Orders] are Orders. */
const unquote = (text: string): string => text.replace(/^"(.*)"$|^`(.*)`$|^\[(.*)\]$/s, (_m, a, b, c) => a ?? b ?? c);

/** The dotted, unquoted name an object_reference names (`app.users`). */
const objectName = (ref: SyntaxNode): string =>
	ref.namedChildren.filter(c => c.type === 'identifier').map(c => unquote(c.text)).join('.');

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
		if (ref !== null && ref.type === 'object_reference') names.push(objectName(ref));
	}
	return names;
}

/** The relations a view selects from, without the names its WITH clause defines. */
function viewReferences(stmt: SyntaxNode): string[] {
	const ctes = new Set(descendants(stmt, 'cte').map(c => c.namedChildren.find(n => n.type === 'identifier')?.text).filter(n => n !== undefined).map(n => unquote(n).toLowerCase()));
	const names: string[] = [];
	for (const rel of descendants(stmt, 'relation')) {
		const ref = rel.namedChildren.find(c => c.type === 'object_reference');
		if (ref === undefined) continue;
		const name = objectName(ref);
		if (!ctes.has(name.toLowerCase())) names.push(name);
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
	readonly extensions = ['.sql'];
	readonly language: Language;
	private readonly tsParser: import('tree-sitter') | null;

	constructor(Parser: typeof import('tree-sitter') | null, grammar: unknown) {
		this.tsParser = Parser === null ? null : new Parser();
		(this.tsParser as { setLanguage(l: unknown): void } | null)?.setLanguage(grammar);
		this.language = this.tsParser === null ? 'config' : 'sql';
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
			const objName = objectName(ref);
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
			byName.set(objName.toLowerCase(), id);
			defs.push({ id, refs: kind === 'table' ? tableReferences(stmt) : viewReferences(stmt) });
		}

		for (const d of defs) {
			for (const target of new Set(d.refs)) {
				const local = byName.get(target.toLowerCase());
				relations.push(local !== undefined
					? { kind: 'REFERENCES', from: d.id, to: local, resolved: true }
					: { kind: 'REFERENCES', from: d.id, to: target, resolved: false, meta: { file: filePath, repo } });
			}
		}
		return { entities, relations };
	}
}

/** The registered parser, or `null` when the grammar failed to load. */
export const sqlParser: SqlParser | null = loadReader('sql', ['.sql'], () => {
	const _require = createRequire(import.meta.url);
	const Parser  = _require('tree-sitter')                 as typeof import('tree-sitter');
	const grammar = _require('@derekstride/tree-sitter-sql') as unknown;
	return new SqlParser(Parser, grammar);
});

// Without the grammar a .sql file is still stored as the document it always was.
if (sqlParser === null) registerParser(new SqlParser(null, null));
