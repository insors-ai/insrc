/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The embedder reads its settings on first use, not at module load (Epic
 * ce99b72065d03b1b, Story s3 · t2; HLD override item 1).
 *
 * HOME points at a temp dir holding config.json. If importing embedder.ts read
 * the local settings, the cached read would pin the value on disk at import
 * time; the first getter would then return it instead of the value written
 * after the import.
 *
 * Run: npx tsx --test src/indexer/__tests__/embedder-lazy.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const home = mkdtempSync(join(tmpdir(), 'embedder-lazy-'));
process.env['HOME'] = home;
const { PATHS } = await import('../../shared/paths.js');

const writeLocal = (embeddingModel: string, embeddingDim: number): void =>
	writeFileSync(PATHS.config, JSON.stringify({ models: { local: { embeddingModel, embeddingDim } } }));

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('embedder-lazy.test.ts: importing embedder.ts calls no settings loader; the first getter does; lifecycle.ts and reembed use the getters', async () => {
	try {
		mkdirSync(dirname(PATHS.config), { recursive: true });
		writeLocal('at-import', 111);
		const embedder = await import('../embedder.js');

		// Written after the import: a lazy embedder reads THIS on its first getter call.
		writeLocal('at-first-use', 222);
		assert.equal(embedder.embeddingModel(), 'at-first-use');
		assert.equal(embedder.embeddingDim(), 222);

		// The first getter's read is cached (until main() drops the cache after the reconcile).
		writeLocal('later', 333);
		assert.equal(embedder.embeddingModel(), 'at-first-use');
		const { resetLocalProviderConfigCache } = await import('../../config/local.js');
		resetLocalProviderConfigCache();
		assert.equal(embedder.embeddingModel(), 'later');
		assert.equal(embedder.embeddingDim(), 333);
		assert.equal('EMBEDDING_MODEL' in embedder || 'EMBEDDING_DIM' in embedder, false, 'the module-load constants are gone');
	} finally {
		rmSync(home, { recursive: true, force: true });
	}

	// The callers use the getters; nothing imports the old constants.
	const lifecycle = readFileSync(join(SRC, 'daemon', 'lifecycle.ts'), 'utf8');
	assert.match(lifecycle, /embeddingDim\(\) !== ONNX_EMBEDDING_DIM/);
	const indexer = readFileSync(join(SRC, 'indexer', 'index.ts'), 'utf8');
	const reembed = indexer.slice(indexer.indexOf('private async reembed('));
	assert.match(reembed.slice(0, 2000), /updateEmbedding\(this\.db, e\.id, e\.embedding, embeddingModel\(\)\)/);
	const offenders: string[] = [];
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			const p = join(dir, name);
			if (statSync(p).isDirectory()) { walk(p); continue; }
			if (!/\.tsx?$/.test(name) || p.includes('__tests__')) continue;
			if (/\{[^}]*\b(EMBEDDING_MODEL|EMBEDDING_DIM)\b[^}]*\}\s*=?\s*(from|await import)?[^;]*embedder/.test(readFileSync(p, 'utf8'))) offenders.push(relative(SRC, p));
		}
	};
	walk(SRC);
	assert.deepEqual(offenders, []);
});
