/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The CLI update (maintenance.ts update) against a single-branch clone: the configured repo URL and branch.
 *
 * Run: npx tsx --test src/cli/__tests__/maintenance-source.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { git, updateFixture } from '../../daemon/__tests__/helpers-update-fixture.js';

test('maintenance-source.test.ts: the CLI update applies the configured repo URL and branch the same way, and opts.branch wins over the config', async () => {
	const f = updateFixture();
	// maintenance.ts reads INSRC_DAEMON_ROOT once, when it is first imported
	process.env['INSRC_DAEMON_ROOT'] = f.install;
	try {
		const { update } = await import('../services/maintenance.js');
		const logs: string[] = [];
		const run = (opts: Parameters<typeof update>[0]) => { logs.length = 0; return update({ skipInstall: true, skipBuild: true, ...opts }, l => logs.push(l)); };
		const head = (): string => git(f.install, 'rev-parse', '--abbrev-ref', 'HEAD');

		// the configured branch: fetched with an explicit refspec into the single-branch clone, then switched to
		let r = await run({ source: { branch: 'dev' } });
		assert.equal(r.ok, true, r.error);
		assert.equal(head(), 'dev');
		assert.equal(git(f.install, 'rev-parse', 'HEAD'), git(f.remote, 'rev-parse', 'dev'));

		// opts.branch wins over the configured branch
		r = await run({ branch: 'main', source: { branch: 'dev' } });
		assert.equal(r.ok, true, r.error);
		assert.equal(head(), 'main');

		// nothing configured: the checkout's own branch, as before
		r = await run({ source: {} });
		assert.equal(r.ok, true, r.error);
		assert.ok(logs.some(l => /already at/.test(l)));

		// an unchanged URL is not set again
		r = await run({ source: { repoUrl: f.remote } });
		assert.equal(r.ok, true, r.error);
		assert.ok(!logs.some(l => /pointing origin/.test(l)));

		// a dirty tree is refused before origin is touched
		writeFileSync(join(f.install, 'package.json'), '{"name":"changed"}\n');
		r = await run({ source: { repoUrl: f.fork } });
		assert.equal(r.ok, false);
		assert.match(r.error ?? '', /uncommitted changes/);
		assert.equal(git(f.install, 'remote', 'get-url', 'origin'), f.remote);
		git(f.install, 'checkout', '--', 'package.json');

		// a fork: origin is pointed at it and main fast-forwards
		r = await run({ source: { repoUrl: f.fork } });
		assert.equal(r.ok, true, r.error);
		assert.equal(git(f.install, 'remote', 'get-url', 'origin'), f.fork);
		assert.equal(git(f.install, 'rev-parse', 'HEAD'), git(f.fork, 'rev-parse', 'main'));

		// a commit that exists only in the checkout is never discarded by a switch
		writeFileSync(join(f.install, 'local.txt'), 'mine');
		git(f.install, 'add', '-A'); git(f.install, 'commit', '-q', '-m', 'local only');
		const before = git(f.install, 'rev-parse', 'HEAD');
		r = await run({ source: { branch: 'dev' } });
		assert.equal(r.ok, false);
		assert.match(r.error ?? '', /commits no remote branch has/);
		assert.equal(git(f.install, 'rev-parse', 'HEAD'), before);

		// commits that exist only on an existing local branch of the target name are not reset either
		git(f.install, 'reset', '--hard', '-q', 'HEAD~1');
		git(f.install, 'checkout', '-q', 'dev');   // the local dev made by the first switch above
		writeFileSync(join(f.install, 'devlocal.txt'), 'x');
		git(f.install, 'add', '-A'); git(f.install, 'commit', '-q', '-m', 'only on local dev');
		const localDev = git(f.install, 'rev-parse', 'HEAD');
		git(f.install, 'checkout', '-q', 'main');
		r = await run({ source: { branch: 'dev' } });
		assert.equal(r.ok, false);
		assert.match(r.error ?? '', /local branch dev has commits/);
		assert.equal(git(f.install, 'rev-parse', 'refs/heads/dev'), localDev);

		// a URL that cannot be fetched from does not stay as origin
		const origin = git(f.install, 'remote', 'get-url', 'origin');
		r = await run({ source: { repoUrl: join(f.root, 'does-not-exist.git') } });
		assert.equal(r.ok, false);
		assert.match(r.error ?? '', /git fetch origin\/main failed/);
		assert.equal(git(f.install, 'remote', 'get-url', 'origin'), origin);

		// a config the reader refuses, and values handed in directly that fail the same checks, stop the update before git runs
		r = await run({ source: {}, repoUrl: '--upload-pack=x' });
		assert.equal(r.ok, false);
		assert.match(r.error ?? '', /invalid update source/);
		r = await run({ branch: 'a..b' });
		assert.equal(r.ok, false);
		assert.match(r.error ?? '', /invalid update source/);
	} finally { delete process.env['INSRC_DAEMON_ROOT']; f.cleanup(); }
});
