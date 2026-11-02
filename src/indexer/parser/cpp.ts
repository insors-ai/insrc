/**
 * C++ parser (Epic c2ba6fa6, Story s9).
 *
 * Uses tree-sitter-cpp behind the registry's guarded load (loadReader). Reads
 * .cpp/.cc/.cxx and the headers .hpp/.hh/.hxx and .h: C and C++ are one family
 * (user decision 2026-11-02), and C++ is a superset for declarations, so a C
 * header is read here as 'cpp' and a C caller links to it through the
 * cross-file pass's family rule.
 *
 * Extracted:
 *  - file entity
 *  - class / struct with a body -> class; INHERITS by name for each base in
 *    its base_class_clause (template arguments dropped)
 *  - members: a function defined or declared in a class body -> method
 *    `Class::name`, exported when its access is public; DEFINES from the class
 *  - function_definition at namespace level -> function, or method when its
 *    declarator is qualified (`Shape::area`); DEFINES from its class when the
 *    class is in this file, else from the file
 *  - a function declaration (a prototype) -> function, unless a definition of
 *    the same name is in the file: a header's declarations are what a caller
 *    in another file links to
 *  - enum / union with a body, typedef, `using X = ...` -> type
 *  - includes as for C (quoted -> the file, angle -> a 'native' module stub)
 *  - CALLS by callee name (plain or qualified) from each function and method
 *
 * Names are folded with their namespaces (`geo::Shape::area`). A function in
 * an anonymous namespace, or declared static, is not exported.
 *
 * Left out: a call through an object (`obj.m()`) is not recorded -- its
 * target cannot be named without types -- and an unqualified call or base
 * inside a namespace is recorded as written, so it matches only a target of
 * that exact name.
 */

import { createRequire } from 'node:module';
import type { CodeParser, ParseResult } from './base.js';
import { makeEntityId } from './base.js';
import type { Entity } from '../../shared/types.js';
import { loadReader } from './registry.js';
import {
	type CWalkCtx, collectCalls, declaratorName, fileEntity, functionDeclarator, handleInclude, pushEntity,
} from './c.js';

type SyntaxNode = import('tree-sitter').SyntaxNode;

/** Where a declaration sits: its namespace prefix, its class, and whether it is visible outside the file. */
interface Scope {
	readonly prefix:   string;                  // 'geo::' -- prepended to every name declared here
	readonly classId:  string | null;
	readonly exported: boolean;                 // false inside an anonymous namespace
	access:            'public' | 'private';    // the current access inside a class body
}

/** A declaration kept until the walk ends, written only when no definition took its id. */
interface Prototype {
	readonly node:     SyntaxNode;
	readonly kind:     'function' | 'method';
	readonly name:     string;
	readonly parentId: string;
	readonly exported: boolean;
}

interface CppCtx extends CWalkCtx {
	readonly prototypes: Prototype[];
}

const CPP_EXTENSIONS = ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.h'];

const isStatic = (node: SyntaxNode): boolean =>
	node.namedChildren.some(c => c.type === 'storage_class_specifier' && c.text === 'static');

/** A base class name as written, without template arguments or whitespace. */
const baseName = (node: SyntaxNode): string => node.text.replace(/<[^]*>/g, '').replace(/\s+/g, '');

function handleClass(node: SyntaxNode, ctx: CppCtx, scope: Scope): void {
	const nameNode = node.childForFieldName('name');
	const body = node.childForFieldName('body');
	if (nameNode === null || body === null) return;
	const name = `${scope.prefix}${nameNode.text}`;
	const id = pushEntity(ctx, node, 'class', name, {
		isExported: scope.exported && scope.access === 'public',
		signature: `${node.type === 'struct_specifier' ? 'struct' : 'class'} ${name}`,
	});
	ctx.relations.push({ kind: 'DEFINES', from: scope.classId ?? ctx.fileId, to: id, resolved: true });

	const bases = node.namedChildren.find(c => c.type === 'base_class_clause');
	for (const b of bases?.namedChildren ?? []) {
		if (b.type !== 'type_identifier' && b.type !== 'qualified_identifier' && b.type !== 'template_type') continue;
		ctx.relations.push({ kind: 'INHERITS', from: id, to: baseName(b), resolved: false, meta: { file: ctx.filePath, repo: ctx.repo } });
	}

	const inner: Scope = { prefix: `${name}::`, classId: id, exported: scope.exported, access: node.type === 'struct_specifier' ? 'public' : 'private' };
	walk(body, ctx, inner);
}

/** A function or method defined here, with its calls. */
function handleDefinition(node: SyntaxNode, ctx: CppCtx, scope: Scope): void {
	const decl = functionDeclarator(node.childForFieldName('declarator'));
	const local = declaratorName(decl?.childForFieldName('declarator') ?? null);
	if (decl === undefined || local === undefined) return;
	const name = `${scope.prefix}${local}`;
	const cut = name.lastIndexOf('::');
	// A qualified definition outside its class (`Shape::area`) is that class's method.
	const ownerName = scope.classId === null && local.includes('::') ? name.slice(0, cut) : undefined;
	const ownerId = ownerName !== undefined ? makeEntityId(ctx.repo, ctx.filePath, 'class', ownerName) : undefined;
	const kind = scope.classId !== null || ownerName !== undefined ? 'method' : 'function';
	const exported = scope.exported && !isStatic(node) && (scope.classId === null || scope.access === 'public');
	const id = pushEntity(ctx, node, kind, name, {
		isExported: exported,
		signature: `${node.childForFieldName('type')?.text ?? ''} ${decl.text}`.trim(),
	});
	const parent = scope.classId ?? (ownerId !== undefined && ctx.entities.some(e => e.id === ownerId) ? ownerId : ctx.fileId);
	ctx.relations.push({ kind: 'DEFINES', from: parent, to: id, resolved: true });
	const body = node.childForFieldName('body');
	if (body !== null) collectCalls(body, id, ctx);
}

/** A declaration (`int f(int);` or a member `void m();`) that names a function. */
function handleDeclaration(node: SyntaxNode, ctx: CppCtx, scope: Scope): void {
	const decl = functionDeclarator(node.childForFieldName('declarator'));
	const local = declaratorName(decl?.childForFieldName('declarator') ?? null);
	if (decl === undefined || local === undefined) return;
	ctx.prototypes.push({
		node,
		kind: scope.classId !== null ? 'method' : 'function',
		name: `${scope.prefix}${local}`,
		parentId: scope.classId ?? ctx.fileId,
		exported: scope.exported && !isStatic(node) && (scope.classId === null || scope.access === 'public'),
	});
}

function handleType(node: SyntaxNode, ctx: CppCtx, scope: Scope): void {
	let local: string | undefined;
	if (node.type === 'type_definition') local = declaratorName(node.childForFieldName('declarator'));
	else if (node.type === 'alias_declaration') local = node.childForFieldName('name')?.text;
	else if (node.childForFieldName('body') !== null) local = node.childForFieldName('name')?.text;
	if (local === undefined) return;
	const name = `${scope.prefix}${local}`;
	const id = pushEntity(ctx, node, 'type', name, { signature: node.text.split('\n')[0]!.slice(0, 200) });
	ctx.relations.push({ kind: 'DEFINES', from: scope.classId ?? ctx.fileId, to: id, resolved: true });
}

/** Walk the children of `node` in `scope`, in source order (ERROR regions included). */
function walk(node: SyntaxNode, ctx: CppCtx, scope: Scope): void {
	for (const n of node.namedChildren) {
		switch (n.type) {
			case 'preproc_include':     handleInclude(n, ctx); break;
			case 'access_specifier':    scope.access = n.text.startsWith('public') ? 'public' : 'private'; break;
			case 'namespace_definition': {
				const nameNode = n.childForFieldName('name');
				const body = n.childForFieldName('body');
				if (body === null) break;
				const inner: Scope = nameNode === null
					? { prefix: scope.prefix, classId: null, exported: false, access: 'public' }
					: { prefix: `${scope.prefix}${nameNode.text.replace(/\s+/g, '')}::`, classId: null, exported: scope.exported, access: 'public' };
				walk(body, ctx, inner);
				break;
			}
			case 'class_specifier':
			case 'struct_specifier':    handleClass(n, ctx, scope); break;
			case 'function_definition': handleDefinition(n, ctx, scope); break;
			case 'declaration':
			case 'field_declaration':   handleDeclaration(n, ctx, scope); walk(n, ctx, scope); break;
			case 'enum_specifier':
			case 'union_specifier':
			case 'type_definition':
			case 'alias_declaration':   handleType(n, ctx, scope); if (n.type === 'type_definition') walk(n, ctx, scope); break;
			default:                    walk(n, ctx, scope); break;
		}
	}
}

/** Write each prototype no definition took, and narrow a definition's export to its declared access. */
function settlePrototypes(ctx: CppCtx): void {
	for (const p of ctx.prototypes) {
		const id = makeEntityId(ctx.repo, ctx.filePath, p.kind, p.name);
		const defined = ctx.entities.find(e => e.id === id);
		if (defined !== undefined) {
			if (!p.exported) (defined as { isExported?: boolean }).isExported = false;
			continue;
		}
		pushEntity(ctx, p.node, p.kind, p.name, { isExported: p.exported, signature: p.node.text.replace(/\s+/g, ' ').slice(0, 200) });
		ctx.relations.push({ kind: 'DEFINES', from: p.parentId, to: id, resolved: true });
	}
}

class CppParser implements CodeParser {
	readonly extensions = CPP_EXTENSIONS;
	readonly language = 'cpp' as const;
	private readonly tsParser: import('tree-sitter');

	constructor(Parser: typeof import('tree-sitter'), grammar: unknown) {
		this.tsParser = new Parser();
		(this.tsParser as { setLanguage(l: unknown): void }).setLanguage(grammar);
	}

	parse(filePath: string, source: string, repo: string, repoId: number): ParseResult {
		const tree = (this.tsParser as { parse(s: string): { rootNode: SyntaxNode } }).parse(source);
		const ctx: CppCtx = {
			repo, repoId, filePath, fileId: makeEntityId(repo, filePath, 'file', filePath),
			now: new Date().toISOString(), language: 'cpp', entities: [] as Entity[], relations: [], prototypes: [],
		};
		ctx.entities.push(fileEntity(ctx, source, tree.rootNode.hasError));
		walk(tree.rootNode, ctx, { prefix: '', classId: null, exported: true, access: 'public' });
		settlePrototypes(ctx);
		return { entities: ctx.entities, relations: ctx.relations };
	}
}

/** The registered parser, or `null` when the grammar failed to load. */
export const cppParser: CppParser | null = loadReader('cpp', CPP_EXTENSIONS, () => {
	const _require = createRequire(import.meta.url);
	const Parser  = _require('tree-sitter')     as typeof import('tree-sitter');
	const grammar = _require('tree-sitter-cpp') as unknown;
	return new CppParser(Parser, grammar);
});
