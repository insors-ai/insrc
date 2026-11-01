/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-1102dc71 S001/t6 — the daemon-reviewed path carries the step's fallback
 * reason to the record the daemon writes: through codeReviewRequestParams, into
 * codeReview.run's params, onto body.fallbackReason.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';

// This file reaches the graph store through code that takes no path; give it a
// temporary one (the default path belongs to the daemon alone).
const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
after(async () => { await closeGraphStore(); rmSync(STORE_DIR, { recursive: true, force: true }); });

import type { IpcStreamMessage, LLMProvider } from '../../shared/types.js';
import { codeReviewRequestParams, type CodeReviewStreamParams } from '../../shared/review-stream.js';
import type { CodeReviewFallbackReason, CodeReviewGrounding, CodeReviewSubject, DimensionResult } from '../../workflow/code-review/types.js';
import { artifactJsonPath, buildArtifactId } from '../../workflow/storage.js';
import { codeReviewRunStart, type CodeReviewRunDeps } from '../code-review-rpc.js';
import { noopRoundWriter } from '../../workflow/__tests__/helpers/round-writer.js';
import '../../workflow/__tests__/helpers/converted-repos.js';

const EPIC = 'abcd1234ef567890';
const STORY = 's1';
const CREATED = '2026-07-18T00:00:00.000Z';
const TIMED_OUT: CodeReviewFallbackReason = { kind: 'freshness-timeout', waitedMs: 3000, inFlight: false, pendingCodeIndexJobs: 4, staleFiles: ['src/a.ts'] };

/** A repo whose BUILD record names the controller as author, so the daemon reviews. */
function controllerRepo(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-cr-fallback-'));
	const json = artifactJsonPath(repo, buildArtifactId(EPIC, STORY));
	mkdirSync(dirname(json), { recursive: true });
	writeFileSync(json, JSON.stringify({ meta: { workflow: 'build', epicHash: EPIC, storyId: STORY, createdAt: CREATED, authoredBy: 'controller' }, body: {} }));
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const subjectFor = (repoPath: string): CodeReviewSubject => ({
	repoPath, epicHash: EPIC, storyId: STORY, changedFiles: ['src/a.ts'],
	approvedLld:  { meta: { epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: null, buildRecord: null, testRecord: null,
});
const DIFF: CodeReviewGrounding = { symbols: [{ entityId: 'diff:src/a.ts', file: 'src/a.ts', kind: 'file', name: 'src/a.ts', signature: '@@', callers: [], callees: [], testsReaching: [] }] };

async function runRpc(params: Record<string, unknown>, deps: CodeReviewRunDeps): Promise<IpcStreamMessage[]> {
	const frames: IpcStreamMessage[] = [];
	await codeReviewRunStart(params, (m) => frames.push(m), new AbortController().signal, deps);
	return frames;
}
