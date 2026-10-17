import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { githubIdentities, localIdentityDeps, resolveLearner } from '../identity.js';
import type { IdentityDeps, IdentityLookup, IdentityCommand, ProviderSource } from '../identity.js';
import { runShell } from '../../daemon/tools/shell-helper.js';

function available(source: ProviderSource, subject: string, authority = 'https://github.com'): IdentityLookup {
  return { source, status: 'available', identities: [{ source, subject, authority }] };
}
function deps(results: IdentityLookup[], email: string | undefined = 'Dev@example.com'): IdentityDeps {
  return { hostId: 'installation-1', osSubject: () => '501', gitEmail: async () => email,
    providers: results.map(r => ({ source: r.source, lookup: async () => r })) };
}
function reply(stdout: string, code = 0) {
  return { stdout, stderr: '', code, spawnError: false, timedOut: false, stdoutTruncated: false };
}

test('Identity precedence preserves authority, case and distinct accounts', async () => {
  const single = await resolveLearner('/repo', deps([available('github', ' abc ')]));
  assert.equal(single.learner.subject, 'abc');
  assert.equal(single.learner.source, 'github');
  const multiple = await resolveLearner('/repo', deps([available('github', 'abc'), available('jira', 'abc', 'https://jira.example.com')]));
  assert.equal(multiple.learner.source, 'git');
  assert.equal(multiple.learner.subject, 'Dev@example.com');
  assert.deepEqual(multiple.learner.aliases, []);
  const otherHost = await resolveLearner('/repo', deps([available('github', 'abc', 'https://enterprise.example.com')]));
  const otherCase = await resolveLearner('/repo', deps([available('github', 'ABC')]));
  assert.notEqual(single.learner.key, otherHost.learner.key);
  assert.notEqual(single.learner.key, otherCase.learner.key);
  assert.equal(single.ownerPrincipal, multiple.ownerPrincipal);
  const os = await resolveLearner('/repo', deps([], ''));
  assert.equal(os.learner.source, 'os');
  assert.equal(os.learner.subject, '501');
  assert.notEqual(os.learner.key, (await resolveLearner('/repo', { ...deps([], ''), hostId: 'other-host' })).learner.key);
});

test('Incomplete provider discovery never selects an apparently unique account', async () => {
  const base = available('github', 'abc');
  const unavailable: IdentityLookup = { source: 'jira', status: 'unavailable', identities: [] };
  assert.equal((await resolveLearner('/repo', deps([base, unavailable]))).learner.source, 'git');
  const bad = { ...base, identities: [{ source: 'github' as const, authority: 'https://evil.example/path', subject: 'a' }] };
  const result = await resolveLearner('/repo', deps([bad], ''));
  assert.equal(result.learner.source, 'os');
  assert.ok(result.diagnostics.some(d => d.status === 'unavailable'));
  assert.ok(!JSON.stringify(result.diagnostics).includes('evil'));
  const duplicates = { ...base, identities: [...base.identities, ...base.identities] };
  assert.equal((await resolveLearner('/repo', deps([duplicates]))).learner.source, 'github');
});

test('Provider adapters distinguish available, disconnected, missing and failed sources', async () => {
  const calls: string[][] = [];
  const run: IdentityCommand = async argv => {
    calls.push([...argv]);
    if (argv[1] === 'auth') return reply(JSON.stringify({ hosts: { 'github.com': [
      { login: 'alice', state: 'success' }, { login: 'bob', state: 'success' },
    ] } }));
    return reply(JSON.stringify({ login: argv.at(-1)?.endsWith('alice') ? 'alice' : 'bob', node_id: argv.at(-1)?.endsWith('alice') ? 'U_1' : 'U_2' }));
  };
  const found = await githubIdentities(run);
  assert.equal(found.status, 'available');
  assert.deepEqual(found.identities.map(i => i.subject), ['U_1', 'U_2']);
  assert.equal((await resolveLearner('/repo', deps([found]))).learner.source, 'git');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(c => !c.includes('--show-token') && !c.includes('login')));
  assert.equal((await githubIdentities(async () => reply('{"hosts":{}}'))).status, 'disconnected');
  assert.equal((await githubIdentities(async () => ({ ...reply('', 1), spawnError: true }))).status, 'missing-integration');
  assert.equal((await githubIdentities(async () => reply('{"hosts":{"github.com":[{"state":"fail"}]}}'))).status, 'unavailable');
  assert.equal((await githubIdentities(async () => reply('invalid'))).status, 'unavailable');
  const resolved = await resolveLearner('/repo', localIdentityDeps('host', async argv => argv[0] === 'gh' ? reply('{"hosts":{}}') : reply('dev@example.com')));
  assert.ok(resolved.diagnostics.some(d => d.source === 'gitlab' && d.status === 'missing-integration'));
  assert.ok(resolved.diagnostics.some(d => d.source === 'jira' && d.status === 'missing-integration'));
});

test('Local adapter reads effective repository Git email and falls back to OS without author substitution', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'insrc-learner-'));
  try {
    execFileSync('git', ['init', '-q', repo]);
    execFileSync('git', ['-C', repo, 'config', 'user.email', 'LocalCase@example.com']);
    const run: IdentityCommand = (argv, options) => argv[0] === 'gh'
      ? Promise.resolve(reply('{"hosts":{}}'))
      : runShell(argv, { ...options, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_EMAIL: 'someone-else@example.com' } });
    const local = localIdentityDeps('fixture-installation', run);
    assert.equal((await resolveLearner(repo, local)).learner.subject, 'LocalCase@example.com');
    execFileSync('git', ['-C', repo, 'config', '--unset', 'user.email']);
    assert.equal((await resolveLearner(repo, local)).learner.source, 'os');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
