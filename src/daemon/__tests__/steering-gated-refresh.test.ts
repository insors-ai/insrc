/**
 * The daemon-boot steering refresh publishes the request guidance only when the
 * daemon advertises the capability (Story 65b643840a294422/s1, task t18).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DAEMON_FEATURES } from '../status.js';
import { STEERING_MARKER_END, STEERING_MARKER_START, daemonAcceptsAnalyzeRequest, runBootSteeringRefresh, readSteeringBlock } from '../steering-inject.js';
import type { SteeringRefreshDeps } from '../steering-inject.js';
import type { RegisteredRepo } from '../../shared/types.js';

const repo: RegisteredRepo = { path: '/r', name: 'r', status: 'ready', addedAt: 0 };
const STALE = `# mine\n${STEERING_MARKER_START}\nOLD\n${STEERING_MARKER_END}\n`;

async function refreshWith(acceptsRequest: (() => boolean) | undefined): Promise<string> {
	const files: Record<string, string> = { '/r/CLAUDE.md': STALE };
	const deps: Partial<SteeringRefreshDeps> = {
		listRepos: async () => [repo],
		readBlock: readSteeringBlock,
		readFile:  async p => (p in files ? files[p]! : null),
		writeFile: async (p, c) => { files[p] = c; },
		...(acceptsRequest !== undefined ? { acceptsRequest } : {}),
	};
	const report = await runBootSteeringRefresh(deps);
	assert.equal(report?.find(o => o.file === '/r/CLAUDE.md')?.action, 'replaced');
	return files['/r/CLAUDE.md']!;
}

test('the boot refresh does not publish the request guidance when the capability is absent and publishes it when present', async () => {
	const without = await refreshWith(() => false);
	assert.equal(without.includes('Send a structured `request`'), false, 'absent capability: no request guidance');
	assert.equal(without.includes('insrc:analyze-request'), false, 'and no stray markers');
	assert.match(without, /could a text match alone give a wrong or incomplete answer\?/, 'the decision rule is still published');

	const withIt = await refreshWith(() => true);
	assert.match(withIt, /Send a structured `request`, not just the prompt/);
	assert.equal(withIt.includes('insrc:analyze-request'), false);

	// The production default follows what daemon.status advertises.
	assert.equal(DAEMON_FEATURES.includes('analyze-request'), true);
	assert.equal(daemonAcceptsAnalyzeRequest(), true);
	const byDefault = await refreshWith(undefined);
	assert.equal(byDefault, withIt, 'a daemon that advertises the capability publishes the guidance by default');
});
