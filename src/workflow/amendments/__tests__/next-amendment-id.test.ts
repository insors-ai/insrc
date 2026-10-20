/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * nextAmendmentId builds its text through ArtifactIds.make (s1/t2).
 *
 * Run: npx tsx --test src/workflow/amendments/__tests__/next-amendment-id.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InvalidArtifactKeyError } from '../../artifact-ids.js';
import { amendmentArtifactPath, writeAtomic } from '../../storage.js';
import { nextAmendmentId } from '../store.js';

const HASH = '2f27754d4ad00b8e';

test('nextAmendmentId returns the same AMD text for existing amendment files and the next counter', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-next-amd-'));
	try {
		assert.equal(nextAmendmentId(repo, HASH), `AMD-${HASH}-1`);
		for (const n of [1, 2, 9]) writeAtomic(amendmentArtifactPath(repo, `AMD-${HASH}-${n}`), '{}');
		// another Epic's file does not count, and a non-numeric tail is ignored
		writeAtomic(amendmentArtifactPath(repo, 'AMD-aaaaaaaaaaaaaaaa-40'), '{}');
		writeAtomic(amendmentArtifactPath(repo, `AMD-${HASH}-x`), '{}');
		assert.equal(nextAmendmentId(repo, HASH), `AMD-${HASH}-10`);
		assert.throws(() => nextAmendmentId(repo, 'NOT-HEX'), InvalidArtifactKeyError);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
