import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { Value } from '@sinclair/typebox/value';

import { ghAuthTool, ghConfigTool, ghSearchTool } from '../account.js';
import { ghGistTool } from '../resources.js';
import { providers } from './_providers.js';

const live = process.env['INSRC_LIVE_TESTS'] === '1';
const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };

/** The sign-in of the machine, read from `gh auth status` text the way a model would: host, account, state. */
function hostsOf(text: string): { hosts: Array<{ host: string; login: string; active: boolean; state: 'logged-in' | 'failed' }> } {
	const hosts: Array<{ host: string; login: string; active: boolean; state: 'logged-in' | 'failed' }> = [];
	let host = '';
	for (const line of text.split('\n')) {
		if (/^\S+$/.test(line.trim()) && !line.startsWith(' ')) { host = line.trim(); }
		const m = /(Logged in to \S+ account (\S+)|Failed to log in to \S+ account (\S+))/.exec(line);
		if (m !== undefined && m !== null) { hosts.push({ host, login: m[2] ?? m[3] ?? '', active: false, state: m[2] !== undefined ? 'logged-in' : 'failed' }); }
		if (/Active account: true/.test(line) && hosts.length > 0) { hosts[hosts.length - 1]!.active = true; }
	}
	return { hosts };
}

test('gh-live.test.ts: gh_auth status, gh_config list, gh_search repos with limit 1, gh_gist list columns and a bad token giving missing-signin', { skip: !live }, async () => {
	// gh_config list: a deterministic parse of the real configuration, no model
	const config = await ghConfigTool.execute({ op: 'list' }, deps);
	assert.equal(config.success, true, config.output);
	const entries = (config.data as { entries: Array<{ key: string; value: string }> }).entries;
	assert.ok(entries.some(e => e.key === 'git_protocol'), 'the configuration lists git_protocol');

	// gh_auth status: the real text, read by a scripted reader, cross-checked against that text
	const raw = (await import('node:child_process')).spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
	const text = raw.stdout.trim().length > 0 ? raw.stdout : raw.stderr;
	const read = hostsOf(text);
	assert.ok(read.hosts.length > 0, 'the machine is signed in');
	const auth = await ghAuthTool.execute({ op: 'status' }, { ...deps, conversion: providers(read).conversion });
	assert.equal(auth.success, true, auth.output);
	assert.ok(Value.Check(ghAuthTool.outputSchema, auth.data));

	// gh_search repos with limit 1: one typed item
	const search = await ghSearchTool.execute({ op: 'repos', query: 'cli', limit: 1 }, deps);
	assert.equal(search.success, true, search.output);
	const found = search.data as { op: string; count: number; items: Array<{ fullName: string }> };
	assert.equal(found.op, 'repos');
	assert.equal(found.count, 1);
	assert.equal(typeof found.items[0]?.fullName, 'string');
	assert.ok(Value.Check(ghSearchTool.outputSchema, search.data));

	// gh_gist list: the five verified columns become named string properties
	const gists = await ghGistTool.execute({ op: 'list', limit: 2 }, deps);
	assert.equal(gists.success, true, gists.output);
	for (const item of (gists.data as { items: Array<Record<string, string>> }).items) {
		assert.deepEqual(Object.keys(item).sort(), ['description', 'files', 'id', 'updated', 'visibility']);
		assert.match(item['visibility'] ?? '', /^(public|secret)$/);
	}

	// a bad token is missing-signin
	const saved = { token: process.env['GH_TOKEN'], dir: process.env['GH_CONFIG_DIR'] };
	process.env['GH_TOKEN'] = 'ghp_thisIsNotARealToken0000000000000000000';
	process.env['GH_CONFIG_DIR'] = mkdtempSync(join(tmpdir(), 'insrc-ghlive-'));
	try {
		const bad = await ghGistTool.execute({ op: 'list', limit: 1 }, deps);
		assert.equal(bad.success, false);
		assert.equal(bad.failure?.kind, 'missing-signin', bad.output);
	} finally {
		if (saved.token === undefined) { delete process.env['GH_TOKEN']; } else { process.env['GH_TOKEN'] = saved.token; }
		if (saved.dir === undefined) { delete process.env['GH_CONFIG_DIR']; } else { process.env['GH_CONFIG_DIR'] = saved.dir; }
	}
});
