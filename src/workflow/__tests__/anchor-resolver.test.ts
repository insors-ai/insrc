/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Epic anchor is resolved in one place (s1/t5): resolveEpicAnchor by head
 * kind, stampRootAnchor, and workItemAnchorCreatedAt.
 *
 * Run: npx tsx --test src/workflow/__tests__/anchor-resolver.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InvalidArtifactKeyError, MissingAnchorError } from '../artifact-ids.js';
import { readEpicDefinitionCore, resolveEpicAnchor, stampRootAnchor, workItemAnchorCreatedAt } from '../storage.js';

const HASH = 'a1b2c3d4e5f60718';
const OWN = '2026-10-12T09:00:00.000Z';
const STAMP = '2026-10-01T08:00:00.000Z';

function repoWith(files: Readonly<Record<string, Record<string, unknown>>>): { repo: string; done: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-anchor-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	for (const [id, meta] of Object.entries(files)) {
		writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify({ meta, body: {} }));
	}
	return { repo, done: () => rmSync(repo, { recursive: true, force: true }) };
}

test('resolveEpicAnchor by head kind, an unstamped standalone LLD head yields undefined, and workItemAnchorCreatedAt raises MissingAnchorError without a stamp', () => {
	// a DEF head contributes its own createdAt
	let r = repoWith({ [`DEF-${HASH}`]: { epicHash: HASH, createdAt: OWN, epicSlug: 'a-def' } });
	try { assert.equal(resolveEpicAnchor(r.repo, HASH), OWN); } finally { r.done(); }

	// an ISSUE head contributes its own createdAt
	r = repoWith({ [`ISSUE-${HASH}`]: { issueHash: HASH, createdAt: OWN, epicSlug: 'an-issue', standalone: true } });
	try { assert.equal(resolveEpicAnchor(r.repo, HASH), OWN); } finally { r.done(); }

	// a standalone LLD head contributes its stamp
	r = repoWith({ [`LLD-${HASH}-s1`]: { epicHash: HASH, storyId: 's1', createdAt: OWN, epicCreatedAt: STAMP, epicSlug: 'a-lld', standalone: true } });
	try {
		assert.equal(resolveEpicAnchor(r.repo, HASH), STAMP);
		assert.equal(readEpicDefinitionCore(r.repo, HASH).createdAt, STAMP);
	} finally { r.done(); }

	// an unstamped standalone LLD head contributes nothing: its own createdAt is not the Epic's
	r = repoWith({ [`LLD-${HASH}-s1`]: { epicHash: HASH, storyId: 's1', createdAt: OWN, epicSlug: 'a-lld', standalone: true } });
	try {
		assert.equal(resolveEpicAnchor(r.repo, HASH), undefined);
		const core = readEpicDefinitionCore(r.repo, HASH);
		assert.equal(core.createdAt, undefined, 'the LLD\'s own clock is not returned as the anchor');
		assert.equal(core.epicSlug, 'a-lld', 'slug and placement still come from the LLD head');
		assert.equal(core.standalone, true);
		assert.equal(core.headKind, 'LLD');
	} finally { r.done(); }

	// nothing at all
	r = repoWith({});
	try { assert.equal(resolveEpicAnchor(r.repo, HASH), undefined); } finally { r.done(); }

	// stampRootAnchor: the existing anchor wins, else the root's own time
	r = repoWith({ [`ISSUE-${HASH}`]: { issueHash: HASH, createdAt: STAMP, epicSlug: 'x', standalone: true } });
	try { assert.equal(stampRootAnchor(r.repo, HASH, OWN), STAMP); } finally { r.done(); }
	r = repoWith({});
	try { assert.equal(stampRootAnchor(r.repo, HASH, OWN), OWN); } finally { r.done(); }

	// workItemAnchorCreatedAt returns the stamp and never falls back to createdAt
	assert.equal(workItemAnchorCreatedAt({ epicCreatedAt: STAMP }), STAMP);
	for (const meta of [{}, { epicCreatedAt: '' }, { epicCreatedAt: undefined }]) {
		assert.throws(
			() => workItemAnchorCreatedAt(meta),
			(err: Error) => err instanceof MissingAnchorError && err instanceof InvalidArtifactKeyError,
		);
	}
	// a record that carries a createdAt but no stamp is still refused
	assert.throws(() => workItemAnchorCreatedAt({ createdAt: OWN } as { epicCreatedAt?: string }), MissingAnchorError);
});
