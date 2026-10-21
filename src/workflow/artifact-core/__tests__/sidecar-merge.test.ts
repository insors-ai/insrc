import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FileSidecarStore, createFileSidecarStore } from '../sidecar-store.js';

const H = '2f27754d4ad00b8e';
const ID = `LLD-${H}-s4`;
const hasGit = spawnSync('git', ['--version']).status === 0;

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

interface Setup { readonly root: string; readonly a: string; readonly b: string }

/** Two clones of one repository whose first commit carries the merge rules, the artifact head and one entry in each line file. */
async function twoClones(): Promise<Setup> {
	const root = mkdtempSync(join(tmpdir(), 'sidecar-merge-'));
	const a = join(root, 'a');
	mkdirSync(a);
	git(a, 'init', '-q', '-b', 'main');
	git(a, 'config', 'user.email', 'a@example.com');
	git(a, 'config', 'user.name', 'A');
	const store = createFileSidecarStore(a);
	mkdirSync(join(a, '.insrc/artifacts'), { recursive: true });
	writeFileSync(join(a, store.filesOf(ID).head), JSON.stringify({ meta: {}, body: { text: 'one' } }, null, 2) + '\n');
	await store.appendRecord('log', { artifactId: ID, entry: { id: 'e00', timestamp: '2026-10-20T10:00:00.000Z' } });
	await store.appendRecord('feedback', { artifactId: ID, entry: { id: 'f00', timestamp: '2026-10-20T10:00:00.000Z' } });
	git(a, 'add', '-A');
	git(a, 'commit', '-q', '-m', 'seed');
	const b = join(root, 'b');
	git(root, 'clone', '-q', a, b);
	git(b, 'config', 'user.email', 'b@example.com');
	git(b, 'config', 'user.name', 'B');
	return { root, a, b };
}

const entry = (id: string, timestamp: string) => ({ id, timestamp });

describe('sidecar-merge', { skip: hasGit ? false : 'git is not available' }, () => {
	it('two clones that append different log and feedback entries to one artifact merge with no conflict and a reader sees every entry once, in timestamp then id order', async () => {
		const { root, a, b } = await twoClones();
		try {
			const sa = createFileSidecarStore(a);
			const sb = createFileSidecarStore(b);
			await sa.appendRecord('log', { artifactId: ID, entry: entry('a1', '2026-10-20T11:00:00.000Z') });
			await sa.appendRecord('feedback', { artifactId: ID, entry: entry('fa', '2026-10-20T11:30:00.000Z') });
			await sb.appendRecord('log', { artifactId: ID, entry: entry('b1', '2026-10-20T11:00:00.000Z') });
			await sb.appendRecord('log', { artifactId: ID, entry: entry('b2', '2026-10-20T10:30:00.000Z') });
			await sb.appendRecord('feedback', { artifactId: ID, entry: entry('fb', '2026-10-20T11:15:00.000Z') });
			git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 'a');
			git(b, 'add', '-A'); git(b, 'commit', '-q', '-m', 'b');

			git(a, 'fetch', '-q', b, 'main');
			git(a, 'merge', '--no-ff', '-m', 'merge b', 'FETCH_HEAD');
			assert.equal(git(a, 'diff', '--name-only', '--diff-filter=U').trim(), '', 'no unmerged file');

			const merged = new FileSidecarStore(a);
			const ids = async (file: 'log' | 'feedback') => (await merged.readRecords<{ id: string }>(file, ID)).map(e => e.id);
			assert.deepEqual(await ids('log'), ['e00', 'b2', 'a1', 'b1']);
			assert.deepEqual(await ids('feedback'), ['f00', 'fb', 'fa']);
			// A union merge can repeat a line; the reader still counts each entry once.
			const logFile = join(a, merged.filesOf(ID).log);
			writeFileSync(logFile, readFileSync(logFile, 'utf8') + readFileSync(logFile, 'utf8').split('\n').slice(0, 1).join('\n') + '\n');
			assert.deepEqual(await ids('log'), ['e00', 'b2', 'a1', 'b1']);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('a head changed in two clones conflicts in git and the line files of the same merge still union', async () => {
		const { root, a, b } = await twoClones();
		try {
			const sa = createFileSidecarStore(a);
			const sb = createFileSidecarStore(b);
			const head = (dir: string) => join(dir, sa.filesOf(ID).head);
			writeFileSync(head(a), JSON.stringify({ meta: {}, body: { text: 'two from a' } }, null, 2) + '\n');
			writeFileSync(head(b), JSON.stringify({ meta: {}, body: { text: 'two from b' } }, null, 2) + '\n');
			await sa.appendRecord('log', { artifactId: ID, entry: entry('a1', '2026-10-20T11:00:00.000Z') });
			await sb.appendRecord('log', { artifactId: ID, entry: entry('b1', '2026-10-20T11:05:00.000Z') });
			git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 'a');
			git(b, 'add', '-A'); git(b, 'commit', '-q', '-m', 'b');

			git(a, 'fetch', '-q', b, 'main');
			const merge = spawnSync('git', ['merge', '--no-ff', '-m', 'merge b', 'FETCH_HEAD'], { cwd: a, encoding: 'utf8' });
			assert.notEqual(merge.status, 0, 'git reports the conflict');
			assert.deepEqual(git(a, 'diff', '--name-only', '--diff-filter=U').trim().split('\n'), [sa.filesOf(ID).head], 'only the head is unmerged');

			const logText = readFileSync(join(a, sa.filesOf(ID).log), 'utf8');
			assert.ok(!logText.includes('<<<<<<<'), 'the line file has no conflict markers');
			const merged = createFileSidecarStore(a);
			assert.deepEqual((await merged.readRecords<{ id: string }>('log', ID)).map(e => e.id), ['e00', 'a1', 'b1']);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
