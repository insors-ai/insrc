/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Independent reconciliation helpers remain supported. Source updates now
 * delegate to the selected transaction owner; daemon startup owns reconciliation.
 * Public caller/lifecycle coverage lives in source-consumers-native.test.ts. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { runUpdateSteeringRefresh } from '../maintenance.js';
import {
	STEERING_MARKER_START,
	STEERING_MARKER_END,
	type SteeringRefreshDeps,
} from '../../../daemon/steering-inject.js';
import type { RegisteredRepo } from '../../../shared/types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAINTENANCE_SRC = join(HERE, '..', 'maintenance.ts');

/** A temp "daemon root" carrying a freshly-built out/prompts/steering-block.md. */
function makeRootWithBlock(body = 'THE REFRESHED STEERING BLOCK'): string {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-daemon-root-'));
	mkdirSync(join(dir, 'out', 'prompts'), { recursive: true });
	writeFileSync(join(dir, 'out', 'prompts', 'steering-block.md'), body);
	return dir;
}

const repo = (path: string): RegisteredRepo => ({ path, name: path, status: 'ready', addedAt: 0 });

test('runUpdateSteeringRefresh: happy path → returns report + emits an onLog summary line', async () => {
	const root = makeRootWithBlock();
	const stale = `# proj\n${STEERING_MARKER_START}\nOLD\n${STEERING_MARKER_END}\n`;
	const files: Record<string, string> = { '/r/CLAUDE.md': stale };   // AGENTS.md absent
	const writes: string[] = [];
	const deps: Partial<SteeringRefreshDeps> = {
		listRepos: async () => [repo('/r')],
		readFile:  async (p) => (p in files ? files[p]! : null),
		writeFile: async (p, c) => { writes.push(p); files[p] = c; },
	};
	const logs: string[] = [];
	try {
		const report = await runUpdateSteeringRefresh(root, l => logs.push(l), deps);
		assert.ok(report, 'returns a report');
		assert.equal(report!.find(o => o.file === '/r/CLAUDE.md')!.action, 'replaced');
		assert.equal(report!.find(o => o.file === '/r/AGENTS.md')!.action, 'skipped');
		assert.deepEqual(writes, ['/r/CLAUDE.md']);
		// the freshly-built block (not the module's own) was stamped
		assert.ok(files['/r/CLAUDE.md']!.includes('THE REFRESHED STEERING BLOCK'));
		assert.ok(logs.some(l => /steering refresh: 1 refreshed, 1 skipped across 2 file\(s\)/.test(l)), 'summary line');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('runUpdateSteeringRefresh: block asset missing → caught, logged, returns undefined', async () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-daemon-root-'));   // NO out/prompts/steering-block.md
	const logs: string[] = [];
	try {
		const report = await runUpdateSteeringRefresh(root, l => logs.push(l), {
			// listRepos would never be reached, but prove it is not invoked either
			listRepos: async () => { throw new Error('should not reach listRepos'); },
		});
		assert.equal(report, undefined);
		assert.ok(logs.some(l => /steering refresh failed:/.test(l)));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('runUpdateSteeringRefresh: listRepos rejection → caught, returns undefined (never throws)', async () => {
	const root = makeRootWithBlock();
	const logs: string[] = [];
	try {
		await assert.doesNotReject(async () => {
			const report = await runUpdateSteeringRefresh(root, l => logs.push(l), {
				listRepos: async () => { throw new Error('registry unavailable'); },
			});
			assert.equal(report, undefined);
		});
		assert.ok(logs.some(l => /steering refresh failed: registry unavailable/.test(l)));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('runUpdateSteeringRefresh: empty steering asset is treated as a failure → undefined', async () => {
	const root = makeRootWithBlock('   \n  ');   // whitespace-only ⇒ empty after trim
	const logs: string[] = [];
	try {
		const report = await runUpdateSteeringRefresh(root, l => logs.push(l), { listRepos: async () => [] });
		assert.equal(report, undefined);
		assert.ok(logs.some(l => /steering block asset is empty/.test(l)));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
