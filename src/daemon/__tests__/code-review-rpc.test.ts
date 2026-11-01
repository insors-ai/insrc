/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's code-review request (`codeReview.run`): it is the daemon's
 * review, so it stamps `daemon` and refuses code the daemon wrote.
 * (LLD-1716f77ba9ba017b-S001, tests T4 and T12; plan tasks t3 and t4.)
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { after as afterAll } from 'node:test';
import { mkdtempSync as mkdtempSyncRaw, rmSync as rmSyncForStore } from 'node:fs';
import { tmpdir as tmpdirForStore } from 'node:os';
import { join as joinForStore } from 'node:path';
import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';

// This file reaches the graph store through code that takes no path. Give it a
// temporary one: the store at the default path belongs to the daemon alone
// (Epic c2ba6fa6, Story s4).
const STORE_DIR = mkdtempSyncRaw(joinForStore(tmpdirForStore(), 'insrc-test-store-'));
setGraphStorePath(joinForStore(STORE_DIR, 'graph.lmdb'));
afterAll(async () => {
	await closeGraphStore();
	rmSyncForStore(STORE_DIR, { recursive: true, force: true });
});


import type { IpcStreamMessage, LLMProvider } from '../../shared/types.js';
import type { DimensionResult } from '../../workflow/code-review/types.js';
import { artifactJsonPath, buildArtifactId } from '../../workflow/storage.js';
import { buildAuthorParty, codeReviewRunStart } from '../code-review-rpc.js';
import type { CodeReviewRunDeps } from '../code-review-rpc.js';
import { noopRoundWriter } from '../../workflow/__tests__/helpers/round-writer.js';
import '../../workflow/__tests__/helpers/converted-repos.js';

const EPIC = 'abcd1234ef567890';
const STORY = 's1';

function repoWith(buildMeta?: Record<string, unknown>): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-cr-rpc-'));
	// the work item's head carries the Epic anchor the review's folder is keyed on
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(join(repo, '.insrc', 'artifacts', `ISSUE-${EPIC}.json`), JSON.stringify({ meta: { issueHash: EPIC, createdAt: '2026-10-01T00:00:00.000Z', epicSlug: 'a-fix', standalone: true }, body: {} }));
	if (buildMeta !== undefined) {
		const json = artifactJsonPath(repo, buildArtifactId(EPIC, STORY));
		mkdirSync(dirname(json), { recursive: true });
		writeFileSync(json, JSON.stringify({ meta: { workflow: 'build', epicHash: EPIC, storyId: STORY, createdAt: '2026-10-05T00:00:00.000Z', ...buildMeta }, body: {} }));
	}
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

async function run(repo: string, deps: CodeReviewRunDeps): Promise<IpcStreamMessage[]> {
	const frames: IpcStreamMessage[] = [];
	await codeReviewRunStart({ repo, epicHash: EPIC, storyId: STORY }, (m) => frames.push(m), new AbortController().signal, deps);
	return frames;
}

test('the author is read from the BUILD record', () => {
	const a = repoWith({ authoredBy: 'daemon' });
	const b = repoWith({ authoredBy: 'controller' });
	try {
		assert.equal(buildAuthorParty(a.repo, EPIC, STORY), 'daemon');
		assert.equal(buildAuthorParty(b.repo, EPIC, STORY), 'controller');
		assert.equal(buildAuthorParty(a.repo, EPIC, 'S999'), 'unknown');
	} finally { a.cleanup(); b.cleanup(); }
});

// --- the grounding mode (LLD-1716f77ba9ba017b-S001, test T17; plan task t6) -------

const DIFF_GROUNDING = { symbols: [], conventions: [], contractRefs: [] } as never;

async function runMode(repo: string, deps: CodeReviewRunDeps, groundingMode?: unknown): Promise<IpcStreamMessage[]> {
	const frames: IpcStreamMessage[] = [];
	await codeReviewRunStart({ repo, epicHash: EPIC, storyId: STORY, ...(groundingMode !== undefined ? { groundingMode } : {}) }, (m) => frames.push(m), new AbortController().signal, deps);
	return frames;
}

interface Record_ { meta: { reviewedBy?: string }; body: { groundingMode: string; verdict: string; subject: { changedFiles: string[] } } }
const recordOf = (writes: { path: string; content: string }[]): Record_ => JSON.parse(writes.find(w => w.path.endsWith('.json'))!.content) as Record_;
