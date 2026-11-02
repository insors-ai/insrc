/**
 * Rust parser (Epic c2ba6fa6, Story s9).
 *
 * Uses tree-sitter-rust behind the registry's guarded load (loadReader).
 *
 * Extracted from a .rs file:
 *  - file entity
 *  - fn -> function; fn in an impl or trait -> method `Type::name`, DEFINES
 *    from the type (or trait) when it is in this file, else from the file
 *  - struct / enum / union -> class; trait -> interface
 *  - an inline `mod x { ... }` folds `x::` into the names declared in it
 *  - `mod x;` -> IMPORTS of the module's file (`self::x`, which the resolver
 *    probes as x.rs, then x/mod.rs, in the declaring module's directory)
 *  - `use crate::a::B` -> IMPORTS of the file of the longest module path that
 *    exists under the crate's src/ (the crate root when none does); `use`
 *    of a module this file declares, and `self::` / `super::` paths, likewise
 *    from this module's directory or its parent's
 *  - `use serde::X` / `extern crate log` -> IMPORTS to a module stub under
 *    'cargo', named by the crate
 *  - CALLS by callee name (`run()`, `Circle::new()`) from each fn, named by
 *    the entity of this file it reaches from the fn's scope: `helper()` or
 *    `Self::helper()` in `impl Circle` is `Circle::helper` when the file has it
 *  - `impl Trait for Type` -> IMPLEMENTS from the type, when it is in this file
 *
 * A pub item (any visibility, pub(crate) included) is exported; a member of
 * a trait or of a trait impl is exported with its trait.
 *
 * Left out: method calls through a value (`self.r.sqrt()`, `c.area()`) are
 * not recorded -- their target cannot be named without types -- and macro
 * invocations are not calls.
 */

import { createRequire } from 'node:module';
import type { CodeParser, ParseResult } from './base.js';
import { makeEntityId } from './base.js';
import type { Entity } from '../../shared/types.js';
import { loadReader } from './registry.js';
import { SHARED_MODULES_REPO_ID } from '../../shared/repo-namespaces.js';
import { type CWalkCtx, addEntity, collectCalls, fileEntity, pushEntity, qualifyCalls } from './c.js';

type SyntaxNode = import('tree-sitter').SyntaxNode;

const RUST_CALLEE_TYPES: ReadonlySet<string> = new Set(['identifier', 'scoped_identifier']);

/** Where an item sits: its module prefix, and the type or trait whose body holds it. */
interface Scope {
	readonly prefix:   string;
	readonly ownerId:  string | null;
	readonly owner:    string | null;          // 'Circle' -- prepended to a member's name
	readonly exported: boolean | null;         // a trait's or trait impl's visibility, given to its members
}

/** A member or impl whose type may be declared later in the file. */
interface Pending {
	readonly typeName: string;
	readonly childId?: string;                  // DEFINES type -> child
	readonly trait?:   string;                  // IMPLEMENTS type -> trait
}

interface RustCtx extends CWalkCtx {
	readonly pending:  Pending[];
	readonly modNames: Set<string>;             // modules this file declares (`mod x;`)
	readonly imports:  Set<string>;             // IMPORTS targets written so far
}

/** Expressions, bodies and macro token trees hold no items; not walking them keeps a deep expression off the stack. */
const NO_ITEMS = /_expression$|_literal$|^(block|arguments|token_tree|macro_invocation)$/;

const isPub = (node: SyntaxNode): boolean => node.namedChildren.some(c => c.type === 'visibility_modifier');

/** A type as named in an impl (`Circle`, `Circle<T>`, `a::Circle`), without generics. */
const typeNameOf = (node: SyntaxNode | null): string | undefined =>
	node === null ? undefined : (node.type === 'generic_type' ? node.childForFieldName('type')?.text : node.text)?.replace(/<[^]*>/g, '').replace(/\s+/g, '');

/** Every path a use argument names: `a::{b, c::D as E, f::*}` -> a::b, a::c::D, a::f. */
export function usePaths(node: SyntaxNode, prefix = ''): string[] {
	switch (node.type) {
		case 'use_as_clause':  { const p = node.childForFieldName('path'); return p === null ? [] : usePaths(p, prefix); }
		case 'use_wildcard':   { const p = node.namedChildren[0]; return p === undefined ? (prefix === '' ? [] : [prefix.slice(0, -2)]) : usePaths(p, prefix); }
		case 'use_list':       return node.namedChildren.flatMap(c => usePaths(c, prefix));
		case 'scoped_use_list': {
			const path = node.childForFieldName('path');
			const list = node.childForFieldName('list');
			const inner = path === null ? prefix : `${prefix}${path.text.replace(/\s+/g, '')}::`;
			return list === null ? [] : usePaths(list, inner);
		}
		default:               return [`${prefix}${node.text.replace(/\s+/g, '')}`];
	}
}

function moduleStub(ctx: RustCtx, crate: string): void {
	const moduleId = makeEntityId('cargo', '', 'module', crate);
	addEntity(ctx, {
		id: moduleId, kind: 'module', name: crate, language: 'rust', repoId: SHARED_MODULES_REPO_ID.cargo,
		repo: '', file: '', startLine: 0, endLine: 0, body: '', embedding: [], indexedAt: ctx.now,
	});
	if (ctx.imports.has(moduleId)) return;
	ctx.imports.add(moduleId);
	ctx.relations.push({ kind: 'IMPORTS', from: ctx.fileId, to: moduleId, resolved: true });
}

/** An IMPORTS of the file a module path names, resolved by the per-file resolver. */
function moduleImport(ctx: RustCtx, path: string): void {
	if (ctx.imports.has(path)) return;
	ctx.imports.add(path);
	ctx.relations.push({ kind: 'IMPORTS', from: ctx.fileId, to: path, resolved: false, meta: { isRelative: true, file: ctx.filePath, repo: ctx.repo } });
}

function handleUse(path: string, ctx: RustCtx): void {
	const first = path.split('::')[0]!;
	if (first === '') return;
	if (first === 'crate' || first === 'self' || first === 'super') { if (path !== first) moduleImport(ctx, path); return; }
	if (ctx.modNames.has(first)) { moduleImport(ctx, `self::${path}`); return; }
	moduleStub(ctx, first);
}

function handleFunction(node: SyntaxNode, ctx: RustCtx, scope: Scope): void {
	const local = node.childForFieldName('name')?.text;
	if (local === undefined) return;
	const member = scope.owner !== null;
	const name = member ? `${scope.owner}::${local}` : `${scope.prefix}${local}`;
	const kind = member ? 'method' : 'function';
	const params = node.childForFieldName('parameters')?.text ?? '()';
	const ret = node.childForFieldName('return_type')?.text;
	const id = pushEntity(ctx, node, kind, name, {
		isExported: scope.exported ?? isPub(node),
		signature: `fn ${local}${params}${ret !== undefined ? ` -> ${ret}` : ''}`.replace(/\s+/g, ' '),
	});
	if (scope.ownerId !== null) ctx.relations.push({ kind: 'DEFINES', from: scope.ownerId, to: id, resolved: true });
	else if (member) ctx.pending.push({ typeName: scope.owner!, childId: id });
	else ctx.relations.push({ kind: 'DEFINES', from: ctx.fileId, to: id, resolved: true });
	const body = node.childForFieldName('body');
	if (body !== null) collectCalls(body, id, ctx, RUST_CALLEE_TYPES);
}

function walk(node: SyntaxNode, ctx: RustCtx, scope: Scope): void {
	for (const n of node.namedChildren) {
		switch (n.type) {
			case 'mod_item': {
				const name = n.childForFieldName('name')?.text;
				const body = n.childForFieldName('body');
				if (name === undefined) break;
				if (body === null) { moduleImport(ctx, `self::${scope.prefix}${name}`); break; }
				walk(body, ctx, { prefix: `${scope.prefix}${name}::`, ownerId: null, owner: null, exported: null });
				break;
			}
			case 'use_declaration': {
				const arg = n.childForFieldName('argument');
				if (arg !== null) for (const p of usePaths(arg)) handleUse(p, ctx);
				break;
			}
			case 'extern_crate_declaration': {
				const name = n.childForFieldName('name')?.text;
				if (name !== undefined) moduleStub(ctx, name);
				break;
			}
			case 'function_item':
			case 'function_signature_item': handleFunction(n, ctx, scope); break;
			case 'struct_item':
			case 'enum_item':
			case 'union_item':
			case 'trait_item': {
				const local = n.childForFieldName('name')?.text;
				if (local === undefined) break;
				const name = `${scope.prefix}${local}`;
				const kind = n.type === 'trait_item' ? 'interface' : 'class';
				const id = pushEntity(ctx, n, kind, name, { isExported: isPub(n), signature: `${n.type.replace('_item', '')} ${name}` });
				ctx.relations.push({ kind: 'DEFINES', from: ctx.fileId, to: id, resolved: true });
				const body = n.childForFieldName('body');
				if (kind === 'interface' && body !== null) walk(body, ctx, { prefix: scope.prefix, ownerId: id, owner: name, exported: isPub(n) });
				break;
			}
			case 'impl_item': {
				const type = typeNameOf(n.childForFieldName('type'));
				const body = n.childForFieldName('body');
				if (type === undefined) break;
				const owner = `${scope.prefix}${type}`;
				const trait = typeNameOf(n.childForFieldName('trait'));
				if (trait !== undefined) ctx.pending.push({ typeName: owner, trait });
				if (body !== null) walk(body, ctx, { prefix: scope.prefix, ownerId: null, owner, exported: trait !== undefined ? true : null });
				break;
			}
			default: if (!NO_ITEMS.test(n.type)) walk(n, ctx, scope); break;
		}
	}
}

/** DEFINES and IMPLEMENTS from a type declared anywhere in the file; members of a type declared elsewhere hang from the file. */
function settle(ctx: RustCtx): void {
	for (const p of ctx.pending) {
		const typeId = ['class', 'interface'].map(k => makeEntityId(ctx.repo, ctx.filePath, k, p.typeName)).find(id => ctx.ids.has(id));
		if (p.childId !== undefined) ctx.relations.push({ kind: 'DEFINES', from: typeId ?? ctx.fileId, to: p.childId, resolved: true });
		if (p.trait !== undefined && typeId !== undefined) {
			ctx.relations.push({ kind: 'IMPLEMENTS', from: typeId, to: p.trait, resolved: false, meta: { file: ctx.filePath, repo: ctx.repo } });
		}
	}
}

class RustParser implements CodeParser {
	readonly extensions = ['.rs'];
	readonly language = 'rust' as const;
	private readonly tsParser: import('tree-sitter');

	constructor(Parser: typeof import('tree-sitter'), grammar: unknown) {
		this.tsParser = new Parser();
		(this.tsParser as { setLanguage(l: unknown): void }).setLanguage(grammar);
	}

	parse(filePath: string, source: string, repo: string, repoId: number): ParseResult {
		const tree = (this.tsParser as { parse(s: string): { rootNode: SyntaxNode } }).parse(source);
		const ctx: RustCtx = {
			repo, repoId, filePath, fileId: makeEntityId(repo, filePath, 'file', filePath),
			now: new Date().toISOString(), language: 'rust', entities: [] as Entity[], relations: [], ids: new Set(), pending: [], modNames: new Set(), imports: new Set(),
		};
		addEntity(ctx, fileEntity(ctx, source, tree.rootNode.hasError));
		// A `use` of a module this file declares may come before its `mod x;`.
		for (const n of tree.rootNode.namedChildren) {
			if (n.type === 'mod_item' && n.childForFieldName('body') === null) {
				const name = n.childForFieldName('name')?.text;
				if (name !== undefined) ctx.modNames.add(name);
			}
		}
		walk(tree.rootNode, ctx, { prefix: '', ownerId: null, owner: null, exported: null });
		settle(ctx);
		qualifyCalls(ctx, '::', 'Self');
		return { entities: ctx.entities, relations: ctx.relations };
	}
}

/** The registered parser, or `null` when the grammar failed to load. */
export const rustParser: RustParser | null = loadReader('rust', ['.rs'], () => {
	const _require = createRequire(import.meta.url);
	const Parser  = _require('tree-sitter')      as typeof import('tree-sitter');
	const grammar = _require('tree-sitter-rust') as unknown;
	return new RustParser(Parser, grammar);
});
