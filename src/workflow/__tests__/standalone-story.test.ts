/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A fresh standalone workflow mints the lowercase story (s1/t3).
 *
 * Run: npx tsx --test src/workflow/__tests__/standalone-story.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ArtifactIds } from '../artifact-ids.js';
import { lldArtifactId, buildArtifactId } from '../storage.js';
import { standaloneStoryContext } from '../runners/design-story/standalone.js';
import { augmentStandaloneParams } from '../../daemon/steps/workflow-step/phases/start.js';
import { handleBuildStep } from '../../daemon/steps/build-step/handler.js';

test('a new standalone workflow with no storyId produces s1 and passes the strict id check', async () => {
	// the start phase fills the story and the hash for a standalone run
	const params: Record<string, unknown> = { standalone: true };
	augmentStandaloneParams(params, 'wf-run-1');
	assert.equal(params['storyId'], 's1');
	const hash = params['epicHash'] as string;

	// the design.story runner takes the same default
	assert.equal(standaloneStoryContext({ standalone: true }, 'a focus').story.id, 's1');

	// and the ids built from them pass the strict check
	const lld = lldArtifactId(hash, params['storyId'] as string);
	assert.equal(ArtifactIds.parse(lld)?.story, 's1');

	// the build step defaults the same way: a Trivial build with no storyId writes BUILD-<hash>-s1
	const dir = mkdtempSync(join(tmpdir(), 'insrc-standalone-s1-'));
	try {
		const out = await handleBuildStep({
			phase: 'implement',
			target: 'standalone',
			repo: dir,
			standalone: { standalone: true, sizeClass: 'trivial', focus: 'Fix a typo in the status log line' },
		});
		assert.ok(out);
		const files = readdirSync(join(dir, '.insrc', 'artifacts'));
		const build = files.find(f => f.startsWith('BUILD-'));
		assert.ok(build !== undefined, `a BUILD record is written (${files.join(', ')})`);
		const key = ArtifactIds.parse(build.replace(/\.json$/, ''));
		assert.equal(key?.story, 's1');
		assert.equal(build.replace(/\.json$/, ''), buildArtifactId(key!.epicHash, 's1'));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
