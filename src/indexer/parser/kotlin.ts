/**
 * Kotlin parser.
 *
 * Uses tree-sitter-kotlin (fwcd grammar) to extract entities + relations from
 * `.kt` / `.kts` sources. Mirrors the Scala parser's JVM template: Kotlin
 * import-stub Modules share the `jvm` shared-modules repo id, so a JVM
 * dependency referenced from Kotlin, Java or Scala dedups to one module node.
 *
 * The grammar is loaded through a GUARDED `_require`: this module is imported
 * for side effects by `indexer/index.ts` alongside the other five parsers, so a
 * native-binding load failure must NOT throw at import time (that would abort
 * every parser's registration). On failure we log a warning and skip
 * registration — Kotlin files then fall through to "unsupported", every other
 * language keeps working.
 *
 * Extracted entities (mapped from the real tree-sitter-kotlin node kinds):
 *   - class_declaration                       -> Class   (signature carries
 *                            `class` / `data class` / `sealed class` /
 *                            `abstract class` / `enum class`)
 *   - class_declaration with `interface` kw   -> Interface (signature `interface`)
 *   - object_declaration                      -> Class   (signature `object`)
 *   - companion_object                        -> Class   (signature
 *                            `companion object (companion of <ClassName>)`)
 *   - function_declaration (top-level)        -> Function
 *   - function_declaration (in class_body)    -> Method
 *   - function_declaration with a leading      -> Method  (signature carries
 *       receiver `user_type` (extension fun)             `extension` + receiver)
 *   - property_declaration / class_parameter  -> Variable (val / var)
 *   - package_header                          -> Module
 *
 * Extracted relations:
 *   - DEFINES from file -> top-level entity, and container -> nested member.
 *   - IMPORTS from file -> Module stub. `import a.b.Foo as Bar` records the
 *     alias in `meta.alias`.
 *   - INHERITS from a class -> the superclass in its supertype list (the entry
 *     with a `constructor_invocation`, i.e. `: Base()`).
 *   - IMPLEMENTS from a class -> each remaining supertype (bare `user_type`,
 *     i.e. an interface with no constructor call).
 *   - CALLS / CALLS_HTTP / messaging edges via the shared http/messaging
 *     client-shape helpers, import-gated exactly like Java/Scala.
 *
 * Kotlin interfaces are `class_declaration` nodes carrying an anonymous
 * `interface` token (NOT a distinct node kind); enum classes carry `enum`
 * `class` tokens + an `enum_class_body`. Files with parse errors still emit
 * their package + cleanly-parsed top-level entities; the file entity gets a
 * `parse-error` marker (the grammar's ERROR-recovery can flag `hasError` even
 * on valid-looking snippets, so we never throw on it).
 *
 * Known tree-sitter-kotlin@0.3.8 limitations / recall gaps (documented, not bugs):
 *   - A compact single-line class body with no newline before its closing `}`
 *     (`class G { val x = 1 }`) trips `hasError` even though the tree is fully
 *     formed, so the file gets a spurious `parse-error` marker. Real multi-line
 *     Kotlin parses clean; the marker is informational metadata (no downstream
 *     gate consumes it) and entities still emit correctly under it.
 *   - `fun interface` (functional interfaces) is not supported by the grammar —
 *     it parses as an ERROR node, so the interface yields no entity.
 *   - Ktor's verb-named `client.get(url)` HTTP calls are a recall gap (see the
 *     kotlin table in http-client-shapes.ts): bare `get`/`post` would collide
 *     with `List.get`/`Map.get`, so only builder-method clients are recognized.
 *   - CALLS are extracted only from `function_body`; calls inside secondary
 *     constructors, `init` blocks, and property initializers are not walked
 *     (consistent with the Scala template).
 *   - A wildcard `import a.b.*` records the package-level module `a.b`.
 */

import { createRequire } from 'node:module';
import { getLogger } from '../../shared/logger.js';
import type { CodeParser, ParseResult } from './base.js';
import { makeEntityId } from './base.js';
import type { Entity, Relation } from '../../shared/types.js';
import { registerParser } from './registry.js';
import { SHARED_MODULES_REPO_ID } from '../../shared/repo-namespaces.js';
import { matchHttpClient, emitCallsHttp, fileImportsHttpLibrary } from './http-client-shapes.js';
import { matchMessagingClient, emitMessaging, fileImportsMessagingLibrary } from './messaging-client-shapes.js';

const log = getLogger('parser:kotlin');

const MODULE_NAMESPACE = 'jvm' as const;
const MODULE_REPO_ID = SHARED_MODULES_REPO_ID[MODULE_NAMESPACE];

type SyntaxNode = import('tree-sitter').SyntaxNode;

// ---------------------------------------------------------------------------
// Modifier extraction
// ---------------------------------------------------------------------------

interface KotlinModifiers {
	readonly keywords: readonly string[]; // class_modifier / inheritance_modifier tokens (data, sealed, abstract, open, ...)
	readonly annotations: readonly string[];
	readonly access: string | null;       // 'private' | 'protected' | 'internal' | null
	readonly isAbstract: boolean;
}

/** Read the `modifiers` child of a declaration: annotations, visibility, and
 *  the class/inheritance/etc. keyword tokens that fold into the signature. */
function readKotlinModifiers(node: SyntaxNode): KotlinModifiers {
	const keywords: string[] = [];
	const annotations: string[] = [];
	let access: string | null = null;

	const modsNode = node.namedChildren.find(c => c.type === 'modifiers');
	if (modsNode !== undefined) {
		for (const m of modsNode.namedChildren) {
			if (m.type === 'annotation') { annotations.push(m.text.replace(/\s+/g, '')); continue; }
			if (m.type === 'visibility_modifier') { access = m.text.trim(); continue; }
			// class_modifier (data/sealed/annotation/...), inheritance_modifier
			// (abstract/open/final), function_modifier, member_modifier, etc.
			if (m.type.endsWith('_modifier')) { keywords.push(m.text.trim()); }
		}
	}
	return {
		keywords,
		annotations,
		access,
		isAbstract: keywords.includes('abstract'),
	};
}

function buildSignaturePrefix(mods: KotlinModifiers): string {
	const parts: string[] = [];
	for (const ann of mods.annotations) { parts.push(ann); }
	if (mods.access !== null) { parts.push(mods.access); }
	for (const kw of mods.keywords) { parts.push(kw); }
	return parts.join(' ');
}

/** True if `node` has an anonymous child token of the given keyword type
 *  (e.g. `interface` / `enum` / `object` are anonymous tokens, not modifiers). */
function hasKeywordToken(node: SyntaxNode, keyword: string): boolean {
	for (let i = 0; i < node.childCount; i++) {
		const c = node.child(i);
		if (c !== null && !c.isNamed && c.type === keyword) { return true; }
	}
	return false;
}

/** The base name of a `user_type` (or any type-bearing node): its first
 *  `type_identifier` descendant, else the whitespace/generics-stripped text. */
function typeName(node: SyntaxNode): string {
	if (node.type === 'type_identifier') { return node.text.trim(); }
	// Breadth-first (document order) so a generic type like `List<Foo>` yields
	// the outer `List`, not the inner `Foo`.
	const queue: SyntaxNode[] = [node];
	for (let head = 0; head < queue.length; head++) {
		const n = queue[head]!;
		if (n.type === 'type_identifier') { return n.text.trim(); }
		for (let i = 0; i < n.namedChildCount; i++) {
			const c = n.namedChild(i);
			if (c !== null) { queue.push(c); }
		}
	}
	let t = node.text.trim();
	const angle = t.indexOf('<');
	if (angle >= 0) { t = t.slice(0, angle); }
	return t.replace(/\s+/g, '');
}

// ---------------------------------------------------------------------------
// Walk context
// ---------------------------------------------------------------------------

interface WalkCtx {
	readonly repo: string;
	readonly repoId: number;
	readonly filePath: string;
	readonly fileId: string;
	readonly now: string;
	readonly entities: Entity[];
	readonly relations: Relation[];
	readonly httpEnabled: boolean;
	readonly messagingEnabled: boolean;
}

interface ContainerCtx {
	readonly classId: string | null;
	readonly className: string | null;
}

const TOP: ContainerCtx = { classId: null, className: null };

function walkProgram(root: SyntaxNode, ctx: WalkCtx): void {
	for (const child of root.namedChildren) {
		walkNode(child, ctx, TOP);
	}
}

function walkNode(node: SyntaxNode, ctx: WalkCtx, parent: ContainerCtx): void {
	switch (node.type) {
		case 'package_header':
			handlePackage(node, ctx);
			break;
		case 'import_list':
			for (const imp of node.namedChildren) {
				if (imp.type === 'import_header') { handleImport(imp, ctx); }
			}
			break;
		case 'class_declaration':
		case 'object_declaration':
		case 'companion_object':
			handleClassLike(node, ctx, parent);
			break;
		case 'function_declaration':
			handleFunction(node, ctx, parent);
			break;
		case 'property_declaration':
		case 'class_parameter':
			handleProperty(node, ctx, parent);
			break;
		case 'enum_entry':
			handleEnumEntry(node, ctx, parent);
			break;
		default:
			break;
	}
}

// ---------------------------------------------------------------------------
// Package + imports
// ---------------------------------------------------------------------------

function upsertModule(ctx: WalkCtx, moduleName: string): string {
	const moduleId = makeEntityId(MODULE_NAMESPACE, '', 'module', moduleName);
	if (!ctx.entities.some(e => e.id === moduleId)) {
		ctx.entities.push({
			id: moduleId, kind: 'module', name: moduleName, language: 'kotlin',
			repoId: MODULE_REPO_ID,
			repo: '', file: '', startLine: 0, endLine: 0,
			body: '', embedding: [], indexedAt: ctx.now,
		});
	}
	return moduleId;
}

function handlePackage(node: SyntaxNode, ctx: WalkCtx): void {
	const idNode = node.namedChildren.find(c => c.type === 'identifier');
	if (idNode === undefined) { return; }
	const moduleName = idNode.text.replace(/\s+/g, '');
	if (moduleName === '') { return; }
	const moduleId = upsertModule(ctx, moduleName);
	ctx.relations.push({
		kind: 'IMPORTS', from: ctx.fileId, to: moduleId, resolved: true,
		meta: { isOwnPackage: true },
	});
}

function handleImport(node: SyntaxNode, ctx: WalkCtx): void {
	const idNode = node.namedChildren.find(c => c.type === 'identifier');
	if (idNode === undefined) { return; }
	const moduleName = idNode.text.replace(/\s+/g, '');
	if (moduleName === '') { return; }
	// `import a.b.Foo as Bar` — the alias is the import_alias' type_identifier.
	const aliasNode = node.namedChildren.find(c => c.type === 'import_alias');
	const alias = aliasNode?.namedChildren.find(c => c.type === 'type_identifier')?.text.trim();
	const moduleId = upsertModule(ctx, moduleName);
	ctx.relations.push({
		kind: 'IMPORTS', from: ctx.fileId, to: moduleId, resolved: true,
		...(alias !== undefined && alias !== '' ? { meta: { alias } } : {}),
	});
}

// ---------------------------------------------------------------------------
// class / interface / object / companion object
// ---------------------------------------------------------------------------

function handleClassLike(node: SyntaxNode, ctx: WalkCtx, parent: ContainerCtx): void {
	const isCompanion = node.type === 'companion_object';
	const isObject    = node.type === 'object_declaration';
	const isInterface = node.type === 'class_declaration' && hasKeywordToken(node, 'interface');
	const isEnum      = node.type === 'class_declaration' && hasKeywordToken(node, 'enum');

	const nameNode = node.namedChildren.find(c => c.type === 'type_identifier');
	const localName = nameNode?.text.trim()
		?? (isCompanion ? 'Companion' : undefined);
	if (localName === undefined) { return; }

	const qualName = parent.className !== null ? `${parent.className}.${localName}` : localName;

	const mods = readKotlinModifiers(node);
	const sigPrefix = buildSignaturePrefix(mods);

	let entityKind: 'class' | 'interface';
	let sigBody: string;
	if (isInterface) {
		entityKind = 'interface';
		sigBody = `interface ${localName}`;
	} else if (isCompanion) {
		entityKind = 'class';
		sigBody = `companion object (companion of ${parent.className ?? '?'})`;
	} else if (isObject) {
		entityKind = 'class';
		sigBody = `object ${localName}`;
	} else {
		entityKind = 'class';
		sigBody = `${isEnum ? 'enum class' : 'class'} ${localName}`;
	}

	const id = makeEntityId(ctx.repo, ctx.filePath, entityKind, qualName);
	const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '') + sigBody;

	ctx.entities.push({
		id,
		kind: entityKind,
		name: qualName,
		language: 'kotlin',
		repoId: ctx.repoId,
		repo: ctx.repo,
		file: ctx.filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		body: node.text,
		embedding: [],
		indexedAt: ctx.now,
		isExported: mods.access === null || mods.access === 'public',
		isAbstract: mods.isAbstract || isInterface,
		signature,
	});
	ctx.relations.push({
		kind: 'DEFINES', from: parent.classId ?? ctx.fileId, to: id, resolved: true,
	});

	// Supertype list: `: Base(), Iface1, Iface2`.
	//   constructor_invocation (`Base()`) -> the superclass -> INHERITS.
	//   bare user_type (`Iface1`)         -> an interface    -> IMPLEMENTS.
	for (const spec of node.namedChildren) {
		if (spec.type !== 'delegation_specifier') { continue; }
		const inner = spec.namedChild(0);
		if (inner === null) { continue; }
		if (inner.type === 'constructor_invocation') {
			const ut = inner.namedChildren.find(c => c.type === 'user_type');
			const superName = ut !== undefined ? typeName(ut) : '';
			if (superName !== '' && superName !== 'Any') {
				ctx.relations.push({
					kind: 'INHERITS', from: id, to: superName, resolved: false,
					meta: { file: ctx.filePath, repo: ctx.repo },
				});
			}
		} else if (inner.type === 'user_type' || inner.type === 'explicit_delegation') {
			// bare `user_type` (an interface) OR `Iface by delegate`
			// (explicit_delegation wraps the supertype user_type) -> IMPLEMENTS.
			const ut = inner.type === 'user_type'
				? inner
				: inner.namedChildren.find(c => c.type === 'user_type');
			const ifaceName = ut !== undefined ? typeName(ut) : '';
			if (ifaceName !== '' && ifaceName !== 'Any') {
				ctx.relations.push({
					kind: 'IMPLEMENTS', from: id, to: ifaceName, resolved: false,
					meta: { file: ctx.filePath, repo: ctx.repo },
				});
			}
		}
	}

	const childCtx: ContainerCtx = { classId: id, className: qualName };

	// Primary-constructor `val`/`var` parameters are properties.
	const primary = node.namedChildren.find(c => c.type === 'primary_constructor');
	if (primary !== undefined) {
		for (const param of primary.namedChildren) {
			if (param.type === 'class_parameter'
				&& param.namedChildren.some(c => c.type === 'binding_pattern_kind')) {
				handleProperty(param, ctx, childCtx);
			}
		}
	}

	// Body members (class_body / enum_class_body).
	const body = node.namedChildren.find(
		c => c.type === 'class_body' || c.type === 'enum_class_body',
	);
	if (body !== undefined) {
		for (const member of body.namedChildren) {
			walkNode(member, ctx, childCtx);
		}
	}
}

// ---------------------------------------------------------------------------
// functions / methods (incl. extensions)
// ---------------------------------------------------------------------------

function handleFunction(node: SyntaxNode, ctx: WalkCtx, parent: ContainerCtx): void {
	const named = node.namedChildren;
	const nameIdx = named.findIndex(c => c.type === 'simple_identifier');
	if (nameIdx < 0) { return; }
	const localName = named[nameIdx]!.text.trim();

	// An extension fun carries a receiver `user_type` BEFORE the name:
	// `fun String.shout()`.
	const receiver = named.slice(0, nameIdx).find(c => c.type === 'user_type');
	const isExtension = receiver !== undefined;

	const kind: 'method' | 'function' = (parent.classId !== null || isExtension) ? 'method' : 'function';
	// Fold the extension receiver into the LOCAL name so a member extension
	// (`class U { fun String.shout() }`) doesn't collide with a same-named plain
	// member (`fun shout()`) under one id — both would hash to `U.shout`.
	const localOrExt = isExtension ? `${typeName(receiver!)}.${localName}` : localName;
	const qualName = parent.className !== null ? `${parent.className}.${localOrExt}` : localOrExt;
	const id = makeEntityId(ctx.repo, ctx.filePath, kind, qualName);

	const mods = readKotlinModifiers(node);
	const sigPrefix = buildSignaturePrefix(mods);
	const params = named.find(c => c.type === 'function_value_parameters')?.text ?? '()';
	const receiverSig = isExtension ? `${typeName(receiver!)}.` : '';
	const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '')
		+ (isExtension ? 'extension ' : '')
		+ `fun ${receiverSig}${localName}${params.replace(/\s+/g, ' ')}`;

	ctx.entities.push({
		id,
		kind,
		name: qualName,
		language: 'kotlin',
		repoId: ctx.repoId,
		repo: ctx.repo,
		file: ctx.filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		body: node.text,
		embedding: [],
		indexedAt: ctx.now,
		isExported: mods.access === null || mods.access === 'public',
		isAbstract: mods.isAbstract,
		signature,
	});
	ctx.relations.push({
		kind: 'DEFINES', from: parent.classId ?? ctx.fileId, to: id, resolved: true,
	});

	const bodyNode = named.find(c => c.type === 'function_body');
	if (bodyNode !== undefined) { extractCalls(bodyNode, id, ctx); }
}

// ---------------------------------------------------------------------------
// properties (property_declaration + constructor class_parameter) + enum entries
// ---------------------------------------------------------------------------

function handleProperty(node: SyntaxNode, ctx: WalkCtx, parent: ContainerCtx): void {
	// property_declaration -> variable_declaration -> simple_identifier;
	// class_parameter      -> simple_identifier directly.
	const decl = node.namedChildren.find(c => c.type === 'variable_declaration');
	const nameNode = (decl ?? node).namedChildren.find(c => c.type === 'simple_identifier');
	if (nameNode === undefined) { return; }
	const localName = nameNode.text.trim();
	const qualName = parent.className !== null ? `${parent.className}.${localName}` : localName;
	const id = makeEntityId(ctx.repo, ctx.filePath, 'variable', qualName);

	const mods = readKotlinModifiers(node);
	const sigPrefix = buildSignaturePrefix(mods);
	const bindKind = node.namedChildren.find(c => c.type === 'binding_pattern_kind')?.text.trim() ?? 'val';
	const typeNode = (decl ?? node).namedChildren.find(c => c.type === 'user_type');
	const signature = (sigPrefix !== '' ? `${sigPrefix} ` : '')
		+ `${bindKind} ${localName}`
		+ (typeNode !== undefined ? `: ${typeName(typeNode)}` : '');

	ctx.entities.push({
		id,
		kind: 'variable',
		name: qualName,
		language: 'kotlin',
		repoId: ctx.repoId,
		repo: ctx.repo,
		file: ctx.filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		body: node.text,
		embedding: [],
		indexedAt: ctx.now,
		isExported: mods.access === null || mods.access === 'public',
		signature,
	});
	ctx.relations.push({
		kind: 'DEFINES', from: parent.classId ?? ctx.fileId, to: id, resolved: true,
	});
}

function handleEnumEntry(node: SyntaxNode, ctx: WalkCtx, parent: ContainerCtx): void {
	const nameNode = node.namedChildren.find(c => c.type === 'simple_identifier');
	if (nameNode === undefined) { return; }
	const localName = nameNode.text.trim();
	const qualName = parent.className !== null ? `${parent.className}.${localName}` : localName;
	const id = makeEntityId(ctx.repo, ctx.filePath, 'variable', qualName);
	ctx.entities.push({
		id,
		kind: 'variable',
		name: qualName,
		language: 'kotlin',
		repoId: ctx.repoId,
		repo: ctx.repo,
		file: ctx.filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		body: node.text,
		embedding: [],
		indexedAt: ctx.now,
		isExported: true,
		signature: `enum entry ${localName}`,
	});
	ctx.relations.push({
		kind: 'DEFINES', from: parent.classId ?? ctx.fileId, to: id, resolved: true,
	});
}

// ---------------------------------------------------------------------------
// CALLS (+ HTTP / messaging recognition)
// ---------------------------------------------------------------------------

/** A `call_expression`'s callee text + its `value_arguments` node.
 *  Shape: call_expression -> [callee (navigation_expression | simple_identifier
 *  | ...), call_suffix -> value_arguments -> value_argument*]. */
function calleeAndArgs(node: SyntaxNode): { calleeText: string; valueArgs: SyntaxNode | null } {
	const suffix = node.namedChildren.find(c => c.type === 'call_suffix');
	const callee = node.namedChildren.find(c => c.type !== 'call_suffix');
	const valueArgs = suffix?.namedChildren.find(c => c.type === 'value_arguments') ?? null;
	return { calleeText: (callee?.text ?? '').replace(/\s+/g, ' '), valueArgs };
}

function extractCalls(body: SyntaxNode, fromId: string, ctx: WalkCtx): void {
	const stack: SyntaxNode[] = [body];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.type === 'call_expression') {
			const { calleeText, valueArgs } = calleeAndArgs(node);
			if (calleeText !== '') {
				// HTTP-client recognizer — matched by the last callee segment
				// (`.url`/`.uri`/`getForObject`/...). Gated on an HTTP-library import
				// so a same-named non-HTTP method can't misfire.
				const httpMatch = ctx.httpEnabled ? matchHttpClient('kotlin', calleeText) : null;
				if (httpMatch) {
					const urlArg = valueArgs?.namedChild(httpMatch.urlArgIndex);
					emitCallsHttp(ctx.relations, {
						from: fromId, repo: ctx.repo, file: ctx.filePath, rawUrlExpr: urlArg?.text ?? '',
					});
				}
				// Messaging recognizer — receiver.<verb>(dest, ...) producer call,
				// gated on a messaging import. Requires a dotted callee so a bare
				// send() cannot misfire.
				const msgMatch = (ctx.messagingEnabled && calleeText.includes('.'))
					? matchMessagingClient('kotlin', calleeText) : null;
				if (msgMatch && typeof msgMatch.topicArg === 'number') {
					const destArg = valueArgs?.namedChild(msgMatch.topicArg);
					emitMessaging(ctx.relations, {
						from: fromId, repo: ctx.repo, file: ctx.filePath,
						direction: msgMatch.direction, rawTopicExpr: destArg?.text ?? '',
					});
				}
				ctx.relations.push({
					kind: 'CALLS', from: fromId, to: calleeText, resolved: false,
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

class KotlinParser implements CodeParser {
	readonly extensions = ['.kt', '.kts'];
	readonly language = 'kotlin' as const;

	private readonly tsParser: import('tree-sitter');

	constructor(Parser: typeof import('tree-sitter'), grammar: unknown) {
		this.tsParser = new Parser();
		(this.tsParser as { setLanguage(l: unknown): void }).setLanguage(grammar);
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
			language: 'kotlin',
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

		// Gate HTTP + messaging recognition on a matching library import (a bare
		// `.url`/`.convertAndSend` on a non-client receiver otherwise misfires).
		const importTexts: string[] = [];
		{
			const stack: SyntaxNode[] = [tree.rootNode];
			while (stack.length > 0) {
				const n = stack.pop()!;
				if (n.type === 'import_header') { importTexts.push(n.text); }
				for (let i = 0; i < n.namedChildCount; i++) {
					const c = n.namedChild(i);
					if (c !== null) { stack.push(c); }
				}
			}
		}
		const httpEnabled = fileImportsHttpLibrary('kotlin', importTexts);
		const messagingEnabled = fileImportsMessagingLibrary('kotlin', importTexts);

		const ctx: WalkCtx = {
			repo, repoId, filePath, fileId, now, entities, relations,
			httpEnabled, messagingEnabled,
		};
		walkProgram(tree.rootNode, ctx);

		return { entities, relations };
	}
}

// ---------------------------------------------------------------------------
// Export — singleton, auto-registered behind a GUARDED grammar load
// ---------------------------------------------------------------------------

/** The registered parser, or `null` when the native grammar failed to load. */
export const kotlinParser: KotlinParser | null = (() => {
	try {
		const _require = createRequire(import.meta.url);
		const Parser  = _require('tree-sitter')        as typeof import('tree-sitter');
		const grammar = _require('tree-sitter-kotlin') as unknown;
		const parser = new KotlinParser(Parser, grammar);
		registerParser(parser);
		return parser;
	} catch (e) {
		log.warn(
			{ err: e instanceof Error ? e.message : String(e) },
			'tree-sitter-kotlin failed to load; Kotlin files will not be indexed (other parsers unaffected)',
		);
		return null;
	}
})();
