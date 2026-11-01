/**
 * Real-git scenarios for the Story change set (Story s9, task t12): the commits of a Story, merges, a squash, an empty Story, the trailer
 * and the recorded end, read through whichever implementation is passed in so two implementations can be compared. Object names are
 * left out of the result (they differ from run to run); the paths, the kinds and the attribution are what is compared. Not a test file.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

type Value<T> = T | Promise<T>;
interface ChangeSetLike { paths: readonly string[]; units: readonly { kind: string; paths: readonly string[] }[]; sharedPaths: readonly string[]; foldedPaths: readonly string[]; attribution: string; sharedWithExcluded: readonly string[]; perUnit: boolean }

export interface StoryApi {
	storyChangeSet(repo: string, base: string, opts?: { storyKey?: string; strict?: boolean }): Value<ChangeSetLike>;
	newestStoryCommit(repo: string, base: string, storyKey: string): Value<string | undefined>;
	mergeInProgress(repo: string): Value<boolean>;
	changedFiles(repo: string, opts: { base: string; storyKey?: string }): Value<readonly string[]>;
}

const STORY = 'a3f4b8c9d1e2f3a4/s1';
const OTHER = 'a3f4b8c9d1e2f3a4/s2';
const sh = (cwd: string, ...a: string[]): string => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function repo(): { dir: string; base: string; commit(files: Record<string, string | null>, msg: string, key?: string): string; cleanup(): void } {
	const dir = mkdtempSync(join(tmpdir(), 'story-scn-'));
	sh(dir, 'init', '-q', '-b', 'main'); sh(dir, 'config', 'user.email', 't@t'); sh(dir, 'config', 'user.name', 't'); sh(dir, 'config', 'commit.gpgsign', 'false');
	const commit = (files: Record<string, string | null>, msg: string, key?: string): string => {
		for (const [path, text] of Object.entries(files)) {
			if (text === null) { rmSync(join(dir, path), { force: true }); continue; }
			mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text);
		}
		sh(dir, 'add', '-A');
		sh(dir, 'commit', '-q', '--allow-empty', '-m', key === undefined ? msg : `${msg}\n\nInsrc-Story: ${key}`);
		return sh(dir, 'rev-parse', 'HEAD');
	};
	const base = commit({ 'README.md': 'r\n' }, 'base');
	return { dir, base, commit, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const view = (set: ChangeSetLike): unknown => ({ paths: set.paths, units: set.units.map(u => ({ kind: u.kind, paths: u.paths })), sharedPaths: set.sharedPaths, foldedPaths: set.foldedPaths, attribution: set.attribution, sharedWithExcluded: set.sharedWithExcluded, perUnit: set.perUnit });
const settle = async <T>(call: () => Value<T>): Promise<unknown> => { try { return await call(); } catch (err) { return { threw: (err as Error).name }; } };

export async function runStoryScenarios(api: StoryApi): Promise<Record<string, unknown>> {
	const out: Record<string, unknown> = {};
	const scenario = async (name: string, body: (r: ReturnType<typeof repo>) => Promise<unknown>): Promise<void> => {
		const r = repo();
		try { out[name] = await body(r); } finally { r.cleanup(); }
	};

	await scenario('commits of the range', async r => {
		r.commit({ 'src/a.ts': '1\n' }, 'one'); r.commit({ 'src/b.ts': '1\n', 'src/a.ts': '2\n' }, 'two'); r.commit({ 'src/b.ts': null }, 'three');
		return { set: view(await api.storyChangeSet(r.dir, r.base)), files: await api.changedFiles(r.dir, { base: r.base }) };
	});
	await scenario('a file name with a space and a newline', async r => {
		r.commit({ 'src/with space.ts': '1\n', 'src/new\nline.ts': '1\n' }, 'odd names');
		return view(await api.storyChangeSet(r.dir, r.base));
	});
	await scenario('trailers pick the Story out of mixed commits', async r => {
		r.commit({ 'src/mine.ts': '1\n' }, 'mine', STORY); r.commit({ 'src/theirs.ts': '1\n' }, 'theirs', OTHER); r.commit({ 'src/untrailered.ts': '1\n' }, 'untrailered');
		return { story: view(await api.storyChangeSet(r.dir, r.base, { storyKey: STORY })), newest: typeof (await api.newestStoryCommit(r.dir, r.base, STORY)), none: await api.newestStoryCommit(r.dir, r.base, 'a3f4b8c9d1e2f3a4/s9'), files: await api.changedFiles(r.dir, { base: r.base, storyKey: STORY }) };
	});
	await scenario('an empty Story and an unresolvable base', async r => ({
		empty: view(await api.storyChangeSet(r.dir, r.base)),
		strictEmpty: await settle(() => api.storyChangeSet(r.dir, r.base, { storyKey: STORY, strict: true })),
		badBase: await settle(() => api.storyChangeSet(r.dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')),
	}));
	await scenario('a clean merge, a conflicting merge and an octopus merge', async r => {
		sh(r.dir, 'checkout', '-q', '-b', 'side'); r.commit({ 'src/side.ts': '1\n', 'shared.txt': 'side\n' }, 'side work');
		sh(r.dir, 'checkout', '-q', 'main'); r.commit({ 'src/main.ts': '1\n' }, 'main work');
		sh(r.dir, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side');
		const clean = view(await api.storyChangeSet(r.dir, r.base));
		sh(r.dir, 'checkout', '-q', '-b', 'c1', 'main'); r.commit({ 'clash.txt': 'one\n' }, 'c1');
		sh(r.dir, 'checkout', '-q', 'main'); sh(r.dir, 'checkout', '-q', '-b', 'c2'); r.commit({ 'clash.txt': 'two\n' }, 'c2');
		sh(r.dir, 'checkout', '-q', 'main'); sh(r.dir, 'merge', '-q', '--no-ff', '-m', 'merge c1', 'c1');
		try { sh(r.dir, 'merge', '--no-ff', '-m', 'merge c2', 'c2'); } catch { /* conflicts */ }
		writeFileSync(join(r.dir, 'clash.txt'), 'resolved\n'); sh(r.dir, 'add', '-A'); sh(r.dir, 'commit', '-q', '-m', 'merge c2 resolved');
		const conflicted = view(await api.storyChangeSet(r.dir, r.base));
		sh(r.dir, 'checkout', '-q', '-b', 'o1', 'main'); r.commit({ 'o1.txt': '1\n' }, 'o1');
		sh(r.dir, 'checkout', '-q', '-b', 'o2', 'main'); r.commit({ 'o2.txt': '1\n' }, 'o2');
		sh(r.dir, 'checkout', '-q', 'main'); sh(r.dir, 'merge', '-q', '--no-ff', '-m', 'octopus', 'o1', 'o2');
		return { clean, conflicted, octopus: view(await api.storyChangeSet(r.dir, r.base)) };
	});
	await scenario('a range that includes a root commit', async r => {
		r.commit({ 'src/a.ts': '1\n' }, 'one');
		sh(r.dir, 'checkout', '-q', '--orphan', 'unrelated'); sh(r.dir, 'rm', '-rfq', '.'); const orphan = r.commit({ 'other.txt': 'o\n' }, 'unrelated root');
		sh(r.dir, 'checkout', '-q', 'main');
		return view(await api.storyChangeSet(r.dir, orphan));
	});
	await scenario('a merge in progress and a squash in progress', async r => {
		const none = await api.mergeInProgress(r.dir);
		sh(r.dir, 'checkout', '-q', '-b', 'side'); r.commit({ 'side.txt': '1\n' }, 'side');
		sh(r.dir, 'checkout', '-q', 'main'); r.commit({ 'main.txt': '1\n' }, 'main');
		sh(r.dir, 'merge', '--no-commit', '--no-ff', 'side');
		const merging = await api.mergeInProgress(r.dir);
		sh(r.dir, 'merge', '--abort');
		sh(r.dir, 'merge', '--squash', 'side');
		const squashing = await api.mergeInProgress(r.dir);
		const plain = mkdtempSync(join(tmpdir(), 'story-scn-plain-'));
		try { return { none, merging, squashing, notARepo: await api.mergeInProgress(plain) }; } finally { rmSync(plain, { recursive: true, force: true }); }
	});
	return out;
}
