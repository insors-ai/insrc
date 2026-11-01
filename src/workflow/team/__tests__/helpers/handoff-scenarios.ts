/**
 * Real-git scenarios for the handoff's git reads (Story s9, task t10): the draft listing, the stage inference and the receiving-repository
 * check, read through whichever implementation is passed in so two implementations can be compared. Not a test file itself.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { git } from '../git-fixture.js';
import { normalise as normaliseShas } from './policy-scenarios.js';

/** Also take out the scratch directories and the shortened commit ids that the messages of this module name. */
const normalise = (value: unknown): unknown => JSON.parse(JSON.stringify(normaliseShas(value), (_k, v) => (typeof v === 'string' ? v.replace(/\/\S*handoff-scn-[\w-]+/g, '<tmp>').replace(/[0-9a-f]{12}/g, '<id>') : v)));

type Value<T> = T | Promise<T>;
export interface HandoffUnitRef { readonly epicHash: string; readonly storyId?: string }

export interface HandoffApi {
	unitDraftFiles(repo: string, unit: HandoffUnitRef): Value<readonly string[]>;
	inferStageWorkflow(repo: string, unit: HandoffUnitRef & { readonly repoPath: string }): Value<string>;
	verifyReceivingRepo(repo: string, repositoryId: string | undefined, listRepos: () => Promise<readonly { path: string }[]>): Value<unknown>;
}

const HASH = 'a3f4b8c9d1e2f3a4';
const OTHER = 'b4f4b8c9d1e2f3a5';
const lld = (hash: string): string => `.insrc/artifacts/LLD-${hash}-s1.json`;
const plan = (hash: string): string => `.insrc/artifacts/PLAN-${hash}-s1.json`;
const hld = (hash: string): string => `.insrc/artifacts/HLD-${hash}.json`;

function repo(): { dir: string; put(path: string, text?: string): void; commit(message: string): void; cleanup(): void } {
	const dir = mkdtempSync(join(tmpdir(), 'handoff-scn-'));
	git(dir, 'init', '-q', '-b', 'main');
	const put = (path: string, text = '{}\n'): void => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
	return { dir, put, commit: m => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', m); }, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export async function runHandoffScenarios(api: HandoffApi): Promise<Record<string, unknown>> {
	const out: Record<string, unknown> = {};
	const scenario = async (name: string, body: (r: ReturnType<typeof repo>) => Promise<unknown>): Promise<void> => {
		const r = repo();
		try { out[name] = normalise(await body(r)); } finally { r.cleanup(); }
	};
	const unit = { epicHash: HASH, storyId: 's1' };

	await scenario('draft files of a unit', async r => {
		r.put('README.md', 'x\n'); r.put(lld(HASH), '{"v":1}\n'); r.commit('base');
		const clean = await api.unitDraftFiles(r.dir, unit);
		r.put(lld(HASH), '{"v":2}\n');
		const modified = await api.unitDraftFiles(r.dir, unit);
		r.put(plan(HASH)); r.put(lld(OTHER)); r.put('docs/note.md', 'n\n');
		const untracked = await api.unitDraftFiles(r.dir, unit);
		git(r.dir, 'add', '-A');
		const staged = await api.unitDraftFiles(r.dir, unit);
		git(r.dir, 'commit', '-q', '-m', 'commit all');
		git(r.dir, 'mv', plan(HASH), '.insrc/artifacts/PLAN-moved.json');
		const renamed = await api.unitDraftFiles(r.dir, unit);
		git(r.dir, 'reset', '-q', '--hard');
		const { rmSync: rm } = await import('node:fs'); rm(join(r.dir, lld(HASH)));
		const deleted = await api.unitDraftFiles(r.dir, unit);
		return { clean, modified, untracked, staged, renamed, deleted };
	});
	await scenario('not a repository', async () => {
		const plain = mkdtempSync(join(tmpdir(), 'handoff-scn-plain-'));
		try { return { files: await api.unitDraftFiles(plain, unit), stage: await api.inferStageWorkflow(plain, { ...unit, repoPath: plain }) }; } finally { rmSync(plain, { recursive: true, force: true }); }
	});
	await scenario('the stage inferred from the committed artifacts', async r => {
		r.put('README.md', 'x\n'); r.commit('base');
		const story0 = await api.inferStageWorkflow(r.dir, { ...unit, repoPath: r.dir });
		const epic0 = await api.inferStageWorkflow(r.dir, { epicHash: HASH, repoPath: r.dir });
		r.put(lld(HASH)); r.commit('lld');
		const story1 = await api.inferStageWorkflow(r.dir, { ...unit, repoPath: r.dir });
		r.put(plan(HASH)); r.commit('plan');
		const story2 = await api.inferStageWorkflow(r.dir, { ...unit, repoPath: r.dir });
		r.put(hld(HASH)); r.commit('hld');
		const epic1 = await api.inferStageWorkflow(r.dir, { epicHash: HASH, repoPath: r.dir });
		r.put(plan('c4f4b8c9d1e2f3a6'));          // present on disk but never committed
		const uncommitted = await api.inferStageWorkflow(r.dir, { epicHash: 'c4f4b8c9d1e2f3a6', storyId: 's1', repoPath: r.dir });
		return { story0, epic0, story1, story2, epic1, uncommitted };
	});
	await scenario('the receiving repository', async r => {
		r.put('README.md', 'x\n'); r.commit('first'); r.put('b.txt'); r.commit('second');
		const root = git(r.dir, 'rev-list', '--max-parents=0', 'HEAD');
		const empty = mkdtempSync(join(tmpdir(), 'handoff-scn-empty-'));
		git(empty, 'init', '-q', '-b', 'main');
		try {
			const registered = async () => [{ path: r.dir }, { path: empty }];
			return {
				same: await api.verifyReceivingRepo(r.dir, root, registered),
				differs: await api.verifyReceivingRepo(r.dir, 'f'.repeat(40), registered),
				anyId: await api.verifyReceivingRepo(r.dir, undefined, registered),
				noHistory: await api.verifyReceivingRepo(empty, root, registered),
				unregistered: await api.verifyReceivingRepo(r.dir, root, async () => []),
			};
		} finally { rmSync(empty, { recursive: true, force: true }); }
	});
	return out;
}
