/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S005 — the markdown port, the shared docs/ containment rule and the two handlers, over real temporary repositories. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { handleArtifactContent, resolveDocsMarkdown } from '../../artifact-content.js';
import { ARTIFACTS_DIR } from '../../storage.js';
import { buildWorkItemGraph } from '../graph.js';
import { loadArtifactRecordSet } from '../load.js';
import { createMarkdownPort } from '../markdown.js';

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
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
