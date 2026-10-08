/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S005 — the markdown port, the shared docs/ containment rule and the two handlers, over real temporary repositories. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { handleArtifactContent, resolveDocsMarkdown } from '../../artifact-content.js';
import { ARTIFACTS_DIR } from '../../storage.js';
import { buildWorkItemGraph } from '../graph.js';
import { loadArtifactRecordSet } from '../load.js';
import { handleDelivery, handleDeliveryEvidence } from '../handlers.js';
import { createMarkdownPort } from '../markdown.js';
import type { DeliveryEvidenceRecord, DeliverySnapshot } from '../types.js';

const EPIC = 'aaaaaaaaaaaaaaaa';
const CREATED = '2026-10-07T09:00:00.000Z';
const EPIC_FOLDER = 'docs/epics/my-epic-E20261007aaaaaaaa';

/** A temporary repo with the given files (objects are written as JSON). */
function repoWith(files: Readonly<Record<string, unknown>>): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-delivery-handlers-'));
	for (const [rel, value] of Object.entries(files)) {
		const abs = join(repo, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
	}
	return repo;
}

const store = (name: string): string => `${ARTIFACTS_DIR}/${name}`;

test("resolveDocsMarkdown keeps workflow.artifactContent's containment errors word for word", () => {
	const repo = repoWith({ 'docs/x/LLD.md': '# x\n', 'docs/x/notes.txt': 'n', 'outside.md': '# out\n' });
	try {
		symlinkSync(join(repo, 'outside.md'), join(repo, 'docs/x/leak.md'));
		const cases: readonly [string, string, string][] = [
			['../outside.md',     'outside-docs',   "workflow.artifactContent: mdPath must resolve under docs/ (got '../outside.md')"],
			['docs/x/notes.txt',  'not-md',         "workflow.artifactContent: mdPath must be a workflow artifact .md (got 'docs/x/notes.txt')"],
			['docs/x/missing.md', 'unreadable',     "workflow.artifactContent: cannot read 'docs/x/missing.md': "],
			['docs/x/leak.md',    'symlink-escape', "workflow.artifactContent: mdPath resolves outside docs/ via a symlink (got 'docs/x/leak.md')"],
		];
		for (const [mdPath, reason, message] of cases) {
			const located = resolveDocsMarkdown(repo, mdPath);
			assert.ok('reason' in located, `${mdPath} is refused`);
			assert.equal(located.reason, reason);
			const view = handleArtifactContent({ repo, mdPath }, undefined);
			assert.ok('error' in view);
			assert.ok(view.error.startsWith(message), `${mdPath}: ${view.error}`);
		}
		const ok = resolveDocsMarkdown(repo, 'docs/x/LLD.md');
		assert.ok('realPath' in ok && ok.realPath.endsWith('LLD.md'));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("a build record that stamps no epic slug or date is located through its work item's folder", () => {
	const repo = repoWith({
		[store(`DEF-${EPIC}.json`)]:       { meta: { epicHash: EPIC, epicSlug: 'my-epic', createdAt: CREATED, epicCreatedAt: CREATED }, body: { stories: [{ id: 's1', title: 'One' }] } },
		[store(`LLD-${EPIC}-s1.json`)]:    { meta: { epicHash: EPIC, epicSlug: 'my-epic', storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} },
		// The real BUILD shape: only epicHash, storyId and createdAt.
		[store(`BUILD-${EPIC}-s1.json`)]:  { meta: { epicHash: EPIC, storyId: 's1', createdAt: '2026-10-08T10:00:00.000Z' }, body: { tasks: [] } },
		[store(`AMD-${EPIC}-1.json`)]:     { id: `AMD-${EPIC}-1`, epicHash: EPIC, proposedAt: CREATED, status: 'pending', amendment: { type: 'storyBoundary.addStory', storyId: 's2' } },
		[store('BUILD-cccccccccccccccc-S001.json')]: { meta: { epicHash: 'cccccccccccccccc', storyId: 'S001', createdAt: CREATED, standalone: true }, body: { tasks: [] } },
		[`${EPIC_FOLDER}/DEF.md`]:         `<!-- insrc:artifact DEF-${EPIC} -->\n# Define\n`,
		[`${EPIC_FOLDER}/S001/LLD.md`]:    `<!-- insrc:artifact LLD-${EPIC}-s1 -->\n# LLD\n`,
		[`${EPIC_FOLDER}/S001/BUILD.md`]:  '# Build record\n\nNo marker on this older shape.\n',
		// s2's folder exists under the epic but has no LLD.md; its meta names another slug, where one does exist.
		[store(`LLD-${EPIC}-s2.json`)]:    { meta: { epicHash: EPIC, epicSlug: 'renamed', storyId: 's2', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} },
		[`${EPIC_FOLDER}/S002/PLAN.md`]:   '# not the LLD\n',
		['docs/epics/renamed-E20261007aaaaaaaa/S002/LLD.md']: `<!-- insrc:artifact LLD-${EPIC}-s2 -->\n# stale copy\n`,
		// A marker with trailing whitespace is not the record's marker line.
		[store(`HLD-${EPIC}.json`)]:       { meta: { epicHash: EPIC, epicSlug: 'my-epic', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} },
		[`${EPIC_FOLDER}/HLD.md`]:         `<!-- insrc:artifact HLD-${EPIC} --> \n# HLD\n`,
	});
	try {
		const set = loadArtifactRecordSet(repo);
		const port = createMarkdownPort(repo, buildWorkItemGraph(set));
		const rec = (id: string) => {
			const r = set.records.find(x => x.artifactId === id);
			assert.ok(r, id);
			return r;
		};
		assert.deepEqual(port.markdownOf(rec(`BUILD-${EPIC}-s1`)), { mdPath: join(repo, EPIC_FOLDER, 'S001', 'BUILD.md'), hasMarker: false });
		assert.deepEqual(port.markdownOf(rec(`LLD-${EPIC}-s1`)), { mdPath: join(repo, EPIC_FOLDER, 'S001', 'LLD.md'), hasMarker: true });
		assert.deepEqual(port.markdownOf(rec(`DEF-${EPIC}`)), { mdPath: join(repo, EPIC_FOLDER, 'DEF.md'), hasMarker: true });
		assert.equal(port.markdownOf(rec(`AMD-${EPIC}-1`)), null, 'an amendment has no rendered markdown');
		assert.equal(port.markdownOf(rec('BUILD-cccccccccccccccc-S001')), null, 'no folder and no file: null');
		assert.equal(port.markdownOf(rec(`LLD-${EPIC}-s2`)), null, 'a matching folder without the file does not fall back to the meta-derived path');
		assert.deepEqual(port.markdownOf(rec(`HLD-${EPIC}`)), { mdPath: join(repo, EPIC_FOLDER, 'HLD.md'), hasMarker: false }, 'the marker must be the whole first line');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

/** Every file under the repo with its size, mtime and content, so a write anywhere shows up. */
function treeOf(root: string): Map<string, string> {
	const out = new Map<string, string>();
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const abs = join(dir, entry.name);
			if (entry.isDirectory()) { walk(abs); continue; }
			const st = statSync(abs);
			out.set(abs, `${st.size}:${st.mtimeMs}:${readFileSync(abs, 'utf8')}`);
		}
	};
	walk(root);
	return out;
}

const git = (repo: string, ...args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

/** A small epic store: DEF, HLD, an approved LLD with marker, a marker-less BUILD and an AMD. */
function epicRepo(): string {
	return repoWith({
		[store(`DEF-${EPIC}.json`)]:      { meta: { epicHash: EPIC, epicSlug: 'my-epic', createdAt: CREATED, epicCreatedAt: CREATED, approvedAt: CREATED }, body: { epic: { title: 'My epic' }, stories: [{ id: 's1', title: 'One' }] } },
		[store(`HLD-${EPIC}.json`)]:      { meta: { epicHash: EPIC, epicSlug: 'my-epic', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} },
		[store(`LLD-${EPIC}-s1.json`)]:   { meta: { epicHash: EPIC, epicSlug: 'my-epic', storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} },
		[store(`BUILD-${EPIC}-s1.json`)]: { meta: { epicHash: EPIC, storyId: 's1', createdAt: '2026-10-08T10:00:00.000Z' }, body: { tasks: [{ id: 't1', passed: true }] } },
		[store(`AMD-${EPIC}-1.json`)]:    { id: `AMD-${EPIC}-1`, epicHash: EPIC, proposedAt: CREATED, status: 'pending', amendment: { type: 'storyBoundary.addStory', storyId: 's2' } },
		[`${EPIC_FOLDER}/DEF.md`]:        `<!-- insrc:artifact DEF-${EPIC} -->\n# Define\n`,
		[`${EPIC_FOLDER}/S001/LLD.md`]:   `<!-- insrc:artifact LLD-${EPIC}-s1 -->\n# LLD\n`,
		[`${EPIC_FOLDER}/S001/BUILD.md`]: '# Build record\n\nNo marker on this older shape.\n',
	});
}

test('workflow.delivery returns one timestamped snapshot and leaves the store, docs and git untouched', () => {
	const repo = epicRepo();
	try {
		git(repo, 'init', '-q');
		git(repo, 'add', '-A');
		git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'seed');
		const before = treeOf(repo);
		const head = git(repo, 'rev-parse', 'HEAD');

		const fromEnv = handleDelivery(undefined, repo, { now: () => '2026-10-08T12:00:00.000Z' });
		assert.ok(!('error' in fromEnv), JSON.stringify(fromEnv));
		const s: DeliverySnapshot = fromEnv;
		assert.equal(s.schemaVersion, 1);
		assert.equal(s.repo, repo);
		assert.equal(s.takenAt, '2026-10-08T12:00:00.000Z');
		assert.equal(s.recordCount, 5);
		assert.equal(s.unreadableCount, 0);
		const story = s.items.find(i => i.kind === 'story');
		assert.ok(story);
		const build = story.evidence.find(e => e.kind === 'BUILD');
		assert.deepEqual([build?.mdPath, build?.openWith], [join(repo, EPIC_FOLDER, 'S001', 'BUILD.md'), 'evidence-read']);
		const lld = story.evidence.find(e => e.kind === 'LLD');
		assert.deepEqual([lld?.mdPath, lld?.openWith], [join(repo, EPIC_FOLDER, 'S001', 'LLD.md'), 'review-view']);
		const epic = s.items.find(i => i.kind === 'epic');
		assert.deepEqual(epic?.amendments.map(a => a.amendmentId), [`AMD-${EPIC}-1`]);
		assert.deepEqual(JSON.parse(JSON.stringify(s)), s, 'plain JSON');

		const fromParams = handleDelivery({ repo }, '/nowhere', { now: () => '2026-10-08T12:00:00.000Z' });
		assert.deepEqual(fromParams, s, 'params.repo wins over INSRC_REPO');

		assert.deepEqual(treeOf(repo), before, 'no file under the repo changed');
		assert.equal(git(repo, 'status', '--porcelain'), '');
		assert.equal(git(repo, 'rev-parse', 'HEAD'), head);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('workflow.deliveryEvidence reads a marker-less build record through the daemon', () => {
	const repo = epicRepo();
	try {
		const before = treeOf(repo);
		const build = handleDeliveryEvidence({ repo, artifactId: `BUILD-${EPIC}-s1` }, undefined);
		assert.ok(!('error' in build), JSON.stringify(build));
		const rec: DeliveryEvidenceRecord = build;
		assert.equal(rec.kind, 'BUILD');
		assert.deepEqual(rec.meta, { epicHash: EPIC, storyId: 's1', createdAt: '2026-10-08T10:00:00.000Z' });
		assert.deepEqual(rec.body, { tasks: [{ id: 't1', passed: true }] });
		assert.equal(rec.renderedMarkdown, '# Build record\n\nNo marker on this older shape.\n', 'a marker-less file is still returned');

		const amd = handleDeliveryEvidence({ artifactId: `AMD-${EPIC}-1` }, repo);
		assert.ok(!('error' in amd), JSON.stringify(amd));
		assert.equal(amd.kind, 'AMD');
		assert.equal(amd.meta['status'], 'pending');
		assert.equal('amendment' in amd.meta, false);
		assert.deepEqual(amd.body, { type: 'storyBoundary.addStory', storyId: 's2' });
		assert.equal(amd.renderedMarkdown, null);

		const hld = handleDeliveryEvidence({ repo, artifactId: `HLD-${EPIC}` }, undefined);
		assert.ok(!('error' in hld));
		assert.equal(hld.renderedMarkdown, null, 'no HLD.md on disk');
		assert.deepEqual(treeOf(repo), before, 'nothing written');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('workflow.deliveryEvidence refuses an invalid or escaping id and reports a missing one', () => {
	const repo = epicRepo();
	const outside = mkdtempSync(join(tmpdir(), 'insrc-delivery-outside-'));
	try {
		writeFileSync(join(outside, 'secret.json'), JSON.stringify({ meta: { epicHash: EPIC }, body: 'secret' }));
		symlinkSync(join(outside, 'secret.json'), join(repo, store(`LLD-${EPIC}-s9.json`)));
		writeFileSync(join(repo, store(`PLAN-${EPIC}-s1.json`)), '{ not json');
		const ask = (artifactId: unknown) => handleDeliveryEvidence({ repo, artifactId } as { repo: string; artifactId: string }, undefined);
		for (const bad of [undefined, 42, '', '../DEF-aaaaaaaaaaaaaaaa', `DEF-${EPIC}/../x`, `DEF-${EPIC}.json`, 'LLD-zzzzzzzzzzzzzzzz-s1', `XYZ-${EPIC}`, `LLD-${EPIC}-s1/x`]) {
			assert.deepEqual(ask(bad), { error: 'invalid artifact id' }, String(bad));
		}
		assert.deepEqual(ask(`LLD-${EPIC}-s9`), { error: 'invalid artifact id' }, 'a symlink out of the store');
		assert.deepEqual(ask(`LLD-${EPIC}-s7`), { error: 'not found' });
		const broken = ask(`PLAN-${EPIC}-s1`);
		assert.ok('error' in broken && broken.error.startsWith(`workflow.deliveryEvidence: PLAN-${EPIC}-s1 cannot be read: `), JSON.stringify(broken));
		assert.deepEqual(handleDeliveryEvidence({ artifactId: `DEF-${EPIC}` }, undefined), { error: 'workflow.deliveryEvidence: `repo` is required' });
	} finally {
		rmSync(repo, { recursive: true, force: true });
		rmSync(outside, { recursive: true, force: true });
	}
});

test('an unresolved repo or an unreadable store is an error and an absent store is an empty snapshot', () => {
	assert.deepEqual(handleDelivery(undefined, undefined), { error: 'workflow.delivery: `repo` is required' });
	assert.deepEqual(handleDelivery({ repo: '' }, ''), { error: 'workflow.delivery: `repo` is required' });

	const unreadable = repoWith({ [ARTIFACTS_DIR]: 'a file where the store directory should be' });
	const empty = repoWith({ 'README.md': '# nothing here\n' });
	try {
		const failed = handleDelivery({ repo: unreadable }, undefined);
		assert.ok('error' in failed && failed.error.startsWith('workflow.delivery: delivery: artifact store at '), JSON.stringify(failed));

		const throwing = handleDelivery({ repo: empty }, undefined, { fs: { exists: () => true, listDir: () => { throw new Error('EACCES'); }, readFile: () => '' } });
		assert.ok('error' in throwing && /EACCES/.test(throwing.error));

		const s = handleDelivery({ repo: empty }, undefined);
		assert.ok(!('error' in s), JSON.stringify(s));
		assert.deepEqual([s.recordCount, s.unreadableCount, s.items, s.rootIds, s.notices], [0, 0, [], [], []]);
		assert.deepEqual(s.counts.items, { epic: 0, story: 0, task: 0, issue: 0 });
	} finally {
		rmSync(unreadable, { recursive: true, force: true });
		rmSync(empty, { recursive: true, force: true });
	}
});

test('a 1,000-record store forming 500 work items is served within 500 ms', () => {
	const files: Record<string, unknown> = {};
	for (let e = 0; e < 100; e++) {
		const hash = e.toString(16).padStart(8, '0').padEnd(16, 'a');
		const slug = `epic-${e}`;
		const folder = `docs/epics/${slug}-E20261007${hash.slice(0, 8)}`;
		const meta = { epicHash: hash, epicSlug: slug, createdAt: CREATED, epicCreatedAt: CREATED, approvedAt: CREATED };
		const stories = [1, 2, 3, 4].map(n => ({ id: `s${n}`, title: `Story ${n}` }));
		files[store(`DEF-${hash}.json`)] = { meta, body: { epic: { title: `Epic ${e}` }, stories } };
		files[store(`HLD-${hash}.json`)] = { meta, body: {} };
		files[`${folder}/DEF.md`] = `<!-- insrc:artifact DEF-${hash} -->\n# Define\n`;
		for (const { id } of stories) {
			const storyMeta = { ...meta, storyId: id };
			files[store(`LLD-${hash}-${id}.json`)] = { meta: storyMeta, body: {} };
			files[store(`PLAN-${hash}-${id}.json`)] = { meta: storyMeta, body: { tasks: [] } };
			files[`${folder}/S00${id.slice(1)}/LLD.md`] = `<!-- insrc:artifact LLD-${hash}-${id} -->\n# LLD\n`;
		}
	}
	const repo = repoWith(files);
	try {
		let best = Infinity;
		let snapshot: DeliverySnapshot | undefined;
		for (let run = 0; run < 3; run++) {
			const started = performance.now();
			const s = handleDelivery({ repo }, undefined);
			best = Math.min(best, performance.now() - started);
			assert.ok(!('error' in s), JSON.stringify(s));
			snapshot = s;
		}
		assert.ok(snapshot);
		assert.equal(snapshot.recordCount, 1000);
		assert.equal(snapshot.items.length, 500);
		assert.ok(snapshot.items.filter(i => i.kind === 'story').every(i => i.evidence.some(e => e.kind === 'LLD' && e.openWith === 'review-view')),
			'the real port found every LLD');
		assert.ok(best < 500, `best of three took ${Math.round(best)} ms`);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
