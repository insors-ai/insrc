/**
 * Scala parser.
 *
 * Uses tree-sitter-scala to extract entities + relations. The grammar
 * covers Scala 2.x + Scala 3.x; some bleeding-edge Scala 3 syntax
 * (heavy use of optional braces / significant indentation) trips
 * the parser. Per plan §2.4, files with parse errors still emit
 * their package + cleanly-parsed top-level entities; the file
 * entity gets a `parse-error` marker.
 *
 * Extracted entities:
 *   - class_definition   -> Class (signature carries `class` /
 *                            `case class` / `sealed class` /
 *                            `abstract class` / `final class`)
 *   - object_definition  -> Class (signature: `object` /
 *                            `case object`; suffix `(companion of
 *                            <Name>)` when a same-named class
 *                            exists in the file)
 *   - trait_definition   -> Interface (signature: `trait` /
 *                            `sealed trait`)
 *   - type_definition    -> Type (alias)
 *   - function_definition (top-level)            -> Function
 *   - function_definition (inside template body) -> Method
 *   - function_declaration (abstract def in trait) -> Method (abstract)
 *   - val_definition / var_definition            -> Variable
 *   - given_definition (Scala 3)                 -> Variable
 *                            (signature: `given`)
 *   - extension_definition's inner def           -> Method
 *                            (signature: `extension method`)
 *   - package_clause                             -> Module
 *
 * Extracted relations:
 *   - DEFINES from file -> top-level entity, and from class/object/
 *     trait -> nested members
 *   - IMPORTS from file -> Module stub. Grouped imports
 *     (`{Foo, Bar}`) emit one IMPORTS edge per selector; renames
 *     (`{Foo => F}`) record the alias in `meta.alias`.
 *   - INHERITS from class/trait -> the `extends` parent (raw type
 *     name; resolver closes the loop).
 *   - IMPLEMENTS from class -> each `with` mixin trait (Scala's
 *     `extends A with B with C` -> INHERITS to A, IMPLEMENTS to B
 *     and C).
 *   - INHERITS from trait -> super-traits in the trait's `extends`
 *     clause (same shape as Java interface inheritance).
 *
 * Annotations fold into the entity's `signature` prefix. Companion
 * objects carry a `(companion of <ClassName>)` suffix in their
 * signature when a same-named class entity is found in the same
 * file -- analyzer queries grep on the suffix, no separate edge.
 */

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);

const Parser       = _require('tree-sitter')       as typeof import('tree-sitter');
const ScalaGrammar = _require('tree-sitter-scala') as unknown;

import type { CodeParser, ParseResult } from './base.js';
import { makeEntityId } from './base.js';
import type { Entity, Relation } from '../../shared/types.js';
import { registerParser } from './registry.js';
import { SHARED_MODULES_REPO_ID } from '../../shared/repo-namespaces.js';

const MODULE_NAMESPACE = 'jvm' as const;
const MODULE_REPO_ID = SHARED_MODULES_REPO_ID[MODULE_NAMESPACE];

type SyntaxNode = import('tree-sitter').SyntaxNode;

// ---------------------------------------------------------------------------
// Modifier extraction
// ---------------------------------------------------------------------------

const MODIFIER_KEYWORDS = new Set([
	'sealed', 'final', 'abstract', 'override', 'lazy', 'implicit',
	'inline', 'opaque', 'open', 'transparent',
]);

interface ScalaModifiers {
	readonly keywords: readonly string[];
	readonly annotations: readonly string[];
	readonly access: string | null;       // 'private' | 'protected' | null
	readonly isCase: boolean;
	readonly isAbstract: boolean;
	readonly isSealed: boolean;
	readonly isFinal: boolean;
	readonly isOverride: boolean;
	readonly isImplicit: boolean;
}

function readScalaModifiers(node: SyntaxNode): ScalaModifiers {
	const keywords: string[] = [];
	const annotations: string[] = [];
	let access: string | null = null;
	let isCase = false;

	// Walk all children (named + anonymous) up to the first non-modifier
	// content (`class` / `object` / `trait` / `def` / etc.).
	for (let i = 0; i < node.childCount; i++) {
		const child = node.child(i);
		if (child === null) { continue; }

		// Annotations appear as named `annotation` children.
		if (child.type === 'annotation') {
			annotations.push(child.text);
			continue;
		}

		// `modifiers` is a named child wrapping multiple modifier tokens.
		if (child.type === 'modifiers') {
			for (let j = 0; j < child.childCount; j++) {
				const m = child.child(j);
				if (m === null) { continue; }
				if (MODIFIER_KEYWORDS.has(m.type)) { keywords.push(m.type); }
				else if (m.type === 'access_modifier') {
					// First token inside access_modifier is `private` or `protected`.
					const first = m.child(0);
					if (first !== null) { access = first.type; }
				}
			}
			continue;
		}

		// `case` is a direct anonymous-token sibling of class_definition.
		if (child.type === 'case' && !child.isNamed) {
			isCase = true;
			continue;
		}
	}

	return {
		keywords,
		annotations,
		access,
		isCase,
		isAbstract: keywords.includes('abstract'),
		isSealed:   keywords.includes('sealed'),
		isFinal:    keywords.includes('final'),
		isOverride: keywords.includes('override'),
		isImplicit: keywords.includes('implicit'),
	};
}

function buildScalaSignaturePrefix(mods: ScalaModifiers): string {
	const parts: string[] = [];
	for (const ann of mods.annotations) { parts.push(ann); }
	if (mods.access !== null) { parts.push(mods.access); }
	for (const kw of mods.keywords) { parts.push(kw); }
	return parts.join(' ');
}

// ---------------------------------------------------------------------------
// extends_clause walker
// ---------------------------------------------------------------------------

interface ExtendsResult {
	readonly extendsType: string | null;
	readonly withTypes: readonly string[];
}

/**
 * Scala's `extends_clause` carries both the parent class and any
 * mixin traits, separated by `extends` / `with` anonymous tokens.
 * Walk the children sequentially: the first type_identifier after
 * `extends` is the parent; every subsequent type_identifier (after
 * a `with` token) is a mixin.
 */
function readExtendsClause(clause: SyntaxNode): ExtendsResult {
	let mode: 'pre-extends' | 'after-extends' | 'after-with' = 'pre-extends';
	let extendsType: string | null = null;
	const withTypes: string[] = [];

	for (let i = 0; i < clause.childCount; i++) {
		const c = clause.child(i);
		if (c === null) { continue; }
		if (c.type === 'extends' && !c.isNamed) {
			mode = 'after-extends';
			continue;
		}
		if (c.type === 'with' && !c.isNamed) {
			mode = 'after-with';
			continue;
		}
		// Type-bearing nodes the grammar emits.
		if (
			c.type === 'type_identifier' || c.type === 'generic_type'
			|| c.type === 'projected_type' || c.type === 'singleton_type'
			|| c.type === 'compound_type' || c.type === 'identifier'
		) {
			const baseName = baseTypeName(c.text);
			if (baseName === '') { continue; }
			if (mode === 'after-extends' && extendsType === null) {
				extendsType = baseName;
				mode = 'after-with';   // anything after the first type is a mixin
			} else if (mode === 'after-with' || mode === 'after-extends') {
				withTypes.push(baseName);
			}
		}
	}

	return { extendsType, withTypes };
}

function baseTypeName(text: string): string {
	let t = text.trim();
	const angle = t.indexOf('[');
	if (angle >= 0) { t = t.slice(0, angle); }
	t = t.replace(/\s+/g, ' ');
	return t;
}

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

interface WalkCtx {
	readonly repo: string;
	readonly repoId: number;
	readonly filePath: string;
	readonly fileId: string;
	readonly now: string;
	readonly entities: Entity[];
	readonly relations: Relation[];
	/** Class names seen at file scope; used to suffix companion-object
	 *  signatures with `(companion of X)`. Populated as the walker
	 *  visits class_definition nodes, then read by object_definition
	 *  visits later in the same file. */
	readonly fileClassNames: Set<string>;
}

interface ContainerCtx {
	readonly classId: string | null;
	readonly className: string | null;
	readonly inObject: boolean;
}

function walkProgram(root: SyntaxNode, ctx: WalkCtx): void {
	// First pass: collect class names for companion-object detection.
	for (const child of root.namedChildren) {
		if (child.type === 'class_definition') {
			const nameNode = child.namedChildren.find(c => c.type === 'identifier');
			if (nameNode !== undefined) { ctx.fileClassNames.add(nameNode.text); }
		}
	}

	// Second pass: emit entities + relations.
	const top: ContainerCtx = { classId: null, className: null, inObject: false };
	for (const child of root.namedChildren) {
		walkTopLevel(child, ctx, top);
	}
}

function walkTopLevel(node: SyntaxNode, ctx: WalkCtx, parent: ContainerCtx): void {
	switch (node.type) {
		case 'package_clause':
			handlePackage(node, ctx);
			break;
		case 'import_declaration':
			handleImport(node, ctx);
			break;
		case 'class_definition':
		case 'object_definition':
		case 'trait_definition':
			handleClassLike(node, ctx, parent);
			break;
		case 'function_definition':
		case 'function_declaration':
			handleMethodOrFunction(node, ctx, parent);
			break;
		case 'val_definition':
		case 'var_definition':
			handleValVar(node, ctx, parent);
			break;
		case 'type_definition':
			handleTypeAlias(node, ctx, parent);
			break;
		case 'given_definition':
			handleGiven(node, ctx, parent);
			break;
		case 'extension_definition':
			handleExtension(node, ctx, parent);
			break;
		default:
			break;
	}
}

// ---------------------------------------------------------------------------
// Package + imports
// ---------------------------------------------------------------------------

function handlePackage(node: SyntaxNode, ctx: WalkCtx): void {
	const idNode = node.namedChildren.find(
		c => c.type === 'package_identifier' || c.type === 'identifier' || c.type === 'stable_identifier',
	);
	if (idNode === undefined) { return; }
	const moduleName = idNode.text.replace(/\s+/g, '');
	const moduleId = makeEntityId(MODULE_NAMESPACE, '', 'module', moduleName);
	if (!ctx.entities.some(e => e.id === moduleId)) {
		ctx.entities.push({
			id: moduleId, kind: 'module', name: moduleName, language: 'scala',
			repoId: MODULE_REPO_ID,
			repo: '', file: '', startLine: 0, endLine: 0,
			body: '', embedding: [], indexedAt: ctx.now,
		});
	}
	ctx.relations.push({
		kind: 'IMPORTS', from: ctx.fileId, to: moduleId, resolved: true,
		meta: { isOwnPackage: true },
	});
}

function handleImport(node: SyntaxNode, ctx: WalkCtx): void {
	// Collect prefix path (sequence of `identifier` children up to a
	// `namespace_selectors` -- if any).
	const prefixIds: string[] = [];
	let selectorsNode: SyntaxNode | null = null;
	for (const c of node.namedChildren) {
		if (c.type === 'identifier' || c.type === 'stable_identifier') {
			prefixIds.push(c.text);
		} else if (c.type === 'namespace_selectors') {
			selectorsNode = c;
		} else if (c.type === 'wildcard') {
			prefixIds.push('_');
		}
	}
	const prefix = prefixIds.join('.');

	if (selectorsNode === null) {
		// Simple: `import a.b.c` -- whole prefix is the module name.
		emitImportEdge(ctx, prefix, undefined);
		return;
	}

	// Grouped / renamed: one edge per selector.
	for (const sel of selectorsNode.namedChildren) {
		if (sel.type === 'identifier') {
			const fullName = `${prefix}.${sel.text}`;
			emitImportEdge(ctx, fullName, undefined);
		} else if (sel.type === 'arrow_renamed_identifier') {
			// `Foo => F` -- two identifier children.
			const ids = sel.namedChildren.filter(c => c.type === 'identifier');
			const original = ids[0]?.text ?? '';
			const alias = ids[1]?.text ?? '';
			if (original !== '') {
				emitImportEdge(ctx, `${prefix}.${original}`, alias !== '' ? alias : undefined);
			}
		}
	}
}

function emitImportEdge(ctx: WalkCtx, moduleName: string, alias?: string | undefined): void {
	const moduleId = makeEntityId(MODULE_NAMESPACE, '', 'module', moduleName);
	if (!ctx.entities.some(e => e.id === moduleId)) {
		ctx.entities.push({
			id: moduleId, kind: 'module', name: moduleName, language: 'scala',
			repoId: MODULE_REPO_ID,
			repo: '', file: '', startLine: 0, endLine: 0,
			body: '', embedding: [], indexedAt: ctx.now,
		});
	}
	ctx.relations.push({
		kind: 'IMPORTS', from: ctx.fileId, to: moduleId, resolved: true,
		...(alias !== undefined ? { meta: { alias } } : {}),
	});
}

// ---------------------------------------------------------------------------
// Class / object / trait
// ---------------------------------------------------------------------------

function handleClassLike(
	node: SyntaxNode,
	ctx: WalkCtx,
	parent: ContainerCtx,
): void {
	const nameNode = node.namedChildren.find(c => c.type === 'identifier');
	if (nameNode === undefined) { return; }
	const localName = nameNode.text;
	const qualName = parent.className !== null
		? `${parent.className}.${localName}`
		: localName;

	const mods = readScalaModifiers(node);
	const sigPrefix = buildScalaSignaturePrefix(mods);

	// Pick entity kind + signature kind word.
	let entityKind: 'class' | 'interface';
	let kindWord: string;
	if (node.type === 'trait_definition') {
		entityKind = 'interface';
		kindWord = 'trait';
	} else if (node.type === 'object_definition') {
		entityKind = 'class';
		kindWord = mods.isCase ? 'case object' : 'object';
		// Companion-object suffix when a same-named class exists in
		// this file (and we're at top level -- nested objects don't
		// participate).
		if (parent.className === null && ctx.fileClassNames.has(localName)) {
			kindWord = `${kindWord} (companion of ${localName})`;
		}
	} else {
		entityKind = 'class';
		kindWord = mods.isCase ? 'case class' : 'class';
	}

	const id = makeEntityId(ctx.repo, ctx.filePath, entityKind, qualName);
	const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '') + `${kindWord} ${localName}`;

	ctx.entities.push({
		id,
		kind: entityKind,
		name: qualName,
		language: 'scala',
		repoId: ctx.repoId,
		repo: ctx.repo,
		file: ctx.filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		body: node.text,
		embedding: [],
		indexedAt: ctx.now,
		isExported: mods.access === null,   // public is the default in Scala
		isAbstract: mods.isAbstract || node.type === 'trait_definition',
		signature,
	});
	ctx.relations.push({
		kind: 'DEFINES',
		from: parent.classId ?? ctx.fileId,
		to: id,
		resolved: true,
	});

	// extends + with -> INHERITS / IMPLEMENTS.
	const extendsClause = node.namedChildren.find(c => c.type === 'extends_clause');
	if (extendsClause !== undefined) {
		const { extendsType, withTypes } = readExtendsClause(extendsClause);
		// For traits, treat both extends parent + `with` mixins as
		// INHERITS (super-trait inheritance, no separate kind).
		if (entityKind === 'interface') {
			if (extendsType !== null && extendsType !== 'AnyRef' && extendsType !== 'Object') {
				ctx.relations.push({
					kind: 'INHERITS', from: id, to: extendsType, resolved: false,
					meta: { file: ctx.filePath, repo: ctx.repo },
				});
			}
			for (const mix of withTypes) {
				ctx.relations.push({
					kind: 'INHERITS', from: id, to: mix, resolved: false,
					meta: { file: ctx.filePath, repo: ctx.repo },
				});
			}
		} else {
			// class / object: extends parent is INHERITS, mixins are IMPLEMENTS.
			if (extendsType !== null && extendsType !== 'AnyRef' && extendsType !== 'Object') {
				ctx.relations.push({
					kind: 'INHERITS', from: id, to: extendsType, resolved: false,
					meta: { file: ctx.filePath, repo: ctx.repo },
				});
			}
			for (const mix of withTypes) {
				ctx.relations.push({
					kind: 'IMPLEMENTS', from: id, to: mix, resolved: false,
					meta: { file: ctx.filePath, repo: ctx.repo },
				});
			}
		}
	}

	// Walk the template body for nested members.
	const tmpl = node.namedChildren.find(
		c => c.type === 'template_body' || c.type === 'with_template_body',
	);
	if (tmpl !== undefined) {
		const childCtx: ContainerCtx = {
			classId: id,
			className: qualName,
			inObject: node.type === 'object_definition',
		};
		for (const member of tmpl.namedChildren) {
			walkTopLevel(member, ctx, childCtx);
		}
	}
}

// ---------------------------------------------------------------------------
// Methods / functions / val / var / type / given / extension
// ---------------------------------------------------------------------------

function handleMethodOrFunction(
	node: SyntaxNode,
	ctx: WalkCtx,
	parent: ContainerCtx,
): void {
	const nameNode = node.namedChildren.find(
		c => c.type === 'identifier' || c.type === 'operator_identifier',
	);
	if (nameNode === undefined) { return; }
	const localName = nameNode.text;
	const qualName = parent.className !== null
		? `${parent.className}.${localName}`
		: localName;
	const kind: 'method' | 'function' = parent.classId !== null ? 'method' : 'function';
	const id = makeEntityId(ctx.repo, ctx.filePath, kind, qualName);

	const mods = readScalaModifiers(node);
	const sigPrefix = buildScalaSignaturePrefix(mods);

	const params = node.namedChildren.filter(c => c.type === 'parameters')
		.map(p => p.text).join('');
	const typeParams = node.namedChildren.find(c => c.type === 'type_parameters')?.text ?? '';
	const retType = node.namedChildren.find(c => c.type === 'type_identifier' || c.type === 'generic_type')?.text ?? '';

	const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '')
		+ `def ${localName}${typeParams}${params}`
		+ (retType !== '' ? `: ${retType}` : '')
		+ (node.type === 'function_declaration' ? ' = <abstract>' : '');

	ctx.entities.push({
		id,
		kind,
		name: qualName,
		language: 'scala',
		repoId: ctx.repoId,
		repo: ctx.repo,
		file: ctx.filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		body: node.text,
		embedding: [],
		indexedAt: ctx.now,
		isExported: mods.access === null,
		isAbstract: node.type === 'function_declaration',
		signature,
	});
	ctx.relations.push({
		kind: 'DEFINES',
		from: parent.classId ?? ctx.fileId,
		to: id,
		resolved: true,
	});

	// Extract calls from the body subtree (function_definition's last
	// non-name / non-parameter / non-type child is typically the body
	// expression).
	extractCalls(node, id, ctx);
}

function handleValVar(
	node: SyntaxNode,
	ctx: WalkCtx,
	parent: ContainerCtx,
): void {
	const nameNode = node.namedChildren.find(c => c.type === 'identifier');
	if (nameNode === undefined) { return; }
	const localName = nameNode.text;
	const qualName = parent.className !== null
		? `${parent.className}.${localName}`
		: localName;
	const id = makeEntityId(ctx.repo, ctx.filePath, 'variable', qualName);

	const mods = readScalaModifiers(node);
	const sigPrefix = buildScalaSignaturePrefix(mods);
	const kindWord = node.type === 'val_definition' ? 'val' : 'var';
	const typeText = node.namedChildren.find(c => c.type === 'type_identifier' || c.type === 'generic_type')?.text ?? '';
	const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '')
		+ `${kindWord} ${localName}`
		+ (typeText !== '' ? `: ${typeText}` : '');

	ctx.entities.push({
		id,
		kind: 'variable',
		name: qualName,
		language: 'scala',
		repoId: ctx.repoId,
		repo: ctx.repo,
		file: ctx.filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		body: node.text,
		embedding: [],
		indexedAt: ctx.now,
		isExported: mods.access === null,
		signature,
	});
	ctx.relations.push({
		kind: 'DEFINES',
		from: parent.classId ?? ctx.fileId,
		to: id,
		resolved: true,
	});
}

function handleTypeAlias(
	node: SyntaxNode,
	ctx: WalkCtx,
	parent: ContainerCtx,
): void {
	const nameNode = node.namedChildren.find(c => c.type === 'type_identifier');
	if (nameNode === undefined) { return; }
	const localName = nameNode.text;
	const qualName = parent.className !== null
		? `${parent.className}.${localName}`
		: localName;
	const id = makeEntityId(ctx.repo, ctx.filePath, 'type', qualName);

	const mods = readScalaModifiers(node);
	const sigPrefix = buildScalaSignaturePrefix(mods);
	const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '') + `type ${localName}`;

	ctx.entities.push({
		id,
		kind: 'type',
		name: qualName,
		language: 'scala',
		repoId: ctx.repoId,
		repo: ctx.repo,
		file: ctx.filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		body: node.text,
		embedding: [],
		indexedAt: ctx.now,
		isExported: mods.access === null,
		signature,
	});
	ctx.relations.push({
		kind: 'DEFINES',
		from: parent.classId ?? ctx.fileId,
		to: id,
		resolved: true,
	});
}

function handleGiven(
	node: SyntaxNode,
	ctx: WalkCtx,
	parent: ContainerCtx,
): void {
	const nameNode = node.namedChildren.find(c => c.type === 'identifier');
	const typeNode = node.namedChildren.find(
		c => c.type === 'type_identifier' || c.type === 'generic_type',
	);
	const localName = nameNode?.text
		?? `given_${typeNode?.text ?? 'anonymous'}`;
	const qualName = parent.className !== null
		? `${parent.className}.${localName}`
		: localName;
	const id = makeEntityId(ctx.repo, ctx.filePath, 'variable', qualName);

	const mods = readScalaModifiers(node);
	const sigPrefix = buildScalaSignaturePrefix(mods);
	const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '')
		+ `given ${localName}`
		+ (typeNode !== undefined ? `: ${typeNode.text}` : '');

	ctx.entities.push({
		id,
		kind: 'variable',
		name: qualName,
		language: 'scala',
		repoId: ctx.repoId,
		repo: ctx.repo,
		file: ctx.filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		body: node.text,
		embedding: [],
		indexedAt: ctx.now,
		isExported: mods.access === null,
		signature,
	});
	ctx.relations.push({
		kind: 'DEFINES',
		from: parent.classId ?? ctx.fileId,
		to: id,
		resolved: true,
	});
}

function handleExtension(
	node: SyntaxNode,
	ctx: WalkCtx,
	parent: ContainerCtx,
): void {
	// Scala 3 `extension (x: Foo) def bar = ...` -- the inner def
	// becomes a method entity tagged as `extension method`.
	const params = node.namedChildren.find(c => c.type === 'parameters');
	const targetType = params?.namedChildren
		.find(c => c.type === 'parameter')
		?.namedChildren.find(c => c.type === 'type_identifier' || c.type === 'generic_type')
		?.text ?? 'Any';
	for (const inner of node.namedChildren) {
		if (inner.type !== 'function_definition' && inner.type !== 'function_declaration') {
			continue;
		}
		const nameNode = inner.namedChildren.find(c => c.type === 'identifier');
		if (nameNode === undefined) { continue; }
		const localName = nameNode.text;
		const qualName = `${baseTypeName(targetType)}.${localName}`;
		const id = makeEntityId(ctx.repo, ctx.filePath, 'method', qualName);
		const mods = readScalaModifiers(inner);
		const sigPrefix = buildScalaSignaturePrefix(mods);
		const innerParams = inner.namedChildren.find(c => c.type === 'parameters')?.text ?? '()';
		const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '')
			+ `extension method def ${localName}${innerParams}`;

		ctx.entities.push({
			id,
			kind: 'method',
			name: qualName,
			language: 'scala',
			repoId: ctx.repoId,
			repo: ctx.repo,
			file: ctx.filePath,
			startLine: inner.startPosition.row + 1,
			endLine: inner.endPosition.row + 1,
			body: inner.text,
			embedding: [],
			indexedAt: ctx.now,
			isExported: mods.access === null,
			signature,
		});
		ctx.relations.push({
			kind: 'DEFINES',
			from: parent.classId ?? ctx.fileId,
			to: id,
			resolved: true,
		});
	}
}

// ---------------------------------------------------------------------------
// CALLS
// ---------------------------------------------------------------------------

function extractCalls(body: SyntaxNode, fromId: string, ctx: WalkCtx): void {
	const stack: SyntaxNode[] = [body];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.type === 'call_expression') {
			const fn = node.namedChildren[0];
			if (fn !== undefined) {
				ctx.relations.push({
					kind: 'CALLS', from: fromId, to: fn.text.replace(/\s+/g, ' '),
					resolved: false,
					meta: { file: ctx.filePath, repo: ctx.repo },
				});
			}
		}
		for (let i = 0; i < node.namedChildCount; i++) {
			const child = node.namedChild(i);
			if (child !== null) { stack.push(child); }
		}
	}
}

// ---------------------------------------------------------------------------
// Parser class
// ---------------------------------------------------------------------------

class ScalaParser implements CodeParser {
	readonly extensions = ['.scala', '.sc'];
	readonly language = 'scala' as const;

	private readonly tsParser: import('tree-sitter');

	constructor() {
		this.tsParser = new Parser();
		(this.tsParser as { setLanguage(l: unknown): void }).setLanguage(ScalaGrammar);
	}

	parse(filePath: string, source: string, repo: string, repoId: number): ParseResult {
		const tree = (this.tsParser as { parse(s: string): { rootNode: SyntaxNode } }).parse(source);
		const now = new Date().toISOString();

		const entities: Entity[] = [];
		const relations: Relation[] = [];

		const fileId = makeEntityId(repo, filePath, 'file', filePath);
		entities.push({
			id: fileId,
			kind: 'file',
			name: filePath,
			language: 'scala',
			repoId,
			repo,
			file: filePath,
			startLine: 1,
			endLine: source.split('\n').length,
			body: '',
			embedding: [],
			indexedAt: now,
			...(tree.rootNode.hasError ? { signature: 'parse-error' } : {}),
		});

		const ctx: WalkCtx = {
			repo, repoId, filePath, fileId, now, entities, relations,
			fileClassNames: new Set<string>(),
		};
		walkProgram(tree.rootNode, ctx);

		return { entities, relations };
	}
}

// ---------------------------------------------------------------------------
// Export -- singleton, auto-registered
// ---------------------------------------------------------------------------

export const scalaParser = new ScalaParser();
registerParser(scalaParser);
