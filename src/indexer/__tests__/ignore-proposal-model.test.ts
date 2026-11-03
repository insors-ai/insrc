/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's cheap-tier model for proposeIgnoreFile (Epic c2ba6fa6 s6/ac6):
 * resolved on each call, and a resolution failure falls back like a model
 * failure (ac7).
 *
 * Run: npx tsx --test src/indexer/__tests__/ignore-proposal-model.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { cheapTierIgnoreModel } from '../ignore-proposal-model.js';
import { proposeIgnoreFile, type CheapTierModel } from '../file-filter.js';

function stub(text: string, calls: string[][]): CheapTierModel {
	return { complete: async messages => { calls.push(messages.map(m => m.content)); return { text, stopReason: 'end_turn' } as never; } };
}

test('ac6: a repo added with no root ignore file gets the cheap-tier model\'s proposal, resolved at call time', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-ignore-model-'));
	try {
		let builds = 0;
		const calls: string[][] = [];
		const model = cheapTierIgnoreModel(() => { builds++; return stub('node_modules/\nout/\n', calls); });
		assert.equal(builds, 0, 'nothing is resolved before the first call');

		const proposal = await proposeIgnoreFile(dir, model);

		assert.deepEqual(proposal, { written: true, source: 'model' });
		assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'node_modules/\nout/\n');
		assert.equal(builds, 1);
		assert.equal(calls.length, 1);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('ac7: a cheap tier that cannot be resolved still leaves a fallback root ignore file', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-ignore-model-'));
	try {
		const model = cheapTierIgnoreModel(() => { throw new Error('cheap tier model not supported'); });

		const proposal = await proposeIgnoreFile(dir, model);

		assert.equal(proposal.written, true);
		assert.equal(proposal.source, 'fallback');
		assert.ok(readFileSync(join(dir, '.gitignore'), 'utf8').length > 0);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
