/**
 * Java parser.
 *
 * Uses tree-sitter-java to extract entities and relations.
 *
 * Extracted entities:
 *   - class_declaration / record_declaration   -> Class
 *   - interface_declaration                    -> Interface
 *   - enum_declaration                         -> Class (signature: 'enum')
 *   - annotation_type_declaration              -> Class (signature: 'annotation interface')
 *   - method_declaration                       -> Method (or Function at top level)
 *   - constructor_declaration                  -> Method (name = enclosing class)
 *   - field_declaration / variable_declarator  -> Variable
 *   - lambda_expression assigned to a field    -> Function (qualName = field name)
 *   - package_declaration                      -> Module (one per file's package)
 *
 * Extracted relations:
 *   - DEFINES from file -> top-level entity
 *   - DEFINES from class/interface -> nested method/field/inner class
 *   - IMPORTS from file -> Module stub (one per import_declaration; static
 *     imports recorded with `static:` prefix in the meta marker)
 *   - INHERITS from class -> superclass type name (unresolved)
 *   - IMPLEMENTS from class -> implemented interface type name (unresolved)
 *   - INHERITS from interface -> super-interface (Java's `interface A extends B`)
 *
 * Annotations show up on each entity's `signature` field
 * (e.g. `@Service public class Foo`); analyzer queries that want
 * annotation-based filtering can grep on signature without needing
 * a separate Annotation entity kind. See plans/jvm-languages.md §1.1.
 */

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);

const Parser      = _require('tree-sitter')      as typeof import('tree-sitter');
const JavaGrammar = _require('tree-sitter-java') as unknown;

import type { CodeParser, ParseResult } from './base.js';
import { makeEntityId } from './base.js';
import type { Entity, Relation } from '../../shared/types.js';
import { registerParser } from './registry.js';
import { SHARED_MODULES_REPO_ID } from '../../shared/repo-namespaces.js';

const MODULE_NAMESPACE = 'jvm' as const;
const MODULE_REPO_ID = SHARED_MODULES_REPO_ID[MODULE_NAMESPACE];

type SyntaxNode = import('tree-sitter').SyntaxNode;

// ---------------------------------------------------------------------------
// Modifier + annotation extraction
// ---------------------------------------------------------------------------

const KEYWORD_MODIFIERS = new Set([
	'public', 'private', 'protected', 'static', 'final', 'abstract',
	'synchronized', 'native', 'transient', 'volatile', 'strictfp',
	'default', 'sealed', 'non-sealed',
]);

interface ModifierInfo {
	readonly keywords: readonly string[];
	readonly annotations: readonly string[];
	readonly isPublic: boolean;
	readonly isStatic: boolean;
	readonly isAbstract: boolean;
	readonly isFinal: boolean;
}

function readModifiers(node: SyntaxNode): ModifierInfo {
	const keywords: string[] = [];
	const annotations: string[] = [];
	const modNode = node.children.find(c => c.type === 'modifiers');
	if (modNode === undefined) {
		return {
			keywords: [], annotations: [],
			isPublic: false, isStatic: false, isAbstract: false, isFinal: false,
		};
	}
	for (const child of modNode.children) {
		if (KEYWORD_MODIFIERS.has(child.type)) {
			keywords.push(child.type);
		} else if (
			child.type === 'marker_annotation'
			|| child.type === 'annotation'
		) {
			annotations.push(child.text);
		}
	}
	return {
		keywords,
		annotations,
		isPublic:   keywords.includes('public'),
		isStatic:   keywords.includes('static'),
		isAbstract: keywords.includes('abstract'),
		isFinal:    keywords.includes('final'),
	};
}

function buildSignaturePrefix(mods: ModifierInfo): string {
	const parts: string[] = [];
	for (const ann of mods.annotations) { parts.push(ann); }
	for (const kw of mods.keywords) { parts.push(kw); }
	return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Type-text helpers
// ---------------------------------------------------------------------------

/**
 * Strip generic parameters + array brackets from a type expression to
 * recover the raw base type name. Used for INHERITS / IMPLEMENTS edges
 * (the resolver doesn't care about generic arguments).
 */
function baseTypeName(text: string): string {
	let t = text.trim();
	const angle = t.indexOf('<');
	if (angle >= 0) { t = t.slice(0, angle); }
	t = t.replace(/\[\s*\]/g, '').trim();
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
	readonly packageName: string;
}

interface ContainerCtx {
	/** Containing class/interface entity id, when the walker is inside
	 *  a class body. */
	readonly classId: string | null;
	/** Containing class/interface name (used to qualify nested-entity
	 *  names so `Outer.Inner` is unique in the graph). */
	readonly className: string | null;
}

function walkProgram(root: SyntaxNode, ctx: WalkCtx): void {
	for (const child of root.namedChildren) {
		switch (child.type) {
			case 'package_declaration':
				handlePackage(child, ctx);
				break;
			case 'import_declaration':
				handleImport(child, ctx);
				break;
			case 'class_declaration':
			case 'record_declaration':
			case 'enum_declaration':
			case 'annotation_type_declaration':
				handleClassLike(child, ctx, { classId: null, className: null });
				break;
			case 'interface_declaration':
				handleInterface(child, ctx, { classId: null, className: null });
				break;
			default:
				break;
		}
	}
}

function handlePackage(node: SyntaxNode, ctx: WalkCtx): void {
	// `package_declaration` -> identifier or `scoped_identifier`.
	const nameNode = node.namedChildren.find(
		c => c.type === 'identifier' || c.type === 'scoped_identifier',
	);
	if (nameNode === undefined) { return; }
	const moduleName = nameNode.text;
	const moduleId = makeEntityId(MODULE_NAMESPACE, '', 'module', moduleName);
	if (!ctx.entities.some(e => e.id === moduleId)) {
		ctx.entities.push({
			id: moduleId, kind: 'module', name: moduleName,
			language: 'java',
			repoId: MODULE_REPO_ID,
			repo: '', file: '', startLine: 0, endLine: 0,
			body: '', embedding: [], indexedAt: ctx.now,
		});
	}
	// The file lives inside its package -- treated as an IMPORTS edge
	// from the file to its own package's module entity so analyzers
	// can find the file by package name.
	ctx.relations.push({
		kind: 'IMPORTS', from: ctx.fileId, to: moduleId, resolved: true,
		meta: { isOwnPackage: true },
	});
}

function handleImport(node: SyntaxNode, ctx: WalkCtx): void {
	// `import_declaration` syntax:
	//   import [static] X.Y.Z;       -> single type
	//   import [static] X.Y.*;       -> wildcard
	const isStatic = node.children.some(c => c.type === 'static');
	const nameNode = node.namedChildren.find(
		c => c.type === 'identifier' || c.type === 'scoped_identifier',
	);
	if (nameNode === undefined) { return; }
	let importPath = nameNode.text;
	const isWildcard = node.children.some(c => c.type === 'asterisk');
	if (isWildcard) { importPath = `${importPath}.*`; }

	const moduleId = makeEntityId(MODULE_NAMESPACE, '', 'module', importPath);
	if (!ctx.entities.some(e => e.id === moduleId)) {
		ctx.entities.push({
			id: moduleId, kind: 'module', name: importPath,
			language: 'java',
			repoId: MODULE_REPO_ID,
			repo: '', file: '', startLine: 0, endLine: 0,
			body: '', embedding: [], indexedAt: ctx.now,
		});
	}
	ctx.relations.push({
		kind: 'IMPORTS', from: ctx.fileId, to: moduleId, resolved: true,
		...(isStatic ? { meta: { static: true } } : {}),
	});
}

// ---------------------------------------------------------------------------
// Class-like: class / record / enum / annotation-interface
// ---------------------------------------------------------------------------

function handleClassLike(
	node: SyntaxNode,
	ctx: WalkCtx,
	parent: ContainerCtx,
): void {
	const nameNode = node.childForFieldName('name');
	if (nameNode === null) { return; }
	const localName = nameNode.text;
	const qualName = parent.className !== null
		? `${parent.className}.${localName}`
		: localName;
	const id = makeEntityId(ctx.repo, ctx.filePath, 'class', qualName);

	const mods = readModifiers(node);
	const sigPrefix = buildSignaturePrefix(mods);

	let kindWord: string;
	switch (node.type) {
		case 'class_declaration':            kindWord = 'class'; break;
		case 'record_declaration':           kindWord = 'record'; break;
		case 'enum_declaration':             kindWord = 'enum'; break;
		case 'annotation_type_declaration':  kindWord = 'annotation interface'; break;
		default:                             kindWord = 'class'; break;
	}
	const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '') + `${kindWord} ${localName}`;

	const entity: Entity = {
		id,
		kind: 'class',
		name: qualName,
		language: 'java',
		repoId: ctx.repoId,
		repo: ctx.repo,
		file: ctx.filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		body: node.text,
		embedding: [],
		indexedAt: ctx.now,
		isExported: mods.isPublic,
		isAbstract: mods.isAbstract,
		signature,
	};
	ctx.entities.push(entity);

	const definer = parent.classId ?? ctx.fileId;
	ctx.relations.push({ kind: 'DEFINES', from: definer, to: id, resolved: true });

	// extends -> INHERITS (unresolved). Only on class_declaration; record
	// + enum + annotation-interface don't have explicit `extends`.
	if (node.type === 'class_declaration') {
		const superNode = node.childForFieldName('superclass');
		if (superNode !== null) {
			// `superclass` field is a `superclass` node containing the type.
			const typeNode = superNode.namedChildren.find(c => c.type !== 'extends');
			const baseName = baseTypeName(typeNode?.text ?? superNode.text.replace(/^extends\s+/, ''));
			if (baseName !== '' && baseName !== 'Object') {
				ctx.relations.push({
					kind: 'INHERITS', from: id, to: baseName, resolved: false,
					meta: { file: ctx.filePath, repo: ctx.repo },
				});
			}
		}
	}

	// implements -> IMPLEMENTS (unresolved). Records + classes both
	// support this; enums implicitly extend `java.lang.Enum`.
	const interfacesNode = node.childForFieldName('interfaces');
	if (interfacesNode !== null) {
		const list = interfacesNode.namedChildren.find(c => c.type === 'type_list');
		const typeNodes = (list ?? interfacesNode).namedChildren.filter(c => c.type !== 'implements');
		for (const t of typeNodes) {
			const baseName = baseTypeName(t.text);
			if (baseName === '') { continue; }
			ctx.relations.push({
				kind: 'IMPLEMENTS', from: id, to: baseName, resolved: false,
				meta: { file: ctx.filePath, repo: ctx.repo },
			});
		}
	}

	// Walk class body for nested entities.
	walkClassBody(node, ctx, { classId: id, className: qualName });
}

function handleInterface(
	node: SyntaxNode,
	ctx: WalkCtx,
	parent: ContainerCtx,
): void {
	const nameNode = node.childForFieldName('name');
	if (nameNode === null) { return; }
	const localName = nameNode.text;
	const qualName = parent.className !== null
		? `${parent.className}.${localName}`
		: localName;
	const id = makeEntityId(ctx.repo, ctx.filePath, 'interface', qualName);

	const mods = readModifiers(node);
	const sigPrefix = buildSignaturePrefix(mods);
	const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '') + `interface ${localName}`;

	ctx.entities.push({
		id,
		kind: 'interface',
		name: qualName,
		language: 'java',
		repoId: ctx.repoId,
		repo: ctx.repo,
		file: ctx.filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		body: node.text,
		embedding: [],
		indexedAt: ctx.now,
		isExported: mods.isPublic,
		isAbstract: true,   // interfaces are inherently abstract
		signature,
	});

	const definer = parent.classId ?? ctx.fileId;
	ctx.relations.push({ kind: 'DEFINES', from: definer, to: id, resolved: true });

	// `interface A extends B, C` -- super-interfaces are INHERITS edges
	// (Java reuses `extends` for interface inheritance; we treat it as
	// INHERITS to match Python / TS conventions).
	const extendsNode = node.childForFieldName('extends_interfaces')
		?? node.childForFieldName('superInterfaces');
	if (extendsNode !== null) {
		const list = extendsNode.namedChildren.find(c => c.type === 'type_list')
			?? extendsNode;
		for (const t of list.namedChildren) {
			if (t.type === 'extends') { continue; }
			const baseName = baseTypeName(t.text);
			if (baseName === '') { continue; }
			ctx.relations.push({
				kind: 'INHERITS', from: id, to: baseName, resolved: false,
				meta: { file: ctx.filePath, repo: ctx.repo },
			});
		}
	}

	// Walk interface body.
	walkClassBody(node, ctx, { classId: id, className: qualName });
}

// ---------------------------------------------------------------------------
// Class / interface / enum body walking
// ---------------------------------------------------------------------------

function walkClassBody(
	node: SyntaxNode,
	ctx: WalkCtx,
	containerCtx: ContainerCtx,
): void {
	const body = node.childForFieldName('body');
	if (body === null) { return; }
	for (const member of body.namedChildren) {
		switch (member.type) {
			case 'method_declaration':
			case 'compact_constructor_declaration':
				handleMethod(member, ctx, containerCtx);
				break;
			case 'constructor_declaration':
				handleConstructor(member, ctx, containerCtx);
				break;
			case 'field_declaration':
				handleField(member, ctx, containerCtx);
				break;
			case 'class_declaration':
			case 'record_declaration':
			case 'enum_declaration':
			case 'annotation_type_declaration':
				handleClassLike(member, ctx, containerCtx);
				break;
			case 'interface_declaration':
				handleInterface(member, ctx, containerCtx);
				break;
			case 'enum_body_declarations':
				// Inside an enum: nested classes / methods / fields appear
				// here after the enum constants. Recurse into its members.
				for (const inner of member.namedChildren) {
					switch (inner.type) {
						case 'method_declaration':
							handleMethod(inner, ctx, containerCtx);
							break;
						case 'constructor_declaration':
							handleConstructor(inner, ctx, containerCtx);
							break;
						case 'field_declaration':
							handleField(inner, ctx, containerCtx);
							break;
						default: break;
					}
				}
				break;
			default:
				break;
		}
	}
}

function handleMethod(
	node: SyntaxNode,
	ctx: WalkCtx,
	parent: ContainerCtx,
): void {
	const nameNode = node.childForFieldName('name');
	if (nameNode === null) { return; }
	const localName = nameNode.text;
	const qualName = parent.className !== null
		? `${parent.className}.${localName}`
		: localName;
	const kind: 'method' | 'function' = parent.classId !== null ? 'method' : 'function';
	const id = makeEntityId(ctx.repo, ctx.filePath, kind, qualName);

	const mods = readModifiers(node);
	const sigPrefix = buildSignaturePrefix(mods);
	const params = node.childForFieldName('parameters')?.text ?? '()';
	const retType = node.childForFieldName('type')?.text ?? '';
	const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '')
		+ (retType !== '' ? `${retType} ` : '')
		+ `${localName}${params}`;

	ctx.entities.push({
		id,
		kind,
		name: qualName,
		language: 'java',
		repoId: ctx.repoId,
		repo: ctx.repo,
		file: ctx.filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		body: node.text,
		embedding: [],
		indexedAt: ctx.now,
		isExported: mods.isPublic,
		isAbstract: mods.isAbstract,
		signature,
	});
	ctx.relations.push({
		kind: 'DEFINES',
		from: parent.classId ?? ctx.fileId,
		to: id,
		resolved: true,
	});

	// Extract method invocations -> CALLS.
	extractCalls(node.childForFieldName('body'), id, ctx);
}

function handleConstructor(
	node: SyntaxNode,
	ctx: WalkCtx,
	parent: ContainerCtx,
): void {
	if (parent.className === null || parent.classId === null) { return; }
	const localName = parent.className.split('.').pop() ?? parent.className;
	const qualName = `${parent.className}.<init>`;
	const id = makeEntityId(ctx.repo, ctx.filePath, 'method', qualName);

	const mods = readModifiers(node);
	const sigPrefix = buildSignaturePrefix(mods);
	const params = node.childForFieldName('parameters')?.text ?? '()';
	const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '') + `${localName}${params}`;

	ctx.entities.push({
		id,
		kind: 'method',
		name: qualName,
		language: 'java',
		repoId: ctx.repoId,
		repo: ctx.repo,
		file: ctx.filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		body: node.text,
		embedding: [],
		indexedAt: ctx.now,
		isExported: mods.isPublic,
		signature,
	});
	ctx.relations.push({
		kind: 'DEFINES', from: parent.classId, to: id, resolved: true,
	});

	extractCalls(node.childForFieldName('body'), id, ctx);
}

function handleField(
	node: SyntaxNode,
	ctx: WalkCtx,
	parent: ContainerCtx,
): void {
	const mods = readModifiers(node);
	const sigPrefix = buildSignaturePrefix(mods);
	const typeNode = node.childForFieldName('type');
	const typeText = typeNode?.text ?? '';

	// `field_declaration` carries one or more `variable_declarator`
	// children (Java's comma-separated `int a, b = 5;`).
	const declarators = node.namedChildren.filter(c => c.type === 'variable_declarator');
	for (const decl of declarators) {
		const fieldNameNode = decl.childForFieldName('name');
		if (fieldNameNode === null) { continue; }
		const fieldName = fieldNameNode.text;
		const qualName = parent.className !== null
			? `${parent.className}.${fieldName}`
			: fieldName;
		const id = makeEntityId(ctx.repo, ctx.filePath, 'variable', qualName);
		const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '')
			+ (typeText !== '' ? `${typeText} ` : '')
			+ fieldName;

		ctx.entities.push({
			id,
			kind: 'variable',
			name: qualName,
			language: 'java',
			repoId: ctx.repoId,
			repo: ctx.repo,
			file: ctx.filePath,
			startLine: node.startPosition.row + 1,
			endLine: node.endPosition.row + 1,
			body: node.text,
			embedding: [],
			indexedAt: ctx.now,
			isExported: mods.isPublic,
			signature,
		});
		ctx.relations.push({
			kind: 'DEFINES',
			from: parent.classId ?? ctx.fileId,
			to: id,
			resolved: true,
		});

		// Special-case: lambda assigned to a field. Surface as a
		// separate `function`-kind entity so call-graph queries can
		// find it (the `variable` entity stays as the field).
		const valueNode = decl.childForFieldName('value');
		if (valueNode !== null && valueNode.type === 'lambda_expression') {
			const lambdaQual = `${qualName}$lambda`;
			const lambdaId = makeEntityId(ctx.repo, ctx.filePath, 'function', lambdaQual);
			ctx.entities.push({
				id: lambdaId,
				kind: 'function',
				name: lambdaQual,
				language: 'java',
				repoId: ctx.repoId,
				repo: ctx.repo,
				file: ctx.filePath,
				startLine: valueNode.startPosition.row + 1,
				endLine: valueNode.endPosition.row + 1,
				body: valueNode.text,
				embedding: [],
				indexedAt: ctx.now,
				signature: `${valueNode.childForFieldName('parameters')?.text ?? '()'} -> ...`,
			});
			ctx.relations.push({
				kind: 'DEFINES',
				from: parent.classId ?? ctx.fileId,
				to: lambdaId,
				resolved: true,
			});
			extractCalls(valueNode.childForFieldName('body'), lambdaId, ctx);
		}
	}
}

// ---------------------------------------------------------------------------
// CALLS extraction
// ---------------------------------------------------------------------------

/**
 * Walk a body subtree looking for `method_invocation` /
 * `object_creation_expression` nodes. Each emits an unresolved CALLS
 * relation from the enclosing entity to the raw method/type name.
 */
function extractCalls(
	body: SyntaxNode | null,
	fromId: string,
	ctx: WalkCtx,
): void {
	if (body === null) { return; }
	const stack: SyntaxNode[] = [body];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.type === 'method_invocation') {
			const nameNode = node.childForFieldName('name');
			if (nameNode !== null) {
				const objNode = node.childForFieldName('object');
				const methodName = objNode !== null
					? `${objNode.text}.${nameNode.text}`
					: nameNode.text;
				ctx.relations.push({
					kind: 'CALLS', from: fromId, to: methodName, resolved: false,
					meta: { file: ctx.filePath, repo: ctx.repo },
				});
			}
		} else if (node.type === 'object_creation_expression') {
			const typeNode = node.childForFieldName('type');
			if (typeNode !== null) {
				const baseName = baseTypeName(typeNode.text);
				if (baseName !== '') {
					ctx.relations.push({
						kind: 'CALLS', from: fromId, to: `new ${baseName}`,
						resolved: false,
						meta: { file: ctx.filePath, repo: ctx.repo, isConstructor: true },
					});
				}
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

class JavaParser implements CodeParser {
	readonly extensions = ['.java'];
	readonly language = 'java' as const;

	private readonly tsParser: import('tree-sitter');

	constructor() {
		this.tsParser = new Parser();
		(this.tsParser as { setLanguage(l: unknown): void }).setLanguage(JavaGrammar);
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
			language: 'java',
			repoId,
			repo,
			file: filePath,
			startLine: 1,
			endLine: source.split('\n').length,
			body: '',
			embedding: [],
			indexedAt: now,
		});

		// Detect the file's package -- written into ctx so child walkers
		// can fold it into qualified names if needed.
		let packageName = '';
		const pkgNode = tree.rootNode.namedChildren.find(c => c.type === 'package_declaration');
		if (pkgNode !== undefined) {
			const nameNode = pkgNode.namedChildren.find(
				c => c.type === 'identifier' || c.type === 'scoped_identifier',
			);
			packageName = nameNode?.text ?? '';
		}

		const ctx: WalkCtx = {
			repo, repoId, filePath, fileId, now, entities, relations, packageName,
		};
		walkProgram(tree.rootNode, ctx);

		return { entities, relations };
	}
}

// ---------------------------------------------------------------------------
// Export -- singleton, auto-registered
// ---------------------------------------------------------------------------

export const javaParser = new JavaParser();
registerParser(javaParser);
