import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import { promises as fs, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, unlinkSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Each node:test file has its own process. Import app modules only after HOME isolation.
const fixture = mkdtempSync(join(tmpdir(), 'insrc-grep-protected-'));
const testHome = join(fixture, 'home');
const storeDir = join(testHome, '.insrc');
mkdirSync(storeDir, { recursive: true });
process.env['HOME'] = testHome;
const data = join(storeDir, 'graph.lmdb');
const lock = `${data}-lock`;
writeFileSync(data, 'PRIVATE_DATA_NEEDLE\n');
writeFileSync(lock, 'PRIVATE_LOCK_NEEDLE\n');
writeFileSync(join(storeDir, 'allowed.txt'), 'ALLOWED_NEEDLE\n');
const alias = join(fixture, 'store-alias');
symlinkSync(storeDir, alias);
const dataAlias = join(fixture, 'data-alias');
const lockAlias = join(fixture, 'lock-alias');
symlinkSync(data, dataAlias); symlinkSync(lock, lockAlias);
const marker = join(fixture, 'backend-started');
const sentinel = join(fixture, 'backend-sentinel');
writeFileSync(sentinel, `#!${process.execPath}\nimport('node:fs').then(fs => { fs.writeFileSync(${JSON.stringify(marker)}, 'started'); process.exitCode = 93; });\n`, { mode: 0o755 });
const { runGrepSearch, NODE_EXCLUDED_BY_RULE, RIPGREP_EXCLUDED_BY_RULE } = await import('../grep.js');
const { isLiveStoreFile } = await import('../../../../../db/graph/store.js');
const { runShell } = await import('../../../shell-helper.js');

after(() => rmSync(fixture, { recursive: true, force: true }));

async function withoutProtectedReads(work: () => Promise<void>): Promise<void> {
	let forbidden = 0;
	const original = fs.readFile;
	const spy = mock.method(fs, 'readFile', (...args: Parameters<typeof fs.readFile>) => {
		if (typeof args[0] === 'string' && isLiveStoreFile(args[0])) { forbidden++; throw new Error('protected read attempted'); }
		return original(...args);
	});
	try { await work(); assert.equal(forbidden, 0, 'protected contents must never be read'); }
	finally { spy.mock.restore(); }
	assert.equal(existsSync(marker), false, 'rg must not be spawned over a protected root');
}

test('Protected direct roots refuse before backend or content access', async () => {
	await withoutProtectedReads(async () => {
		for (const root of [data, lock, dataAlias, lockAlias]) for (const complete of [false, true]) {
			await assert.rejects(runGrepSearch({ root, pattern: 'NEEDLE', complete, _backend: { rgCommand: sentinel } }), /Refusing to touch/);
		}
	});
});

test('Store ancestor and directory aliases use guarded Node in bounded and complete modes', async () => {
	await withoutProtectedReads(async () => {
		for (const root of [storeDir, alias, testHome]) for (const complete of [false, true]) {
			for (const rgCommand of [sentinel, join(fixture, 'missing-rg')]) {
				const r = await runGrepSearch({ root, pattern: 'NEEDLE', complete, _backend: { rgCommand } });
				assert.equal(r.usedRipgrep, false); assert.equal(r.truncated, false);
				assert.equal(r.omitted.excludedByRule, NODE_EXCLUDED_BY_RULE);
				assert.equal(JSON.stringify(r).includes('PRIVATE_'), false);
				assert.equal(r.hits.length, root === testHome ? 0 : 1);
			}
		}
		// Only the lock target is beneath this root, independently of the data target.
		const outside = join(fixture, 'lock-only'); mkdirSync(outside);
		const target = join(outside, 'actual-lock'); writeFileSync(target, 'PRIVATE_LOCK_NEEDLE\n');
		writeFileSync(join(outside, 'allowed.txt'), 'ALLOWED_NEEDLE\n');
		unlinkSync(lock); symlinkSync(target, lock);
		const dataOutside = join(fixture, 'data-only'); mkdirSync(dataOutside);
		const dataTarget = join(dataOutside, 'actual-data'); writeFileSync(dataTarget, 'PRIVATE_DATA_NEEDLE\n');
		unlinkSync(data); symlinkSync(dataTarget, data);
		try {
			assert.equal(isLiveStoreFile(target), true);
			assert.equal(isLiveStoreFile(dataTarget), true);
			for (const complete of [false, true]) {
				for (const root of [data, lock, dataTarget, target, dataAlias, lockAlias]) {
					await assert.rejects(runGrepSearch({ root, pattern: 'NEEDLE', complete, _backend: { rgCommand: sentinel } }), /Refusing to touch/);
				}
				const r = await runGrepSearch({ root: outside, pattern: 'NEEDLE', complete, _backend: { rgCommand: sentinel } });
				assert.equal(r.usedRipgrep, false); assert.deepEqual(r.hits.map(h => h.text), ['ALLOWED_NEEDLE']);
				const d = await runGrepSearch({ root: dataOutside, pattern: 'NEEDLE', complete, _backend: { rgCommand: sentinel } });
				assert.equal(d.usedRipgrep, false); assert.deepEqual(d.hits, []);
			}
		} finally { unlinkSync(lock); writeFileSync(lock, 'PRIVATE_LOCK_NEEDLE\n'); unlinkSync(data); writeFileSync(data, 'PRIVATE_DATA_NEEDLE\n'); }
	});
});

test('Allowed roots retain real ripgrep without ambient configuration or symlink following', async () => {
	assert.equal((await runShell(['rg', '--version'], { timeoutMs: 5000 })).code, 0, 'real rg is required for this regression');
	const sibling = `${storeDir}-sibling`; mkdirSync(sibling);
	writeFileSync(join(sibling, 'graph.lmdb'), 'ALLOWED_DATA_NEEDLE\n');
	writeFileSync(join(sibling, 'graph.lmdb-lock'), 'ALLOWED_LOCK_NEEDLE\n');
	symlinkSync(storeDir, join(sibling, 'nested-alias'));
	const config = join(fixture, 'rg-config'); writeFileSync(config, '--follow\n');
	const previous = process.env['RIPGREP_CONFIG_PATH']; process.env['RIPGREP_CONFIG_PATH'] = config;
	try {
		for (const complete of [false, true]) {
			const r = await runGrepSearch({ root: sibling, pattern: 'NEEDLE', complete });
			assert.equal(r.usedRipgrep, true); assert.equal(r.omitted.excludedByRule, RIPGREP_EXCLUDED_BY_RULE);
			assert.deepEqual(r.hits.map(h => h.text).sort(), ['ALLOWED_DATA_NEEDLE', 'ALLOWED_LOCK_NEEDLE']);
			assert.equal(r.hits.some(h => resolve(sibling, h.path).includes('nested-alias')), false);
			const node = await runGrepSearch({ root: sibling, pattern: 'NEEDLE', complete, _backend: { rgCommand: join(fixture, 'missing-rg') } });
			assert.equal(node.usedRipgrep, false); assert.deepEqual(node.hits.map(h => h.text).sort(), r.hits.map(h => h.text).sort());
		}
	} finally { if (previous === undefined) delete process.env['RIPGREP_CONFIG_PATH']; else process.env['RIPGREP_CONFIG_PATH'] = previous; }
});
