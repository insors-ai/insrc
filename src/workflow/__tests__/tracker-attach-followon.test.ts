/**
 * The BUILD approval's attach follow-on (s6): the Story's build, review and test records go to its issue, each link naming the
 * commit that last touched the file, and nothing is committed on the way.
 *
 * Run: npx tsx --test src/workflow/__tests__/tracker-attach-followon.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { followOnTrackerAttach } from '../../daemon/tracker-attach.js';
import { _setAutoPushDepsForTests } from '../tracker-auto.js';
import { artifactJsonPath, buildArtifactId, buildArtifactPaths, codeReviewArtifactPaths, testsArtifactPaths } from '../storage.js';
import { ensureUnitIssueDetailed } from '../tracker/unit-issue.js';
import { readAttachments } from '../tracker/binding.js';
import type { TrackerPort } from '../tracker/port.js';

import { HASH, CREATED, SLUG, fakeTracker, seed, teamPolicy } from './approve-fallback-kit.js';

const git = (repo: string, ...args: string[]): string => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

function setup() {
	const fx = seed({ pushTasks: false });
	git(fx.repo, 'init', '-q', '-b', 'main');
	git(fx.repo, 'config', 'user.email', 't@example.com');
	git(fx.repo, 'config', 'user.name', 'T');
	git(fx.repo, 'remote', 'add', 'origin', 'https://github.com/acme/demo.git');
	const t = fakeTracker();
	const links: string[] = [];
	(t.port as unknown as { attach: TrackerPort['attach'] }).attach = ((_i: string, _r: unknown, link: string) => { links.push(link); return { ok: true, value: { externalId: String(900 + links.length) } }; }) as TrackerPort['attach'];
	_setAutoPushDepsForTests({ policy: teamPolicy, port: t.port });
	// every record carries the folder anchor a stored one has
	for (const name of ['DEF-', 'HLD-', 'LLD-', 'PLAN-']) {
		for (const f of execFileSync('ls', [join(fx.repo, '.insrc', 'artifacts')], { encoding: 'utf8' }).split('\n').filter(n => n.startsWith(name))) {
			const p = join(fx.repo, '.insrc', 'artifacts', f);
			const doc = JSON.parse(readFileSync(p, 'utf8')); doc.meta.epicCreatedAt = CREATED; writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
		}
	}
	assert.equal(ensureUnitIssueDetailed({ unit: 'epic', repoPath: fx.repo, epicHash: HASH }, t.port).ok, true);
	assert.equal(ensureUnitIssueDetailed({ unit: 'story', repoPath: fx.repo, epicHash: HASH, storyId: 's1' }, t.port).ok, true);
	const buildJson = artifactJsonPath(fx.repo, buildArtifactId(HASH, 's1'));
	writeFileSync(buildJson, JSON.stringify({ meta: { workflow: 'build', repoPath: fx.repo, epicHash: HASH, storyId: 's1', epicSlug: SLUG, epicCreatedAt: CREATED, createdAt: CREATED, revision: 1 }, body: {} }) + '\n');
	const mds = {
		build: buildArtifactPaths(fx.repo, HASH, 's1', CREATED, 'epic', SLUG).md,
		review: codeReviewArtifactPaths(fx.repo, HASH, 's1', CREATED, 'epic', SLUG).md,
		tests: testsArtifactPaths(fx.repo, HASH, 's1', CREATED, 'epic', SLUG).md,
	};
	for (const p of Object.values(mds)) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, `# ${p}\n`); }
	const rel = (p: string): string => p.slice(fx.repo.length + 1);
	return { fx, links, mds, buildJson, rel };
}
const approvedOf = (path: string) => [{ path, result: {} as never }];

test('the BUILD approval\'s follow-on attaches the build, review and test records that git reports clean and reports the dirty ones, and the daemon workflow.approve commits nothing', () => {
	const { fx, links, mds, buildJson, rel } = setup();
	try {
		git(fx.repo, 'add', '--', rel(mds.build), rel(mds.review), rel(mds.tests)); git(fx.repo, 'commit', '-q', '-m', 'records');
		writeFileSync(mds.tests, '# tests, changed after the commit\n');   // dirty
		const head = git(fx.repo, 'rev-parse', 'HEAD');
		const out = followOnTrackerAttach(approvedOf(buildJson), fx.repo);
		assert.equal(out.length, 1);
		assert.equal(out[0]?.kind, 'tracker-attach');
		assert.equal(out[0]?.ok, false, 'a dirty record is reported, so the follow-on is not ok');
		assert.equal(out[0]?.attach?.attached.length, 2, 'the build and review records');
		assert.deepEqual(out[0]?.attach?.failed.map(f => f.target), [rel(mds.tests)]);
		assert.equal(links.length, 2);
		assert.equal(git(fx.repo, 'rev-parse', 'HEAD'), head, 'nothing was committed');
		assert.equal(git(fx.repo, 'status', '--porcelain', '--', rel(mds.tests)).startsWith('M'), true, 'the dirty file is left as it was');
		// an approval that is not a BUILD fires nothing
		assert.deepEqual(followOnTrackerAttach(approvedOf(fx.lld), fx.repo), []);
	} finally { fx.cleanup(); }
});

test('the design document, plan and build, review and test records are attached to the unit\'s issue with a link per revision', () => {
	const { fx, links, mds, buildJson, rel } = setup();
	try {
		git(fx.repo, 'add', '--', rel(mds.build), rel(mds.review), rel(mds.tests)); git(fx.repo, 'commit', '-q', '-m', 'records');
		followOnTrackerAttach(approvedOf(buildJson), fx.repo);
		assert.equal(links.length, 3);
		const first = readAttachments(fx.repo, `LLD-${HASH}-s1`);
		assert.deepEqual(first.map(a => a.target.fragment).sort(), [rel(mds.build), rel(mds.review), rel(mds.tests)].sort());

		// a second approval of unchanged records posts nothing; a new revision of the build record gets its own link and keeps the first
		followOnTrackerAttach(approvedOf(buildJson), fx.repo);
		assert.equal(links.length, 3);
		const doc = JSON.parse(readFileSync(buildJson, 'utf8')); doc.meta.revision = 2; writeFileSync(buildJson, JSON.stringify(doc) + '\n');
		writeFileSync(mds.build, '# build, revision 2\n'); git(fx.repo, 'add', '--', rel(mds.build)); git(fx.repo, 'commit', '-q', '-m', 'build r2');
		followOnTrackerAttach(approvedOf(buildJson), fx.repo);
		assert.equal(links.length, 4);
		assert.equal(readAttachments(fx.repo, `LLD-${HASH}-s1`).filter(a => a.target.fragment === rel(mds.build)).length, 2, 'one link per revision');
	} finally { fx.cleanup(); }
});
