import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { load } from 'js-yaml';

const { checkPromotion } = await import(new URL('../promote-daemon-candidate.mjs', import.meta.url).href);
const { sha256, manifestSigningBytes, QUALIFICATION_TESTS } = await import(new URL('../daemon-bundle-metadata.mjs', import.meta.url).href);

test('promotion admits only the approved manifest, archive and local evidence', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'insrc-promote-test-'));
	try {
		const recordDir = join(dir, 'record');
		const artifactDir = join(dir, 'artifact');
		await mkdir(recordDir);
		await mkdir(artifactDir);
		const repository = 'insors-ai/insrc';
		const archive = Buffer.from('archive fixture');
		const archiveSha256 = sha256(archive);
		const build = { version: '0.2.1-pilot.1', commit: 'a'.repeat(40), target: 'darwin-arm64', minimumMacOS: '15.0',
			nodeVersion: '22.22.1', archiveName: 'insrc-daemon-0.2.1-pilot.1-darwin-arm64.tar.gz',
			archiveSha256, archiveBytes: archive.length };
		const manifest = Buffer.from(JSON.stringify({ ...build, schemaVersion: 1, channel: 'macos-arm64-pilot',
			sequence: 1, compatibility: { graphSchema: 1, formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' } },
			predecessors: [] }));
		const key = generateKeyPairSync('ed25519');
		const qualificationKey = key.publicKey.export({ format: 'pem', type: 'spki' });
		const log = Buffer.from('local fixture passed');
		await writeFile(join(recordDir, 'qualification.v1.json'), JSON.stringify({
			schemaVersion: 1, qualifiedAt: '2026-11-14T07:00:00Z', host: { macOSVersion: '15.0', arch: 'arm64', nodeVersion: build.nodeVersion },
			candidate: { repository, commit: build.commit, version: build.version, target: build.target, runId: '123', artifactId: '456',
				archiveSha256, archiveBytes: archive.length, manifestSha256: sha256(manifest) },
			tests: QUALIFICATION_TESTS.map((id: string) => ({ id, result: 'pass', evidenceSha256: sha256(log) })),
		}));
		for (const id of QUALIFICATION_TESTS) await writeFile(join(recordDir, `${id}.log`), log);
		await writeFile(join(recordDir, 'manifest.json'), manifest);
		await writeFile(join(recordDir, 'manifest.qualification.sig'), sign(null, manifestSigningBytes(manifest, 'qualification'), key.privateKey));
		await writeFile(join(artifactDir, 'candidate.json'), JSON.stringify(build));
		await writeFile(join(artifactDir, build.archiveName), archive);
		const args = { recordDir, artifactDir, repository, archiveSha256, qualificationKey };
		assert.deepEqual((await checkPromotion(args)).bytes, manifest);
		await assert.rejects(checkPromotion({ ...args, archiveSha256: 'b'.repeat(64) }), /approval/);
		await writeFile(join(artifactDir, build.archiveName), Buffer.alloc(archive.length));
		await assert.rejects(checkPromotion(args), /digest mismatch/);
		await writeFile(join(artifactDir, build.archiveName), archive);
		await writeFile(join(recordDir, 'rollback.log'), 'changed result');
		await assert.rejects(checkPromotion(args), /evidence checksum mismatch/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('promotion requires protected approval and never rebuilds the candidate', async () => {
	const yaml = await readFile(new URL('../../.github/workflows/daemon-promotion.yml', import.meta.url), 'utf8');
	const workflow = load(yaml) as { jobs: { publish: { environment: string; needs: string } } };
	assert.equal(workflow.jobs.publish.needs, 'prepare');
	assert.equal(workflow.jobs.publish.environment, 'daemon-pilot-production');
	assert.match(yaml, /require_code_owner_reviews/);
	assert.match(yaml, /daemon-release-artifact\.sh/);
	assert.doesNotMatch(yaml, /npm (?:ci|install|run|test)|--clobber/);
});
