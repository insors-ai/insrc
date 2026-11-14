import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { stageVerifiedBundle, measureBundleRuntime } = await import(new URL('../stage-daemon-bundle.mjs', import.meta.url).href);
const { sha256, verifyBundleManifest } = await import(new URL('../daemon-bundle-metadata.mjs', import.meta.url).href);

test('staging authenticates archive bytes and rejects links leaving the runtime', async () => {
	const dir = await realpath(await mkdtemp(join(tmpdir(), 'insrc-stage-test-')));
	try {
		const source = join(dir, 'source');
		const parent = join(dir, 'releases');
		const archive = join(dir, 'candidate.tar.gz');
		const active = join(dir, 'installed-selector');
		await writeFile(active, 'existing release');
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
		const manifestDigest = 'b'.repeat(64);
		const stage = (value: typeof manifest) => stageVerifiedBundle(archive, value, parent, manifestDigest);
		await assert.rejects(stage({ ...manifest, archiveSha256: '0'.repeat(64) }), /digest mismatch/);
		assert.deepEqual(await readdir(parent), []);
		const staged = await stage(manifest);
		assert.equal(staged.manifestSha256, manifestDigest);
		assert.equal(staged.archiveSha256, manifest.archiveSha256);
		assert.equal(await readFile(join(staged.root, 'out/daemon/current.js'), 'utf8'), 'daemon fixture');
		assert.equal(await measureBundleRuntime(staged.root), staged.fingerprint);
		await assert.rejects(stage({ ...manifest, runtimeFingerprint: '0'.repeat(64) } as typeof manifest),
			/signed fingerprint/);
		const checked = await stageVerifiedBundle(archive, { ...manifest, runtimeFingerprint: staged.fingerprint }, parent, manifestDigest);
		assert.equal(checked.fingerprint, staged.fingerprint);
		await rm(checked.root, { recursive: true });
		const releaseDir = join(dir, 'release-input');
		await mkdir(releaseDir);
		const archiveName = 'insrc-daemon-0.2.1-pilot.1-darwin-arm64.tar.gz';
		await writeFile(join(releaseDir, archiveName), await readFile(archive));
		await writeFile(join(releaseDir, 'candidate.json'), JSON.stringify({ ...manifest, archiveName,
			version: '0.2.1-pilot.1', target: 'darwin-arm64', nodeVersion: '22.22.1', minimumMacOS: '15.0',
			runtimeFingerprint: '0'.repeat(64) }));
		const compatibility = join(dir, 'compatibility.json');
		await writeFile(compatibility, JSON.stringify({ compatibility: { graphSchema: 1,
			formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' } }, predecessors: [] }));
		const { privateKey, publicKey } = generateKeyPairSync('ed25519');
		execFileSync(process.execPath, [new URL('../prepare-daemon-qualification.mjs', import.meta.url).pathname, releaseDir,
			manifest.commit, '1', compatibility], { env: { ...process.env, INSRC_QUALIFICATION_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() } });
		const signed = verifyBundleManifest(await readFile(join(releaseDir, 'manifest.json')),
			await readFile(join(releaseDir, 'manifest.qualification.sig')), 'qualification', publicKey.export({ type: 'spki', format: 'pem' }));
		assert.equal(signed.runtimeFingerprint, staged.fingerprint);
		await writeFile(staged.runtime, 'changed executable');
		assert.notEqual(await measureBundleRuntime(staged.root), staged.fingerprint);
		await symlink('../../../outside', join(source, 'out/daemon/escape'));
		await assert.rejects(stage(await archiveManifest()), /unsafe archive path/);
		await rm(join(source, 'out/daemon/escape'));
		await chmod(join(source, 'out/daemon/index.js'), 0o666);
		await assert.rejects(stage(await archiveManifest()), /unsupported archive entry/);
		await chmod(join(source, 'out/daemon/index.js'), 0o644);
		execFileSync('mkfifo', [join(source, 'out/daemon/pipe')]);
		await assert.rejects(stage(await archiveManifest()), /unsupported archive entry/);
		assert.equal((await readdir(parent)).length, 1);
		assert.equal(await readFile(active, 'utf8'), 'existing release');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
