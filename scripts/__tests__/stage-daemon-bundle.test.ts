import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { stageVerifiedBundle, measureBundleRuntime } = await import(new URL('../stage-daemon-bundle.mjs', import.meta.url).href);
const { sha256 } = await import(new URL('../daemon-bundle-metadata.mjs', import.meta.url).href);

test('staging authenticates archive bytes and rejects links leaving the runtime', async () => {
	const dir = await realpath(await mkdtemp(join(tmpdir(), 'insrc-stage-test-')));
	try {
		const source = join(dir, 'source');
		const parent = join(dir, 'releases');
		const archive = join(dir, 'candidate.tar.gz');
		await mkdir(join(source, 'out/daemon'), { recursive: true });
		await mkdir(join(source, 'tools'));
		await mkdir(parent, { mode: 0o700 });
		await writeFile(join(source, 'tools/node'), 'fake executable', { mode: 0o700 });
		await writeFile(join(source, 'out/daemon/index.js'), 'daemon fixture');
		await symlink('index.js', join(source, 'out/daemon/current.js'));
		const archiveManifest = async () => {
			execFileSync('tar', ['--format', 'ustar', '-czf', archive, '-C', source, 'out', 'tools']);
			const bytes = await readFile(archive);
			return { archiveBytes: bytes.length, archiveSha256: sha256(bytes), commit: 'a'.repeat(40) };
		};
		const manifest = await archiveManifest();
		await assert.rejects(stageVerifiedBundle(archive, { ...manifest, archiveSha256: '0'.repeat(64) }, parent), /digest mismatch/);
		assert.deepEqual(await readdir(parent), []);
		const staged = await stageVerifiedBundle(archive, manifest, parent);
		assert.equal(await readFile(join(staged.root, 'out/daemon/current.js'), 'utf8'), 'daemon fixture');
		assert.equal(await measureBundleRuntime(staged.root), staged.fingerprint);
		await writeFile(staged.runtime, 'changed executable');
		assert.notEqual(await measureBundleRuntime(staged.root), staged.fingerprint);
		await symlink('../../../outside', join(source, 'out/daemon/escape'));
		await assert.rejects(stageVerifiedBundle(archive, await archiveManifest(), parent), /unsafe archive path/);
		assert.equal((await readdir(parent)).length, 1);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
