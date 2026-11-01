/**
 * Real-git scenarios for the build runners' git reads (Story s9, task t11): the build-start stamp, the range base and end, the short and
 * full HEAD and the prior commit of a BUILD record, read through whichever implementation is passed in so two implementations can be
 * compared. Values that differ from run to run (object names) are compared with the repository, not recorded. Not a test file itself.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

type Value<T> = T | Promise<T>;

export interface BuildApi {
	readBuildStart(repo: string, epic: string, story: string): Value<{ kind: string; reason?: string; stamp?: { rangeBase: string } }>;
	stampBuildStart(repo: string, epic: string, story: string): Value<string>;
	resolveStoryRangeBase(repo: string, epic: string, story: string): Value<string | undefined>;
	resolveStoryRangeEnd(repo: string, epic: string, story: string): Value<string | undefined>;
	headShortSha(repo: string): Value<string | undefined>;
	headFullSha(repo: string): Value<string | undefined>;
	persistBuildRecord(repo: string, rec: unknown): Value<{ json: string }>;
}

const EPIC = 'a3f4b8c9d1e2f3a4';
const sh = (cwd: string, ...a: string[]): string => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const startFile = (epic: string, story: string): string => `.insrc/build-start/${epic}-${story}.json`;

function repo(): { dir: string; commit(path: string, text: string, msg: string): string; cleanup(): void } {
	const dir = mkdtempSync(join(tmpdir(), 'build-scn-'));
	sh(dir, 'init', '-q', '-b', 'main'); sh(dir, 'config', 'user.email', 't@t'); sh(dir, 'config', 'user.name', 't'); sh(dir, 'config', 'commit.gpgsign', 'false');
	return {
		dir,
		commit: (path, text, msg) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); sh(dir, 'add', '-A'); sh(dir, 'commit', '-q', '-m', msg); return sh(dir, 'rev-parse', 'HEAD'); },
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

const planRec = (at: string): unknown => ({ meta: { workflow: 'build', standalone: false, epicHash: EPIC, storyId: 's1', createdAt: at, updatedAt: at }, body: { tasks: [{ id: 't1', passed: true }] } });

export async function runBuildScenarios(api: BuildApi, buildStartPath: (epic: string, story: string) => string = startFile): Promise<Record<string, unknown>> {
	const out: Record<string, unknown> = {};
	const scenario = async (name: string, body: (r: ReturnType<typeof repo>) => Promise<unknown>): Promise<void> => {
		const r = repo();
		try { out[name] = await body(r); } finally { r.cleanup(); }
	};

	await scenario('the build-start stamp', async r => {
		const head0 = r.commit('a.txt', '1\n', 'one');
		const absent = await api.readBuildStart(r.dir, EPIC, 's1');
		const first = await api.stampBuildStart(r.dir, EPIC, 's1');
		const stamped = await api.readBuildStart(r.dir, EPIC, 's1');
		r.commit('a.txt', '2\n', 'two');
		const again = await api.stampBuildStart(r.dir, EPIC, 's1');
		const base = await api.resolveStoryRangeBase(r.dir, EPIC, 's1');
		// a stamp that names a commit the repository does not have is ignored
		mkdirSync(dirname(join(r.dir, buildStartPath(EPIC, 's1'))), { recursive: true });
		writeFileSync(join(r.dir, buildStartPath(EPIC, 's1')), JSON.stringify({ epicHash: EPIC, storyId: 's1', rangeBase: 'f'.repeat(40), stampedAt: '2026-01-01T00:00:00.000Z' }));
		const invalid = await api.readBuildStart(r.dir, EPIC, 's1');
		return { absent, first, stampIsHead: stamped.kind === 'valid' && stamped.stamp?.rangeBase === head0, again, baseIsStamp: base === head0, invalid };
	});
	await scenario('no repository and no commit', async r => {
		const plain = mkdtempSync(join(tmpdir(), 'build-scn-plain-'));
		try {
			return {
				plain: { stamp: await api.stampBuildStart(plain, EPIC, 's1'), short: await api.headShortSha(plain), full: await api.headFullSha(plain), base: await api.resolveStoryRangeBase(plain, EPIC, 's1') },
				unborn: { stamp: await api.stampBuildStart(r.dir, EPIC, 's1'), short: await api.headShortSha(r.dir), full: await api.headFullSha(r.dir) },
			};
		} finally { rmSync(plain, { recursive: true, force: true }); }
	});
	await scenario('the range base from an upstream artifact', async r => {
		r.commit('a.txt', '1\n', 'one');
		const plan = `.insrc/artifacts/PLAN-${EPIC}-s1.json`;
		const introduced = r.commit(plan, '{"meta":{}}\n', 'plan');
		r.commit('a.txt', '2\n', 'later');
		const byCommit = await api.resolveStoryRangeBase(r.dir, EPIC, 's1');
		writeFileSync(join(r.dir, plan), JSON.stringify({ meta: { rangeBase: 'a'.repeat(40) } }));
		const stamped = await api.resolveStoryRangeBase(r.dir, EPIC, 's1');
		return { byCommitIsIntroducing: byCommit === introduced, stampedBase: stamped };
	});
	await scenario('the end of a pre-trailer Story', async r => {
		const head = r.commit('a.txt', '1\n', 'one');
		const record = `.insrc/artifacts/BUILD-${EPIC}-s1.json`;
		mkdirSync(join(r.dir, '.insrc', 'artifacts'), { recursive: true });
		const none = await api.resolveStoryRangeEnd(r.dir, EPIC, 's1');
		writeFileSync(join(r.dir, record), JSON.stringify({ body: { commit: head.slice(0, 7) } }));
		const short = await api.resolveStoryRangeEnd(r.dir, EPIC, 's1');
		writeFileSync(join(r.dir, record), JSON.stringify({ body: { commit: 'f'.repeat(40) } }));
		const missing = await api.resolveStoryRangeEnd(r.dir, EPIC, 's1');
		writeFileSync(join(r.dir, record), JSON.stringify({ body: {} }));
		const noCommit = await api.resolveStoryRangeEnd(r.dir, EPIC, 's1');
		return { none, shortIsHead: short === head, missing, noCommit };
	});
	await scenario('HEAD as the gate and the record read it', async r => {
		const head = r.commit('a.txt', '1\n', 'one');
		const short = await api.headShortSha(r.dir);
		return { fullIsHead: (await api.headFullSha(r.dir)) === head, shortIsPrefix: short !== undefined && head.startsWith(short) };
	});
	await scenario('a BUILD record keeps its recorded commit', async r => {
		const first = r.commit('f.ts', 'export const f = 1;\n', 'seed');
		mkdirSync(join(r.dir, '.insrc', 'artifacts'), { recursive: true }); mkdirSync(join(r.dir, 'docs', 'builds'), { recursive: true });
		const written = await api.persistBuildRecord(r.dir, planRec('2026-10-18T00:00:00.000Z'));
		const commit1 = (JSON.parse(readFileSync(written.json, 'utf8')) as { body: { commit?: string } }).body.commit;
		r.commit('g.ts', 'export const g = 1;\n', 'later, untrailered');
		await api.persistBuildRecord(r.dir, planRec('2026-10-19T00:00:00.000Z'));
		const commit2 = (JSON.parse(readFileSync(written.json, 'utf8')) as { body: { commit?: string } }).body.commit;
		return { firstIsHead: commit1 !== undefined && first.startsWith(commit1), kept: commit1 === commit2, exists: existsSync(written.json) };
	});
	return out;
}
