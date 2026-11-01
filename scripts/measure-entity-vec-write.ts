/**
 * Epic c2ba6fa6, Story s2, t11 -- time the vector upsert (writeEntityEmbeddings,
 * Lance mergeInsert) against the plain add (addEntityEmbeddings) on a COPY of a
 * real entity vector table, at a refresh-sized and a backfill-sized batch, and
 * a one-row upsert (one updateEmbedding call).
 *
 * The live table belongs to the daemon: copy it first, never point this at
 * ~/.insrc/lance.
 *
 *   cp -R ~/.insrc/lance/entity_vec.lance /tmp/vecbench/lance/
 *   npx tsx scripts/measure-entity-vec-write.ts /tmp/vecbench/lance [refreshSize] [backfillSize] [reps]
 */

import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { closeLanceConn, getLanceConn, setLanceConnPath } from '../src/db/lance/conn.js';
import { addEntityEmbeddings, writeEntityEmbeddings } from '../src/db/lance/entity-vec.js';

const [dirArg, refreshArg, backfillArg, repsArg] = process.argv.slice(2);
if (dirArg === undefined) throw new Error('usage: measure-entity-vec-write.ts <copied lance dir> [refreshSize] [backfillSize] [reps]');
const dir = resolve(dirArg);
if (dir.startsWith(resolve(homedir(), '.insrc'))) throw new Error('refusing the daemon\'s own vector store: measure on a copy');
const sizes = { refresh: Number(refreshArg ?? 16), backfill: Number(backfillArg ?? 256) };
const reps = Number(repsArg ?? 5);

setLanceConnPath(dir);
const table = await (await getLanceConn()).openTable('entity_vec');   // read side only: the writes go through the store's own writers
const total = await table.countRows();
type VecRow = { id: string; embedding: ArrayLike<number>; repo: string; kind: string; artifact: boolean };
// One row per id: a mergeInsert source must not repeat an id. The table itself
// may hold an id more than once (adds on top of an existing vector); counted.
const ids = (await table.query().select(['id']).toArray() as Array<{ id: string }>).map(r => r.id);
const duplicateIds = ids.length - new Set(ids).size;
const seen = new Set<string>();
const sample: VecRow[] = [];
for (const r of await table.query().limit((sizes.refresh + sizes.backfill + 1) * reps * 3).toArray() as VecRow[]) {
	if (seen.has(r.id)) continue;
	seen.add(r.id);
	sample.push(r);
}
const dim = sample[0]?.embedding.length ?? 0;
const row = (r: (typeof sample)[number]) => ({ id: r.id, embedding: Float32Array.from(r.embedding), repo: r.repo, kind: r.kind, artifact: r.artifact });
const fresh = (r: (typeof sample)[number]) => ({ ...row(r), id: randomBytes(16).toString('hex') });

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
async function time(fn: () => Promise<void>): Promise<number> { const t = performance.now(); await fn(); return performance.now() - t; }

let cursor = 0;
const take = (n: number) => { const out = sample.slice(cursor, cursor + n); cursor += n; return out; };
const results: Record<string, number> = {};
for (const [label, n] of [['refresh', sizes.refresh], ['backfill', sizes.backfill]] as const) {
	const upsert: number[] = []; const add: number[] = [];
	for (let i = 0; i < reps; i++) {
		const existing = take(n);   // ids already in the table: the upsert replaces them
		upsert.push(await time(() => writeEntityEmbeddings(existing.map(row))));
		add.push(await time(() => addEntityEmbeddings(existing.map(fresh))));
	}
	results[`${label} (${n}) upsert ms`] = median(upsert);
	results[`${label} (${n}) add ms`] = median(add);
}
const single: number[] = [];
for (let i = 0; i < reps; i++) { const [r] = take(1); single.push(await time(() => writeEntityEmbeddings([row(r!)]))); }
results['one-row upsert ms'] = median(single);

process.stdout.write(`${JSON.stringify({ table: dir, rows: total, distinctIds: ids.length - duplicateIds, duplicateIds, dim, reps, medians: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, Math.round(v)])) }, null, 1)}\n`);
await closeLanceConn();
