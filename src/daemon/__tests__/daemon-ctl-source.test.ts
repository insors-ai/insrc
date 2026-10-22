/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * scripts/daemon-ctl.sh update against a single-branch clone: --repo-url and --branch.
 *
 * Run: npx tsx --test src/daemon/__tests__/daemon-ctl-source.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { git, updateFixture } from './helpers-update-fixture.js';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'daemon-ctl.sh');

function ctl(install: string, root: string, ...flags: string[]): { code: number | null; out: string } {
	const r = spawnSync('bash', [SCRIPT, 'update', '--skip-install', '--skip-build', ...flags], {
		encoding: 'utf8', env: { ...process.env, INSRC_DAEMON_ROOT: install, INSRC_CTL_LOG_DIR: join(root, 'ctl-logs'), HOME: root },
	});
	return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test('daemon-ctl-source.test.ts: daemon-ctl.sh update with --repo-url and --branch points origin at the URL, switches to the branch and fast-forwards, and refuses a dirty tree and local-only commits', () => {
	const f = updateFixture();
	try {
		const head = (): string => git(f.install, 'rev-parse', '--abbrev-ref', 'HEAD');
		const originUrl = (): string => git(f.install, 'remote', 'get-url', 'origin');

		// the single-branch clone has no origin/dev; --branch dev fetches it with an explicit refspec and switches
		assert.throws(() => git(f.install, 'rev-parse', 'origin/dev'));
		let r = ctl(f.install, f.root, '--branch', 'dev');
		assert.equal(r.code, 0, r.out);
		assert.equal(head(), 'dev');
		assert.equal(git(f.install, 'rev-parse', 'HEAD'), git(f.remote, 'rev-parse', 'dev'));

		// back to main with no flag at all: the checkout's own branch is followed, as before
		git(f.install, 'checkout', '-q', 'main');
		r = ctl(f.install, f.root);
		assert.equal(r.code, 0, r.out);
		assert.match(r.out, /already at/);

		// an unchanged URL: no set-url, no log line for it
		r = ctl(f.install, f.root, '--repo-url', f.remote);
		assert.equal(r.code, 0, r.out);
		assert.doesNotMatch(r.out, /pointing origin/);
		assert.equal(originUrl(), f.remote);

		// a dirty tree is refused before origin is touched
		writeFileSync(join(f.install, 'package.json'), '{"name":"changed"}\n');
		r = ctl(f.install, f.root, '--repo-url', f.fork);
		assert.equal(r.code, 3, r.out);
		assert.equal(originUrl(), f.remote, 'origin is unchanged');
		git(f.install, 'checkout', '--', 'package.json');

		// a fork: origin is pointed at it and main fast-forwards to the fork's commit
		r = ctl(f.install, f.root, '--repo-url', f.fork);
		assert.equal(r.code, 0, r.out);
		assert.match(r.out, /pointing origin at/);
		assert.equal(originUrl(), f.fork);
		assert.equal(git(f.install, 'rev-parse', 'HEAD'), git(f.fork, 'rev-parse', 'main'));

		// a commit that exists only in the checkout is never discarded by a switch
		writeFileSync(join(f.install, 'local.txt'), 'mine');
		git(f.install, 'add', '-A'); git(f.install, 'commit', '-q', '-m', 'local only');
		const before = git(f.install, 'rev-parse', 'HEAD');
		r = ctl(f.install, f.root, '--branch', 'dev');
		assert.equal(r.code, 3, r.out);
		assert.match(r.out, /commits no remote branch has/);
		assert.equal(git(f.install, 'rev-parse', 'HEAD'), before);
		assert.equal(head(), 'main');

		// a URL that cannot be fetched from does not stay as origin
		const gone = join(f.root, 'does-not-exist.git');
		r = ctl(f.install, f.root, '--repo-url', gone);
		assert.notEqual(r.code, 0, r.out);
		assert.match(r.out, /origin restored/);
		assert.equal(originUrl(), f.fork, 'origin is back to the previous URL');

		// a malformed flag
		r = ctl(f.install, f.root, '--repo-url', '--branch', 'dev');
		assert.equal(r.code, 1, r.out);
	} finally { f.cleanup(); }
});
