/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The validate turn holds one write root (s1/t7): the first headless turn files the
 * TESTS and BUILD records under one anchor, a TESTS write failure does not strand the
 * BUILD record, and a record no anchor can place is told from an ordinary ledger failure.
 *
 * Run: npx tsx --test src/daemon/steps/build-step/__tests__/validate-anchor.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleBuildStep } from '../handler.js';
import {
	_setBuildValidateCheckRunnerForTests,
	_setBuildValidateClockForTests,
	_setBuildValidateProviderForTests,
	_setBuildValidateTestRecordWriterForTests,
} from '../phases/validate.js';
import type { ValidationCheckResults } from '../validation-checks.js';
import '../../../../workflow/__tests__/helpers/converted-repos.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const DAY1 = '2026-03-01T23:50:00.000Z';
const DAY2 = '2026-03-02T09:00:00.000Z';
const TRIVIAL = { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'trivial', focus: 'a guard' };

const PASSING: ValidationCheckResults = {
	typecheck: { ok: true, command: 'npx tsc --noEmit', exitCode: 0, timedOut: false, durationMs: 1, outputTail: '' },
	tests:     { ok: true, command: 'npx tsx --test x.test.ts', exitCode: 0, timedOut: false, durationMs: 1, outputTail: '' },
};
_setBuildValidateCheckRunnerForTests(async () => PASSING);

const verdict = (): Record<string, unknown> => ({ taskId: 's1', passed: true, checks: [], scopeRespected: true, reason: 'ok' });
const failJudge = (): never => { throw new Error('the CLI exited with 1'); };

function mkRepo(): string { return mkdtempSync(join(tmpdir(), 'insrc-validate-anchor-')); }
const artifacts = (repo: string): string => { const d = join(repo, '.insrc', 'artifacts'); mkdirSync(d, { recursive: true }); return d; };
const readJson = (repo: string, id: string): { meta: Record<string, unknown>; body: Record<string, unknown> } =>
	JSON.parse(readFileSync(join(artifacts(repo), `${id}.json`), 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };

/** Every TESTS.md / BUILD.md under docs/, repo-relative. */
function recordDocs(repo: string): string[] {
	const out: string[] = [];
	const walk = (rel: string): void => {
		if (!existsSync(join(repo, rel))) return;
		for (const name of readdirSync(join(repo, rel))) {
			const child = `${rel}/${name}`;
			if (name === 'TESTS.md' || name === 'BUILD.md') out.push(child);
			else if (!name.includes('.')) walk(child);
		}
	};
	walk('docs');
	return out.sort();
}

/** One standalone validate turn at a given time; `judge` may throw. */
async function turn(repo: string, at: string, judge: () => unknown = verdict): Promise<Record<string, unknown>> {
	_setBuildValidateClockForTests(() => at);
	_setBuildValidateProviderForTests({ async runReviewSession<T>() { return judge() as T; } });
	try {
		const env = await handleBuildStep({ phase: 'validate', target: 's1', repo, standalone: TRIVIAL as never });
		return JSON.parse(env.content[0]!.text) as Record<string, unknown>;
	} finally {
		_setBuildValidateProviderForTests(undefined);
		_setBuildValidateClockForTests(undefined);
		_setBuildValidateTestRecordWriterForTests(undefined);
	}
}

test('the first headless validate call writes TESTS first, a failing judge leaves the evidence, and a retry on a later day files BUILD in the same folder', async () => {
	const repo = mkRepo();
	try {
		const first = await turn(repo, DAY1, failJudge);
		assert.equal((first['error'] as { code: string }).code, 'verdict-session-failed');
		const docs = recordDocs(repo);
		assert.deepEqual(docs.map(d => d.split('/').pop()), ['TESTS.md'], 'the evidence of the run is kept and no BUILD exists yet');
		assert.equal(readJson(repo, `TESTS-${HASH}-s1`).meta['epicCreatedAt'], DAY1, 'the first write stamped the anchor');

		const second = await turn(repo, DAY2);
		assert.equal(second['next'], 'done');
		assert.deepEqual(recordDocs(repo), [`${dirname(docs[0]!)}/BUILD.md`, docs[0]!], 'BUILD joined the folder TESTS made, one day later');
		assert.equal(readJson(repo, `BUILD-${HASH}-s1`).meta['epicCreatedAt'], DAY1);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('the first headless validate call with an injected TESTS write failure and a successful judge returns the verdict and writes a stamped BUILD', async () => {
	const repo = mkRepo();
	try {
		_setBuildValidateTestRecordWriterForTests(() => { throw new Error('disk full'); });
		const out = await turn(repo, DAY1);
		assert.equal(out['next'], 'done');
		assert.equal(out['passed'], true);
		const evidence = (out['verdict'] as { evidence: { testRecordNote?: string } }).evidence;
		assert.match(evidence.testRecordNote ?? '', /disk full/);
		const build = readJson(repo, `BUILD-${HASH}-s1`);
		assert.equal(build.meta['epicCreatedAt'], DAY1, 'the BUILD record is stamped with the turn\'s time');
		assert.deepEqual(recordDocs(repo).map(d => d.split('/').pop()), ['BUILD.md']);
		const changeLog = JSON.stringify(build.body['changeLog'] ?? []);
		assert.ok(!/BUILD\.md|TESTS\.md|\.insrc\/artifacts/.test(changeLog), 'the change log leaves out the workflow\'s own files');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a read-intent MissingAnchorError returns the missing-anchor error and an ordinary ledger write failure still returns the verdict', async () => {
	// A test record on disk that carries no stamp, with no head: no anchor can place it.
	const stranded = mkRepo();
	try {
		writeFileSync(join(artifacts(stranded), `TESTS-${HASH}-s1.json`), JSON.stringify({
			meta: { workflow: 'tests', epicHash: HASH, storyId: 's1', createdAt: DAY1, updatedAt: DAY1, standalone: true },
			body: { tasks: [] },
		}));
		_setBuildValidateTestRecordWriterForTests(() => { throw new Error('disk full'); });
		const out = await turn(stranded, DAY2);
		assert.equal(out['next'], 'error', 'not { next: done }');
		assert.equal((out['error'] as { code: string }).code, 'missing-anchor');
	} finally { rmSync(stranded, { recursive: true, force: true }); }

	// The same ordinary failure with an anchor on disk is only noted: the verdict stands.
	const anchored = mkRepo();
	try {
		writeFileSync(join(artifacts(anchored), `ISSUE-${HASH}.json`), JSON.stringify({ meta: { issueHash: HASH, createdAt: DAY1, epicSlug: 'a-fix', standalone: true }, body: {} }));
		_setBuildValidateTestRecordWriterForTests(() => { throw new Error('disk full'); });
		const out = await turn(anchored, DAY2);
		assert.equal(out['next'], 'done');
		assert.match((out['verdict'] as { evidence: { testRecordNote?: string } }).evidence.testRecordNote ?? '', /disk full/);
	} finally { rmSync(anchored, { recursive: true, force: true }); }
});

test('a BUILD record that cannot be stored through the service is named in the verdict\'s evidence, and the verdict stands', async () => {
	const repo = mkRepo();
	try {
		const first = await turn(repo, DAY1);
		assert.equal(first['next'], 'done');
		assert.equal((first['verdict'] as { evidence: { buildRecordNote?: string } }).evidence.buildRecordNote, undefined, 'a stored round carries no note');
		// the BUILD head is edited behind the store: its stored hash no longer matches its content, and the store refuses to write over it
		const path = join(artifacts(repo), `BUILD-${HASH}-s1.json`);
		const head = JSON.parse(readFileSync(path, 'utf8')) as { body: Record<string, unknown> };
		head.body['summary'] = 'edited by hand';
		writeFileSync(path, JSON.stringify(head, null, 2) + '\n');
		const second = await turn(repo, DAY2);
		assert.equal(second['next'], 'done');
		assert.equal(second['passed'], true, 'the verdict is unchanged');
		const note = (second['verdict'] as { evidence: { buildRecordNote?: string } }).evidence.buildRecordNote;
		assert.match(note ?? '', /the BUILD record was not written \(.*hash-mismatch/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
