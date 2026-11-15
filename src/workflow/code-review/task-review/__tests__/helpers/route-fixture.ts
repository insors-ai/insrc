import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RegistryReviewSources } from '../../sources.js';
import type { ReviewPacket } from '../../contracts.js';
import { CodePreparation } from '../../../../review/code-preparation.js';
import { reviewPreparationLimits } from '../../../../../config/review.js';
import { ReviewPreparationCapacity } from '../../../../review/source-session.js';
export const ISSUE_ONLY = '1111111111111111', LLD_ONLY = '2222222222222222', PLAN_STORY = '3333333333333333', NO_BUILD = '4444444444444444', BUILD_ONLY = '6666666666666666', DEF_STORY = '7777777777777777';
export const artifact = (name: string) => `.insrc/artifacts/${name}.json`;

/** A repository with four Stories on different routes, their artifacts committed and stored in .insrc/artifacts. */
export function routeFixture() {
	const repo = realpathSync(mkdtempSync(join(tmpdir(), 'task-review-route-admission-')));
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
	git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
	const put = (path: string, value: unknown) => { mkdirSync(join(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), typeof value === 'string' ? value : JSON.stringify(value)); };
	const build = (hash: string) => put(artifact(`BUILD-${hash}-s1`), { meta: { epicHash: hash, storyId: 's1' }, body: { focus: 'Change the behaviour', tasks: [{ id: 's1', passed: true }] } });
	const lld = (hash: string) => put(artifact(`LLD-${hash}-s1`), { meta: { epicHash: hash, storyId: 's1', workflow: 'design.story' }, body: {} });
	put(artifact(`ISSUE-${ISSUE_ONLY}`), { meta: { workflow: 'issue', issueHash: ISSUE_ONLY }, body: { title: 'Defect', fixIntent: 'Fix it' } }); build(ISSUE_ONLY);
	lld(LLD_ONLY); build(LLD_ONLY);
	lld(PLAN_STORY); build(PLAN_STORY);
	const plan = (hash: string) => put(artifact(`PLAN-${hash}-s1`), { meta: { epicHash: hash, storyId: 's1', workflow: 'plan' }, body: { tasks: [{ id: 't1', title: 'T', summary: 'S', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['Holds'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'N' }] }] }, citations: [{ id: 'c1', kind: 'stakeholder', ref: 'Fixture' }] });
	plan(PLAN_STORY);
	build(BUILD_ONLY); // a trivial Story: a BUILD and nothing else
	lld(DEF_STORY); plan(DEF_STORY); build(DEF_STORY); // an epic Story: its epic has a DEF
	put(artifact(`DEF-${DEF_STORY}`), { meta: { epicHash: DEF_STORY, workflow: 'define' }, body: { stories: [{ id: 's1' }] } });
	put(artifact(`ISSUE-${NO_BUILD}`), { meta: { workflow: 'issue', issueHash: NO_BUILD }, body: { title: 'Defect', fixIntent: 'Fix it' } });
	put('src/a.ts', 'first\nsecond\n');
	git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
	put('src/a.ts', 'FIRST\nsecond\n');
	git('add', '.'); git('commit', '-qm', 'change'); const commit = git('rev-parse', 'HEAD');
	const at = (name: string) => ({ path: artifact(name), commit: base });
	const packetWith = (documents: ReviewPacket['documents']): ReviewPacket => ({
		reviewRevision: commit, storyId: 's1', functionalSummary: 'Change behaviour', documents,
		reviewSet: [{ commit, parent: base, files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }], tests: [],
	});
	const sources = new RegistryReviewSources({ repoPath: repo, sessionId: 'task-review-route-admission', requestId: 1, send: () => {} });
	const admit = async (packet: ReviewPacket, epicHash: string, id = 'review-1') => {
  const limits = reviewPreparationLimits(join(repo, 'missing-config.json')), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
  const preparation = await CodePreparation.create({ project: repo, family: 'code', reviewId: id }, sources, limits, capacity);
  try { return await preparation.prepare(repo, id, 1, packet, 'daemon', sources, { epicHash }); }
  finally { await preparation.close(); }
 };
	return { repo, at, packetWith, sources, admit, git, put, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}
