#!/usr/bin/env tsx
/**
 * Layered indexer smoke test — run with: npx tsx scripts/test-indexer.ts
 *
 * Layer 1: Parser          (no DB, no Ollama)
 * Layer 2: Manifest parser (no DB, no Ollama)
 * Layer 3: Resolver        (no DB, no Ollama)
 * Layer 4: Full DB index   (Kuzu + LanceDB — embedded, no server required)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO  = resolve(import.meta.dirname, '..');
const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const YELL  = '\x1b[33m';
const DIM   = '\x1b[2m';
const RESET = '\x1b[0m';

function section(title: string) {
  console.log(`\n${CYAN}━━━ ${title} ━━━${RESET}`);
}
function ok(msg: string)   { console.log(`${GREEN}✓${RESET} ${msg}`); }
function fail(msg: string) { console.log(`${RED}✗${RESET} ${msg}`); }
function skip(msg: string) { console.log(`${YELL}⚠${RESET} ${msg}`); }
function dim(msg: string)  { console.log(`${DIM}  ${msg}${RESET}`); }

// ---------------------------------------------------------------------------
// Layer 1: Parser — import typescript parser first so it self-registers
// ---------------------------------------------------------------------------
section('Layer 1: TypeScript parser');

try {
  // Side-effect import triggers registerParser() inside the module
  await import('../src/indexer/parser/typescript.js');
  const { getParser } = await import('../src/indexer/parser/registry.js');

  const testFile = resolve(REPO, 'src/indexer/manifest.ts');
  const source   = readFileSync(testFile, 'utf8');

  const parser = getParser(testFile);
  if (!parser) throw new Error('No parser registered for .ts');

  const result = parser.parse(testFile, source, REPO);

  ok(`Parsed ${testFile.replace(REPO, '.')}`);
  ok(`Entities (${result.entities.length}):`);
  for (const e of result.entities) {
    dim(`${e.kind.padEnd(14)} ${e.name}`);
  }
  ok(`Relations (${result.relations.length}):`);
  for (const r of result.relations) {
    dim(`${r.kind.padEnd(14)} ${String(r.from).split(':')[1] ?? r.from} → ${r.to}`);
  }

  if (result.entities.length === 0) fail('Expected at least 1 entity');
} catch (err) {
  fail(`Parser error: ${err}`);
}

// ---------------------------------------------------------------------------
// Layer 2: Manifest parser
// ---------------------------------------------------------------------------
section('Layer 2: Manifest parser');

try {
  const { parseManifest } = await import('../src/indexer/manifest.js');
  const deps = parseManifest(REPO);

  ok(`Found ${deps.length} deps in package.json`);
  for (const d of deps.slice(0, 8)) {
    dim(`${d.name}${d.version ? '@' + d.version : ''}`);
  }
  if (deps.length > 8) dim(`… and ${deps.length - 8} more`);

  if (deps.length === 0) fail('Expected deps from package.json');
} catch (err) {
  fail(`Manifest error: ${err}`);
}

// ---------------------------------------------------------------------------
// Layer 3: Resolver
// ---------------------------------------------------------------------------
section('Layer 3: Relation resolver');

try {
  const { getParser }        = await import('../src/indexer/parser/registry.js');
  const { resolveRelations } = await import('../src/indexer/resolver.js');

  const testFile = resolve(REPO, 'src/indexer/index.ts');
  const source   = readFileSync(testFile, 'utf8');
  const parser   = getParser(testFile);
  if (!parser) throw new Error('No parser registered for .ts');

  const result   = parser.parse(testFile, source, REPO);
  const resolved = resolveRelations(result.relations, testFile, REPO);

  const imports    = resolved.filter(r => r.kind === 'IMPORTS');
  const resolvedOk = imports.filter(r => r.resolved);

  ok(`Total relations: ${result.relations.length}`);
  ok(`IMPORTS resolved: ${resolvedOk.length} / ${imports.length}`);
  for (const r of resolvedOk) {
    dim(String(r.to).replace(REPO, '.'));
  }

  if (resolvedOk.length === 0) fail('Expected at least one resolved import');
} catch (err) {
  fail(`Resolver error: ${err}`);
}

// ---------------------------------------------------------------------------
// Layer 4: Full DB index (Kuzu + LanceDB — embedded, no server needed)
// ---------------------------------------------------------------------------
section('Layer 4: Full DB index (Kuzu graph + LanceDB entities)');

import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Shared helpers for temp DB layers
async function makeTempDb() {
  const tmpDir   = mkdtempSync(join(tmpdir(), 'insrc-test-'));
  const tmpGraph = join(tmpDir, 'graph');   // Kuzu creates this — do NOT pre-create
  const tmpLance = join(tmpDir, 'lance');
  mkdirSync(tmpLance, { recursive: true });

  const kuzu    = (await import('kuzu')).default;
  const lancedb = await import('@lancedb/lancedb');

  const kuzuDb = new kuzu.Database(tmpGraph);
  const graph  = new kuzu.Connection(kuzuDb);
  const lance  = await lancedb.connect(tmpLance);
  const db     = { graph, lance };

  const { KUZU_STATEMENTS } = await import('../src/db/schema.js');
  for (const stmt of KUZU_STATEMENTS) await db.graph.query(stmt);

  return { db, tmpDir };
}

try {
  const { db, tmpDir } = await makeTempDb();
  ok('Kuzu + LanceDB initialised');

  const { upsertEntities }   = await import('../src/db/entities.js');
  const { upsertRelations }  = await import('../src/db/relations.js');
  const { getParser }        = await import('../src/indexer/parser/registry.js');
  const { resolveRelations } = await import('../src/indexer/resolver.js');

  const testFile = resolve(REPO, 'src/indexer/manifest.ts');
  const source   = readFileSync(testFile, 'utf8');
  const parser   = getParser(testFile)!;
  const result   = parser.parse(testFile, source, REPO);
  const resolved = resolveRelations(result.relations, testFile, REPO);

  await upsertEntities(db, result.entities);
  await upsertRelations(db, resolved);
  ok(`Upserted ${result.entities.length} entities, ${resolved.length} relations`);

  // Query back from LanceDB
  const names = await db.lance.tableNames();
  if (names.includes('entities')) {
    const tbl  = await db.lance.openTable('entities');
    const rows = await tbl.query().select(['kind', 'name']).toArray();
    ok(`Rows in LanceDB: ${rows.length}`);
    for (const row of rows) {
      dim(`${String(row['kind'] ?? '?').padEnd(14)} ${String(row['name'] ?? '?')}`);
    }
  }

  const kuzuResult = await db.graph.query('MATCH (e:Entity) RETURN e.id AS id LIMIT 5');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kuzuQr   = Array.isArray(kuzuResult) ? kuzuResult[0]! : kuzuResult;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kuzuRows = await (kuzuQr as any).getAll();
  ok(`Entity stubs in Kuzu: ${kuzuRows.length} (showing up to 5)`);

  rmSync(tmpDir, { recursive: true, force: true });
  ok('Temp DB cleaned up');
} catch (err: unknown) {
  fail(`DB error: ${err}`);
}

// ---------------------------------------------------------------------------
// Layer 5: Python parser
// ---------------------------------------------------------------------------
section('Layer 5: Python parser');

const PYTHON_FIXTURE = `\
import os
import sys
from pathlib import Path
from . import sibling

__all__ = ['MyClass', 'top_fn']

class MyClass(BaseClass):
    def __init__(self, x: int) -> None:
        self.x = x

    async def fetch(self, url: str) -> str:
        return url

def top_fn(a: int, b: int) -> int:
    return a + b

def _private():
    pass
`;

try {
  await import('../src/indexer/parser/python.js');
  const { getParser } = await import('../src/indexer/parser/registry.js');

  const parser = getParser('test.py');
  if (!parser) throw new Error('No parser registered for .py');

  const result = parser.parse('/repo/test.py', PYTHON_FIXTURE, '/repo');

  const kinds   = result.entities.map(e => e.kind);
  const names   = result.entities.map(e => e.name);
  const classes = result.entities.filter(e => e.kind === 'class');
  const methods = result.entities.filter(e => e.kind === 'method');
  const fns     = result.entities.filter(e => e.kind === 'function');
  const imports = result.relations.filter(r => r.kind === 'IMPORTS');

  ok(`Entities (${result.entities.length}): ${kinds.join(', ')}`);
  for (const e of result.entities) {
    dim(`${e.kind.padEnd(10)} ${e.name}${e.isExported ? ' [exported]' : ''}`);
  }
  ok(`Relations (${result.relations.length})`);

  if (classes.length !== 1)      fail(`Expected 1 class, got ${classes.length}`);
  else                           ok('Class: MyClass ✓');

  if (methods.length !== 2)      fail(`Expected 2 methods, got ${methods.length}`);
  else                           ok('Methods: __init__, fetch ✓');

  const fetchMethod = methods.find(m => m.name === 'fetch');
  if (!fetchMethod?.isAsync)     fail('Expected fetch to be isAsync');
  else                           ok('fetch isAsync ✓');

  if (fns.length !== 2)          fail(`Expected 2 functions (top_fn, _private), got ${fns.length}`);
  else                           ok('Functions: top_fn, _private ✓');

  const topFn = fns.find(f => f.name === 'top_fn');
  const priv  = fns.find(f => f.name === '_private');
  if (!topFn?.isExported)        fail('Expected top_fn to be exported (__all__)');
  else                           ok('top_fn isExported ✓');
  if (priv?.isExported)          fail('Expected _private NOT exported');
  else                           ok('_private not exported ✓');

  const inherits = result.relations.filter(r => r.kind === 'INHERITS');
  if (inherits.length !== 1)     fail(`Expected 1 INHERITS edge, got ${inherits.length}`);
  else                           ok(`INHERITS: MyClass → ${inherits[0]!.to} ✓`);

  const relImports = imports.filter(r => !r.resolved); // relative '. sibling'
  if (relImports.length !== 1)   fail(`Expected 1 relative import, got ${relImports.length}`);
  else                           ok('Relative import unresolved ✓');
} catch (err) {
  fail(`Python parser error: ${err}`);
}

// ---------------------------------------------------------------------------
// Layer 6: Go parser
// ---------------------------------------------------------------------------
section('Layer 6: Go parser');

const GO_FIXTURE = `\
package main

import (
\t"fmt"
\t"os"
)

type Animal interface {
\tSpeak() string
\tMove(speed int) bool
}

type Dog struct {
\tName string
\tAge  int
}

func (d *Dog) Speak() string {
\treturn "Woof"
}

func (d *Dog) Move(speed int) bool {
\treturn speed > 0
}

func NewDog(name string) *Dog {
\treturn &Dog{Name: name}
}

func main() {
\tfmt.Println(os.Args)
}
`;

try {
  await import('../src/indexer/parser/go.js');
  const { getParser } = await import('../src/indexer/parser/registry.js');

  const parser = getParser('main.go');
  if (!parser) throw new Error('No parser registered for .go');

  const result = parser.parse('/repo/main.go', GO_FIXTURE, '/repo');

  const ifaces  = result.entities.filter(e => e.kind === 'interface');
  const classes = result.entities.filter(e => e.kind === 'class');
  const methods = result.entities.filter(e => e.kind === 'method');
  const fns     = result.entities.filter(e => e.kind === 'function');
  const imports = result.relations.filter(r => r.kind === 'IMPORTS');

  ok(`Entities (${result.entities.length}):`);
  for (const e of result.entities) {
    dim(`${e.kind.padEnd(10)} ${e.name}${e.isExported ? ' [exported]' : ''}`);
  }

  if (ifaces.length !== 1)      fail(`Expected 1 interface (Animal), got ${ifaces.length}`);
  else                          ok('Interface: Animal ✓');

  if (classes.length !== 1)     fail(`Expected 1 struct (Dog), got ${classes.length}`);
  else                          ok('Struct: Dog ✓');

  if (methods.length !== 2)     fail(`Expected 2 methods (Speak, Move), got ${methods.length}`);
  else                          ok('Methods: Speak, Move ✓');

  if (fns.length < 2)           fail(`Expected at least 2 functions (NewDog, main), got ${fns.length}`);
  else                          ok('Functions: NewDog, main ✓');

  const newDog = fns.find(f => f.name === 'NewDog');
  if (!newDog?.isExported)      fail('Expected NewDog to be exported');
  else                          ok('NewDog isExported ✓');

  const mainFn = fns.find(f => f.name === 'main');
  if (mainFn?.isExported)       fail('Expected main NOT exported');
  else                          ok('main not exported ✓');

  if (imports.length !== 2)     fail(`Expected 2 IMPORTS (fmt, os), got ${imports.length}`);
  else                          ok('Imports: fmt, os ✓');
} catch (err) {
  fail(`Go parser error: ${err}`);
}

// ---------------------------------------------------------------------------
// Layer 7: Search layer (resolveClosure + searchEntities)
// ---------------------------------------------------------------------------
section('Layer 7: Search layer');

try {
  const { db, tmpDir } = await makeTempDb();

  const { upsertEntities }  = await import('../src/db/entities.js');
  const { upsertRelations } = await import('../src/db/relations.js');
  const { addRepo }         = await import('../src/db/repos.js');
  const { resolveClosure, searchEntities } = await import('../src/db/search.js');
  const { getParser }       = await import('../src/indexer/parser/registry.js');
  const { resolveRelations } = await import('../src/indexer/resolver.js');

  // Register a repo and index the manifest file
  await addRepo(db, {
    path:    REPO,
    name:    'insrc',
    addedAt: new Date().toISOString(),
    status:  'ready',
  });

  const testFile = resolve(REPO, 'src/indexer/manifest.ts');
  const source   = readFileSync(testFile, 'utf8');
  const parser   = getParser(testFile)!;
  const result   = parser.parse(testFile, source, REPO);
  const resolved = resolveRelations(result.relations, testFile, REPO);
  await upsertEntities(db, result.entities);
  await upsertRelations(db, resolved);

  // resolveClosure — should return at least the root repo
  const closure = await resolveClosure(db, REPO);
  if (!closure.includes(REPO)) fail(`Closure missing root repo; got: ${JSON.stringify(closure)}`);
  else                         ok(`resolveClosure: ${closure.length} repo(s) ✓`);

  // searchEntities with zero vector — no embeddings indexed so result will be empty
  // but the call should succeed without throwing
  const zeroVec = new Array<number>(1024).fill(0);
  const hits    = await searchEntities(db, zeroVec, closure, 5);
  ok(`searchEntities (zero vec): returned ${hits.length} hits without error ✓`);

  rmSync(tmpDir, { recursive: true, force: true });
  ok('Temp DB cleaned up');
} catch (err) {
  fail(`Search layer error: ${err}`);
}

console.log('\nDone.\n');
