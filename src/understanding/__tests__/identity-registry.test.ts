/**
 * Story s9, task t16: the identity lookup's gh and git commands run through the tool registry (gh_auth hosts, gh_tracker user_by_host,
 * git_config). Its multi-host and multi-account results, its options and its error codes equal those of the lookup that ran the programs
 * itself: both are run against the same stand-in gh and the same repositories and compared.
 * Run: npx tsx --test-force-exit src/understanding/__tests__/identity-registry.test.ts
 */

import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _resetToolHooksForTests, registerToolHook } from '../../daemon/tools/hooks.js';
import { runShell } from '../../daemon/tools/shell-helper.js';
import { _resetRegistryForTests } from '../../daemon/tools/registry.js';
import { githubIdentities, localIdentityDeps, resolveLearner } from '../identity.js';

const TOOLS = ['gh_auth', 'gh_tracker', 'git_config'];
const calls: Array<{ tool: string; caller: string | undefined }> = [];
const dirs: string[] = [];
const savedEnv = { ...process.env };
beforeEach(() => {
	_resetRegistryForTests(); _resetToolHooksForTests(); calls.length = 0;
	for (const tool of TOOLS) registerToolHook({ id: `spy-${tool}`, toolId: tool, async run(ctx) { calls.push({ tool: ctx.toolId, caller: ctx.caller }); } });
	process.env['GIT_CONFIG_GLOBAL'] = '/dev/null'; process.env['GIT_CONFIG_NOSYSTEM'] = '1';
});
afterEach(() => { _resetToolHooksForTests(); process.env = { ...savedEnv }; for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A stand-in gh first on PATH: `HOSTS` is what `auth status --json hosts` prints (or 'old': a gh that has no --json), users are fixed. */
function standInGh(hosts: string): void {
	const dir = mkdtempSync(join(tmpdir(), 'identity-gh-')); dirs.push(dir);
	writeFileSync(join(dir, 'gh'), `#!/bin/sh
case "$*" in
  "auth status --json hosts")
    if [ "$GH_HOSTS" = old ]; then echo 'unknown flag: --json' >&2; exit 1; fi
    printf '%s' "$GH_HOSTS" ;;
  "api --hostname github.com users/alice") echo '{"login":"alice","node_id":"N_alice"}' ;;
  "api --hostname github.com users/bob") echo '{"login":"bob","node_id":"N_bob"}' ;;
  "api --hostname ghe.example.com users/carol") echo '{"login":"carol","node_id":"N_carol"}' ;;
  "api --hostname github.com users/ghost") echo '{"login":"someone-else","node_id":"N_x"}' ;;
  *) echo "unexpected: $*" >&2; exit 1 ;;
esac
`);
	chmodSync(join(dir, 'gh'), 0o755);
	process.env['PATH'] = `${dir}:${savedEnv['PATH'] ?? ''}`; process.env['GH_HOSTS'] = hosts;
}

const account = (login: string, state = 'success'): string => `{"state":"${state}","login":"${login}","active":true}`;

test('identity-registry.test.ts: multi-host and multi-account results, public options and error codes equal the old lookup, and on a gh without auth status --json the recorded behaviour holds', async () => {
	const cases: Record<string, string> = {
		'two hosts and two accounts': `{"hosts":{"github.com":[${account('alice')},${account('bob')}],"ghe.example.com":[${account('carol')}]}}`,
		'one account': `{"hosts":{"github.com":[${account('alice')}]}}`,
		'no host': '{"hosts":{}}',
		'a failed account': `{"hosts":{"github.com":[${account('alice', 'error')}]}}`,
		'an account whose profile names another login': `{"hosts":{"github.com":[${account('ghost')}]}}`,
		'not json': 'not json',
		'a gh without --json': 'old',
	};
	for (const [name, hosts] of Object.entries(cases)) {
		standInGh(hosts);
		const viaTools = await githubIdentities();
		const viaProgram = await githubIdentities(runShell);
		assert.deepEqual(viaTools, viaProgram, `${name}: the lookup equals the old lookup`);
		if (name === 'two hosts and two accounts') assert.deepEqual(viaTools.identities.map(i => i.subject).sort(), ['N_alice', 'N_bob', 'N_carol'].sort());
		if (name === 'a gh without --json') assert.equal(viaTools.status, 'unavailable', 'the recorded behaviour of the older gh');
		if (name === 'no host') assert.equal(viaTools.status, 'disconnected');
	}

	// no gh program at all
	process.env['PATH'] = mkdtempSync(join(tmpdir(), 'identity-nopath-')); dirs.push(process.env['PATH']);
	assert.equal((await githubIdentities()).status, 'missing-integration');
	assert.equal((await githubIdentities(runShell)).status, 'missing-integration');
	process.env['PATH'] = savedEnv['PATH'];

	// the git e-mail
	const repo = mkdtempSync(join(tmpdir(), 'identity-repo-')); dirs.push(repo);
	execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
	assert.equal(await localIdentityDeps('host').gitEmail(repo), undefined, 'no e-mail set');
	assert.equal(await localIdentityDeps('host', runShell).gitEmail(repo), undefined);
	execFileSync('git', ['config', 'user.email', 'ada@example.org'], { cwd: repo });
	assert.equal(await localIdentityDeps('host').gitEmail(repo), 'ada@example.org');
	assert.equal(await localIdentityDeps('host', runShell).gitEmail(repo), 'ada@example.org');

	// the whole resolution: a confirmed provider identity, else the git e-mail
	standInGh(cases['one account']!);
	const resolved = await resolveLearner(repo, localIdentityDeps('host'));
	assert.equal(resolved.learner.source, 'github');
	assert.deepEqual(resolved, await resolveLearner(repo, localIdentityDeps('host', runShell)));

	assert.ok(calls.length > 0 && calls.every(c => c.caller === 'workflow'), "the commands went through the registry as the workflow");
	for (const tool of TOOLS) assert.ok(calls.some(c => c.tool === tool), `${tool} was called`);
});

test('identity-registry.test.ts: no runShell call remains in identity.ts', () => {
	const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'identity.ts'), 'utf8');
	assert.ok(!/\brunShell\(|=\s*runShell\b/.test(text), 'identity.ts runs no program itself');
	assert.ok(/toolIdentityCommand/.test(text), 'the default command runner is the tool one');
});
