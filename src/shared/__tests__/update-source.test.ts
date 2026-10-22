/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon update source reader: which keys of ~/.insrc/config.json are used, and which values are refused.
 *
 * Run: npx tsx --test src/shared/__tests__/update-source.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readUpdateSource, updateSourceArgs, UpdateSourceError } from '../update-source.js';

function withConfig(content: string | undefined, run: (path: string) => void): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-update-source-'));
	const path = join(dir, 'config.json');
	if (content !== undefined) writeFileSync(path, content);
	try { run(path); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const cfg = (daemonUpdate: unknown): string => JSON.stringify({ logLevel: 'info', daemonUpdate });

test('update-source.test.ts: readUpdateSource returns only the set and valid keys, treats an absent file and empty strings as unset, and throws UpdateSourceError for each invalid value', () => {
	// unset: no file, no section, empty strings
	withConfig(undefined, p => assert.deepEqual(readUpdateSource(p), {}));
	withConfig('{}', p => assert.deepEqual(readUpdateSource(p), {}));
	withConfig(cfg({ repoUrl: '', branch: '' }), p => assert.deepEqual(readUpdateSource(p), {}));
	withConfig(cfg({ repoUrl: '  ', branch: ' ' }), p => assert.deepEqual(readUpdateSource(p), {}));

	// only the keys that are set
	withConfig(cfg({ branch: 'v2' }), p => assert.deepEqual(readUpdateSource(p), { branch: 'v2' }));
	withConfig(cfg({ repoUrl: 'https://github.com/someone/insrc.git' }), p => assert.deepEqual(readUpdateSource(p), { repoUrl: 'https://github.com/someone/insrc.git' }));
	for (const url of ['git@github.com:someone/insrc.git', 'ssh://git@host/x/y.git', 'file:///srv/insrc', '/srv/git/insrc.git', 'git://host/x.git']) {
		withConfig(cfg({ repoUrl: url, branch: 'feature/s9-x_1.0' }), p => assert.deepEqual(readUpdateSource(p), { repoUrl: url, branch: 'feature/s9-x_1.0' }), );
	}

	// refused
	const bad: unknown[] = [
		{ repoUrl: '--upload-pack=evil' }, { repoUrl: 'https://host/a b' }, { repoUrl: 'ftp://host/x' }, { repoUrl: 'relative/path' }, { repoUrl: 'https://host/x\ny' },
		{ branch: '-f' }, { branch: 'a..b' }, { branch: 'a//b' }, { branch: 'a/' }, { branch: 'x.lock' }, { branch: 'has space' }, { branch: 'a~1' },
		{ repoUrl: 5 }, { branch: ['v2'] }, 'text', [], 7,
	];
	for (const section of bad) withConfig(cfg(section), p => assert.throws(() => readUpdateSource(p), UpdateSourceError, JSON.stringify(section)));
	withConfig('{ not json', p => assert.throws(() => readUpdateSource(p), /cannot be read as JSON/));
	withConfig('[]', p => assert.throws(() => readUpdateSource(p), /not a JSON object/));

	// the flags handed to daemon-ctl.sh
	assert.deepEqual(updateSourceArgs({}), []);
	assert.deepEqual(updateSourceArgs({ repoUrl: '/r', branch: 'v2' }), ['--repo-url', '/r', '--branch', 'v2']);
	assert.deepEqual(updateSourceArgs({ branch: 'v2' }), ['--branch', 'v2']);
});
