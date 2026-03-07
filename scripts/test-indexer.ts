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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

try {
  // Use a temp directory so the test is self-contained and doesn't pollute ~/.insrc
  const tmpDir   = mkdtempSync(join(tmpdir(), 'insrc-test-'));
  const tmpGraph = join(tmpDir, 'graph');   // Kuzu creates this path itself — do NOT pre-create
  const tmpLance = join(tmpDir, 'lance');

  const { mkdirSync } = await import('node:fs');
  mkdirSync(tmpLance, { recursive: true }); // LanceDB needs the dir to exist

  const kuzu    = (await import('kuzu')).default;
  const lancedb = await import('@lancedb/lancedb');

  const kuzuDb = new kuzu.Database(tmpGraph);
  const graph  = new kuzu.Connection(kuzuDb);
  const lance  = await lancedb.connect(tmpLance);

  const db = { graph, lance };

  const { KUZU_STATEMENTS } = await import('../src/db/schema.js');
  for (const stmt of KUZU_STATEMENTS) {
    await db.graph.query(stmt);
  }
  ok('Kuzu + LanceDB initialised');

  const { upsertEntities }   = await import('../src/db/entities.js');
  const { upsertRelations }  = await import('../src/db/relations.js');
  const { getParser }        = await import('../src/indexer/parser/registry.js');
  const { resolveRelations } = await import('../src/indexer/resolver.js');

  // Index a single file
  const testFile = resolve(REPO, 'src/indexer/manifest.ts');
  const source   = readFileSync(testFile, 'utf8');
  const parser   = getParser(testFile)!;
  const result   = parser.parse(testFile, source, REPO);
  const resolved = resolveRelations(result.relations, testFile, REPO);

  await upsertEntities(db, result.entities);
  await upsertRelations(db, resolved);
  ok(`Upserted ${result.entities.length} entities, ${resolved.length} relations`);

  // Query back from LanceDB
  const names = await lance.tableNames();
  if (names.includes('entities')) {
    const tbl  = await lance.openTable('entities');
    const rows = await tbl.query().select(['kind', 'name']).toArray();
    ok(`Rows in LanceDB: ${rows.length}`);
    for (const row of rows) {
      dim(`${String(row['kind'] ?? '?').padEnd(14)} ${String(row['name'] ?? '?')}`);
    }
  }

  // Query back from Kuzu
  const kuzuResult = await db.graph.query('MATCH (e:Entity) RETURN e.id AS id LIMIT 5');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kuzuQr     = Array.isArray(kuzuResult) ? kuzuResult[0]! : kuzuResult;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kuzuRows   = await (kuzuQr as any).getAll();
  ok(`Entity stubs in Kuzu: ${kuzuRows.length} (showing up to 5)`);

  // Cleanup temp dir
  rmSync(tmpDir, { recursive: true, force: true });
  ok('Temp DB cleaned up');
} catch (err: unknown) {
  fail(`DB error: ${err}`);
}

console.log('\nDone.\n');
