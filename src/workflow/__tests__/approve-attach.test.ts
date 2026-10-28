/**
 * Approve-time attachment (s6): the approved document is attached after the check-in commit, so its link names that commit, and
 * the attachment records are committed in a second commit.
 *
 * Run: npx tsx --test src/workflow/__tests__/approve-attach.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { approve } from '../../cli/services/workflow.js';
import { _setAutoPushDepsForTests } from '../tracker-auto.js';
import { hldArtifactPaths, lldArtifactPaths, planArtifactPaths } from '../storage.js';
import { type TrackerExec } from '../tracker/github.js';
import { _setTrackerExecForTests } from '../tracker/__tests__/_legacy-table.js';
import { handleTrackerAttach } from '../../daemon/tracker-attach.js';
import { readAttachments } from '../tracker/binding.js';
import { stampOtherPartyReview } from './helpers/other-party-review.js';
import type { TrackerPort } from '../tracker/port.js';

import { HASH, CREATED, SLUG, fakeTracker, seed, teamPolicy } from './approve-fallback-kit.js';
import './helpers/converted-repos.js';

const git = (repo: string, ...args: string[]): string => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

/** git runs for real, `push` is a no-op, and nothing else (gh) is reached: the fake tracker answers for it. */
const realGitExec: TrackerExec = ((cmd: string, args: readonly string[], opts?: object) => {
	if (cmd === 'git' && args.includes('push')) return '';
	if (cmd === 'git') return execFileSync(cmd, [...args], { encoding: 'utf8', ...(opts as object) }) as string;
	return '';
}) as TrackerExec;

function repoWithGit(repo: string): void {
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'user.email', 't@example.com');
	git(repo, 'config', 'user.name', 'T');
	git(repo, 'remote', 'add', 'origin', 'https://github.com/acme/demo.git');
	git(repo, 'commit', '-q', '--allow-empty', '-m', 'init');
}

/** The fixtures carry no folder anchor; give each the Epic's creation time, as a stored record has. */
function anchorAll(repo: string): void {
	const dir = join(repo, '.insrc', 'artifacts');
	for (const name of readdirSync(dir).filter(n => n.endsWith('.json'))) {
		const p = join(dir, name);
		const doc = JSON.parse(readFileSync(p, 'utf8'));
		doc.meta.epicCreatedAt = CREATED;
		writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
	}
}

test('approve() attaches the approved HLD, LLD and plan documents after its commit so the files are clean and the links name that commit, commits the attachment records in a second commit, skips attachment with a stated reason when commitArtifacts is false, and tracker.attach attaches a diagram companion or any target refused as uncommitted once it is committed', async () => {
	const fx = seed({ pushTasks: false });
	try {
		repoWithGit(fx.repo); anchorAll(fx.repo);
		const t = fakeTracker();
		const attachCalls: string[] = [];
		(t.port as unknown as { attach: TrackerPort['attach'] }).attach = ((_issue: string, _ref: unknown, link: string) => { attachCalls.push(link); return { ok: true, value: { externalId: String(900 + attachCalls.length) } }; }) as TrackerPort['attach'];
		_setTrackerExecForTests(realGitExec);
		_setAutoPushDepsForTests({ policy: teamPolicy, port: t.port });

		// the fixtures' bodies are too thin to render; the rendered files are written as the renderer would leave them
		for (const p of [hldArtifactPaths(fx.repo, HASH, CREATED, 'epic', SLUG).md, lldArtifactPaths(fx.repo, HASH, 's1', CREATED, 'epic', SLUG).md, planArtifactPaths(fx.repo, HASH, 's1', CREATED, 'epic', SLUG).md]) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, `# ${p}\n`); }

		// HLD approval: the document is committed first, then linked at that commit
		stampOtherPartyReview(fx.hld);
		const epic = await approve(fx.hld);
		assert.equal(epic.commit?.committed, true, JSON.stringify(epic.commit));
		const hldMd = hldArtifactPaths(fx.repo, HASH, CREATED, 'epic', SLUG).md;
		const rel = hldMd.slice(fx.repo.length + 1);
		const sha = git(fx.repo, 'log', '-1', '--format=%H', '--', rel);
		assert.ok(epic.attach !== undefined && 'attached' in epic.attach, JSON.stringify(epic.attach));
		assert.deepEqual(attachCalls, [`https://github.com/acme/demo/blob/${sha}/${rel}`]);

		// the attachment record is committed in a second commit, and the work tree is clean
		assert.equal(epic.attachCommit?.committed, true, JSON.stringify(epic.attachCommit));
		assert.match(git(repo(fx), 'log', '-1', '--format=%s'), /record the attached documents/);
		assert.equal(git(fx.repo, 'status', '--porcelain', '--', rel), '');
		assert.equal(readAttachments(fx.repo, `EPIC-${HASH}`).length, 1);

		// LLD approval links the LLD to the Story's issue
		stampOtherPartyReview(fx.lld);
		const story = await approve(fx.lld);
		const lldRel = lldArtifactPaths(fx.repo, HASH, 's1', CREATED, 'epic', SLUG).md.slice(fx.repo.length + 1);
		assert.ok(story.attach !== undefined && 'attached' in story.attach && story.attach.attached.length === 1, JSON.stringify(story.attach));
		assert.match(attachCalls.at(-1) ?? '', new RegExp(`/blob/[0-9a-f]{40}/${lldRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));

		// plan approval links the plan to the Story's issue, at the commit that carries it
		stampOtherPartyReview(fx.plan);
		const planOut = await approve(fx.plan);
		const planRel = planArtifactPaths(fx.repo, HASH, 's1', CREATED, 'epic', SLUG).md.slice(fx.repo.length + 1);
		const planSha = git(fx.repo, 'log', '-1', '--format=%H', '--', planRel);
		assert.ok(planOut.attach !== undefined && 'attached' in planOut.attach, JSON.stringify(planOut.attach));
		assert.deepEqual(planOut.attach.attached, [`https://github.com/acme/demo/blob/${planSha}/${planRel}`]);
		assert.equal(git(fx.repo, 'status', '--porcelain', '--', planRel), '');

		// a diagram companion is refused while uncommitted, then attached through tracker.attach once committed
		const diagramRel = join(dirname(lldRel), 'sequence.html');
		const lldJson = JSON.parse(readFileSync(fx.lld, 'utf8'));
		lldJson.body.companions = [{ relPath: diagramRel }];
		writeFileSync(fx.lld, JSON.stringify(lldJson, null, 2) + '\n');
		mkdirSync(join(fx.repo, dirname(lldRel)), { recursive: true });
		writeFileSync(join(fx.repo, diagramRel), '<html></html>');
		const refused = await handleTrackerAttach({ repo: fx.repo, epicHash: HASH, unit: 'story', storyId: 's1', scope: 'documents' }, undefined);
		assert.ok('failed' in refused && refused.failed.some(f => f.target === diagramRel), JSON.stringify(refused));
		git(fx.repo, 'add', '--', diagramRel); git(fx.repo, 'commit', '-q', '-m', 'diagram');
		const done = await handleTrackerAttach({ repo: fx.repo, epicHash: HASH, unit: 'story', storyId: 's1', scope: 'documents' }, undefined);
		assert.ok('attached' in done && done.attached.some(l => l.endsWith(`/${diagramRel}`)), JSON.stringify(done));

		// no tracker or no binding: an error, nothing attempted
		assert.ok('error' in await handleTrackerAttach({ repo: fx.repo, epicHash: HASH, unit: 'story', storyId: 's9' }, undefined));
	} finally { fx.cleanup(); }

	// commitArtifacts false: nothing is committed, so nothing is linked, and the reason is stated
	const off = seed({ pushTasks: false });
	try {
		repoWithGit(off.repo); anchorAll(off.repo);
		const cfgPath = process.env['INSRC_GITHUB_CONFIG'] as string;
		writeFileSync(cfgPath, JSON.stringify({ repos: { [off.repo]: { type: 'github', owner: 'acme', repo: 'demo', pushTasks: false, commitArtifacts: false } } }));
		const t = fakeTracker();
		_setTrackerExecForTests(realGitExec);
		_setAutoPushDepsForTests({ policy: teamPolicy, port: t.port });
		stampOtherPartyReview(off.hld);
		const out = await approve(off.hld);
		assert.equal(out.commit, undefined);
		assert.deepEqual(out.attach, { skipped: 'attachments skipped: the artifacts are not committed' });
	} finally { off.cleanup(); }
});

const repo = (fx: { repo: string }): string => fx.repo;
