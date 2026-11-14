import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fetchDevelopmentCheckout, measureDevelopmentCandidate, requireCleanDevelopmentCheckout } from '../package-daemon-development.mjs';
import { sha256 } from '../daemon-bundle-metadata.mjs';

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
		assert.throws(() => requireCleanDevelopmentCheckout(candidate.checkout, tip), /different commit/);
		await writeFile(join(candidate.checkout, 'source'), 'dirty');
		assert.throws(() => requireCleanDevelopmentCheckout(candidate.checkout, commit), /dirty/);
		await assert.rejects(fetchDevelopmentCheckout(policy, ref, unrelated, await fresh()), /unreachable/);
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
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
