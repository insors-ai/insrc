/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Epic built-state digest (ISSUE-1b3caadf04023d33, s1/t2), over temporary Epic records.
 *
 * Run: npx tsx --test src/workflow/__tests__/epic-built-state-digest.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	EPIC_IMPACT_FIRST_ACTION,
	EPIC_IMPACT_LABEL,
	buildEpicBuiltStateDigest,
	renderEpicBuiltStateDigest,
} from '../epic-built-state.js';
import { ARTIFACTS_DIR, artifactJsonPath, buildArtifactId, defineArtifactId, lldArtifactId } from '../storage.js';
import { approvedMeta, draftMeta, writeHead } from './lifecycle-fixtures.js';

const HASH = 'c1d2e3f4a5b6c7d8';

function repoWith(storyIds: readonly string[]): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-digest-'));
	writeHead(repo, defineArtifactId(HASH), {
		meta: { workflow: 'define', epicHash: HASH, epicSlug: 'x', createdAt: '2026-01-01T00:00:00.000Z', epicCreatedAt: '2026-01-01T00:00:00.000Z', ...approvedMeta() },
		body: { flavor: 'new-capability', problem: 'p', nonGoals: [], assumptions: [], constraints: [], stories: storyIds.map(id => ({ id, title: `Title ${id}`, userValue: 'v', acceptanceCriteria: [] })), openQuestions: [] },
		citations: [],
	});
	return repo;
}

function build(repo: string, id: string, opts: { approved?: boolean; summary?: string; files?: string[]; at?: string } = {}): void {
	writeHead(repo, buildArtifactId(HASH, id), {
		meta: { workflow: 'build', epicHash: HASH, createdAt: opts.at ?? '2026-02-01T00:00:00.000Z', ...(opts.approved === false ? draftMeta() : approvedMeta()) },
		body: {
			summary: opts.summary ?? `built ${id}`,
			tasks: [{ id: 't1', passed: true }],
			changeLog: (opts.files ?? [`src/${id}.ts`]).map(file => ({ target: { file }, author: 'a', timestamp: 't' })),
		},
		citations: [],
	});
}

function lld(repo: string, id: string, names: string[]): void {
	writeHead(repo, lldArtifactId(HASH, id), {
		meta: { workflow: 'design.story', epicHash: HASH, ...approvedMeta() },
		body: { contractDetails: { api: names.map(name => ({ name })) } },
		citations: [],
	});
}

const clean = (repo: string): void => rmSync(repo, { recursive: true, force: true });

test('epic-built-state-digest.test.ts: buildEpicBuiltStateDigest returns null for a standalone Story, for an Epic\'s first Story and for an Epic with no other Story that has an approved BUILD, and otherwise lists the other Stories in the Define\'s order without the Story at hand', () => {
	const standalone = mkdtempSync(join(tmpdir(), 'insrc-digest-'));
	const repo = repoWith(['s1', 's2', 's3']);
	try {
		assert.equal(buildEpicBuiltStateDigest(standalone, HASH, 's1'), null, 'no Define');
		assert.equal(buildEpicBuiltStateDigest(repo, HASH, 's1'), null, 'first Story, nothing built');
		build(repo, 's2', { approved: false });
		assert.equal(buildEpicBuiltStateDigest(repo, HASH, 's3'), null, 'an unapproved BUILD does not count');
		writeFileSync(artifactJsonPath(repo, buildArtifactId(HASH, 's1')), '{ not json');
		assert.equal(buildEpicBuiltStateDigest(repo, HASH, 's3'), null, 'an unreadable BUILD alone does not make a digest');
		build(repo, 's3'); build(repo, 's2'); build(repo, 's1');
		assert.equal(buildEpicBuiltStateDigest(repo, HASH, 's1'), null, "the Define's first Story is never given a digest, even when later Stories are built");
		const d = buildEpicBuiltStateDigest(repo, HASH, 's2');
		assert.ok(d);
		assert.deepEqual(d.stories.map(s => s.storyId), ['s1', 's3'], "the Define's order, without the Story at hand");
		assert.deepEqual(d.stories[0]!.changedFiles, ['src/s1.ts']);
		assert.equal(d.stories[0]!.buildSummary, 'built s1');
	} finally { clean(standalone); clean(repo); }
});

test('epic-built-state-digest.test.ts: a Story whose BUILD or TESTS record is missing or malformed, or whose commits cannot be listed, is listed with a note naming what was unreadable, the other Stories are still digested, and the builder never throws', () => {
	const repo = repoWith(['s1', 's2', 's3', 's4']);
	try {
		build(repo, 's1'); build(repo, 's2');
		writeFileSync(join(repo, ARTIFACTS_DIR, `TESTS-${HASH}-s2.json`), '{ not json');
		writeFileSync(artifactJsonPath(repo, buildArtifactId(HASH, 's3')), '{ not json');
		build(repo, 's4', { files: [] });
		writeFileSync(artifactJsonPath(repo, buildArtifactId(HASH, 's3')), '[1]');   // parses, but is not a record
		const d = buildEpicBuiltStateDigest(repo, HASH, 's9');
		assert.ok(d);
		const byId = Object.fromEntries(d.stories.map(s => [s.storyId, s]));
		assert.match(byId['s2']!.note ?? '', /TESTS record unreadable/);
		assert.match(byId['s3']!.note ?? '', /BUILD record unreadable/);
		assert.match(byId['s1']!.note ?? '', /TESTS record missing/);
		assert.match(byId['s4']!.note ?? '', /files this Story changed are not recorded/);
		assert.equal(byId['s1']!.buildSummary, 'built s1', 'the others are still digested');
		// a reader that always throws still does not throw out of the builder
		assert.doesNotThrow(() => buildEpicBuiltStateDigest(repo, HASH, 's9', { readJson: () => { throw new Error('boom'); } }));
	} finally { clean(repo); }
});

test('epic-built-state-digest.test.ts: the newest Stories are in full and older ones are a summary line and a path, the rendered text never exceeds the total cap, and truncated says how many Stories were reduced', () => {
	const ids = ['s1', 's2', 's3', 's4', 's5'];
	const repo = repoWith([...ids, 's6']);
	try {
		ids.forEach((id, i) => build(repo, id, { at: `2026-02-0${i + 1}T00:00:00.000Z`, summary: `summary of ${id}\n${'detail '.repeat(300)}`, files: Array.from({ length: 60 }, (_, k) => `src/${id}/f${k}.ts`) }));
		lld(repo, 's5', ['Alpha', 'Beta']);
		const d = buildEpicBuiltStateDigest(repo, HASH, 's6', { fullStories: 2 });
		assert.ok(d);
		assert.deepEqual(d.truncated, { reducedStories: 3, omittedStories: 0 });
		assert.deepEqual(d.stories.filter(s => s.detail === 'full').map(s => s.storyId), ['s4', 's5'], 'the newest are in full');
		const text = renderEpicBuiltStateDigest(d);
		assert.match(text, /- s1 — Title s1: summary of s1 \(records: `[^`]*BUILD-/);
		assert.match(text, /Contracts its LLD names: `Alpha`, `Beta`/);
		const capped = buildEpicBuiltStateDigest(repo, HASH, 's6', { fullStories: 5, totalChars: 900 });
		assert.ok(capped && capped.truncated !== null && capped.truncated.reducedStories >= 3, 'the builder reports reductions made to fit the total cap');
		assert.ok(renderEpicBuiltStateDigest(capped).length <= 900, 'the renderer keeps to the cap the digest was built with');
		assert.ok(buildEpicBuiltStateDigest(repo, HASH, 's6', { totalChars: 700 })?.caps.totalChars === 700);
		const tiny = buildEpicBuiltStateDigest(repo, HASH, 's6', { totalChars: 700 });
		assert.ok(tiny && tiny.truncated !== null && tiny.truncated.omittedStories > 0 && tiny.stories.length < 5, 'older Stories are left out and counted');
		assert.match(renderEpicBuiltStateDigest(tiny), /more left out to stay within the size cap/, 'the render still says Stories were left out');
		for (const cap of [0, 1, 400, 900, 3000]) {
			const t = renderEpicBuiltStateDigest(d, { totalChars: cap });
			assert.ok(t.length <= cap, `cap ${cap}: ${t.length}`);
		}
		assert.match(renderEpicBuiltStateDigest(d, { totalChars: 700 }), /more left out to stay within the size cap/, 'Stories dropped, not cut mid-text');
		assert.equal(buildEpicBuiltStateDigest(repo, HASH, 's6')?.truncated?.reducedStories, 2, 'the default of 3 full Stories reduces the other 2 of 5');
	} finally { clean(repo); }
});

test('epic-built-state-digest.test.ts: renderEpicBuiltStateDigest renders the same digest to the same text and a null digest to one line that says the analysis does not apply and why', () => {
	const repo = repoWith(['s1', 's2']);
	try {
		build(repo, 's1');
		const before = readdirSync(join(repo, ARTIFACTS_DIR)).sort();
		const a = renderEpicBuiltStateDigest(buildEpicBuiltStateDigest(repo, HASH, 's2'));
		const b = renderEpicBuiltStateDigest(buildEpicBuiltStateDigest(repo, HASH, 's2'));
		assert.equal(a, b);
		assert.deepEqual(readdirSync(join(repo, ARTIFACTS_DIR)).sort(), before, 'reads only');
		const none = renderEpicBuiltStateDigest(null);
		assert.equal(none.split('\n').length, 1);
		assert.match(none, /does not apply/);
		assert.match(none, /standalone|first Story|no other Story/);
		assert.equal(EPIC_IMPACT_LABEL, 'Epic impact:');
		assert.ok(EPIC_IMPACT_FIRST_ACTION.includes(EPIC_IMPACT_LABEL));
	} finally { clean(repo); }
});
