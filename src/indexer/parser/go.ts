/**
 * Go parser.
 *
 * Uses tree-sitter-go to extract entities and relations.
 *
 * Extracted:
 *  - function_declaration → Function node (exported if name starts with uppercase)
 *  - method_declaration → Method node; DEFINES from receiver type stub
 *  - type_spec with struct_type → Class node
 *  - type_spec with interface_type → Interface node
 *  - type_alias → Type node
 *  - import_declaration → IMPORTS to Module stub
 *
 * Interface satisfaction (implicit implements) is handled by a post-parse pass
 * in runInterfaceSatisfactionPass(), called by the IndexerService after a full
 * repo index.
 */

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);

const Parser    = _require('tree-sitter')    as typeof import('tree-sitter');
const GoGrammar = _require('tree-sitter-go') as unknown;

import type { CodeParser, ParseResult } from './base.js';
import { makeEntityId } from './base.js';
import type { Entity, Relation } from '../../shared/types.js';
import { registerParser } from './registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SyntaxNode = import('tree-sitter').SyntaxNode;

/** In Go, exported identifiers start with an uppercase letter. */
function isExported(name: string): boolean {
  return name.length > 0 && name[0]! >= 'A' && name[0]! <= 'Z';
}

/** Strip quotes from a Go interpreted string literal. */
function stripGoString(text: string): string {
  return text.replace(/^"|"$/g, '').replace(/^`|`$/g, '');
}

/**
 * Extract the receiver type name from a method receiver parameter list.
 * e.g. `(s *MyStruct)` → `MyStruct`
 */
function receiverTypeName(receiverNode: SyntaxNode): string {
  // receiver is a parameter_list: (name type)
  for (const param of receiverNode.namedChildren) {
    // param is a parameter_declaration: name type
    const typeNode = param.childForFieldName('type') ?? param.namedChildren.at(-1);
    if (!typeNode) continue;
    // Strip pointer: *Foo → Foo; may also be (T) generic receiver
    let typeName = typeNode.text.replace(/^\*/, '').replace(/\[.*\]/, '').trim();
    // Handle generic receivers: Foo[T any] → Foo
    typeName = typeName.split('[')[0]?.trim() ?? typeName;
    if (typeName) return typeName;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Extractor functions
// ---------------------------------------------------------------------------

function extractFunction(
  node:      SyntaxNode,
  repo:      string,
  filePath:  string,
  fileId:    string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const name      = nameNode.text;
  const exported  = isExported(name);
  const params    = node.childForFieldName('parameters')?.text ?? '';
  const result    = node.childForFieldName('result')?.text ?? '';
  const signature = `func ${name}${params}${result ? ' ' + result : ''}`;
  const id        = makeEntityId(repo, filePath, 'function', name);

  entities.push({
    id,
    kind:       'function',
    name,
    language:   'go',
    repo,
    file:       filePath,
    startLine:  node.startPosition.row + 1,
    endLine:    node.endPosition.row + 1,
    body:       node.text,
    embedding:  [],
    indexedAt:  now,
    isExported: exported,
    signature,
  });

  relations.push({ kind: 'DEFINES', from: fileId, to: id, resolved: true });
}

function extractMethod(
  node:      SyntaxNode,
  repo:      string,
  filePath:  string,
  fileId:    string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
): void {
  const nameNode     = node.childForFieldName('name');
  const receiverNode = node.childForFieldName('receiver');
  if (!nameNode) return;

  const methodName  = nameNode.text;
  const typeName    = receiverNode ? receiverTypeName(receiverNode) : '';
  const qualName    = typeName ? `${typeName}.${methodName}` : methodName;
  const exported    = isExported(methodName);
  const params      = node.childForFieldName('parameters')?.text ?? '';
  const result      = node.childForFieldName('result')?.text ?? '';
  const receiver    = receiverNode?.text ?? '';
  const signature   = `func ${receiver} ${methodName}${params}${result ? ' ' + result : ''}`;
  const id          = makeEntityId(repo, filePath, 'method', qualName);

  entities.push({
    id,
    kind:       'method',
    name:       methodName,
    language:   'go',
    repo,
    file:       filePath,
    startLine:  node.startPosition.row + 1,
    endLine:    node.endPosition.row + 1,
    body:       node.text,
    embedding:  [],
    indexedAt:  now,
    isExported: exported,
    signature,
  });

  relations.push({ kind: 'DEFINES', from: fileId, to: id, resolved: true });

  // DEFINES from the receiver struct stub (unresolved — type may be in another file)
  if (typeName) {
    const classId = makeEntityId(repo, filePath, 'class', typeName);
    relations.push({ kind: 'DEFINES', from: classId, to: id, resolved: true });
  }
}

function extractTypeSpec(
  node:      SyntaxNode,
  repo:      string,
  filePath:  string,
  fileId:    string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
): void {
  const nameNode = node.childForFieldName('name');
  const typeNode = node.childForFieldName('type');
  if (!nameNode || !typeNode) return;

  const name     = nameNode.text;
  const exported = isExported(name);

  if (typeNode.type === 'struct_type') {
    const id = makeEntityId(repo, filePath, 'class', name);
    entities.push({
      id,
      kind:       'class',
      name,
      language:   'go',
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

  } else if (typeNode.type === 'interface_type') {
    const id = makeEntityId(repo, filePath, 'interface', name);

    // Collect method signatures from the interface body for the satisfaction pass
    const methodSigs: string[] = [];
    for (const member of typeNode.namedChildren) {
      if (member.type === 'method_spec') {
        const mName   = member.childForFieldName('name')?.text ?? '';
        const mParams = member.childForFieldName('parameters')?.text ?? '';
        const mResult = member.childForFieldName('result')?.text ?? '';
        if (mName) methodSigs.push(`${mName}${mParams}${mResult ? ' ' + mResult : ''}`);
      }
    }

    entities.push({
      id,
      kind:       'interface',
      name,
      language:   'go',
      repo,
      file:       filePath,
      startLine:  node.startPosition.row + 1,
      endLine:    node.endPosition.row + 1,
      body:       node.text,
      embedding:  [],
      indexedAt:  now,
      isExported: exported,
      // Store method signatures in signature field (pipe-separated) for the satisfaction pass
      signature:  methodSigs.join(' | '),
    });
    relations.push({ kind: 'DEFINES', from: fileId, to: id, resolved: true });

  } else {
    // Type alias or other named type → Type entity
    const id = makeEntityId(repo, filePath, 'type', name);
    entities.push({
      id,
      kind:       'type',
      name,
      language:   'go',
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
}

function extractImport(
  node:      SyntaxNode,
  repo:      string,
  filePath:  string,
  fileId:    string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
): void {
  // import_declaration may contain import_spec_list or a single import_spec
  const specs: SyntaxNode[] = [];

  for (const child of node.namedChildren) {
    if (child.type === 'import_spec') {
      specs.push(child);
    } else if (child.type === 'import_spec_list') {
      for (const spec of child.namedChildren) {
        if (spec.type === 'import_spec') specs.push(spec);
      }
    }
  }

  for (const spec of specs) {
    const pathNode = spec.childForFieldName('path');
    if (!pathNode) continue;
    const importPath = stripGoString(pathNode.text);
    if (!importPath) continue;

    const moduleId = makeEntityId('', '', 'module', importPath);
    if (!entities.some(e => e.id === moduleId)) {
      entities.push({
        id: moduleId, kind: 'module', name: importPath, language: 'go',
        repo: '', file: '', startLine: 0, endLine: 0,
        body: '', embedding: [], indexedAt: now,
      });
    }
    relations.push({ kind: 'IMPORTS', from: fileId, to: moduleId, resolved: true });
  }
}

// ---------------------------------------------------------------------------
// AST walker
// ---------------------------------------------------------------------------

function walkGoNode(
  node:      SyntaxNode,
  repo:      string,
  filePath:  string,
  fileId:    string,
  now:       string,
  entities:  Entity[],
  relations: Relation[],
): void {
  switch (node.type) {

    case 'function_declaration':
      extractFunction(node, repo, filePath, fileId, now, entities, relations);
      return;

    case 'method_declaration':
      extractMethod(node, repo, filePath, fileId, now, entities, relations);
      return;

    case 'type_declaration':
      // May contain multiple type_spec children
      for (const child of node.namedChildren) {
        if (child.type === 'type_spec') {
          extractTypeSpec(child, repo, filePath, fileId, now, entities, relations);
        }
      }
      return;

    case 'import_declaration':
      extractImport(node, repo, filePath, fileId, now, entities, relations);
      return;
  }

  // Walk top-level declarations only (don't descend into function bodies)
  for (const child of node.namedChildren) {
    walkGoNode(child, repo, filePath, fileId, now, entities, relations);
  }
}

// ---------------------------------------------------------------------------
// Parser class
// ---------------------------------------------------------------------------

class GoParser implements CodeParser {
  readonly extensions = ['.go'];
  readonly language   = 'go' as const;

  private readonly tsParser: import('tree-sitter');

  constructor() {
    this.tsParser = new Parser();
    (this.tsParser as { setLanguage(l: unknown): void }).setLanguage(GoGrammar);
  }

  parse(filePath: string, source: string, repo: string): ParseResult {
    const tree = (this.tsParser as { parse(s: string): { rootNode: SyntaxNode } }).parse(source);
    const now  = new Date().toISOString();

    const entities:  Entity[]   = [];
    const relations: Relation[] = [];

    const fileId = makeEntityId(repo, filePath, 'file', filePath);
    entities.push({
      id:        fileId,
      kind:      'file',
      name:      filePath,
      language:  'go',
      repo,
      file:      filePath,
      startLine: 1,
      endLine:   source.split('\n').length,
      body:      '',
      embedding: [],
      indexedAt: now,
    });

    // Walk top-level declarations
    for (const child of tree.rootNode.namedChildren) {
      walkGoNode(child, repo, filePath, fileId, now, entities, relations);
    }

    return { entities, relations };
  }
}

// ---------------------------------------------------------------------------
// Export — singleton, auto-registered
// ---------------------------------------------------------------------------

export const goParser = new GoParser();
registerParser(goParser);
