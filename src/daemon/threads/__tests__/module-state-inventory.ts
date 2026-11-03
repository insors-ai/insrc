/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Module-scope state a session worker can load (Story 5d393a4b S001): the top-level
 * declarations, in the import closure of the session worker, that hold state which can change.
 * Read-only source scan with the type checker, like connection-source-inventory.ts.
 */

import { join, relative, sep } from 'node:path';
import ts from 'typescript';

export interface ModuleStateSite {
	/** `<file>#<name>`, the file relative to the repo root. */
	readonly key: string;
	readonly file: string;
	readonly name: string;
	readonly kind: 'let' | 'var' | 'container' | 'literal';
}

export const SESSION_WORKER_ENTRY = 'src/daemon/threads/session-worker.ts';

/** Methods that change the array, Map or Set they are called on. */
const MUTATORS = new Set(['set', 'add', 'delete', 'clear', 'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);

function options(root: string): ts.CompilerOptions {
	const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
	if (config.error) throw new Error('Cannot read module-state inventory tsconfig');
	return ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
}

const isSource = (root: string, file: string): boolean => {
	const rel = relative(root, file).split(sep).join('/');
	return rel.startsWith('src/') && !rel.endsWith('.d.ts') && !rel.split('/').includes('__tests__') && !rel.endsWith('.test.ts');
};

/** The files the entry loads at run time: value imports, re-exports and string-literal dynamic imports, within src/. */
function closure(root: string, entry: string, opts: ts.CompilerOptions): string[] {
	const host = ts.createCompilerHost(opts);
	const seen = new Set<string>();
	const queue = [join(root, entry)];
	while (queue.length > 0) {
		const file = queue.pop()!;
		if (seen.has(file)) continue;
		seen.add(file);
		const text = ts.sys.readFile(file);
		if (text === undefined) continue;
		const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
		const specifiers: string[] = [];
		const visit = (node: ts.Node): void => {
			if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !node.importClause?.isTypeOnly) specifiers.push(node.moduleSpecifier.text);
			else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) specifiers.push(node.moduleSpecifier.text);
			else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) specifiers.push(node.arguments[0].text);
			ts.forEachChild(node, visit);
		};
		visit(source);
		for (const specifier of specifiers) {
			const resolved = ts.resolveModuleName(specifier, file, opts, host).resolvedModule;
			if (resolved && !resolved.isExternalLibraryImport && isSource(root, resolved.resolvedFileName)) queue.push(resolved.resolvedFileName);
		}
	}
	return [...seen].filter(file => isSource(root, file));
}

/** The expression under `as`, `satisfies`, `!` and parentheses. */
function unwrap(node: ts.Expression): ts.Expression {
	while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node)) {
		if (ts.isAsExpression(node) && ts.isTypeReferenceNode(node.type) && node.type.typeName.getText() === 'const') return node;
		node = node.expression;
	}
	return node;
}

const isAsConst = (node: ts.Expression): boolean => {
	for (let n: ts.Expression = node; ; ) {
		if (ts.isAsExpression(n) && ts.isTypeReferenceNode(n.type) && n.type.typeName.getText() === 'const') return true;
		if (ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isParenthesizedExpression(n)) { n = n.expression; continue; }
		return false;
	}
};

const isFreeze = (node: ts.Expression): boolean =>
	ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.getText() === 'Object.freeze';

const isAssignment = (kind: ts.SyntaxKind): boolean => kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

/** Whether `id` (a reference to a module-scope literal) is written through: a property write, delete, ++/--, a mutating call, or Object.assign into it. */
function writes(id: ts.Identifier): boolean {
	let node: ts.Node = id;
	// Walk up the access chain the identifier heads (x, x.a, x[k], x.a.b ...).
	while ((ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent)) && node.parent.expression === node) {
		const access = node.parent;
		const up = access.parent;
		if (ts.isBinaryExpression(up) && up.left === access && isAssignment(up.operatorToken.kind)) return true;
		if ((ts.isPrefixUnaryExpression(up) || ts.isPostfixUnaryExpression(up)) && (up.operator === ts.SyntaxKind.PlusPlusToken || up.operator === ts.SyntaxKind.MinusMinusToken)) return true;
		if (ts.isDeleteExpression(up)) return true;
		if (ts.isCallExpression(up) && up.expression === access && ts.isPropertyAccessExpression(access) && MUTATORS.has(access.name.text)) return true;
		node = access;
	}
	const call = id.parent;
	return ts.isCallExpression(call) && call.arguments[0] === id && call.expression.getText() === 'Object.assign';
}

/** Every module-scope mutable declaration the entry (by default the session worker) can load, sorted by key. */
export function moduleStateInventory(root: string, entry: string = SESSION_WORKER_ENTRY): ModuleStateSite[] {
	const opts = options(root);
	const files = closure(root, entry, opts);
	const program = ts.createProgram(files, opts);
	const checker = program.getTypeChecker();
	const sites: ModuleStateSite[] = [];
	const site = (file: string, name: string, kind: ModuleStateSite['kind']): ModuleStateSite => {
		const rel = relative(root, file).split(sep).join('/');
		return { key: `${rel}#${name}`, file: rel, name, kind };
	};
	// Const literals that count only if something writes to them.
	const literals = new Map<ts.Symbol, ModuleStateSite>();
	const sources = files.map(file => program.getSourceFile(file)).filter((s): s is ts.SourceFile => s !== undefined);
	for (const source of sources) {
		for (const statement of source.statements) {
			if (!ts.isVariableStatement(statement)) continue;
			const flags = statement.declarationList.flags;
			const kind = flags & ts.NodeFlags.Const ? 'const' : flags & ts.NodeFlags.Let ? 'let' : 'var';
			for (const decl of statement.declarationList.declarations) {
				if (kind !== 'const') {
					const names: string[] = [];
					const collect = (name: ts.BindingName): void => {
						if (ts.isIdentifier(name)) names.push(name.text);
						else for (const element of name.elements) if (!ts.isOmittedExpression(element)) collect(element.name);
					};
					collect(decl.name);
					for (const name of names) sites.push(site(source.fileName, name, kind));
					continue;
				}
				if (!ts.isIdentifier(decl.name) || decl.initializer === undefined || isAsConst(decl.initializer)) continue;
				const init = unwrap(decl.initializer);
				if (isFreeze(init)) continue;
				if (ts.isNewExpression(init)) sites.push(site(source.fileName, decl.name.text, 'container'));
				else if (ts.isArrayLiteralExpression(init) || ts.isObjectLiteralExpression(init)) {
					const symbol = checker.getSymbolAtLocation(decl.name);
					if (symbol) literals.set(symbol, site(source.fileName, decl.name.text, 'literal'));
				}
			}
		}
	}
	if (literals.size > 0) {
		const written = new Set<ModuleStateSite>();
		for (const source of sources) {
			const visit = (node: ts.Node): void => {
				if (ts.isIdentifier(node) && writes(node)) {
					let symbol = checker.getSymbolAtLocation(node);
					if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
					const hit = symbol && literals.get(symbol);
					if (hit) written.add(hit);
				}
				ts.forEachChild(node, visit);
			};
			visit(source);
		}
		sites.push(...written);
	}
	return sites.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** How one module-scope value is held across threads. */
export type StateClass = 'per-thread' | 'shared-store' | 'one-owner';
export type StateOwner = 'shared-state' | 'main' | 'admin' | 'indexing';

/** One reviewed entry of the module-state inventory fixture. */
export interface StateEntry {
	readonly class: StateClass;
	/** one-owner only: the thread that holds the value. */
	readonly owner?: StateOwner | undefined;
	/** one-owner on the shared-state worker: the method prefix whose methods reach it there (as s3 routes chat., todos., understanding.). */
	readonly methods?: string | undefined;
	readonly reason: string;
}

const CLASSES: ReadonlySet<string> = new Set(['per-thread', 'shared-store', 'one-owner']);
const OWNERS: ReadonlySet<string> = new Set(['shared-state', 'main', 'admin', 'indexing']);

/**
 * What is wrong between the scanned sites and the fixture, one line per problem naming the key:
 * an unclassified site, a stale entry, or an entry with an invalid class, owner or reason, or a
 * shared-state owner whose methods no routed method starts with. `prefix` limits both sides to
 * keys under it.
 */
export function inventoryProblems(
	sites: readonly ModuleStateSite[], fixture: Readonly<Record<string, StateEntry>>, routed: ReadonlySet<string>, prefix = '',
): string[] {
	const problems: string[] = [];
	const scanned = new Set(sites.map(s => s.key).filter(k => k.startsWith(prefix)));
	const listed = Object.keys(fixture).filter(k => k.startsWith(prefix));
	for (const key of scanned) if (!Object.hasOwn(fixture, key)) problems.push(`${key}: not classified (add a class and a reason)`);
	for (const key of listed) {
		if (!scanned.has(key)) { problems.push(`${key}: stale (no such module-scope state any more)`); continue; }
		const entry = fixture[key]!;
		if (!CLASSES.has(entry.class)) problems.push(`${key}: invalid class '${String(entry.class)}'`);
		if (typeof entry.reason !== 'string' || entry.reason.trim().length < 40) problems.push(`${key}: reason under 40 characters`);
		if (entry.class !== 'one-owner') continue;
		if (entry.owner === undefined || !OWNERS.has(entry.owner)) { problems.push(`${key}: one-owner without a valid owner`); continue; }
		if (entry.owner === 'shared-state') {
			const methods = entry.methods;
			if (!methods || ![...routed].some(m => m.startsWith(methods))) problems.push(`${key}: owned by the shared-state worker but no routed method starts with '${methods ?? ''}'`);
		}
	}
	return problems.sort();
}
