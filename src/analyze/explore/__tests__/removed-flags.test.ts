/**
 * The flags the completeness record replaced are gone from what a model is
 * told, and a lookup output stored before the change is not served
 * (LLD-b9d5c5c40df5a574-s1, task t5).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	EXPLORATION_CACHE_VERSION,
	getCachedExploration,
	hashExplorationParams,
	putCachedExploration,
} from '../../../db/exploration-cache.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { buildCompleteness } from '../../completeness.js';
import type { Exploration, ExplorationOutput } from '../types.js';

const PROMPTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'prompts', 'analyze');

/**
 * A removed field NAMED AS A FIELD: after a dot, or followed by what follows
 * a field in a shape or a condition (`truncated,` `truncated }` `truncated:`
 * `truncated ===`). The plain word in prose ("the list is truncated to a
 * handful") and the heading text `_… truncated_` are not fields.
 */
const TRUNCATED_FIELD = /(\.truncated\b|\btruncated\s*[:,}=])/;

test('no prompt under src/prompts/analyze names a removed field, and each names `completeness`', () => {
	const files = readdirSync(PROMPTS).filter(f => f.endsWith('.md'));
	assert.ok(files.length > 10, 'the prompt directory was found');

	const offenders: string[] = [];
	for (const f of files) {
		const lines = readFileSync(join(PROMPTS, f), 'utf8').split('\n');
		lines.forEach((line, i) => {
			if (/\b(totalCallers|exhaustedNote)\b/.test(line) || TRUNCATED_FIELD.test(line)) {
				offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
			}
		});
	}
	assert.deepEqual(offenders, []);

	// The check can see a field when one is there, and does not mistake prose for one.
	assert.ok(TRUNCATED_FIELD.test('`{ pattern, hits, truncated, backend }`'));
	assert.ok(TRUNCATED_FIELD.test('When `db.tables.list.truncated === true`'));
	assert.ok(TRUNCATED_FIELD.test('{ charts, truncated }'));
	assert.equal(TRUNCATED_FIELD.test('The list is truncated to a handful of candidates.'), false);
	assert.equal(TRUNCATED_FIELD.test('append `_… truncated_` to the group heading'), false);

	// Each prompt that listed one of the fields now lists the record in its place,
	// on the line of the output it describes.
	const expectOn: Record<string, readonly string[]> = {
		'synthesize.data.system.md':       ['db.tables.list'],
		'synthesize.adherence.system.md':  ['usage.example', 'search.text', 'config.trace'],
		'synthesize.capability.system.md': ['usage.example'],
		'synthesize.code.system.md':       ['freeform.probe'],
	};
	for (const [f, outputs] of Object.entries(expectOn)) {
		const lines = readFileSync(join(PROMPTS, f), 'utf8').split('\n');
		for (const output of outputs) {
			const line = lines.find(l => l.includes(`**\`${output}\`**`) && l.includes('completeness'));
			assert.ok(line, `${f}: the line describing ${output} names completeness`);
		}
	}
	// synthesize.code lists two of its shapes in a fenced block under the output's name.
	const code = readFileSync(join(PROMPTS, 'synthesize.code.system.md'), 'utf8');
	assert.match(code, /\*\*`usage\.example`\*\*[^\n]*\n\s*```\n[^\n]*\bcompleteness\b/);
	assert.match(code, /\{ key, hits: \[\{ file, line, text, role \}\], completeness, backend, root \}/);
});

test('a lookup output cached before the change is not returned: the cache key includes its version', async () => {
	const exp: Exploration = { id: 'e1', type: 'search.text', purpose: 't', params: { pattern: 'needle' } };

	// The version is part of what is hashed into the key.
	assert.equal(EXPLORATION_CACHE_VERSION, 2);
	const { createHash } = await import('node:crypto');
	const keyOf = (canonical: unknown): string => createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex').slice(0, 16);
	const v1Key = keyOf({ type: exp.type, params: exp.params });
	assert.equal(hashExplorationParams(exp), keyOf({ v: 2, type: exp.type, params: exp.params }));
	assert.notEqual(hashExplorationParams(exp), v1Key, 'the key written before the change is a different key');

	// And so a row stored under the old key is not found by a read made now.
	await closeGraphStore();
	const dir = mkdtempSync(join(tmpdir(), 'insrc-cache-version-'));
	try {
		setGraphStorePath(join(dir, 'graph.lmdb'));
		const REPO = '/repo/cache';
		await addRepo(null, { path: REPO, name: '', addedAt: '2026-10-08T10:00:00.000Z', status: 'pending' });

		// Write a version-1 row exactly as the old code did: same store, same key layout, old hash.
		const { getGraphStore, withWriteTxn } = await import('../../../db/graph/store.js');
		const { lookupRepoIdInTxn } = await import('../../../db/repos.js');
		const { Packr } = await import('msgpackr');
		const oldOutput = { type: 'search.text', pattern: 'needle', hits: [], truncated: false, backend: 'node', root: REPO };
		await withWriteTxn(s => {
			const key = Buffer.alloc(20);
			key.writeUInt32BE(lookupRepoIdInTxn(s, REPO)!, 0);
			key.writeBigUInt64BE(7n, 4);
			Buffer.from(v1Key, 'hex').copy(key, 12, 0, 8);
			s.explorationCache.put(key, new Packr({ useRecords: false }).pack({ exploration: exp, output: oldOutput, cachedAt: 1 }));
		});
		const store = await getGraphStore();
		assert.equal([...store.explorationCache.getKeys()].length, 1, 'the old row is in the store');

		assert.equal(await getCachedExploration(REPO, 7n, exp), null, 'the old row is not returned');

		// A row written now is found, and carries its record.
		const fresh = {
			type: 'search.text', pattern: 'needle', hits: [], backend: 'node', root: REPO,
			completeness: buildCompleteness({ returned: 0, basis: 'text' }),
		} as ExplorationOutput;
		await putCachedExploration(REPO, 7n, exp, fresh);
		assert.deepEqual(await getCachedExploration(REPO, 7n, exp), fresh);
		assert.equal([...store.explorationCache.getKeys()].length, 2, 'stored beside the old row, under its own key');
	} finally {
		await closeGraphStore();
		rmSync(dir, { recursive: true, force: true });
	}
});
