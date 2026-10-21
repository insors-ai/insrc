/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-b47dadc7 S001/t4 — a BUILD record's body.commit names the Story's newest
 * commit carrying its `Insrc-Story` trailer since the range base, not whatever
 * HEAD is when it is persisted; HEAD when none carries it; an explicit value wins.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/standalone-record-commit.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { persistBuildRecord, type BuildRecord } from '../standalone-record.js';
import { stampBuildStart } from '../range-base.js';

const EPIC = 'b47dadc7cf0cccb1';

async function withRepo(fn: (repo: string, git: (...a: string[]) => string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-record-commit-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
	try {
		git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'seed.ts'), 'seed\n');
		git('add', '-A'); git('commit', '-qm', 'seed');
		assert.equal(stampBuildStart(repo, EPIC, 's1'), 'stamped', 'the range base is the seed commit');
		await fn(repo, git);
	} finally { rmSync(repo, { recursive: true, force: true }); }
}

function commit(repo: string, git: (...a: string[]) => string, file: string, msg: string): string {
	writeFileSync(join(repo, file), `${file}\n`);
	git('add', file);
	git('commit', '-qm', msg);
	return git('rev-parse', '--short', 'HEAD');
}

const record = (commit?: string): BuildRecord => ({
	meta: { workflow: 'build', standalone: false, epicHash: EPIC, storyId: 's1', createdAt: '2026-10-18T00:00:00.000Z' },
	body: { tasks: [{ id: 't1', passed: true }], ...(commit !== undefined ? { commit } : {}) },
});

const persistedCommit = async (repo: string): Promise<unknown> =>
	(JSON.parse(readFileSync((await persistBuildRecord(repo, record())).json, 'utf8')) as { body: Record<string, unknown> }).body['commit'];

test("a BUILD record persisted after another Story's commits names the Story's newest trailered commit", async () => {
	await withRepo(async (repo, git) => {
		commit(repo, git, 'a.ts', `feat(build): S001/t1 a\n\nInsrc-Story: ${EPIC}/s1`);
		const newest = commit(repo, git, 'b.ts', `feat(build): S001/t2 b\n\nInsrc-Story: ${EPIC}/s1`);
		commit(repo, git, 'c.ts', 'feat(build): s3/t1 another Story\n\nInsrc-Story: c2ba6fa6aaaaaaaa/s3');
		const head = commit(repo, git, 'd.ts', 'chore: untrailed');

		assert.notEqual(head, newest);
		assert.equal(await persistedCommit(repo), newest);
	});
});

test('with no trailered commit the record names HEAD, and an explicit commit wins', () => {
	withRepo(async (repo, git) => {
		commit(repo, git, 'a.ts', 'feat(build): S001/t1 untrailed');
		const head = commit(repo, git, 'b.ts', `feat(build): S001/t2 a different Story\n\nInsrc-Story: 748edb69bd23f767/s1`);
		assert.equal(await persistedCommit(repo), head);

		// An explicit value wins even over a trailered commit of this Story.
		const trailered = commit(repo, git, 'c.ts', `feat(build): S001/t3 c\n\nInsrc-Story: ${EPIC}/s1`);
		assert.equal(await persistedCommit(repo), trailered);
		const json = (await persistBuildRecord(repo, record('deadbee'))).json;
		assert.equal((JSON.parse(readFileSync(json, 'utf8')) as { body: Record<string, unknown> }).body['commit'], 'deadbee');
	});
});
