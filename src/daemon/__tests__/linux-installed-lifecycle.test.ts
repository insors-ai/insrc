/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

test('Linux normal install, update and restart unchanged', { timeout: 120_000 }, async t => {
	const root = fileURLToPath(new URL('../../../', import.meta.url));
	const fixture = 'src/daemon/__tests__/fixtures/linux-installed-lifecycle.sh';
	if (process.platform !== 'linux') {
		const available = await promisify(execFile)('docker', ['image', 'inspect', 'node:22.22.1-bookworm'], { timeout: 5_000 })
			.then(() => true, () => false);
		if (!available) { t.skip('requires Linux or a cached Linux Node 22 image'); return; }
	}
	const result = process.platform === 'linux'
		? await promisify(execFile)('/bin/bash', [join(root, fixture), root], { timeout: 100_000 })
		: await promisify(execFile)('docker', ['run', '--rm', '--pull=never', '--network=none', '--volume', `${root}:/workspace:ro`,
			'node:22.22.1-bookworm', '/bin/bash', `/workspace/${fixture}`, '/workspace'], { timeout: 100_000 });
	assert.match(result.stdout, /verified Linux install, update without restart, ordinary restart and stop/);
});
