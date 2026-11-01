/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One folder per Epic however many days its records are written over (s1/t8): on the
 * epic route (a DEF head) and the standalone route (a stamped LLD head), for HLD, LLD,
 * PLAN, BUILD, TESTS and CR, and in the delivery read model's grouping.
 *
 * Run: npx tsx --test src/workflow/__tests__/anchor-folders.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { MissingAnchorError } from '../artifact-ids.js';
import {
	codeReviewArtifactPaths, hldArtifactPaths, lldArtifactPaths, planArtifactPaths,
	readEpicDefinitionCore, resolveEpicAnchor, workItemAnchorCreatedAt,
} from '../storage.js';
import { persistBuildRecord, type BuildRecord } from '../runners/build/standalone-record.js';
import { persistTestRecordTask } from '../runners/build/test-record.js';
import { buildWorkItemGraph } from '../delivery/graph.js';
import { loadArtifactRecordSet } from '../delivery/load.js';
import { lldRecord, recordSet } from '../delivery/__tests__/fixtures.js';

const HASH = 'c0ffee00d15ea5e5';
const D0 = '2026-10-01T10:00:00.000Z';
const D1 = '2026-10-02T10:00:00.000Z';
const D2 = '2026-10-03T10:00:00.000Z';
const D3 = '2026-10-04T10:00:00.000Z';
const D4 = '2026-10-05T10:00:00.000Z';
const D5 = '2026-10-06T10:00:00.000Z';
const D6 = '2026-10-07T10:00:00.000Z';
const SLUG = 'tag-filtering';

function tempRepo(): { repo: string; seed: (id: string, meta: Record<string, unknown>) => void; done: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-anchor-folders-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	return {
		repo,
		seed: (id, meta) => writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify({ meta, body: {} })),
		done: () => rmSync(repo, { recursive: true, force: true }),
	};
}

const task = (at: string) => ({ taskId: 't1', ranAt: at, testsPassed: true, tests: [], files: [] });
const buildRec = (createdAt: string, standalone: boolean): BuildRecord => ({
	meta: { workflow: 'build', epicHash: HASH, storyId: 's1', createdAt, updatedAt: createdAt, ...(standalone ? { standalone: true } : {}) },
	body: { tasks: [{ id: 't1', passed: true }] },
} as unknown as BuildRecord);

/** What a design finalizer does: stamp the Epic's anchor on the record, write its json, and render its md in the
 *  folder the stamp names. Returns the md path. */
function writeDesign(r: ReturnType<typeof tempRepo>, kind: 'HLD' | 'LLD' | 'PLAN', createdAt: string, standalone: boolean, lldIsHead = false): string {
	const stamp = resolveEpicAnchor(r.repo, HASH)!;
	const meta = { epicHash: HASH, ...(kind === 'HLD' ? {} : { storyId: 's1' }), createdAt, epicCreatedAt: stamp, epicSlug: SLUG, ...(standalone ? { standalone: true } : {}) };
	const id = kind === 'HLD' ? `HLD-${HASH}` : `${kind}-${HASH}-s1`;
	// the standalone route's head is the LLD already on disk: do not replace its stamp-bearing record
	if (!(lldIsHead && kind === 'LLD')) r.seed(id, meta);
	const anchor = workItemAnchorCreatedAt(meta);
	const wk = standalone ? 'standalone' : 'epic';
	const md = kind === 'HLD' ? hldArtifactPaths(r.repo, HASH, anchor, wk, SLUG).md
		: kind === 'LLD' ? lldArtifactPaths(r.repo, HASH, 's1', anchor, wk, SLUG).md
		: planArtifactPaths(r.repo, HASH, 's1', anchor, wk, SLUG).md;
	mkdirSync(dirname(md), { recursive: true });
	writeFileSync(md, `# ${kind}\n`);
	return md;
}
