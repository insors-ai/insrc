/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Setup recommendation (Epic ce99b72065d03b1b, Story s5 · t5): the local
 * model is the one the caller passes from the daemon's definitions, with its
 * installed state and memory estimate; the recommender names no model itself.
 *
 * Run: npx tsx --test src/shared/__tests__/model-recommender.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getSystemInfo, type SystemInfo } from '../system-info.js';
import { recommendModels } from '../model-recommender.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const REAL = getSystemInfo();

/** This machine's system info with the GPU and Ollama's installed models replaced. */
function info(vramMb: number, installed: string[], ramMb = 65536): SystemInfo {
	return {
		...REAL,
		ram: { ...REAL.ram, totalMb: ramMb },
		gpu: vramMb > 0 ? { ...(REAL.gpu ?? {}), name: 'Test GPU', vramMb, unifiedMemory: false } : null,
		ollama: { ...REAL.ollama, models: installed.map(name => ({ name })) },
	} as unknown as SystemInfo;
}

test('model-recommender.test.ts: recommendModels uses the passed local model, installed flag and memoryMb, falling back to the generic estimate', () => {
	// The passed model, its installed flag (false → pull) and its memory estimate.
	const a = recommendModels(info(24000, []), { model: 'fake-local:1', installed: false, memoryMb: 4000 });
	assert.equal(a.coder.model, 'fake-local:1');
	assert.equal(a.coder.pull, true);
	assert.equal(a.coder.vramNeeded, 4000);
	assert.deepEqual([a.coder.params, a.coder.quantization], ['', '']);
	assert.ok(a.notes.some(n => n.includes('fake-local:1 (~4000MB, fits VRAM)')), a.notes.join('\n'));

	// installed true → no pull, whatever Ollama's own list says.
	assert.equal(recommendModels(info(24000, []), { model: 'fake-local:1', installed: true }).coder.pull, false);
	// installed absent (Ollama did not answer the daemon) → the local install list decides.
	assert.equal(recommendModels(info(24000, ['fake-local:1']), { model: 'fake-local:1' }).coder.pull, false);
	assert.equal(recommendModels(info(24000, []), { model: 'fake-local:1' }).coder.pull, true);

	// No memoryMb → the generic estimate, said so in the note.
	const g = recommendModels(info(24000, []), { model: 'fake-local:1' });
	assert.equal(g.coder.vramNeeded, 14000);
	assert.ok(g.notes.some(n => n.includes('generic estimate')), g.notes.join('\n'));

	// The memory figure sizes the context: a smaller model leaves more VRAM for a longer context.
	// (8 GB RAM, so little can spill out of VRAM.)
	const small = recommendModels(info(16000, [], 8192), { model: 'm', memoryMb: 2000 });
	const big = recommendModels(info(16000, [], 8192), { model: 'm', memoryMb: 13500 });
	assert.ok(small.context.tokens > big.context.tokens, `${small.context.tokens} > ${big.context.tokens}`);

	// The module names no model of the shipped definitions.
	const src = readFileSync(join(ROOT, 'src', 'shared', 'model-recommender.ts'), 'utf8');
	const defs = JSON.parse(readFileSync(join(ROOT, 'src', 'assets', 'models', 'cloud-model-catalog.json'), 'utf8')) as { families: Array<{ models: Array<{ id: string; aliases?: string[] }> }> };
	for (const f of defs.families) for (const m of f.models) for (const name of [m.id, ...(m.aliases ?? [])]) {
		assert.ok(!src.includes(`'${name}'`) && !src.includes(`"${name}"`), `model-recommender.ts names ${name}`);
	}
});
