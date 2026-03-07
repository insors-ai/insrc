/**
 * Python parser.
 *
 * Uses tree-sitter-python to extract entities and relations.
 *
 * Extracted:
 *  - function_definition (sync and async) → Function / Method nodes
 *  - class_definition → Class nodes with INHERITS edges
 *  - decorated_definition → unwraps to the inner function/class
 *  - import_statement → IMPORTS to Module stub
 *  - import_from_statement → IMPORTS (relative stays unresolved; absolute → Module stub)
 *  - __all__ → restricts which top-level defs are marked isExported
 */

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);

const Parser        = _require('tree-sitter')        as typeof import('tree-sitter');
const PythonGrammar = _require('tree-sitter-python') as unknown;

import type { CodeParser, ParseResult } from './base.js';
import { makeEntityId } from './base.js';
import type { Entity, Relation } from '../../shared/types.js';
import { registerParser } from './registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SyntaxNode = import('tree-sitter').SyntaxNode;

/**
 * Scan the module root for an `__all__ = [...]` assignment.
 * Returns the set of exported names, or null if __all__ is absent.
 */
function collectDunderAll(root: SyntaxNode): Set<string> | null {
  for (const child of root.namedChildren) {
    if (child.type !== 'expression_statement') continue;
    const expr = child.namedChildren[0];
    if (!expr || expr.type !== 'assignment') continue;
    const left = expr.childForFieldName('left');
    if (!left || left.text !== '__all__') continue;
    const right = expr.childForFieldName('right');
    if (!right) continue;
    const names = new Set<string>();
    for (const item of right.namedChildren) {
      // String literals — strip quotes
      if (item.type === 'string') {
        names.add(item.text.replace(/^['"]|['"]$/g, '').replace(/^['"]|['"]$/g, ''));
      }
    }
    return names;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

function walkPythonNode(
  node:       SyntaxNode,
  repo:       string,
  filePath:   string,
  fileId:     string,
  now:        string,
  entities:   Entity[],
  relations:  Relation[],
  allNames:   Set<string> | null,
  hasAll:     boolean,
  isTopLevel: boolean,
  classId?:   string,
  className?: string,
): void {
  switch (node.type) {

    case 'function_definition': {
      const nameNode = node.childForFieldName('name');
      if (!nameNode) break;

      const name    = nameNode.text;
      // async keyword appears as a direct named child before 'def'
      const isAsync = node.children.some(c => c.type === 'async');
      const kind    = classId ? 'method' : 'function';
      const qualName = classId && className ? `${className}.${name}` : name;
      const id      = makeEntityId(repo, filePath, kind, qualName);

      const isExported = isTopLevel && (!hasAll || (allNames?.has(name) ?? false));

      const params  = node.childForFieldName('parameters')?.text ?? '';
      const retType = node.childForFieldName('return_type')?.text.replace(/^->\s*/, '') ?? '';
      const signature = `def ${name}${params}${retType ? ' -> ' + retType : ''}`;

      entities.push({
        id,
        kind,
        name,
        language:   'python',
        repo,
        file:       filePath,
        startLine:  node.startPosition.row + 1,
        endLine:    node.endPosition.row + 1,
        body:       node.text,
        embedding:  [],
        indexedAt:  now,
        isExported,
        isAsync,
        signature,
      });

      relations.push({ kind: 'DEFINES', from: fileId, to: id, resolved: true });
      if (classId) {
        relations.push({ kind: 'DEFINES', from: classId, to: id, resolved: true });
      }
      break;
    }

    case 'class_definition': {
      const nameNode = node.childForFieldName('name');
      if (!nameNode) break;

      const name       = nameNode.text;
      const id         = makeEntityId(repo, filePath, 'class', name);
      const isExported = isTopLevel && (!hasAll || (allNames?.has(name) ?? false));

      entities.push({
        id,
        kind:       'class',
        name,
        language:   'python',
        repo,
        file:       filePath,
        startLine:  node.startPosition.row + 1,
        endLine:    node.endPosition.row + 1,
        body:       node.text,
        embedding:  [],
        indexedAt:  now,
        isExported,
      });

      relations.push({ kind: 'DEFINES', from: fileId, to: id, resolved: true });

      // Extract superclasses → unresolved INHERITS edges
      const superclasses = node.childForFieldName('superclasses');
      if (superclasses) {
        for (const parent of superclasses.namedChildren) {
          // Skip keyword arguments like metaclass=...
          if (parent.type === 'keyword_argument') continue;
          const parentName = parent.text.split('[')[0]?.split('(')[0]?.trim() ?? '';
          if (parentName && parentName !== 'object') {
            relations.push({
              kind:     'INHERITS',
              from:     id,
              to:       parentName,
              resolved: false,
              meta:     { file: filePath, repo },
            });
          }
        }
      }

      // Walk class body for methods
      const body = node.childForFieldName('body');
      if (body) {
        for (const member of body.namedChildren) {
          walkPythonNode(
            member, repo, filePath, fileId, now,
            entities, relations,
            null, false, false,
            id, name,
          );
        }
      }
      break;
    }

    case 'decorated_definition': {
      // Unwrap to the inner function_definition or class_definition.
      // tree-sitter-python stores it as the last named child (after decorator(s)).
      const children = node.namedChildren;
      let inner: SyntaxNode | undefined;
      for (let i = children.length - 1; i >= 0; i--) {
        const c = children[i]!;
        if (c.type === 'function_definition' || c.type === 'class_definition') { inner = c; break; }
      }
      if (inner) {
        walkPythonNode(
          inner, repo, filePath, fileId, now,
          entities, relations,
          allNames, hasAll, isTopLevel,
          classId, className,
        );
      }
      break;
    }

    case 'import_statement': {
      // import foo, import foo as bar
      for (const child of node.namedChildren) {
        let modName: string;
        if (child.type === 'aliased_import') {
          modName = child.childForFieldName('name')?.text ?? '';
        } else {
          // dotted_name
          modName = child.text;
        }
        if (!modName) continue;

        const moduleId = makeEntityId('', '', 'module', modName);
        if (!entities.some(e => e.id === moduleId)) {
          entities.push({
            id: moduleId, kind: 'module', name: modName, language: 'python',
            repo: '', file: '', startLine: 0, endLine: 0,
            body: '', embedding: [], indexedAt: now,
          });
        }
        relations.push({ kind: 'IMPORTS', from: fileId, to: moduleId, resolved: true });
      }
      break;
    }

    case 'import_from_statement': {
      // from foo import bar  /  from . import bar  /  from ..pkg import baz
      const moduleNameNode = node.childForFieldName('module_name');
      if (!moduleNameNode) break;

      const modText    = moduleNameNode.text;  // e.g. ".foo" or "os"
      const isRelative = modText.startsWith('.');

      if (isRelative) {
        relations.push({
          kind:     'IMPORTS',
          from:     fileId,
          to:       modText,
          resolved: false,
          meta:     { file: filePath, repo, isRelative: true },
        });
      } else {
        const moduleId = makeEntityId('', '', 'module', modText);
        if (!entities.some(e => e.id === moduleId)) {
          entities.push({
            id: moduleId, kind: 'module', name: modText, language: 'python',
            repo: '', file: '', startLine: 0, endLine: 0,
            body: '', embedding: [], indexedAt: now,
          });
        }
        relations.push({ kind: 'IMPORTS', from: fileId, to: moduleId, resolved: true });
      }
      break;
    }

    default:
      // Walk children for other top-level nodes (if/try blocks, etc.)
      if (isTopLevel) {
        for (const child of node.namedChildren) {
          walkPythonNode(
            child, repo, filePath, fileId, now,
            entities, relations,
            allNames, hasAll, false,
          );
        }
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Parser class
// ---------------------------------------------------------------------------

class PythonParser implements CodeParser {
  readonly extensions = ['.py'];
  readonly language   = 'python' as const;

  private readonly tsParser: import('tree-sitter');

  constructor() {
    this.tsParser = new Parser();
    (this.tsParser as { setLanguage(l: unknown): void }).setLanguage(PythonGrammar);
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
      language:  'python',
      repo,
      file:      filePath,
      startLine: 1,
      endLine:   source.split('\n').length,
      body:      '',
      embedding: [],
      indexedAt: now,
    });

    // Detect __all__ to know which top-level defs are exported
    const allNames = collectDunderAll(tree.rootNode);
    const hasAll   = allNames !== null;

    for (const child of tree.rootNode.namedChildren) {
      walkPythonNode(
        child, repo, filePath, fileId, now,
        entities, relations,
        allNames, hasAll, true,
      );
    }

    return { entities, relations };
  }
}

// ---------------------------------------------------------------------------
// Export — singleton, auto-registered
// ---------------------------------------------------------------------------

export const pythonParser = new PythonParser();
registerParser(pythonParser);
