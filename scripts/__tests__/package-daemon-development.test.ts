import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { archiveDevelopmentRuntime, fetchDevelopmentCheckout, measureDevelopmentCandidate, packageDevelopmentCandidate, requireCleanDevelopmentCheckout } from '../package-daemon-development.mjs';
import { sha256 } from '../daemon-bundle-metadata.mjs';

async function createFixtureRuntime(stage: string) {
	await mkdir(join(stage, 'tools'));
	await mkdir(join(stage, 'out', 'daemon'), { recursive: true });
	await writeFile(join(stage, 'tools', 'node'), 'pinned runtime', { mode: 0o700 });
	await writeFile(join(stage, 'out', 'daemon', 'index.js'), 'candidate runtime');
}

test('development archives omit overlong SDK metadata and reject lost runtime files', async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'insrc-development-archive-test-')));
	try {
		const stage = join(root, 'stage');
		const archive = join(root, 'development.tar.gz');
		await mkdir(stage);
		await createFixtureRuntime(stage);
		const operations = 'node_modules/@mistralai/mistralai/esm/models/operations';
		const longName = 'model-operation-'.repeat(7);
		await mkdir(join(stage, operations), { recursive: true });
		await writeFile(join(stage, operations, longName + '.js.map'), 'source map');
		await writeFile(join(stage, operations, longName + '.d.ts'), 'declarations');
		await writeFile(join(stage, operations, 'normal.js'), 'code');
		const commit = 'a'.repeat(40);
		const identity = await archiveDevelopmentRuntime(stage, archive, root, commit);
		const entries = execFileSync('/usr/bin/tar', ['-tzf', archive], { encoding: 'utf8' }).split('\n');
		assert(entries.includes(`${operations}/normal.js`));
		assert(!entries.some(entry => entry.includes(longName)));
		assert.deepEqual(await measureDevelopmentCandidate(stage, archive), identity);
		await writeFile(join(stage, operations, longName + '.js'), 'required runtime');
		await assert.rejects(archiveDevelopmentRuntime(stage, archive, root, commit), /fingerprint|Pathname too long/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('local development packaging pins a configured ref and measures candidate bytes', async () => {
	const root = await mkdtemp(join(tmpdir(), 'insrc-development-candidate-test-'));
	try {
		const upstream = join(root, 'upstream');
		await mkdir(upstream);
		const git = (...args: string[]) => execFileSync('/usr/bin/git', args, { cwd: upstream, encoding: 'utf8' }).trim();
		git('init', '-b', 'preview/next');
		git('config', 'user.name', 'Fixture');
		git('config', 'user.email', 'fixture@example.test');
		await writeFile(join(upstream, 'source'), 'first');
		git('add', 'source');
		git('commit', '-m', 'first');
		const commit = git('rev-parse', 'HEAD');
		await writeFile(join(upstream, 'source'), 'second');
		git('commit', '-am', 'second');
		const tip = git('rev-parse', 'HEAD');
		git('checkout', '-b', 'unrelated');
		git('commit', '--allow-empty', '-m', 'unrelated');
		const unrelated = git('rev-parse', 'HEAD');
		const ref = 'refs/heads/preview/next';
		const policy = { repository: upstream, releaseRef: 'refs/heads/main', developmentRefs: [ref] };
		const fresh = () => mkdtemp(join(root, 'bare-'));
		const candidate = await fetchDevelopmentCheckout(policy, ref, commit, await fresh());
		assert.equal(candidate.fetchedTip, tip);
		assert.equal(candidate.sourceRef, ref);
		assert.equal(candidate.commit, commit);
		const fakeHome = join(root, 'git-home');
		await mkdir(fakeHome);
		await writeFile(join(fakeHome, '.gitconfig'), `[url "${upstream}"]\n\tinsteadOf = ${join(root, 'absent')}\n`);
		const savedHome = process.env.HOME;
		try {
			process.env.HOME = fakeHome;
			await assert.rejects(fetchDevelopmentCheckout({ ...policy, repository: join(root, 'absent') },
				ref, commit, await fresh()), /git.*fetch/s);
		} finally {
			if (savedHome === undefined) delete process.env.HOME;
			else process.env.HOME = savedHome;
		}
		assert.throws(() => requireCleanDevelopmentCheckout(candidate.checkout, tip), /different commit/);
		await writeFile(join(candidate.checkout, 'source'), 'dirty');
		assert.throws(() => requireCleanDevelopmentCheckout(candidate.checkout, commit), /dirty/);
		await assert.rejects(fetchDevelopmentCheckout(policy, ref, unrelated, await fresh()), /unreachable/);
		await assert.rejects(fetchDevelopmentCheckout(policy, ref, '0'.repeat(40), await fresh()), /unreachable/);
		const deletedRef = 'refs/heads/preview/deleted';
		git('branch', 'preview/deleted', tip);
		git('branch', '-D', 'preview/deleted');
		await assert.rejects(fetchDevelopmentCheckout({ ...policy, developmentRefs: [ref, deletedRef] },
			deletedRef, commit, await fresh()), /git.*fetch/s);
		await assert.rejects(fetchDevelopmentCheckout(policy, 'refs/heads/unrelated', unrelated, await fresh()), /not approved/);
		await assert.rejects(fetchDevelopmentCheckout(policy, 'refs/tags/preview', commit, await fresh()), /full branch ref/);

		const stage = join(root, 'stage');
		const archive = join(root, 'archive');
		await mkdir(stage);
		await writeFile(join(stage, 'runtime'), 'runtime bytes');
		await writeFile(archive, 'archive bytes');
		const identity = await measureDevelopmentCandidate(stage, archive);
		assert.equal(identity.archiveBytes, Buffer.byteLength('archive bytes'));
		assert.equal(identity.archiveSha256, sha256(Buffer.from('archive bytes')));
		await writeFile(join(stage, 'runtime'), 'changed runtime');
		assert.notEqual((await measureDevelopmentCandidate(stage, archive)).runtimeFingerprint, identity.runtimeFingerprint);

		const outputPath = join(root, 'output');
		await packageDevelopmentCandidate({ policy, ref, commit, outputPath, version: '1.0.0-dev.1' }, {
			async buildRuntime(checkout: string, staging: string) {
				assert.equal(await readFile(join(checkout, 'source'), 'utf8'), 'first');
				await createFixtureRuntime(staging);
			},
		});
		const handoff = JSON.parse(await readFile(join(outputPath, 'candidate.json'), 'utf8'));
		assert.equal(handoff.repository, upstream);
		assert.equal(handoff.sourceRef, ref);
		assert.equal(handoff.commit, commit);
		assert.equal(handoff.fetchedTip, tip);
		assert.equal(handoff.channel, 'development');
		assert.equal(handoff.runId, undefined);
		const packaged = await readFile(join(outputPath, handoff.archiveName));
		assert.equal(handoff.archiveSha256, sha256(packaged));
		assert.equal(handoff.archiveBytes, packaged.length);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
