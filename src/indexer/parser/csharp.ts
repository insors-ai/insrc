/**
 * C# parser (Epic c2ba6fa6, Story s9).
 *
 * Uses tree-sitter-c-sharp 0.23.1 behind the registry's guarded load
 * (loadReader); 0.23.5 is ESM with top-level await and cannot be required.
 *
 * Extracted from a .cs file:
 *  - file entity
 *  - class / record / struct -> class; interface -> interface; enum and
 *    delegate -> type; names folded with their namespaces and enclosing types
 *    (`Geo.Shapes.Circle`), block and file-scoped namespaces alike
 *  - method and constructor -> method `Type.Name`; DEFINES from the type
 *  - `using X.Y;` -> IMPORTS to a module stub under 'nuget' named by the
 *    namespace (aliases and `using static` name theirs)
 *  - CALLS by name: `M()`, `this.M()`, `base.M()` and `Type.M()`. A callee
 *    (or a base, below) that names a member of an enclosing type or namespace
 *    declared in this file is qualified to it, so it links to that entity. A call into
 *    another file through a namespace stays pending: a namespace is not a
 *    file, and this Story maps no namespace to files (the stated limitation).
 *  - base lists -> INHERITS / IMPLEMENTS by name. The syntax does not say
 *    which base is a class: for a class the first base INHERITS unless it is
 *    named like an interface (`IArea`), the rest IMPLEMENTS; an interface's
 *    bases INHERITS; a struct's IMPLEMENTS.
 *
 * Exported: a type or member marked public, internal or protected; a type
 * with no modifier (internal by default); an interface's members.
 *
 * Left out: properties, fields and events are not entities, and a call
 * through a value (`list.Add(x)`) is not recorded -- its target cannot be
 * named without types.
 */

import { createRequire } from 'node:module';
import type { CodeParser, ParseResult } from './base.js';
import { makeEntityId } from './base.js';
import type { Entity } from '../../shared/types.js';
import { loadReader } from './registry.js';
import { SHARED_MODULES_REPO_ID } from '../../shared/repo-namespaces.js';
import { type CWalkCtx, fileEntity, pushEntity } from './c.js';

type SyntaxNode = import('tree-sitter').SyntaxNode;

/** Where a declaration sits: its namespace, and the types enclosing it (innermost last). */
interface Scope {
	readonly namespace: string;                       // 'Geo.Shapes' or ''
	readonly types:     readonly { name: string; id: string; isInterface: boolean }[];
}

/** A call or base recorded during the walk, qualified once every entity of the file is known. */
interface RawRef {
	readonly kind:  'CALLS' | 'INHERITS' | 'IMPLEMENTS';
	readonly from:  string;
	readonly name:  string;
	readonly scope: Scope;
}

interface CsCtx extends CWalkCtx {
	readonly refs: RawRef[];
}

const TYPE_KINDS: Readonly<Record<string, 'class' | 'interface' | 'type'>> = {
	class_declaration: 'class', record_declaration: 'class', struct_declaration: 'class',
	interface_declaration: 'interface', enum_declaration: 'type', delegate_declaration: 'type',
};

const modifiers = (node: SyntaxNode): string[] => node.namedChildren.filter(c => c.type === 'modifier').map(c => c.text);
const visibleOutside = (mods: string[]): boolean => mods.some(m => m === 'public' || m === 'internal' || m === 'protected');
const join = (...parts: string[]): string => parts.filter(p => p !== '').join('.');
const typeName = (node: SyntaxNode): string => (node.type === 'generic_name' ? node.namedChildren[0]?.text ?? node.text : node.text).replace(/\s+/g, '');

function handleUsing(node: SyntaxNode, ctx: CsCtx): void {
	const target = node.namedChildren.find(c => c !== node.childForFieldName('name') && (c.type === 'qualified_name' || c.type === 'identifier'));
	if (target === undefined) return;
	const name = target.text.replace(/\s+/g, '');
	const moduleId = makeEntityId('nuget', '', 'module', name);
	if (ctx.entities.some(e => e.id === moduleId)) return;
	ctx.entities.push({
		id: moduleId, kind: 'module', name, language: 'csharp', repoId: SHARED_MODULES_REPO_ID.nuget,
		repo: '', file: '', startLine: 0, endLine: 0, body: '', embedding: [], indexedAt: ctx.now,
	});
	ctx.relations.push({ kind: 'IMPORTS', from: ctx.fileId, to: moduleId, resolved: true });
}

function handleType(node: SyntaxNode, ctx: CsCtx, scope: Scope): void {
	const local = node.childForFieldName('name')?.text;
	if (local === undefined) return;
	const kind = TYPE_KINDS[node.type]!;
	const outer = scope.types[scope.types.length - 1];
	const name = join(outer?.name ?? scope.namespace, local);
	const mods = modifiers(node);
	const id = pushEntity(ctx, node, kind, name, {
		isExported: visibleOutside(mods) || (outer === undefined && !mods.includes('private')) || outer?.isInterface === true,
		signature: `${[...mods, node.type.replace('_declaration', '')].join(' ')} ${name}`,
	});
	ctx.relations.push({ kind: 'DEFINES', from: outer?.id ?? ctx.fileId, to: id, resolved: true });

	const bases = node.namedChildren.find(c => c.type === 'base_list')?.namedChildren
		.filter(c => c.type === 'identifier' || c.type === 'qualified_name' || c.type === 'generic_name') ?? [];
	bases.forEach((b, i) => {
		const base = typeName(b);
		const last = base.split('.').pop()!;
		const inherits = kind === 'interface' || (node.type === 'class_declaration' && i === 0 && !/^I[A-Z]/.test(last));
		ctx.refs.push({ kind: inherits ? 'INHERITS' : 'IMPLEMENTS', from: id, name: base, scope });
	});

	const body = node.childForFieldName('body');
	if (body !== null && kind !== 'type') walk(body, ctx, { namespace: scope.namespace, types: [...scope.types, { name, id, isInterface: kind === 'interface' }] });
}

function handleMethod(node: SyntaxNode, ctx: CsCtx, scope: Scope): void {
	const owner = scope.types[scope.types.length - 1];
	const local = node.childForFieldName('name')?.text;
	if (owner === undefined || local === undefined) return;
	const name = `${owner.name}.${local}`;
	const params = node.childForFieldName('parameters')?.text ?? '()';
	const returns = node.childForFieldName('returns')?.text;
	const mods = modifiers(node);
	const id = pushEntity(ctx, node, 'method', name, {
		isExported: owner.isInterface || visibleOutside(mods),
		signature: [...mods, returns, `${local}${params}`].filter(p => p !== undefined).join(' ').replace(/\s+/g, ' '),
	});
	ctx.relations.push({ kind: 'DEFINES', from: owner.id, to: id, resolved: true });
	const body = node.childForFieldName('body');
	if (body !== null) collectCalls(body, id, ctx, scope);
}

/** The name a call is recorded by, or undefined for a call through a value. */
function calleeName(fn: SyntaxNode): string | undefined {
	if (fn.type === 'identifier') return fn.text;
	if (fn.type === 'generic_name') return fn.namedChildren[0]?.text;
	if (fn.type !== 'member_access_expression') return undefined;
	const expr = fn.childForFieldName('expression');
	const name = fn.childForFieldName('name');
	if (name === null) return undefined;
	const member = name.type === 'generic_name' ? name.namedChildren[0]?.text : name.text;
	if (member === undefined) return undefined;
	if (expr === null || expr.text === 'this' || expr.text === 'base') return member;
	// `Math.Abs`, `Geo.Util.Go`: a type-like (capitalised) receiver names its member; a value does not.
	if ((expr.type === 'identifier' || expr.type === 'qualified_name' || expr.type === 'member_access_expression') && /^[A-Z]/.test(expr.text.split('.').pop()!)) {
		return `${expr.text.replace(/\s+/g, '')}.${member}`;
	}
	return undefined;
}

function collectCalls(body: SyntaxNode, from: string, ctx: CsCtx, scope: Scope): void {
	const stack: SyntaxNode[] = [body];
	const seen = new Set<string>();
	while (stack.length > 0) {
		const n = stack.pop()!;
		if (n.type === 'invocation_expression') {
			const fn = n.childForFieldName('function');
			const callee = fn === null ? undefined : calleeName(fn);
			if (callee !== undefined && !seen.has(callee)) { seen.add(callee); ctx.refs.push({ kind: 'CALLS', from, name: callee, scope }); }
		}
		for (const c of n.namedChildren) stack.push(c);
	}
}

/**
 * Write each call and base by the name of what it reaches in this file: the
 * name qualified by the innermost enclosing type that has it, then by the
 * namespace and its parents; as written when none does. A call reaches a
 * method or a type, a base a class or an interface.
 */
function settleRefs(ctx: CsCtx): void {
	const named = (kinds: readonly string[]) => new Set(ctx.entities.filter(e => kinds.includes(e.kind)).map(e => e.name));
	const targets = { CALLS: named(['method', 'class']), INHERITS: named(['class', 'interface']), IMPLEMENTS: named(['class', 'interface']) };
	for (const r of ctx.refs) {
		const prefixes = r.scope.types.map(t => t.name).reverse();
		for (let ns = r.scope.namespace; ns !== ''; ns = ns.includes('.') ? ns.slice(0, ns.lastIndexOf('.')) : '') prefixes.push(ns);
		const to = prefixes.map(p => `${p}.${r.name}`).find(q => targets[r.kind].has(q)) ?? r.name;
		ctx.relations.push({ kind: r.kind, from: r.from, to, resolved: false, meta: { file: ctx.filePath, repo: ctx.repo } });
	}
}

function walk(node: SyntaxNode, ctx: CsCtx, scope: Scope): void {
	let current = scope;
	for (const n of node.namedChildren) {
		switch (n.type) {
			case 'using_directive': handleUsing(n, ctx); break;
			case 'namespace_declaration': {
				const name = n.childForFieldName('name')?.text.replace(/\s+/g, '');
				const body = n.childForFieldName('body');
				if (name !== undefined && body !== null) walk(body, ctx, { namespace: join(current.namespace, name), types: [] });
				break;
			}
			// `namespace X;` holds every declaration after it in the file.
			case 'file_scoped_namespace_declaration': {
				const name = n.childForFieldName('name')?.text.replace(/\s+/g, '');
				if (name !== undefined) current = { namespace: join(current.namespace, name), types: [] };
				break;
			}
			case 'method_declaration':
			case 'constructor_declaration': handleMethod(n, ctx, current); break;
			default:
				if (TYPE_KINDS[n.type] !== undefined) handleType(n, ctx, current);
				else walk(n, ctx, current);
				break;
		}
	}
}

class CSharpParser implements CodeParser {
	readonly extensions = ['.cs'];
	readonly language = 'csharp' as const;
	private readonly tsParser: import('tree-sitter');

	constructor(Parser: typeof import('tree-sitter'), grammar: unknown) {
		this.tsParser = new Parser();
		(this.tsParser as { setLanguage(l: unknown): void }).setLanguage(grammar);
	}

	parse(filePath: string, source: string, repo: string, repoId: number): ParseResult {
		const tree = (this.tsParser as { parse(s: string): { rootNode: SyntaxNode } }).parse(source);
		const ctx: CsCtx = {
			repo, repoId, filePath, fileId: makeEntityId(repo, filePath, 'file', filePath),
			now: new Date().toISOString(), language: 'csharp', entities: [] as Entity[], relations: [], refs: [],
		};
		ctx.entities.push(fileEntity(ctx, source, tree.rootNode.hasError));
		walk(tree.rootNode, ctx, { namespace: '', types: [] });
		settleRefs(ctx);
		return { entities: ctx.entities, relations: ctx.relations };
	}
}

/** The registered parser, or `null` when the grammar failed to load. */
export const csharpParser: CSharpParser | null = loadReader('csharp', ['.cs'], () => {
	const _require = createRequire(import.meta.url);
	const Parser  = _require('tree-sitter')         as typeof import('tree-sitter');
	const grammar = _require('tree-sitter-c-sharp') as unknown;
	return new CSharpParser(Parser, grammar);
});
