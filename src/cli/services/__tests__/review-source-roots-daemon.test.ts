/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The CLI's review reads a repository's source roots THROUGH THE DAEMON
 * (Epic c2ba6fa6, Story s4, t8). Before this, the CLI's in-process review
 * opened the live store itself: one more process on the store, which is how a
 * daemon's locks get removed.
 *
 * A child process stands in for the daemon: it holds the store and serves the
 * daemon's real `repo.entitiesForSourceRoots` handler on the socket of a
 * temporary home. This process is "the CLI": its home is pointed at the same
 * temporary one BEFORE the service is imported, so its request client talks to
 * that socket, and at no point may it hold a descriptor on the store.
 *
 * Run: npx tsx --test src/cli/services/__tests__/review-source-roots-daemon.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// A short root: the socket lives under it (path limit ~104 bytes on macOS).
const HOME = mkdtempSync('/tmp/insrc-cli-review-');
process.env['HOME'] = HOME;
mkdirSync(join(HOME, '.insrc'), { recursive: true });

const { readEntitiesForRepoFromDaemon, reviewArtifact } = await import('../workflow.js');
const { gatherEvidence } = await import('../../../workflow/review/probe.js');
const { killAllStoreChildren, spawnStoreChild } = await import('../../../db/graph/__tests__/helpers/store-child-driver.js');
type Claim = import('../../../workflow/review/types.js').Claim;
type ReviewArtifactOpts = import('../../../workflow/review/run-artifact.js').ReviewArtifactOpts;

after(() => {
	killAllStoreChildren();
	rmSync(HOME, { recursive: true, force: true });
});

const STORE = join(HOME, '.insrc', 'graph.lmdb');
const repo = join(HOME, 'repo');
const TOKEN = 'UNIQUE_TOKEN_TUV';

/** Every file this process has open, by path. */
function openFiles(): string {
	return execFileSync('lsof', ['-p', String(process.pid), '-Fn'], { encoding: 'utf8' });
}

test('CLI review through the daemon: source roots come through the request and the CLI\'s process holds no descriptor on the store', { skip: process.platform === 'win32' }, async () => {
	for (const dir of ['indexed', 'elsewhere']) {
		mkdirSync(join(repo, dir), { recursive: true });
		writeFileSync(join(repo, dir, 'widget.ts'), `export const ${TOKEN} = 1;\n`);
	}

	// The "daemon": holds the store (which knows only indexed/) and serves.
	const daemon = await spawnStoreChild(STORE, { env: { HOME } });
	// Like the real daemon, the stand-in declares itself the store's owner.
	assert.deepEqual(await daemon.send({ op: 'declare-owner' }), { ok: true });
	assert.deepEqual(await daemon.send({ op: 'open' }), { ok: true });
	assert.deepEqual(await daemon.send({ op: 'seed-repo', repoPath: repo, files: [join(repo, 'indexed', 'widget.ts')] }), { ok: true });
	const served = await daemon.send({ op: 'daemon-like', logPath: join(HOME, 'daemon.log'), crashLogDir: join(HOME, 'crash') });
	assert.ok(served.ok, served.ok ? '' : served.message);

	// The request returns the repository's file entities, and only those.
	const entities = await readEntitiesForRepoFromDaemon(repo);
	assert.deepEqual(entities.map(e => [e.kind, e.file]), [['file', join(repo, 'indexed', 'widget.ts')]], 'the function entity of the same file is left out');

	// The evidence of a review is gathered under the root the DAEMON named.
	const claims = [{ id: 'c1', kind: 'citation', text: 't', anchors: [], probe: { greps: [TOKEN], reads: [] } } as Claim];
	const fellBack: string[] = [];
	const ev = await gatherEvidence(claims, repo, { readEntitiesForRepo: readEntitiesForRepoFromDaemon, onSourceRootFallback: r => fellBack.push(r) });
	const found = ev[0]!.grepResults.flatMap(g => g.matches);
	assert.ok(found.some(m => m.includes('indexed/widget.ts')));
	assert.equal(found.some(m => m.includes('elsewhere/widget.ts')), false, 'not the whole repository root: the roots came from the daemon');
	assert.deepEqual(fellBack, []);

	// The CLI's review service passes exactly that reader down.
	const planDir = join(repo, 'docs', 'epics', 'x-E202610110123abcd', 'S001');
	mkdirSync(planDir, { recursive: true });
	writeFileSync(join(planDir, 'PLAN.md'), '<!-- insrc:artifact PLAN-0123456789abcdef-s1 -->\n\n# Plan\n');
	let seen: ReviewArtifactOpts | undefined;
	await reviewArtifact(repo, join(planDir, 'PLAN.md'), (async (opts: ReviewArtifactOpts) => { seen = opts; return { report: {}, applied: [], skipped: [], pendingUser: [] }; }) as never);
	assert.equal(seen?.readEntitiesForRepo, readEntitiesForRepoFromDaemon);
	assert.equal(seen?.repo, repo);

	// An unregistered repository is an error from the daemon, which the reader raises.
	await assert.rejects(readEntitiesForRepoFromDaemon(''), /repoPath \(a non-empty string\) is required/);

	// Throughout, this process never opened the store or its lock file.
	const open = openFiles();
	assert.doesNotMatch(open, /graph\.lmdb/, 'no descriptor on the store file or its lock file');
	assert.match(open, /\n/, 'lsof listed this process');

	await daemon.kill();

	// With the daemon gone the reader rejects, and the review falls back.
	await assert.rejects(readEntitiesForRepoFromDaemon(repo), /daemon is not running/);
	const reasons: string[] = [];
	await gatherEvidence(claims, repo, { readEntitiesForRepo: readEntitiesForRepoFromDaemon, onSourceRootFallback: r => reasons.push(r) });
	assert.match(reasons[0] ?? '', /the index could not be read \(daemon is not running/);
	assert.doesNotMatch(openFiles(), /graph\.lmdb/);
});
