/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s3/t1: buildArgv and readExitEvidence are now
 * exported from vibe-adapter.ts (previously module-private), mirroring the existing export
 * precedent other adapter primitives already use, so the plugin's direct-spawn vibe branch
 * (s3/t3-t7) can reuse them directly instead of reimplementing them.
 * Run: npx tsx --test src/shared/__tests__/vibe-adapter-exports.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildArgv, readExitEvidence } from '../vibe-adapter.js';

test('buildArgv and readExitEvidence import directly from vibe-adapter.ts and are callable', async () => {
	const argv = buildArgv({ prompt: 'x', outputMode: 'text', session: { kind: 'new' }, mode: 'default' }, '/tmp/unused-output-dir');
	assert.ok(Array.isArray(argv));
	assert.deepEqual(argv.slice(0, 4), ['-p', '--output', 'text', '--output-dir']);

	const evidence = await readExitEvidence('/definitely/does/not/exist/export.json', async () => { throw new Error('ENOENT'); });
	assert.equal(evidence, undefined, 'a missing export.json yields undefined evidence, never a fabricated value');
});
