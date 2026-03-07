/**
 * TypeScript / JavaScript parser.
 *
 * Uses tree-sitter-typescript (for .ts/.tsx) and tree-sitter-javascript
 * (for .js/.jsx/.mjs/.cjs) to extract entities and relations.
 *
 * Extracted:
 *  - Function declarations + arrow functions assigned to const/let
 *  - Class declarations (with INHERITS and IMPLEMENTS edges)
 *  - Interface declarations
 *  - Type alias declarations
 *  - Method definitions inside class bodies
 *  - Import statements → unresolved IMPORTS relations
 *  - Export modifier → isExported: true
 */

// tree-sitter and its grammar packages are CommonJS native addons.
// In ESM scope, use createRequire to load them.
import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);

const Parser     = _require('tree-sitter')            as typeof import('tree-sitter');
const TSGrammars = _require('tree-sitter-typescript') as { typescript: unknown; tsx: unknown };
const JSGrammar  = _require('tree-sitter-javascript') as unknown;

import type { CodeParser, ParseResult } from './base.js';
import { makeEntityId } from './base.js';
import type { Entity, Relation, Language } from '../../shared/types.js';
import { registerParser } from './registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SyntaxNode = import('tree-sitter').SyntaxNode;

/** Get the text of the first named child with the given field name. */
function fieldText(node: SyntaxNode, fieldName: string): string {
  return node.childForFieldName(fieldName)?.text ?? '';
}

/** Return true if a node (or any ancestor up to `stopType`) has a parent of the given type. */
function hasAncestor(node: SyntaxNode, ancestorType: string, stopType?: string): boolean {
  let cur: SyntaxNode | null = node.parent;
  while (cur !== null) {
    if (cur.type === ancestorType) return true;
    if (stopType && cur.type === stopType) return false;
    cur = cur.parent;
  }
  return false;
}

/**
 * Determine if a declaration node is exported.
 * A node is exported if:
 *  - its direct parent is an `export_statement`, OR
 *  - it has an `export` modifier child
 */
function isNodeExported(node: SyntaxNode): boolean {
  if (node.parent?.type === 'export_statement') return true;
  return node.children.some(c => c.type === 'export');
}

// ---------------------------------------------------------------------------
// Core parser class (shared between TS, TSX, JS, JSX)
// ---------------------------------------------------------------------------

class TypeScriptParser implements CodeParser {
  readonly extensions: string[];
  readonly language: Language;

  private readonly tsParser: import('tree-sitter');
  private readonly jsParser: import('tree-sitter');

  constructor() {
    this.extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    this.language   = 'typescript';

    // TypeScript parser (handles .ts and .tsx)
    this.tsParser = new Parser();
    (this.tsParser as { setLanguage(l: unknown): void }).setLanguage(TSGrammars.typescript);

    // JavaScript parser (handles .js, .jsx, .mjs, .cjs)
    this.jsParser = new Parser();
    (this.jsParser as { setLanguage(l: unknown): void }).setLanguage(JSGrammar);
  }

  parse(filePath: string, source: string, repo: string): ParseResult {
    const isTsx  = filePath.endsWith('.tsx');
    const isJS   = filePath.endsWith('.js') || filePath.endsWith('.jsx') ||
                   filePath.endsWith('.mjs') || filePath.endsWith('.cjs');

    // Pick the right parser; TSX uses the tsx grammar
    let parser = this.tsParser;
    if (isTsx) {
      parser = new Parser();
      (parser as { setLanguage(l: unknown): void }).setLanguage(TSGrammars.tsx);
    } else if (isJS) {
      parser = this.jsParser;
    }

    const tree = (parser as { parse(s: string): { rootNode: SyntaxNode } }).parse(source);
    const lang: Language = isJS ? 'javascript' : 'typescript';

    const entities:  Entity[]   = [];
    const relations: Relation[] = [];
    const now = new Date().toISOString();

    // Create a File entity for the file itself
    const fileId = makeEntityId(repo, filePath, 'file', filePath);
    entities.push({
      id:        fileId,
      kind:      'file',
      name:      filePath,
      language:  lang,
      repo,
      file:      filePath,
      startLine: 1,
      endLine:   source.split('\n').length,
      body:      '',
      embedding: [],
      indexedAt: now,
    });

    // Walk the AST
    walkNode(tree.rootNode, source, repo, filePath, lang, fileId, now, entities, relations);

    return { entities, relations };
  }
}

// ---------------------------------------------------------------------------
// AST walker
// ---------------------------------------------------------------------------

function walkNode(
  node:      SyntaxNode,
  source:    string,
  repo:      string,
  filePath:  string,
  lang:      Language,
  fileId:    string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
): void {
  switch (node.type) {
    case 'import_statement':
      extractImport(node, repo, filePath, lang, fileId, now, entities, relations);
      return; // don't descend into imports

    case 'function_declaration':
    case 'generator_function_declaration':
      extractFunction(node, source, repo, filePath, lang, fileId, now, entities, relations);
      break;

    case 'class_declaration':
      extractClass(node, source, repo, filePath, lang, fileId, now, entities, relations);
      return; // class walker handles children

    case 'interface_declaration':
      extractInterface(node, source, repo, filePath, lang, fileId, now, entities, relations);
      return;

    case 'type_alias_declaration':
      extractTypeAlias(node, source, repo, filePath, lang, fileId, now, entities, relations);
      return;

    case 'lexical_declaration':
    case 'variable_declaration':
      extractArrowFunction(node, source, repo, filePath, lang, fileId, now, entities, relations);
      break;

    case 'export_statement': {
      // Recurse into the exported declaration
      const decl = node.childForFieldName('declaration');
      if (decl) {
        walkNode(decl, source, repo, filePath, lang, fileId, now, entities, relations);
      }
      return;
    }
  }

  for (const child of node.namedChildren) {
    walkNode(child, source, repo, filePath, lang, fileId, now, entities, relations);
  }
}

// ---------------------------------------------------------------------------
// Entity extractors
// ---------------------------------------------------------------------------

function extractFunction(
  node:      SyntaxNode,
  source:    string,
  repo:      string,
  filePath:  string,
  lang:      Language,
  fileId:    string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
  className?: string,  // set when inside a class
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name      = nameNode.text;
  const kind      = className ? 'method' : 'function';
  const isAsync   = node.children.some(c => c.type === 'async');
  const exported  = isNodeExported(node);
  const params    = node.childForFieldName('parameters')?.text ?? '';
  const retType   = node.childForFieldName('return_type')?.text.replace(/^:\s*/, '') ?? '';
  const signature = `${name}${params}${retType ? ': ' + retType : ''}`;
  const id        = makeEntityId(repo, filePath, kind, className ? `${className}.${name}` : name);

  entities.push({
    id,
    kind:       kind,
    name,
    language:   lang,
    repo,
    file:       filePath,
    startLine:  node.startPosition.row + 1,
    endLine:    node.endPosition.row + 1,
    body:       node.text,
    embedding:  [],
    indexedAt:  now,
    isExported: exported,
    isAsync,
    signature,
  });

  // DEFINES edge: File → Function
  relations.push({
    kind: 'DEFINES', from: fileId, to: id, resolved: true,
  });
}

function extractClass(
  node:      SyntaxNode,
  source:    string,
  repo:      string,
  filePath:  string,
  lang:      Language,
  fileId:    string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name     = nameNode.text;
  const exported = isNodeExported(node);
  const id       = makeEntityId(repo, filePath, 'class', name);

  entities.push({
    id,
    kind:       'class',
    name,
    language:   lang,
    repo,
    file:       filePath,
    startLine:  node.startPosition.row + 1,
    endLine:    node.endPosition.row + 1,
    body:       node.text,
    embedding:  [],
    indexedAt:  now,
    isExported: exported,
  });

  relations.push({ kind: 'DEFINES', from: fileId, to: id, resolved: true });

  // Walk class_heritage for extends / implements
  for (const child of node.namedChildren) {
    if (child.type === 'class_heritage') {
      extractClassHeritage(child, id, repo, filePath, now, entities, relations);
    }
  }

  // Walk class_body for method definitions
  const body = node.childForFieldName('body');
  if (body) {
    for (const member of body.namedChildren) {
      if (member.type === 'method_definition' || member.type === 'method_signature') {
        extractMethod(member, source, repo, filePath, lang, fileId, id, name, now, entities, relations);
      }
    }
  }
}

function extractClassHeritage(
  heritage:  SyntaxNode,
  classId:   string,
  repo:      string,
  filePath:  string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
): void {
  for (const child of heritage.namedChildren) {
    if (child.type === 'extends_clause') {
      // extends_clause has a 'value' field with the superclass name/expression
      const superName = child.childForFieldName('value')?.text ?? child.namedChildren[0]?.text;
      if (superName) {
        // Unresolved: 'to' is the class name, Resolver will find the ID
        relations.push({
          kind:     'INHERITS',
          from:     classId,
          to:       superName,
          resolved: false,
          meta:     { file: filePath, repo },
        });
      }
    } else if (child.type === 'implements_clause') {
      // implements_clause: named children are the interface types
      for (const iface of child.namedChildren) {
        const ifaceName = iface.text.split('<')[0]?.trim(); // strip generics
        if (ifaceName) {
          relations.push({
            kind:     'IMPLEMENTS',
            from:     classId,
            to:       ifaceName,
            resolved: false,
            meta:     { file: filePath, repo },
          });
        }
      }
    }
  }
}

function extractMethod(
  node:      SyntaxNode,
  source:    string,
  repo:      string,
  filePath:  string,
  lang:      Language,
  fileId:    string,
  classId:   string,
  className: string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const methodName = nameNode.text;
  if (methodName === 'constructor') {
    // Skip constructor — covered by the class entity
    return;
  }

  const isAsync  = node.children.some(c => c.type === 'async');
  const params   = node.childForFieldName('parameters')?.text ?? '';
  const retType  = node.childForFieldName('return_type')?.text.replace(/^:\s*/, '') ?? '';
  const sig      = `${methodName}${params}${retType ? ': ' + retType : ''}`;
  const id       = makeEntityId(repo, filePath, 'method', `${className}.${methodName}`);

  entities.push({
    id,
    kind:      'method',
    name:      methodName,
    language:  lang,
    repo,
    file:      filePath,
    startLine: node.startPosition.row + 1,
    endLine:   node.endPosition.row + 1,
    body:      node.text,
    embedding: [],
    indexedAt: now,
    isAsync,
    signature: sig,
  });

  relations.push({ kind: 'DEFINES', from: fileId,  to: id,      resolved: true });
  relations.push({ kind: 'DEFINES', from: classId, to: id,      resolved: true });
}

function extractInterface(
  node:      SyntaxNode,
  source:    string,
  repo:      string,
  filePath:  string,
  lang:      Language,
  fileId:    string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name     = nameNode.text;
  const exported = isNodeExported(node);
  const id       = makeEntityId(repo, filePath, 'interface', name);

  entities.push({
    id,
    kind:       'interface',
    name,
    language:   lang,
    repo,
    file:       filePath,
    startLine:  node.startPosition.row + 1,
    endLine:    node.endPosition.row + 1,
    body:       node.text,
    embedding:  [],
    indexedAt:  now,
    isExported: exported,
  });

  relations.push({ kind: 'DEFINES', from: fileId, to: id, resolved: true });
}

function extractTypeAlias(
  node:      SyntaxNode,
  source:    string,
  repo:      string,
  filePath:  string,
  lang:      Language,
  fileId:    string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name     = nameNode.text;
  const exported = isNodeExported(node);
  const id       = makeEntityId(repo, filePath, 'type', name);

  entities.push({
    id,
    kind:       'type',
    name,
    language:   lang,
    repo,
    file:       filePath,
    startLine:  node.startPosition.row + 1,
    endLine:    node.endPosition.row + 1,
    body:       node.text,
    embedding:  [],
    indexedAt:  now,
    isExported: exported,
  });

  relations.push({ kind: 'DEFINES', from: fileId, to: id, resolved: true });
}

function extractArrowFunction(
  node:      SyntaxNode,
  source:    string,
  repo:      string,
  filePath:  string,
  lang:      Language,
  fileId:    string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
): void {
  // Handle: const foo = () => {} or const foo = function() {}
  for (const declarator of node.namedChildren) {
    if (declarator.type !== 'variable_declarator') continue;

    const nameNode = declarator.childForFieldName('name');
    const valueNode = declarator.childForFieldName('value');
    if (!nameNode || !valueNode) continue;
    if (valueNode.type !== 'arrow_function' && valueNode.type !== 'function_expression' &&
        valueNode.type !== 'generator_function_expression') continue;

    const name    = nameNode.text;
    const isAsync = valueNode.children.some(c => c.type === 'async');
    const params  = valueNode.childForFieldName('parameters')?.text ?? '';
    const retType = valueNode.childForFieldName('return_type')?.text.replace(/^:\s*/, '') ?? '';
    const sig     = `${name}${params}${retType ? ': ' + retType : ''}`;
    const id      = makeEntityId(repo, filePath, 'function', name);
    const exported = isNodeExported(node);

    entities.push({
      id,
      kind:       'function',
      name,
      language:   lang,
      repo,
      file:       filePath,
      startLine:  node.startPosition.row + 1,
      endLine:    node.endPosition.row + 1,
      body:       node.text,
      embedding:  [],
      indexedAt:  now,
      isExported: exported,
      isAsync,
      signature:  sig,
    });

    relations.push({ kind: 'DEFINES', from: fileId, to: id, resolved: true });
  }
}

function extractImport(
  node:      SyntaxNode,
  repo:      string,
  filePath:  string,
  lang:      Language,
  fileId:    string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
): void {
  const sourceNode = node.childForFieldName('source');
  if (!sourceNode) return;

  // Strip quotes from the module specifier
  const specifier = sourceNode.text.replace(/^['"`]|['"`]$/g, '');
  if (!specifier) return;

  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');

  if (isRelative) {
    // Resolved later by the Resolver; for now emit unresolved with raw specifier as 'to'
    relations.push({
      kind:     'IMPORTS',
      from:     fileId,
      to:       specifier,
      resolved: false,
      meta:     { file: filePath, repo, isRelative: true },
    });
  } else {
    // External module — create a Module stub entity and an IMPORTS edge
    const moduleId = makeEntityId(repo, '', 'module', specifier);
    if (!entities.some(e => e.id === moduleId)) {
      entities.push({
        id:        moduleId,
        kind:      'module',
        name:      specifier,
        language:  lang,
        repo:      '',  // external — no repo
        file:      '',
        startLine: 0,
        endLine:   0,
        body:      '',
        embedding: [],
        indexedAt: now,
      });
    }
    relations.push({
      kind:     'IMPORTS',
      from:     fileId,
      to:       moduleId,
      resolved: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Export — singleton instance, auto-registered
// ---------------------------------------------------------------------------

export const typescriptParser = new TypeScriptParser();
registerParser(typescriptParser);
