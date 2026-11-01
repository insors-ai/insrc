/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Every meta-only writer (sc3) leaves the artifact body byte-identical and the
 * revision unchanged: question resolution, findings review stamp, refs patch,
 * bugfix stamp, orchestrator tracker push and sync.
 *
 * Run: npx tsx --test src/workflow/__tests__/meta-only-body-unchanged.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { recordResolution, questionId } from '../questions.js';
import { patchTrackerMeta } from '../tracker/refs.js';
import { _setTrackerExecForTests } from '../tracker/__tests__/_legacy-table.js';
import { defaultStampDeps } from '../bugfix/stamp.js';
import { _mutateEpicTrackerMeta } from '../orchestrator.js';
import { ARTIFACTS_DIR, defineArtifactId, hldArtifactId, artifactJsonPath, issueArtifactId } from '../storage.js';
import { lifecycleReviewOf } from '../artifact-core/approval-view.js';
import { approvedMeta, draftMeta } from './lifecycle-fixtures.js';
import './helpers/converted-repos.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED_AT = '2026-07-19T00:00:00.000Z';
const Q = '[sc1 / missed] Case-insensitive tags?';

afterEach(() => { _setTrackerExecForTests(); });

type Doc = { meta: Record<string, unknown>; body: unknown; citations?: unknown };
const read = (p: string): Doc => JSON.parse(readFileSync(p, 'utf8')) as Doc;

function repoWith(name: string, doc: Doc): { repo: string; json: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-metaonly-'));
	mkdirSync(join(repo, ARTIFACTS_DIR), { recursive: true });
	const json = join(repo, ARTIFACTS_DIR, `${name}.json`);
	writeFileSync(json, JSON.stringify(doc, null, 2) + '\n');
	return { repo, json, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

function sameBodyAndRevision(before: Doc, after: Doc, revision: number | undefined): void {
	assert.equal(JSON.stringify(after.body), JSON.stringify(before.body), 'the body is byte-identical');
	assert.equal(JSON.stringify(after.citations), JSON.stringify(before.citations), 'the citations are byte-identical');
	assert.equal(after.meta['revision'], revision, 'the revision is unchanged');
}
