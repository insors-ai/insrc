#!/usr/bin/env tsx
/**
 * Standalone index + search demo.
 *
 * Indexes the insrc repo itself into ~/.insrc-demo/ (persisted across runs,
 * incremental — already-indexed files are skipped via content hash).
 * Then runs a suite of graph queries and (if Ollama is up) vector searches.
 *
 * Usage:
 *   npx tsx scripts/index-and-search.ts
 *   npx tsx scripts/index-and-search.ts "how does the watcher debounce events"
 *
 * The optional argument becomes the semantic search query.
 */

import { mkdirSync } from 'node:fs';
import { homedir }   from 'node:os';
import { join, resolve, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REPO     = resolve(import.meta.dirname, '..');
const DEMO_DIR = join(homedir(), '.insrc-demo');
const GRAPH    = join(DEMO_DIR, 'graph');
const LANCE    = join(DEMO_DIR, 'lance');

const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELL  = '\x1b[33m';
const DIM   = '\x1b[2m';
const BOLD  = '\x1b[1m';
const RESET = '\x1b[0m';

function section(title: string) { console.log(`\n${CYAN}━━━ ${title} ━━━${RESET}`); }
function ok(msg: string)         { console.log(`${GREEN}✓${RESET} ${msg}`); }
function info(msg: string)       { console.log(`${YELL}→${RESET} ${msg}`); }
function dim(msg: string)        { console.log(`${DIM}  ${msg}${RESET}`); }
function bold(msg: string)       { console.log(`${BOLD}${msg}${RESET}`); }

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

mkdirSync(LANCE, { recursive: true });
// GRAPH must NOT be pre-created — Kuzu creates it

const kuzu    = (await import('kuzu')).default;
const lancedb = await import('@lancedb/lancedb');

const kuzuDb  = new kuzu.Database(GRAPH);
const graph   = new kuzu.Connection(kuzuDb);
const lance   = await lancedb.connect(LANCE);
const db      = { graph, lance };

const { KUZU_STATEMENTS } = await import('../src/db/schema.js');
for (const stmt of KUZU_STATEMENTS) await db.graph.query(stmt);

ok(`DB at ${DEMO_DIR}`);

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------
section('Indexing insrc repo');

// Register the repo in Kuzu so resolveClosure works
const { addRepo, listRepos } = await import('../src/db/repos.js');
const existing = await listRepos(db);
if (!existing.some(r => r.path === REPO)) {
  await addRepo(db, {
    path:    REPO,
    name:    'insrc',
    addedAt: new Date().toISOString(),
    status:  'pending',
  });
}

// Check Ollama + model availability once up front
const { isOllamaAvailable, EMBEDDING_MODEL, ensureEmbeddingModel } = await import('../src/indexer/embedder.js');
const ollamaUp = await isOllamaAvailable();
let embeddingsReady = false;

if (!ollamaUp) {
  info('Ollama not reachable — skipping embeddings');
} else {
  try {
    process.stdout.write(`  Checking ${EMBEDDING_MODEL}...`);
    await ensureEmbeddingModel(pct => {
      process.stdout.write(`\r  Pulling ${EMBEDDING_MODEL}: ${pct}%   `);
    });
    process.stdout.write('\n');
    embeddingsReady = true;
    ok(`${EMBEDDING_MODEL} ready`);
  } catch (err) {
    process.stdout.write('\n');
    info(`Model pull failed: ${err} — skipping embeddings`);
  }
}

// Use IndexerService.processJob directly (no queue/watcher needed for a one-shot run)
const { Watcher }      = await import('../src/indexer/watcher.js');
const { IndexQueue }   = await import('../src/daemon/queue.js');
const { IndexerService } = await import('../src/indexer/index.js');

const watcher = new Watcher();
const queue   = new IndexQueue();
const indexer = new IndexerService(db, queue, watcher);

const t0 = Date.now();
await indexer.processJob({ kind: 'full', repoPath: REPO });
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

ok(`Full index complete in ${elapsed}s`);

// Count what's in the DB
const tableNames = await lance.tableNames();
if (tableNames.includes('entities')) {
  const tbl   = await lance.openTable('entities');
  const count = await tbl.countRows();
  ok(`LanceDB: ${count} entities`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function kuzuCount(stmt: string): Promise<number> {
  const r  = await db.graph.query(stmt);
  const qr = Array.isArray(r) ? r[0]! : r;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (qr as any).getAll() as { n: number }[];
  return rows[0]?.n ?? 0;
}

const entityCount   = await kuzuCount('MATCH (e:Entity) RETURN count(e) AS n');
const relationCount = await kuzuCount('MATCH ()-[r]->() RETURN count(r) AS n');
ok(`Kuzu: ${entityCount} entity stubs, ${relationCount} relation edges`);

// ---------------------------------------------------------------------------
// Graph queries
// ---------------------------------------------------------------------------
section('Graph queries');

const { findDefinedIn, findCallers, findCallees, resolveClosure } = await import('../src/db/search.js');
const { makeEntityId } = await import('../src/indexer/parser/base.js');

// 1. resolveClosure
const closure = await resolveClosure(db, REPO);
bold(`Dependency closure for insrc:`);
for (const r of closure) dim(r);

// 2. Entities defined in indexer/index.ts
const indexerFile = resolve(REPO, 'src/indexer/index.ts');
const fileId      = makeEntityId(REPO, indexerFile, 'file', indexerFile);
const defined     = await findDefinedIn(db, fileId);

bold(`\nEntities defined in src/indexer/index.ts (${defined.length}):`);
for (const e of defined) {
  dim(`${e.kind.padEnd(10)} ${e.name}  [${e.file ? relative(REPO, e.file) : ''}:${e.startLine}]`);
}

// 3. Callers of IndexerService constructor method
const callerTargets = [
  { label: 'IndexerService', kind: 'class'  as const, name: 'IndexerService' },
  { label: 'embedEntities',  kind: 'function' as const, name: 'embedEntities' },
  { label: 'upsertEntities', kind: 'function' as const, name: 'upsertEntities' },
];

for (const target of callerTargets) {
  const id      = makeEntityId(REPO, '', target.kind, target.name);
  const callers = await findCallers(db, id);
  if (callers.length > 0) {
    bold(`\nCallers of ${target.name} (${callers.length}):`);
    for (const c of callers) dim(`${c.kind.padEnd(10)} ${c.name}  [${relative(REPO, c.file)}:${c.startLine}]`);
  }
  const callees = await findCallees(db, id);
  if (callees.length > 0) {
    bold(`Calls made by ${target.name} (${callees.length}):`);
    for (const c of callees) dim(`${c.kind.padEnd(10)} ${c.name}  [${c.file ? relative(REPO, c.file) : 'external'}]`);
  }
}

// ---------------------------------------------------------------------------
// Vector search (only if Ollama available)
// ---------------------------------------------------------------------------
section('Vector search');

if (!embeddingsReady) {
  info(`Skipping — run: ollama pull ${EMBEDDING_MODEL}`);
} else {
  const { embedQuery } = await import('../src/indexer/embedder.js');
  const { searchEntities } = await import('../src/db/search.js');

  // Queries to run
  const userQuery = process.argv[2] ?? 'how does file watching and debouncing work';
  const queries   = [
    userQuery,
    'parse typescript imports and class inheritance',
    'embed entities using ollama',
  ];

  for (const q of queries) {
    bold(`\nQuery: "${q}"`);
    const vec  = await embedQuery(q);
    if (vec.length === 0) { info('embedding failed'); continue; }

    const hits = await searchEntities(db, vec, closure, 5);
    if (hits.length === 0) {
      info('no hits (entities may not yet be embedded — run again after Ollama is up)');
    }
    for (const hit of hits) {
      const loc = `${relative(REPO, hit.file)}:${hit.startLine}`;
      dim(`${hit.kind.padEnd(10)} ${hit.name.padEnd(30)} ${loc}`);
    }
  }
}

console.log(`\n${GREEN}Done.${RESET}\n`);
