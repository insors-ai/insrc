/**
 * C parser (Epic c2ba6fa6, Story s9).
 *
 * Uses tree-sitter-c behind the registry's guarded load (loadReader): a
 * grammar that cannot load on this machine skips C files with a stated reason
 * and leaves every other reader registered.
 *
 * Extracted from a .c file (headers, .h, are read by the C++ reader: C and C++
 * are one family, so a C caller links to a declaration in a header):
 *  - file entity
 *  - function_definition -> function (isExported unless `static`); DEFINES
 *  - struct / union / enum with a body, and typedef -> type; DEFINES
 *  - #include "x.h" -> IMPORTS kept unresolved with isRelative, so the
 *    resolver links it to the file the path names relative to this file
 *    (evidence 'extracted'), or classes it no-candidate when it is not on disk
 *  - #include <x.h> -> IMPORTS to a module stub under the 'native' namespace
 *  - call_expression with a plain function name inside a function -> CALLS by
 *    name (the resolver links a same-file target; the cross-file pass the rest)
 *
 * Declarations inside a region with syntax errors are still read: the walk
 * visits every node, ERROR nodes included.
 */

import { createRequire } from 'node:module';
import type { CodeParser, ParseResult } from './base.js';
import { makeEntityId } from './base.js';
import type { Entity, Language, Relation } from '../../shared/types.js';
import { loadReader } from './registry.js';
import { SHARED_MODULES_REPO_ID } from '../../shared/repo-namespaces.js';

type SyntaxNode = import('tree-sitter').SyntaxNode;

const NATIVE_REPO_ID = SHARED_MODULES_REPO_ID.native;

/** The walk's state for one file (shared with the C++ reader). */
export interface CWalkCtx {
	readonly repo:      string;
	readonly repoId:    number;
	readonly filePath:  string;
	readonly fileId:    string;
	readonly now:       string;
	readonly language:  Language;
	readonly entities:  Entity[];
	readonly relations: Relation[];
	/** The ids in `entities`: a duplicate check per entity stays constant-time on a generated file. */
	readonly ids:       Set<string>;
}

/** Add an entity to the walk's result (once per id). */
export function addEntity(ctx: CWalkCtx, entity: Entity): void {
	if (ctx.ids.has(entity.id)) return;
	ctx.ids.add(entity.id);
	ctx.entities.push(entity);
}

/** The identifier a (possibly pointer/array/parenthesised) declarator names. */
export function declaratorName(node: SyntaxNode | null): string | undefined {
	let n: SyntaxNode | null = node;
	while (n !== null) {
		if (n.type === 'identifier' || n.type === 'field_identifier' || n.type === 'type_identifier') return n.text;
		if (n.type === 'qualified_identifier' || n.type === 'destructor_name' || n.type === 'operator_name') return n.text;
		n = n.childForFieldName('declarator') ?? n.namedChildren.find(c => /declarator$|identifier$/.test(c.type)) ?? null;
	}
	return undefined;
}

/** The function_declarator under a definition's declarator (through pointers). */
export function functionDeclarator(node: SyntaxNode | null): SyntaxNode | undefined {
	let n: SyntaxNode | null = node;
	while (n !== null) {
		if (n.type === 'function_declarator') return n;
		n = n.childForFieldName('declarator');
	}
	return undefined;
}

function hasStorageClass(node: SyntaxNode, word: string): boolean {
	return node.namedChildren.some(c => c.type === 'storage_class_specifier' && c.text === word);
}

export function pushEntity(ctx: CWalkCtx, node: SyntaxNode, kind: Entity['kind'], name: string, extra: Partial<Entity> = {}): string {
	const id = makeEntityId(ctx.repo, ctx.filePath, kind, name);
	addEntity(ctx, {
		id, kind, name, language: ctx.language, repoId: ctx.repoId, repo: ctx.repo, file: ctx.filePath,
		startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1,
		body: node.text, embedding: [], indexedAt: ctx.now, ...extra,
	});
	return id;
}

/** #include "x" (relative, resolved to a file) or #include <x> (a native module stub). */
export function handleInclude(node: SyntaxNode, ctx: CWalkCtx): void {
	const path = node.childForFieldName('path');
	if (path === null) return;
	if (path.type === 'string_literal') {
		const spec = path.text.replace(/^"|"$/g, '');
		if (spec === '') return;
		ctx.relations.push({ kind: 'IMPORTS', from: ctx.fileId, to: spec, resolved: false, meta: { isRelative: true, file: ctx.filePath, repo: ctx.repo } });
		return;
	}
	if (path.type === 'system_lib_string') {
		const name = path.text.replace(/^<|>$/g, '');
		if (name === '') return;
		const moduleId = makeEntityId('native', '', 'module', name);
		addEntity(ctx, {
			id: moduleId, kind: 'module', name, language: ctx.language, repoId: NATIVE_REPO_ID,
			repo: '', file: '', startLine: 0, endLine: 0, body: '', embedding: [], indexedAt: ctx.now,
		});
		ctx.relations.push({ kind: 'IMPORTS', from: ctx.fileId, to: moduleId, resolved: true });
	}
}

/** The callee node types a call is recorded by: a plain name, or a qualified one in C++. */
const C_CALLEE_TYPES: ReadonlySet<string> = new Set(['identifier', 'qualified_identifier']);

/** CALLS by name from `fromId` for every call under `body` whose callee is one of `calleeTypes`. */
export function collectCalls(body: SyntaxNode, fromId: string, ctx: CWalkCtx, calleeTypes: ReadonlySet<string> = C_CALLEE_TYPES): void {
	const stack: SyntaxNode[] = [body];
	const seen = new Set<string>();
	while (stack.length > 0) {
		const n = stack.pop()!;
		if (n.type === 'call_expression') {
			const fn = n.childForFieldName('function');
			const name = fn !== null && calleeTypes.has(fn.type) ? fn.text : undefined;
			if (name !== undefined && !seen.has(name)) {
				seen.add(name);
				ctx.relations.push({ kind: 'CALLS', from: fromId, to: name, resolved: false, meta: { file: ctx.filePath, repo: ctx.repo } });
			}
		}
		for (const c of n.namedChildren) stack.push(c);
	}
}

/**
 * Name each pending call by the entity of this file it reaches from where it
 * is written: a callee written `area` inside `geo::Shape::twice` is
 * `geo::Shape::area` when this file has it, then `geo::area`, then `area` as
 * written -- the innermost scope first, as C++ and Rust look names up.
 * `selfWord` (Rust's `Self`) is rewritten to the caller's owner, so `Self::x`
 * reaches the impl's own member.
 */
export function qualifyCalls(ctx: CWalkCtx, sep: string, selfWord?: string): void {
	const byId = new Map(ctx.entities.map(e => [e.id, e.name]));
	const names = new Set(ctx.entities.filter(e => e.kind === 'function' || e.kind === 'method' || e.kind === 'class').map(e => e.name));
	ctx.relations.forEach((r, i) => {
		if (r.kind !== 'CALLS' || r.resolved) return;
		const caller = byId.get(r.from);
		if (caller === undefined) return;
		const scopes = caller.split(sep).slice(0, -1);
		let callee = r.to;
		if (selfWord !== undefined && callee.startsWith(`${selfWord}${sep}`) && scopes.length > 0) callee = `${scopes.join(sep)}${callee.slice(selfWord.length)}`;
		let to = callee;
		for (let k = scopes.length; k >= 1; k--) {
			const q = `${scopes.slice(0, k).join(sep)}${sep}${callee}`;
			if (names.has(q)) { to = q; break; }
		}
		if (to !== r.to) ctx.relations[i] = { ...r, to };
	});
}

/** A struct/union/enum with a body, or a typedef, as a type entity. */
export function handleTypeSpecifier(node: SyntaxNode, ctx: CWalkCtx): void {
	if (node.type === 'type_definition') {
		const name = declaratorName(node.childForFieldName('declarator'));
		if (name === undefined) return;
		const id = pushEntity(ctx, node, 'type', name, { signature: node.text.split('\n')[0]!.slice(0, 200) });
		ctx.relations.push({ kind: 'DEFINES', from: ctx.fileId, to: id, resolved: true });
		return;
	}
	const name = node.childForFieldName('name')?.text;
	if (name === undefined || node.childForFieldName('body') === null) return;
	const keyword = node.type.replace('_specifier', '');
	const id = pushEntity(ctx, node, 'type', name, { signature: `${keyword} ${name}` });
	ctx.relations.push({ kind: 'DEFINES', from: ctx.fileId, to: id, resolved: true });
}

/** A function definition as a function entity with its calls. */
export function handleFunctionDefinition(node: SyntaxNode, ctx: CWalkCtx): void {
	const decl = functionDeclarator(node.childForFieldName('declarator'));
	const name = declaratorName(decl?.childForFieldName('declarator') ?? null);
	if (decl === undefined || name === undefined) return;
	const returnType = node.childForFieldName('type')?.text ?? '';
	const id = pushEntity(ctx, node, 'function', name, {
		isExported: !hasStorageClass(node, 'static'),
		signature: `${returnType} ${decl.text}`.trim(),
	});
	ctx.relations.push({ kind: 'DEFINES', from: ctx.fileId, to: id, resolved: true });
	const body = node.childForFieldName('body');
	if (body !== null) collectCalls(body, id, ctx);
}

/** Walk every node of a C translation unit (ERROR regions included). */
function walkC(root: SyntaxNode, ctx: CWalkCtx): void {
	const stack: SyntaxNode[] = [root];
	while (stack.length > 0) {
		const n = stack.pop()!;
		switch (n.type) {
			case 'preproc_include':     handleInclude(n, ctx); continue;
			case 'function_definition': handleFunctionDefinition(n, ctx); continue;
			case 'type_definition':     handleTypeSpecifier(n, ctx); continue;
			case 'struct_specifier':
			case 'union_specifier':
			case 'enum_specifier':      handleTypeSpecifier(n, ctx); break;
			default: break;
		}
		for (const c of n.namedChildren) stack.push(c);
	}
}

/** The file entity every reader writes, marked when the parse had errors. */
export function fileEntity(ctx: CWalkCtx, source: string, hasError: boolean): Entity {
	return {
		id: ctx.fileId, kind: 'file', name: ctx.filePath, language: ctx.language, repoId: ctx.repoId, repo: ctx.repo,
		file: ctx.filePath, startLine: 1, endLine: source.split('\n').length, body: '', embedding: [], indexedAt: ctx.now,
		...(hasError ? { signature: 'parse-error' } : {}),
	};
}

class CParser implements CodeParser {
	readonly extensions = ['.c'];
	readonly language = 'c' as const;
	private readonly tsParser: import('tree-sitter');

	constructor(Parser: typeof import('tree-sitter'), grammar: unknown) {
		this.tsParser = new Parser();
		(this.tsParser as { setLanguage(l: unknown): void }).setLanguage(grammar);
	}

	parse(filePath: string, source: string, repo: string, repoId: number): ParseResult {
		const tree = (this.tsParser as { parse(s: string): { rootNode: SyntaxNode } }).parse(source);
		const ctx: CWalkCtx = {
			repo, repoId, filePath, fileId: makeEntityId(repo, filePath, 'file', filePath),
			now: new Date().toISOString(), language: 'c', entities: [], relations: [], ids: new Set(),
		};
		addEntity(ctx, fileEntity(ctx, source, tree.rootNode.hasError));
		walkC(tree.rootNode, ctx);
		return { entities: ctx.entities, relations: ctx.relations };
	}
}

/** The registered parser, or `null` when the grammar failed to load. */
export const cParser: CParser | null = loadReader('c', ['.c'], () => {
	const _require = createRequire(import.meta.url);
	const Parser  = _require('tree-sitter')   as typeof import('tree-sitter');
	const grammar = _require('tree-sitter-c') as unknown;
	return new CParser(Parser, grammar);
});
