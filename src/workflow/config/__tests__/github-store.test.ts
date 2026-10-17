import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	MAX_WRITE_ATTEMPTS,
	mergeRepoEntryKeys,
	readRepoEntry,
	writeRepoEntryKeys,
} from '../github-store.js';
import type { StoreSeams } from '../github-store.js';

const REPO = '/work/repo';

function tmp(): string { return mkdtempSync(join(tmpdir(), 'insrc-gh-store-')); }

function fileAt(dir: string, content: string): string {
	const p = join(dir, 'github.json');
	writeFileSync(p, content);
	return p;
}

const realSeams: StoreSeams = {
	writeFile: (p, c) => writeFileSync(p, c, 'utf8'),
	rename: (a, b) => renameSync(a, b),
};

const tick = (): Promise<void> => new Promise(r => setImmediate(r));

test('readRepoEntry rejects each malformed level and accepts missing parts', () => {
	const dir = tmp();
	try {
		const bad: Array<[string, string, RegExp]> = [
			['invalid JSON', '{not json', /not valid JSON/],
			['null top level', 'null', /top level/],
			['array top level', '[]', /top level/],
			['primitive top level', '3', /top level/],
			['null default', '{"default":null}', /"default"/],
			['array default', '{"default":[]}', /"default"/],
			['primitive default', '{"default":"x"}', /"default"/],
			['null repos', '{"repos":null}', /"repos"/],
			['array repos', '{"repos":[]}', /"repos"/],
			['primitive repos', '{"repos":1}', /"repos"/],
			['null own entry (default complete)', `{"default":{"type":"github","owner":"o","repo":"r"},"repos":{"${REPO}":null}}`, /repos\["\/work\/repo"\]/],
			['array own entry', `{"repos":{"${REPO}":[]}}`, /repos\["\/work\/repo"\]/],
			['primitive own entry', `{"repos":{"${REPO}":true}}`, /repos\["\/work\/repo"\]/],
		];
		for (const [label, content, re] of bad) {
			const r = readRepoEntry(REPO, fileAt(dir, content));
			assert.equal(r.ok, false, label);
			if (!r.ok) {
				assert.equal(r.error.code, 'github-json-unreadable', label);
				assert.match(r.error.message, re, label);
			}
		}

		// A null entry for a different repo is not this repo's level.
		const other = readRepoEntry(REPO, fileAt(dir, '{"repos":{"/other":null}}'));
		assert.equal(other.ok, true);

		const missing = readRepoEntry(REPO, join(dir, 'absent.json'));
		assert.deepEqual(missing, { ok: true, file: {}, entry: undefined });

		const noDefault = readRepoEntry(REPO, fileAt(dir, '{}'));
		assert.equal(noDefault.ok && noDefault.entry, undefined);

		const full = readRepoEntry(REPO, fileAt(dir, `{"default":{"type":"none"},"repos":{"${REPO}":{"owner":"o"}}}`));
		assert.equal(full.ok, true);
		if (full.ok) assert.deepEqual(full.entry, { owner: 'o' });

		// An existing file behind an inaccessible parent directory is a read failure, not a missing file.
		if (typeof process.getuid === 'function' && process.getuid() !== 0) {
			const locked = join(dir, 'locked');
			mkdirSync(locked);
			writeFileSync(join(locked, 'github.json'), '{}\n');
			chmodSync(locked, 0o000);
			try {
				const r = readRepoEntry(REPO, join(locked, 'github.json'));
				assert.equal(r.ok, false);
				if (!r.ok) {
					assert.equal(r.error.code, 'github-json-unreadable');
					assert.match(r.error.message, /EACCES/);
				}
			} finally { chmodSync(locked, 0o700); }
		}

		// A directory in place of the file cannot be read.
		const asDir = readRepoEntry(REPO, dir);
		assert.equal(asDir.ok, false);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mergeRepoEntryKeys changes only the named keys', () => {
	const file = {
		default: { type: 'none' as const },
		repos: {
			[REPO]: { owner: 'o', repo: 'r', pushTasks: true, custom: 'keep' } as Record<string, unknown>,
			'/other': { owner: 'x' },
		},
		extra: 7,
	};
	const snapshot = JSON.stringify(file);

	const set = mergeRepoEntryKeys(file as never, REPO, { owner: 'o2', ghHost: 'h' });
	assert.equal(set.changed, true);
	assert.deepEqual(set.file.repos?.[REPO], { owner: 'o2', repo: 'r', pushTasks: true, custom: 'keep', ghHost: 'h' });
	assert.deepEqual(set.file.default, { type: 'none' });
	assert.deepEqual(set.file.repos?.['/other'], { owner: 'x' });
	assert.equal((set.file as Record<string, unknown>)['extra'], 7);
	assert.equal(JSON.stringify(file), snapshot, 'input is not mutated');

	const removed = mergeRepoEntryKeys(file as never, REPO, { pushTasks: null });
	assert.equal(removed.changed, true);
	assert.equal(Object.hasOwn(removed.file.repos?.[REPO] ?? {}, 'pushTasks'), false);

	const noop = mergeRepoEntryKeys(file as never, REPO, { ghPath: null });
	assert.equal(noop.changed, false);
	assert.equal(noop.file, file);

	const same = mergeRepoEntryKeys(file as never, REPO, { owner: 'o' });
	assert.equal(same.changed, false);

	const created = mergeRepoEntryKeys({}, REPO, { type: 'github' });
	assert.deepEqual(created.file, { repos: { [REPO]: { type: 'github' } } });

	const nothing = mergeRepoEntryKeys({}, REPO, { ghPath: null });
	assert.deepEqual(nothing.file, {});
	assert.equal(nothing.changed, false);
});

test('concurrent writes all land one at a time and a failure does not stall the queue', async () => {
	const dir = tmp();
	try {
		const path = join(dir, 'github.json');
		let active = 0;
		let maxActive = 0;
		const observed: StoreSeams = {
			writeFile: async (p, c) => {
				active++; maxActive = Math.max(maxActive, active);
				await tick();
				writeFileSync(p, c, 'utf8');
			},
			rename: async (a, b) => {
				await tick();
				renameSync(a, b);
				active--;
			},
		};
		const failing: StoreSeams = {
			writeFile: async () => { await tick(); throw new Error('injected write error'); },
			rename: observed.rename,
		};

		const keys = ['owner', 'repo', 'ghPath', 'ghHost', 'branchPattern'];
		const calls = keys.map((k, i) =>
			writeRepoEntryKeys(REPO, { [k]: `v-${k}` }, path, i === 2 ? failing : observed));
		const results = await Promise.all(calls);

		assert.equal(maxActive, 1, 'no two writes overlap');
		results.forEach((r, i) => assert.equal(r.ok, i !== 2, `call ${i}`));
		const bad = results[2];
		assert.ok(bad && !bad.ok && bad.error.code === 'write-failed');
		assert.match(bad.error.message, /injected write error/);

		const stored = JSON.parse(readFileSync(path, 'utf8')) as { repos: Record<string, Record<string, string>> };
		assert.deepEqual(stored.repos[REPO], { owner: 'v-owner', repo: 'v-repo', ghHost: 'v-ghHost', branchPattern: 'v-branchPattern' });

		// The queue still accepts work after the failure.
		const after = await writeRepoEntryKeys(REPO, { ghPath: '/usr/bin/gh' }, path, realSeams);
		assert.deepEqual(after, { ok: true, changed: true });
		assert.deepEqual(readdirSync(dir), ['github.json']);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('write-failed leaves the file and temp file as they were', async () => {
	const dir = tmp();
	try {
		const original = '{"repos":{"/work/repo":{"owner":"o"}}}\n';
		const path = fileAt(dir, original);

		const tempFails = await writeRepoEntryKeys(REPO, { repo: 'r' }, path, {
			writeFile: () => { throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }); },
			rename: realSeams.rename,
		});
		assert.ok(!tempFails.ok && tempFails.error.code === 'write-failed');
		assert.match(tempFails.error.message, /ENOSPC/);
		assert.equal(readFileSync(path, 'utf8'), original);
		assert.deepEqual(readdirSync(dir), ['github.json']);

		const renameFails = await writeRepoEntryKeys(REPO, { repo: 'r' }, path, {
			writeFile: realSeams.writeFile,
			rename: () => { throw new Error('EXDEV: cross-device link not permitted'); },
		});
		assert.ok(!renameFails.ok && renameFails.error.code === 'write-failed');
		assert.match(renameFails.error.message, /EXDEV/);
		assert.equal(readFileSync(path, 'utf8'), original);
		assert.deepEqual(readdirSync(dir), ['github.json']);

		// A structurally invalid file is refused and left untouched.
		const badPath = fileAt(dir, '{"repos":{"/work/repo":null}}');
		const refused = await writeRepoEntryKeys(REPO, { repo: 'r' }, badPath, realSeams);
		assert.ok(!refused.ok && refused.error.code === 'github-json-unreadable');
		assert.equal(readFileSync(badPath, 'utf8'), '{"repos":{"/work/repo":null}}');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('verify step re-merges after an outside change and returns file-changed after the bounded attempts', async () => {
	const dir = tmp();
	try {
		const path = fileAt(dir, '{"repos":{"/work/repo":{"owner":"o"}}}\n');

		// One outside change after the first temp write: the second attempt merges from the new content.
		let calls = 0;
		const once = await writeRepoEntryKeys(REPO, { repo: 'r' }, path, {
			...realSeams,
			afterTempWrite: (attempt) => {
				calls++;
				if (attempt === 1) writeFileSync(path, '{"repos":{"/work/repo":{"owner":"o","ghHost":"outside"}}}\n');
			},
		});
		assert.deepEqual(once, { ok: true, changed: true });
		assert.equal(calls, 2);
		const merged = JSON.parse(readFileSync(path, 'utf8')) as { repos: Record<string, Record<string, string>> };
		assert.deepEqual(merged.repos[REPO], { owner: 'o', ghHost: 'outside', repo: 'r' });
		assert.deepEqual(readdirSync(dir), ['github.json']);

		// A change on every attempt: file-changed, nothing written, no temp left.
		let n = 0;
		const outsideLast = (): string => `{"repos":{"/work/repo":{"owner":"o","counter":${n}}}}\n`;
		const always = await writeRepoEntryKeys(REPO, { ghPath: '/x' }, path, {
			...realSeams,
			afterTempWrite: () => { n++; writeFileSync(path, outsideLast()); },
		});
		assert.ok(!always.ok && always.error.code === 'file-changed');
		assert.equal(n, MAX_WRITE_ATTEMPTS);
		assert.equal(readFileSync(path, 'utf8'), outsideLast());
		assert.deepEqual(readdirSync(dir), ['github.json']);

		// A same-size outside change is still seen (content hash).
		const p2 = fileAt(dir, '{"repos":{"/work/repo":{"owner":"a"}}}\n');
		let first = true;
		const sameSize = await writeRepoEntryKeys(REPO, { repo: 'r' }, p2, {
			...realSeams,
			afterTempWrite: () => {
				if (first) { first = false; writeFileSync(p2, '{"repos":{"/work/repo":{"owner":"b"}}}\n'); }
			},
		});
		assert.deepEqual(sameSize, { ok: true, changed: true });
		const after = JSON.parse(readFileSync(p2, 'utf8')) as { repos: Record<string, Record<string, string>> };
		assert.deepEqual(after.repos[REPO], { owner: 'b', repo: 'r' });

		// A file that was missing and stays missing is unchanged.
		const fresh = join(dir, 'fresh.json');
		const created = await writeRepoEntryKeys(REPO, { type: 'github' }, fresh, realSeams);
		assert.deepEqual(created, { ok: true, changed: true });
		assert.deepEqual(JSON.parse(readFileSync(fresh, 'utf8')), { repos: { [REPO]: { type: 'github' } } });
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unwritable directory returns write-failed with the operating-system message', async () => {
	const dir = tmp();
	try {
		// Missing directory: the temp file cannot be created.
		const missing = await writeRepoEntryKeys(REPO, { owner: 'o' }, join(dir, 'nope', 'github.json'));
		assert.ok(!missing.ok && missing.error.code === 'write-failed');
		assert.match(missing.error.message, /ENOENT/);

		// Read-only directory (not testable as root).
		if (typeof process.getuid === 'function' && process.getuid() !== 0) {
			const ro = join(dir, 'ro');
			mkdirSync(ro);
			writeFileSync(join(ro, 'github.json'), '{}\n');
			chmodSync(ro, 0o500);
			try {
				const r = await writeRepoEntryKeys(REPO, { owner: 'o' }, join(ro, 'github.json'));
				assert.ok(!r.ok && r.error.code === 'write-failed');
				assert.match(r.error.message, /EACCES/);
				assert.equal(readFileSync(join(ro, 'github.json'), 'utf8'), '{}\n');
			} finally { chmodSync(ro, 0o700); }
		}
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
