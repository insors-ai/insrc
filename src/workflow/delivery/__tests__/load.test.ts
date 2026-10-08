/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S001 / t4 — loader, against temporary artifact stores on disk. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ARTIFACTS_DIR } from '../../storage.js';
import { loadArtifactRecordSet, nodeStoreFs } from '../load.js';
import { DeliveryStoreUnreadableError, type ReadonlyStoreFs } from '../types.js';
import { REAL_STORE } from './fixtures.js';

const NOW = () => '2026-10-07T12:00:00.000Z';

function storeRepo(files: Readonly<Record<string, unknown>>): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-delivery-load-'));
	const dir = join(repo, ARTIFACTS_DIR);
	mkdirSync(dir, { recursive: true });
	for (const [name, value] of Object.entries(files)) {
		writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
	}
	return repo;
}

/** Path, size, mtime and content hash of every file under `root`. */
function snapshotTree(root: string): string[] {
	const out: string[] = [];
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir).sort()) {
			const p = join(dir, name);
			const st = statSync(p);
			if (st.isDirectory()) { out.push(`${p}/`); walk(p); continue; }
			out.push(`${p} ${st.size} ${st.mtimeMs} ${createHash('sha256').update(readFileSync(p)).digest('hex')}`);
		}
	};
	walk(root);
	return out;
}

const SPEC = { meta: { specHash: '5555555555555555', createdAt: '2026-10-01T00:00:00.000Z' }, body: { title: 'A spec' } };
const DEF  = { meta: { epicHash: '1111111111111111', epicCreatedAt: '2026-10-01T00:00:00.000Z', seededFromSpec: '5555555555555555' }, body: {} };
const HLD  = { meta: { epicHash: '1111111111111111', epicCreatedAt: '2026-10-01T00:00:00.000Z', rejectedAt: '2026-10-02T00:00:00.000Z' }, body: {} };

test('every kind in a temporary store is lifted, AMD from its flat shape', () => {
	const repo = storeRepo({
		...REAL_STORE,
		'SPEC-5555555555555555.json': SPEC,
		'DEF-1111111111111111.json':  DEF,
		'HLD-1111111111111111.json':  HLD,
	});
	try {
		const set = loadArtifactRecordSet(repo, undefined, NOW);
		assert.equal(set.repo, repo);
		assert.equal(set.readAt, NOW());
		assert.deepEqual(set.failures, []);
		assert.equal(set.records.length, Object.keys(REAL_STORE).length + 3);
		const ids = set.records.map(r => r.artifactId);
		assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)));
		assert.deepEqual([...new Set(set.records.map(r => r.kind))].sort(),
			['AMD', 'BUILD', 'CR', 'DEF', 'EXT', 'HLD', 'ISSUE', 'LLD', 'PLAN', 'SPEC']);

		const byId = new Map(set.records.map(r => [r.artifactId, r]));
		assert.equal(byId.get('SPEC-5555555555555555')?.workItemHash, '5555555555555555');
		assert.equal(byId.get('ISSUE-0855311b6b32eb72')?.workItemHash, '0855311b6b32eb72');
		assert.equal(byId.get('DEF-1111111111111111')?.epicCreatedAt, '2026-10-01T00:00:00.000Z');
		assert.equal(byId.get('HLD-1111111111111111')?.approval.state, 'rejected');
		assert.equal(byId.get('PLAN-dfc0371b7200f5b5-s001')?.storyOrdinal, 1);

		const amd = byId.get('AMD-761a43a6fa645815-1');
		assert.ok(amd);
		assert.equal(amd.workItemHash, '761a43a6fa645815');
		assert.deepEqual(amd.approval, { state: 'approved', approvedAt: '2026-08-05T05:03:58.498Z', rejectedAt: null });
		assert.equal(amd.createdAt, '2026-08-05T04:47:34.061Z');
		assert.equal('amendment' in amd.meta, false);
		assert.equal(amd.meta['status'], 'approved');
		assert.deepEqual(amd.body, { type: 'storyBoundary.addStory', storyId: 's9', internal: "Private implementation of s9: Wait for a fresh index before grounding a Story's code review" });
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('invalid JSON, missing meta, unknown prefix and an unreadable file each become a load failure and the load continues', () => {
	const repo = storeRepo({
		'DEF-1111111111111111.json':  DEF,
		'LLD-1111111111111111-s1.json': '{ not json',
		'PLAN-1111111111111111-s1.json': { body: { tasks: [] } },
		'NOTE-1111111111111111.json': { meta: {} },
		'BUILD-1111111111111111-s1.json': { meta: { epicHash: '1111111111111111', storyId: 's1' }, body: { tasks: [] } },
		'README.md': '# not a record',
	});
	const unreadable = 'BUILD-1111111111111111-s1.json';
	const fs: ReadonlyStoreFs = {
		...nodeStoreFs,
		readFile: (path) => {
			if (path.endsWith(unreadable)) throw new Error('EACCES: permission denied');
			return nodeStoreFs.readFile(path);
		},
	};
	try {
		const set = loadArtifactRecordSet(repo, fs, NOW);
		assert.deepEqual(set.records.map(r => r.artifactId), ['DEF-1111111111111111']);
		assert.deepEqual(set.failures.map(f => [f.fileName, f.reason]), [
			['BUILD-1111111111111111-s1.json', 'unreadable'],
			['LLD-1111111111111111-s1.json', 'invalid-json'],
			['NOTE-1111111111111111.json', 'unknown-kind'],
			['PLAN-1111111111111111-s1.json', 'missing-meta'],
		]);
		assert.match(set.failures[0]?.detail ?? '', /EACCES/);
		// Every *.json file appears exactly once; non-JSON files are not store records.
		assert.equal(set.records.length + set.failures.length, 5);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('an absent store yields an empty record set', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-delivery-load-empty-'));
	try {
		const set = loadArtifactRecordSet(repo, undefined, NOW);
		assert.deepEqual(set, { repo, readAt: NOW(), records: [], failures: [] });
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('a store whose listDir throws raises DeliveryStoreUnreadableError', () => {
	const fs: ReadonlyStoreFs = {
		exists:   () => true,
		listDir:  () => { throw new Error('EACCES: permission denied'); },
		readFile: () => { throw new Error('not reached'); },
	};
	assert.throws(
		() => loadArtifactRecordSet('/repo', fs, NOW),
		(err: unknown) => err instanceof DeliveryStoreUnreadableError
			&& err.storePath === join('/repo', ARTIFACTS_DIR)
			&& /EACCES/.test(err.message),
	);
});

test('the store is byte-identical after a load', () => {
	const repo = storeRepo({ ...REAL_STORE, 'LLD-1111111111111111-s1.json': '{ not json' });
	try {
		const before = snapshotTree(repo);
		loadArtifactRecordSet(repo);
		assert.deepEqual(snapshotTree(repo), before);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('an unparseable storyId keeps storyIdRaw with storyOrdinal null', () => {
	const repo = storeRepo({
		'LLD-1111111111111111-x.json': { meta: { epicHash: '1111111111111111', storyId: 'x' }, body: {} },
	});
	try {
		const set = loadArtifactRecordSet(repo, undefined, NOW);
		assert.deepEqual(set.failures, []);
		const [lld] = set.records;
		assert.ok(lld);
		assert.equal(lld.storyIdRaw, 'x');
		assert.equal(lld.storyOrdinal, null);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
